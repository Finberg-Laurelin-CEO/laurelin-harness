#!/usr/bin/env python3
"""Score one test-set run. Called by run.sh; not meant to be run by hand.

Reads the Prime JSON event stream (events.jsonl) for cost and tokens, the gate log
(decision-log/gates.jsonl) for gate results, the target file, and the spec's rubric.
Asks Jev one score question per rubric criterion in one call. Writes the result JSON
and prints one table row: id, gates passed/total, score, cost, seconds, status.
"""
import argparse, json, os, subprocess, sys, datetime

LEVELS = ["not met", "partly met", "met"]
MAX_TARGET_CHARS = 6000
MAX_REPLY_CHARS = 3000


def read_jsonl(path):
    rows = []
    if not os.path.exists(path):
        return rows
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line.startswith("{"):
                continue  # Prime prints the odd plain line on stdout; skip it
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return rows


def parse_events(events):
    """Usage totals, model, final reply and counts from the assistant messages."""
    usage = {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 0, "cost": 0.0}
    model = None
    final_text = ""
    turns = 0
    tool_calls = 0
    for ev in events:
        t = ev.get("type")
        if t == "message_end" and ev.get("message", {}).get("role") == "assistant":
            m = ev["message"]
            turns += 1
            model = m.get("model") or model
            u = m.get("usage") or {}
            for k in ("input", "output", "cacheRead", "cacheWrite", "totalTokens"):
                usage[k] += int(u.get(k) or 0)
            usage["cost"] += float((u.get("cost") or {}).get("total") or 0)
            text = "".join(c.get("text", "") for c in m.get("content", []) if c.get("type") == "text")
            if text.strip():
                final_text = text
        elif t == "tool_execution_start":
            tool_calls += 1
    usage["cost"] = round(usage["cost"], 5)
    return usage, model, final_text, turns, tool_calls


def gate_summary(rows):
    """The last row per check decides. Skipped rows count in neither passed nor total."""
    last = {}
    for r in rows:
        if "check" in r:
            last[r["check"]] = r
    passed = sum(1 for r in last.values() if r.get("result") == "pass")
    failed = sum(1 for r in last.values() if r.get("result") == "fail")
    return {
        "passed": passed, "failed": failed, "total": passed + failed,
        "skipped": sum(1 for r in last.values() if r.get("result") == "skipped"),
        "final": {k: {"result": v.get("result"), "confidence": v.get("confidence"), "answer": v.get("answer")} for k, v in last.items()},
        "rows": rows,
    }


def target_view(target):
    """What Jev sees of the target: the file text, or a listing plus the first files of a folder."""
    if os.path.isfile(target):
        with open(target, encoding="utf-8", errors="replace") as f:
            return {"exists": True, "kind": "file", "content": f.read(MAX_TARGET_CHARS)}
    if os.path.isdir(target):
        files = []
        for dp, dn, fn in os.walk(target):
            dn[:] = [d for d in dn if not d.startswith(".")]
            for n in sorted(fn):
                files.append(os.path.relpath(os.path.join(dp, n), target))
        content = {}
        budget = MAX_TARGET_CHARS
        for rel in files[:5]:
            try:
                with open(os.path.join(target, rel), encoding="utf-8", errors="replace") as f:
                    s = f.read(min(budget, 2000))
            except OSError:
                continue
            content[rel] = s
            budget -= len(s)
            if budget <= 0:
                break
        return {"exists": True, "kind": "folder", "files": files[:50], "content": content}
    return {"exists": False, "kind": "missing"}


