#!/usr/bin/env python3
"""metrics.py: first-pass acceptance and the numbers beside it.

Run through bin/laurelin-metrics, which sources the key store first.

  laurelin-metrics [--json] [--since YYYY-MM-DD] [--include-prime]
  laurelin-metrics baseline [--sample 500]

Plan: section 22 (the edge), Step 6. Brief: docs/briefs/metrics.md.
Docs: docs/metrics.md says what each number means.

Sources
  sessions      ~/.laurelin/agent/sessions/*.jsonl (Prime's session format,
                agent/packages/coding-agent/docs/session-format.md), plus
                ~/.prime/agent/sessions with --include-prime
  router rows   decision-log/router.jsonl and the laurelin_decision entries
                inside each session (intent of the first prompt)
  gate log      decision-log/gates.jsonl, plus the gate rows inside
                tests/testset/results/*.json
  intent cache  decision-log/intent-cache.jsonl: sha256 of a message, its
                Jev label and confidence. A message is judged once.

Privacy: no message text is ever printed or written. The cache, latest.json
and baseline.md hold hashes, labels and counts only. Text goes to Jev only,
after key-shaped tokens are masked.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import random
import re
import statistics
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

INTENTS = ["correction", "steer", "question", "approval", "new_task"]
# Same criteria the router uses (pack/extensions/laurelin-router.ts, INTENT_CRITERIA),
# so the two judgments agree on what a correction is.
INTENT_CRITERIA = {
    "new_task": {
        "what": "Joe asks for a piece of work to start: write, build, fix, research, move, draft",
        "examples": ["rewrite the deck intro", "fix the script", "research this firm"],
    },
    "steer": {
        "what": "Joe adds a constraint or preference for work that is under way or about to start, with no claim that something already went wrong",
        "examples": ["keep my sentences as they are", "use the strong model for this", "focus on US investors only"],
    },
    "correction": {
        "what": "Joe says something the agent did or said was wrong and says what it should have been",
        "examples": ["that's wrong, the ask goes at the end", "no, I said the newest engineering doc", "you changed my prose, put it back"],
    },
    "question": {
        "what": "Joe asks for information or an explanation and no work product",
        "examples": ["what does gbrain do", "why did the prose gate fail", "which skill builds PDFs"],
    },
    "approval": {
        "what": "Joe answers yes or no, or says go ahead or stop, to something the agent proposed just before",
        "examples": ["push it", "yes, go ahead", "approve", "no, hold off"],
    },
}
JEV_BATCH = 40          # questions per Jev call
JEV_TIMEOUT = 60        # seconds per call
MESSAGE_CAP = 2000      # characters of a message sent to Jev
CONTEXT_CAP = 400       # characters of the preceding assistant reply sent to Jev
KEY_STORE = Path.home() / ".config" / "agent-keys" / "env"

# Tokens that look like keys are masked before a message goes to Jev. The
# scrubber does this inside the harness; history files predate it.
KEY_SHAPES = re.compile(
    r"(sk-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,}"
    r"|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|[A-Za-z0-9+/_-]{40,})"
)


def mask(text: str) -> str:
    return KEY_SHAPES.sub("[masked]", text)


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def iso_week(ts_ms: float) -> str:
    d = dt.datetime.fromtimestamp(ts_ms / 1000, tz=dt.timezone.utc).date()
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def parse_ts(entry: dict, message: dict) -> float | None:
    """Milliseconds since the epoch, from the message or the entry."""
    t = message.get("timestamp")
    if isinstance(t, (int, float)):
        return float(t)
    s = entry.get("timestamp")
    if isinstance(s, str):
        try:
            return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000
        except ValueError:
            return None
    return None


def text_of(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return ""


# ---------------------------------------------------------------- keys and Jev

def jev_available() -> bool:
    """True when the jev CLI can find a key. Reads the name only, never the value."""
    if os.environ.get("TYPESAFE_API_KEY"):
        return True
    try:
        for line in KEY_STORE.read_text().splitlines():
            if re.match(r"\s*(export\s+)?TYPESAFE_API_KEY=\S", line):
                return True
    except OSError:
        pass
    return False


def jev_bin() -> str:
    if os.environ.get("JEV_BIN"):
        return os.environ["JEV_BIN"]
    local = Path.home() / ".local" / "bin" / "jev"
    return str(local) if local.exists() else "jev"


def ask_jev(state: dict, questions: dict) -> dict:
    """One call, every question in parallel. Returns {name: {choice, confidence}}. Raises on failure."""
    proc = subprocess.run(
        [jev_bin(), "--raw"],
        input=json.dumps({"state": state, "questions": questions}),
        capture_output=True, text=True, timeout=JEV_TIMEOUT,
    )
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout).strip().splitlines()
        raise RuntimeError(tail[-1] if tail else "jev failed")
    return json.loads(proc.stdout)["answers"]


class IntentCache:
    """decision-log/intent-cache.jsonl: one line per judged message, keyed by sha256. No text."""

    def __init__(self, path: Path):
        self.path = path
        self.rows: dict[str, dict] = {}
        if path.exists():
            for line in path.read_text().splitlines():
                try:
                    r = json.loads(line)
                    self.rows[r["hash"]] = r
                except (ValueError, KeyError):
                    continue

    def get(self, h: str) -> dict | None:
        return self.rows.get(h)

    def put(self, h: str, label: str, confidence: float, source: str) -> None:
        r = {"ts": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "hash": h,
             "label": label, "confidence": round(confidence, 4), "source": source}
        self.rows[h] = r
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a") as f:
            f.write(json.dumps(r) + "\n")


def judge(items: list[dict], cache: IntentCache, source: str, use_jev: bool, stats: dict) -> None:
    """Fill item['label'] and item['confidence'] for each {hash, text, before?}. Asks Jev only for cache misses."""
    misses = []
    for it in items:
        row = cache.get(it["hash"])
        if row:
            it["label"], it["confidence"] = row["label"], row["confidence"]
            stats["cache_hits"] += 1
        else:
            misses.append(it)
    if not misses:
        return
    if not use_jev:
        stats["unjudged"] += len(misses)
        return
    for start in range(0, len(misses), JEV_BATCH):
        chunk = misses[start:start + JEV_BATCH]
        questions = {}
        for i, it in enumerate(chunk):
            before = it.get("before")
            instr = {
                "question": "What kind of message is this from Joe to the agent?",
                "message": mask(it["text"][:MESSAGE_CAP]),
            }
            if before:
                instr["what_the_agent_said_just_before"] = mask(before[-CONTEXT_CAP:])
            questions[f"m{i}"] = {"type": "choice", "instructions": instr, "criteria": INTENT_CRITERIA}
        state = {"note": "Each question holds one message Joe typed to a coding agent. Judge each message on its own."}
        try:
            answers = ask_jev(state, questions)
            stats["jev_calls"] += 1
        except Exception as e:  # noqa: BLE001
            stats["unjudged"] += len(chunk)
            stats["jev_error"] = str(e)
            continue
        for i, it in enumerate(chunk):
            a = answers.get(f"m{i}") or {}
            label = a.get("choice")
            conf = float(a.get("confidence") or 0)
            if label not in INTENTS:
                stats["unjudged"] += 1
                continue
            it["label"], it["confidence"] = label, conf
            cache.put(it["hash"], label, conf, source)
            stats["judged"] += 1


# ---------------------------------------------------------------- sessions

def load_router_intents(decision_dir: Path) -> dict[str, str]:
    """prompt_sha256 (16 hex) -> intent from decision-log/router.jsonl."""
    out: dict[str, str] = {}
    f = decision_dir / "router.jsonl"
    if not f.exists():
        return out
    for line in f.read_text().splitlines():
        try:
            d = json.loads(line)
            out[d["prompt_sha256"]] = d["answers"]["intent"]["choice"]
        except (ValueError, KeyError, TypeError):
            continue
    return out


def read_session(path: Path) -> dict | None:
    """One session file -> {id, path, root, users[], assistants[], intents{hash16: intent}}."""
    users, assistants, intents = [], [], {}
    header = None
    last_assistant_text = None
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return None
    for line in lines:
        try:
            e = json.loads(line)
        except ValueError:
            continue
        t = e.get("type")
        if t == "session":
            header = e
            continue
        if t == "custom" and e.get("customType") == "laurelin_decision":
            d = e.get("data") or {}
            try:
                intents[d["prompt_sha256"]] = d["answers"]["intent"]["choice"]
            except (KeyError, TypeError):
                pass
            continue
        if t != "message":
            continue
        m = e.get("message") or {}
        ts = parse_ts(e, m)
        if m.get("role") == "user":
            text = text_of(m.get("content"))
            if not text.strip():
                continue
            users.append({"text": text, "hash": sha(text), "ts": ts, "before": last_assistant_text,
                          "after_first_reply": len(assistants) > 0})
        elif m.get("role") == "assistant":
            cost = ((m.get("usage") or {}).get("cost") or {}).get("total")
            assistants.append({"ts": ts, "cost": float(cost) if isinstance(cost, (int, float)) else 0.0})
            txt = text_of([b for b in (m.get("content") or []) if isinstance(b, dict)])
            if txt.strip():
                last_assistant_text = txt
    if header is None or not users:
        return None
    return {
        "id": header.get("id") or path.stem,
        "path": str(path),
        "root": int(header.get("rlmDepth") or 0) == 0,
        "users": users,
        "assistants": assistants,
        "intents": intents,
    }


def session_dirs(args) -> list[Path]:
    dirs = [Path(p).expanduser() for p in (args.sessions or [])]
    if not dirs:
        dirs = [Path(os.environ.get("LAURELIN_SESSIONS") or Path.home() / ".laurelin" / "agent" / "sessions")]
        if args.include_prime:
            dirs.append(Path.home() / ".prime" / "agent" / "sessions")
    return dirs


# ---------------------------------------------------------------- the report

def since_ms(s: str | None) -> float:
    if not s:
        return 0.0
    d = dt.date.fromisoformat(s)
    return dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc).timestamp() * 1000


def median(xs: list[float]) -> float | None:
    return statistics.median(xs) if xs else None


def rate(n: int, d: int) -> float | None:
    return round(n / d, 4) if d else None


def summarize(jobs: list[dict]) -> dict:
    judged = [j for j in jobs if j["judged"]]
    accepted = [j for j in judged if j["corrections"] == 0]
    cost = sum(j["cost"] for j in jobs)
    cost_accepted = sum(j["cost"] for j in accepted)
    m = median([j["seconds"] for j in jobs if j["seconds"] is not None])
    return {
        "jobs": len(jobs),
        "jobs_judged": len(judged),
        "accepted": len(accepted),
        "acceptance": rate(len(accepted), len(judged)),
        "corrections": sum(j["corrections"] for j in judged),
        "corrections_per_job": rate(sum(j["corrections"] for j in judged), len(judged)),
        "messages_unjudged": sum(j["unjudged"] for j in jobs),
        "cost_total": round(cost, 4),
        "cost_per_accepted_job": round(cost_accepted / len(accepted), 4) if accepted else None,
        "time_to_done_median_s": round(m) if m is not None else None,
    }


def gate_rows(gate_log: Path, results_dir: Path, since: float) -> list[dict]:
    rows = []

    def take(r):
        ts = r.get("ts")
        if since and isinstance(ts, str):
            try:
                if dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000 < since:
                    return
            except ValueError:
                pass
        if r.get("check") and r.get("result"):
            rows.append({"check": r["check"], "result": r["result"]})

    if gate_log.exists():
        for line in gate_log.read_text().splitlines():
            try:
                take(json.loads(line))
            except ValueError:
                continue
    if results_dir.is_dir():
        for f in sorted(results_dir.glob("*.json")):
            try:
                for r in json.loads(f.read_text()).get("gate_log") or []:
                    take(r)
            except (ValueError, OSError, AttributeError):
                continue
    return rows


def gate_table(rows: list[dict]) -> dict:
    c: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        c[r["check"]][r["result"]] += 1
    out = {}
    for check in sorted(c):
        p, f, s = c[check]["pass"], c[check]["fail"], c[check]["skipped"]
        out[check] = {"pass": p, "fail": f, "skipped": s, "pass_rate": rate(p, p + f)}
    return out


def testset_summary(results_dir: Path, since: float) -> dict:
    n, scores, cost = 0, [], 0.0
    if results_dir.is_dir():
        for f in results_dir.glob("*.json"):
            try:
                r = json.loads(f.read_text())
            except (ValueError, OSError):
                continue
            d = r.get("date")
            if since and isinstance(d, str):
                try:
                    if dt.datetime.fromisoformat(d).replace(tzinfo=dt.timezone.utc).timestamp() * 1000 < since:
                        continue
                except ValueError:
                    pass
            n += 1
            if isinstance(r.get("score"), (int, float)):
                scores.append(float(r["score"]))
            if isinstance(r.get("cost"), (int, float)):
                cost += float(r["cost"])
    return {"runs": n, "score_mean": round(statistics.fmean(scores), 3) if scores else None, "cost_total": round(cost, 4)}


def report(args) -> dict:
    since = since_ms(args.since)
    decision_dir = Path(args.decision_log or os.environ.get("LAURELIN_DECISION_LOG") or REPO / "decision-log")
    cache = IntentCache(Path(args.cache) if args.cache else decision_dir / "intent-cache.jsonl")
    router_intents = load_router_intents(decision_dir)
    use_jev = not args.no_jev and jev_available()
    stats = Counter(jev_calls=0, cache_hits=0, judged=0, unjudged=0)
    threshold = args.threshold

    sessions = []
    for d in session_dirs(args):
        if not d.is_dir():
            continue
        for f in sorted(d.glob("*.jsonl")):
            s = read_session(f)
            if s and s["root"]:
                sessions.append(s)

    jobs, not_jobs = [], 0
    for s in sessions:
        first = s["users"][0]
        if first["ts"] is not None and first["ts"] < since:
            continue
        intent = s["intents"].get(first["hash"][:16]) or router_intents.get(first["hash"][:16])
        if intent is not None and intent != "new_task":
            not_jobs += 1
            continue
        later = [u for u in s["users"] if u["after_first_reply"]]
        judge(later, cache, "session", use_jev, stats)
        unjudged = [u for u in later if "label" not in u]
        corrections = sum(1 for u in later if u.get("label") == "correction" and u.get("confidence", 0) >= threshold)
        last_ts = max((a["ts"] for a in s["assistants"] if a["ts"] is not None), default=None)
        seconds = (last_ts - first["ts"]) / 1000 if last_ts is not None and first["ts"] is not None else None
        jobs.append({
            "session": s["id"],
            "week": iso_week(first["ts"]) if first["ts"] is not None else "unknown",
            "router_intent": intent,
            "messages_after_first_reply": len(later),
            "corrections": corrections,
            "judged": not unjudged,
            "unjudged": len(unjudged),
            "cost": sum(a["cost"] for a in s["assistants"]),
            "seconds": seconds,
        })

    weeks = {}
    for w in sorted({j["week"] for j in jobs}):
        weeks[w] = summarize([j for j in jobs if j["week"] == w])
    overall = summarize(jobs)
    gate_log = Path(args.gate_log or os.environ.get("LAURELIN_GATE_LOG") or decision_dir / "gates.jsonl")
    results_dir = Path(args.results or REPO / "tests" / "testset" / "results")
    grows = gate_rows(gate_log, results_dir, since)
    latest_week = max((w for w in weeks if w != "unknown"), default=None)

    notes = []
    if not use_jev:
        notes.append("corrections not judged: Jev off or no TYPESAFE_API_KEY (cached labels still count)")
    if stats.get("jev_error"):
        notes.append(f"Jev error: {stats['jev_error']}")
    if overall["messages_unjudged"]:
        notes.append(f"{overall['messages_unjudged']} messages unjudged; acceptance counts only fully judged jobs")

    return {
        "computed_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "since": args.since,
        "threshold": threshold,
        "sources": {"sessions": [str(d) for d in session_dirs(args)], "decision_log": str(decision_dir),
                    "gate_log": str(gate_log), "results": str(results_dir)},
        "sessions_read": len(sessions),
        "sessions_not_jobs": not_jobs,
        "overall": overall,
        "weeks": weeks,
        "latest_week": {"week": latest_week, **weeks[latest_week]} if latest_week else None,
        "gates": gate_table(grows),
        "testset": testset_summary(results_dir, since),
        "jev": {k: stats[k] for k in ("jev_calls", "cache_hits", "judged", "unjudged")},
        "notes": notes,
        "jobs": jobs if args.jobs else None,
    }


def pct(x: float | None) -> str:
    return "-" if x is None else f"{round(x * 100):d}%"


def num(x, fmt="{:.2f}") -> str:
    return "-" if x is None else fmt.format(x)


def print_table(r: dict) -> None:
    head = f"{'week':<10} {'jobs':>5} {'accept':>7} {'corr/job':>9} {'$/accepted':>11} {'done (min)':>11}"
    print(head)
    print("-" * len(head))
    rows = list(r["weeks"].items()) + [("overall", r["overall"])]
    for w, s in rows:
        done = None if s["time_to_done_median_s"] is None else s["time_to_done_median_s"] / 60
        judged = "" if s["jobs_judged"] == s["jobs"] else f" ({s['jobs_judged']} judged)"
        print(f"{w:<10} {s['jobs']:>5} {pct(s['acceptance']):>7} {num(s['corrections_per_job']):>9} "
              f"{num(s['cost_per_accepted_job'], '{:.4f}'):>11} {num(done, '{:.1f}'):>11}{judged}")
    if r["gates"]:
        print()
        print(f"{'gate':<14} {'pass':>5} {'fail':>5} {'skip':>5} {'rate':>6}")
        for check, g in r["gates"].items():
            print(f"{check:<14} {g['pass']:>5} {g['fail']:>5} {g['skipped']:>5} {pct(g['pass_rate']):>6}")
    t = r["testset"]
    if t["runs"]:
        print()
        print(f"test set: {t['runs']} runs, mean score {num(t['score_mean'])}, cost ${t['cost_total']:.4f}")
    j = r["jev"]
    print()
    print(f"sessions read {r['sessions_read']}, not jobs {r['sessions_not_jobs']}; "
          f"Jev calls {j['jev_calls']}, cache hits {j['cache_hits']}, judged {j['judged']}, unjudged {j['unjudged']}")
    for n in r["notes"]:
        print(f"note: {n}")


def write_latest(r: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    slim = {k: v for k, v in r.items() if k != "jobs"}
    out.write_text(json.dumps(slim, indent=1) + "\n")


# ---------------------------------------------------------------- baseline

def history_prompts(paths: list[Path]) -> list[dict]:
    """Prompts from Claude Code's and Codex's history files: {text, hash, ts}. Empty rows dropped."""
    out = []
    for p in paths:
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                d = json.loads(line)
            except ValueError:
                continue
            text = d.get("display") if "display" in d else d.get("text")
            if not isinstance(text, str) or not text.strip():
                continue
            ts = d.get("timestamp", d.get("ts"))
            if isinstance(ts, (int, float)) and ts < 1e11:  # Codex writes seconds
                ts = ts * 1000
            out.append({"text": text, "hash": sha(text), "ts": ts, "file": str(p)})
    return out


def short(p: Path) -> str:
    """~/.claude/history.jsonl rather than a bare basename, so two same-named files can be told apart."""
    try:
        return "~/" + str(p.resolve().relative_to(Path.home()))
    except ValueError:
        return str(p)


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / den
    return (max(0.0, centre - half), min(1.0, centre + half))


def baseline(args) -> int:
    paths = [Path(p).expanduser() for p in args.history] if args.history else [
        Path.home() / ".claude" / "history.jsonl", Path.home() / ".codex" / "history.jsonl"]
    readable = [p for p in paths if p.exists() and os.access(p, os.R_OK)]
    if not readable:
        print("baseline: no readable history file; nothing written", file=sys.stderr)
        return 1
    prompts = history_prompts(readable)
    if not prompts:
        print("baseline: history files hold no prompts; nothing written", file=sys.stderr)
        return 1
    decision_dir = Path(args.decision_log or os.environ.get("LAURELIN_DECISION_LOG") or REPO / "decision-log")
    cache = IntentCache(Path(args.cache) if args.cache else decision_dir / "intent-cache.jsonl")
    rng = random.Random(args.seed)
    sample = rng.sample(prompts, min(args.sample, len(prompts)))
    use_jev = not args.no_jev and jev_available()
    stats = Counter(jev_calls=0, cache_hits=0, judged=0, unjudged=0)
    judge(sample, cache, "history", use_jev, stats)

    labels = Counter(s["label"] for s in sample if "label" in s)
    low = sum(1 for s in sample if "label" in s and s["confidence"] < args.threshold)
    judged = sum(labels.values())
    corrections = labels["correction"]
    lo, hi = wilson(corrections, judged)
    tss = [p["ts"] for p in prompts if isinstance(p["ts"], (int, float))]
    span = ""
    if tss:
        a = dt.datetime.fromtimestamp(min(tss) / 1000, tz=dt.timezone.utc).date()
        b = dt.datetime.fromtimestamp(max(tss) / 1000, tz=dt.timezone.utc).date()
        span = f"{a} to {b}"

    out = Path(args.out or REPO / "metrics" / "baseline.md")
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Baseline: correction share of the year's prompts",
        "",
        f"Computed {dt.date.today()} by `laurelin-metrics baseline`. Hashes and labels only; no prompt text is stored here or in the cache.",
        "",
        "| Item | Value |",
        "|---|---|",
        f"| History files read | {', '.join(short(p) for p in readable)} ({len(readable)} of {len(paths)}) |",
        f"| Prompts in the files | {len(prompts)} |",
        f"| Date span | {span or 'unknown'} |",
        f"| Sample size | {len(sample)} (seed {args.seed}) |",
        f"| Judged by Jev | {judged} |",
        f"| Confidence below {args.threshold} | {low} |",
        f"| **Correction share** | **{pct(rate(corrections, judged))}** (95% interval {pct(lo)} to {pct(hi)}) |",
        "",
        "| Label | Count | Share |",
        "|---|---|---|",
    ]
    for lab in INTENTS:
        lines.append(f"| {lab} | {labels[lab]} | {pct(rate(labels[lab], judged))} |")
    lines += [
        "",
        f"Jev calls this run: {stats['jev_calls']}; cache hits: {stats['cache_hits']}; unjudged: {stats['unjudged']}.",
        "",
        "How to read it: the plan's section 3 estimated that about 35 percent of the year's prompts were corrections, from a manual read. "
        "This table is the same question put to Jev over a random sample, with the same five labels the router uses. "
        "History prompts carry no record of what the agent said immediately before. Approvals and short steers are harder to tell apart here than inside a session. "
        "The interval is a Wilson score interval on the sample.",
    ]
    if not use_jev:
        lines.append("")
        lines.append("Jev was not available on this run (no TYPESAFE_API_KEY). Only cached labels are counted.")
    out.write_text("\n".join(lines) + "\n")
    print(f"baseline: {len(prompts)} prompts, sample {len(sample)}, judged {judged}, "
          f"correction share {pct(rate(corrections, judged))}, written to {out}")
    return 0


# ---------------------------------------------------------------- main

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="laurelin-metrics", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", nargs="?", default="report", choices=["report", "baseline"])
    ap.add_argument("--json", action="store_true", help="print JSON instead of the table")
    ap.add_argument("--since", help="count jobs and gate rows from this date (YYYY-MM-DD)")
    ap.add_argument("--include-prime", action="store_true", help="also read ~/.prime/agent/sessions")
    ap.add_argument("--sessions", action="append", help="session folder (repeatable; replaces the defaults)")
    ap.add_argument("--decision-log", help="folder with router.jsonl, gates.jsonl and the cache")
    ap.add_argument("--gate-log", help="gate log file")
    ap.add_argument("--results", help="test-set results folder")
    ap.add_argument("--cache", help="intent cache file")
    ap.add_argument("--out", help="where latest.json (report) or baseline.md (baseline) goes")
    ap.add_argument("--threshold", type=float, default=float(os.environ.get("LAURELIN_JEV_THRESHOLD", 0.6)),
                    help="a label under this confidence does not count as a correction")
    ap.add_argument("--no-jev", action="store_true", help="never call Jev; use cached labels only")
    ap.add_argument("--jobs", action="store_true", help="include one row per job in the JSON")
    ap.add_argument("--history", action="append", help="baseline: history file (repeatable)")
    ap.add_argument("--sample", type=int, default=500, help="baseline: prompts to sample")
    ap.add_argument("--seed", type=int, default=20260925, help="baseline: sample seed")
    args = ap.parse_args(argv)

    if args.command == "baseline":
        return baseline(args)
    r = report(args)
    write_latest(r, Path(args.out or os.environ.get("LAURELIN_METRICS_FILE") or REPO / "metrics" / "latest.json"))
    if args.json:
        print(json.dumps(r, indent=1))
    else:
        print_table(r)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