def jev_score(spec, prompt, view, reply, gates):
    """One Jev call: one score question per rubric criterion, all over the same state."""
    questions = {}
    for i, crit in enumerate(spec["rubric"], 1):
        questions[f"c{i}"] = {"type": "score", "instructions": crit, "criteria": LEVELS}
    state = {
        "task": prompt,
        "claim": spec.get("claim", ""),
        "target": view,
        "agent_final_reply": reply[:MAX_REPLY_CHARS],
        "gate_results": {k: v["result"] for k, v in gates["final"].items()},
        "note": "Judge the target and the reply as evidence. The reply's own claims are not proof; the target content is.",
    }
    req = json.dumps({"state": state, "questions": questions})
    try:
        p = subprocess.run(["jev", "--raw"], input=req, capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as e:
        return None, f"jev failed: {e}"
    if p.returncode != 0:
        msg = (p.stdout or p.stderr).strip().splitlines()
        return None, "jev failed: " + (msg[-1] if msg else "no output")
    try:
        raw = json.loads(p.stdout)
    except json.JSONDecodeError:
        return None, "jev returned no JSON"
    per = []
    top = len(LEVELS) - 1
    for i, crit in enumerate(spec["rubric"], 1):
        a = raw.get("answers", {}).get(f"c{i}", {})
        s = a.get("score")
        per.append({"criterion": crit, "score": s, "normalized": (round(s / top, 3) if isinstance(s, (int, float)) else None),
                    "confidence": a.get("confidence"),
                    "level": (LEVELS[min(top, max(0, int(round(s))))] if isinstance(s, (int, float)) else None)})
    vals = [c["normalized"] for c in per if c["normalized"] is not None]
    mean = round(sum(vals) / len(vals), 3) if vals else None
    return {"mean": mean, "criteria": per, "jev_model": raw.get("model"), "jev_usage": raw.get("usage")}, None


def main():
    ap = argparse.ArgumentParser()
    for a in ("--spec", "--root", "--work", "--target", "--prompt", "--out"):
        ap.add_argument(a, required=True)
    ap.add_argument("--exit", type=int, required=True)
    ap.add_argument("--seconds", type=int, required=True)
    args = ap.parse_args()

    spec = json.load(open(args.spec, encoding="utf-8"))
    events = read_jsonl(os.path.join(args.work, "events.jsonl"))
    stderr = ""
    try:
        stderr = open(os.path.join(args.work, "stderr.log"), encoding="utf-8", errors="replace").read()
    except OSError:
        pass
    usage, model, reply, turns, tool_calls = parse_events(events)
    gates = gate_summary(read_jsonl(os.path.join(args.work, "decision-log", "gates.jsonl")))
    view = target_view(args.target)

    haystack = (stderr + "\n" + "\n".join(json.dumps(e) for e in events[-5:])).lower()
    if args.exit == 124:
        status = "timeout"
    elif "no models available" in haystack or (args.exit != 0 and turns == 0 and any(w in haystack for w in ("api key", "unauthorized", "not configured", "401", "403"))):
        status = "skipped: no model"
    elif args.exit != 0:
        status = f"exit {args.exit}"
    else:
        status = "ok"

    score, score_err = (None, "not scored: " + status) if status == "skipped: no model" else jev_score(spec, args.prompt, view, reply, gates)

    result = {
        "id": spec["id"], "name": spec.get("name"), "group": spec.get("group"),
        "date": datetime.datetime.now().isoformat(timespec="seconds"),
        "status": status, "exit_code": args.exit, "seconds": args.seconds,
        "model": model, "turns": turns, "tool_calls": tool_calls,
        "root": args.root, "work": args.work, "target": args.target, "target_exists": view["exists"],
        "prompt": args.prompt, "checks": spec.get("checks"),
        "gates": {k: gates[k] for k in ("passed", "failed", "skipped", "total", "final")},
        "gate_log": gates["rows"],
        "usage": usage, "cost": usage["cost"],
        "score": score["mean"] if score else None,
        "score_detail": score, "score_error": score_err,
        "final_reply": reply[:MAX_REPLY_CHARS],
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    score_s = f"{score['mean']:.2f}" if score and score["mean"] is not None else "-"
    print(f"{spec['id']:<12} {gates['passed']}/{gates['total']:<5} {score_s:<6} ${usage['cost']:<8.4f} {args.seconds:<8} {status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
