#!/usr/bin/env bash
# One-command test for the metrics piece (branch `metrics`, plan section 22 and Step 6).
#   tests/test-metrics.sh
# Builds a synthetic session folder under tests/tmp/metrics (three root sessions:
# one clean, one with two corrections, one steer only; plus a child session and a
# non-job session that must be ignored), a fake router row and a fake gate log,
# then runs bin/laurelin-metrics against them. Never reads Joe's real sessions.
# Sources the key store (never prints it). Without TYPESAFE_API_KEY the Jev part
# prints `skip` and the structural checks still run.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [ -z "${TYPESAFE_API_KEY:-}" ] && [ -f "$HOME/.config/agent-keys/env" ]; then
  set -a; . "$HOME/.config/agent-keys/env" >/dev/null 2>&1; set +a
fi

T="$PWD/tests/tmp/metrics"
rm -rf "$T"; mkdir -p "$T/sessions" "$T/log" "$T/results"
status=0
ok() { echo "ok   $*"; }
fail() { echo "FAIL $*"; status=1; }

# ---- fixtures
python3 - "$T" <<'EOF'
import hashlib, json, sys
T = sys.argv[1]
BASE = 1790146800000  # 2026-09-23 07:00 UTC, ISO week 2026-W39

def sha16(t): return hashlib.sha256(t.encode()).hexdigest()[:16]

def session(name, depth, turns, decision=None):
    """turns: list of (role, text, cost). Writes Prime-format JSONL."""
    entries = [{"type": "session", "version": 3, "id": name, "timestamp": "2026-09-23T07:00:00.000Z", "cwd": "/tmp/x", "rlmDepth": depth}]
    parent, t = None, BASE
    for i, (role, text, cost) in enumerate(turns):
        eid = f"{name[:4]}{i:04d}"
        t += 60000 * (i + 1)
        if role == "user":
            msg = {"role": "user", "content": text, "timestamp": t}
        else:
            msg = {"role": "assistant", "content": [{"type": "text", "text": text}], "api": "x", "provider": "x", "model": "test-model",
                   "usage": {"input": 10, "output": 5, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 15,
                             "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": cost}},
                   "stopReason": "stop", "timestamp": t}
        entries.append({"type": "message", "id": eid, "parentId": parent, "timestamp": "2026-09-23T07:01:00.000Z", "message": msg})
        parent = eid
        if i == 0 and decision:
            entries.append({"type": "custom", "id": f"{name[:4]}dec1", "parentId": parent, "timestamp": "2026-09-23T07:01:00.000Z",
                            "customType": "laurelin_decision",
                            "data": {"prompt_sha256": sha16(text), "answers": {"intent": {"choice": decision, "confidence": 0.9}}}})
    with open(f"{T}/sessions/{name}.jsonl", "w") as f:
        for e in entries:
            f.write(json.dumps(e) + "\n")

ASK = "Write a two-paragraph summary of the notes in summary.md and save it as summary-short.md."
REPLY = "Done. I wrote two paragraphs to summary-short.md and kept your headings."

# A: clean. The follow-up is an approval, not a correction.
session("aaaa-clean", 0, [("user", ASK, 0.10), ("assistant", REPLY, 0.10),
                          ("user", "Good, thank you. That is exactly what I asked for.", 0), ("assistant", "Glad it fits.", 0.02)],
        decision="new_task")
# B: two corrections after the first reply.
session("bbbb-twocorr", 0, [("user", ASK + " Keep it to one paragraph.", 0), ("assistant", "Done. I wrote three paragraphs to summary-short.md.", 0.20),
                            ("user", "No, that is wrong. I asked for one paragraph, not three. Cut it to one.", 0), ("assistant", "Cut to one paragraph.", 0.05),
                            ("user", "You changed my first sentence. Put it back exactly as I wrote it.", 0), ("assistant", "Restored your first sentence.", 0.05)],
        decision="new_task")
# C: steer only. No decision entry in the session; the router log carries it instead.
session("cccc-steer", 0, [("user", "Draft the intro section of the memo from the outline in outline.md.", 0), ("assistant", "Drafted the intro from the outline.", 0.30),
                          ("user", "From here on keep every sentence under twenty words and use US spelling.", 0), ("assistant", "Will do for the rest of the memo.", 0.05)])
# D: a child session (rlmDepth 1) with a correction inside. Must be ignored.
session("dddd-child", 1, [("user", "Summarize this file.", 0), ("assistant", "Here is the summary.", 0.50),
                          ("user", "No, that is wrong, you summarized the wrong file. Use notes.md.", 0), ("assistant", "Redone.", 0.05)])
# E: a root session whose first prompt the router logged as a question. Not a job.
session("eeee-question", 0, [("user", "What does the prose gate check?", 0), ("assistant", "It runs jev-sweep over the target.", 0.01)],
        decision="question")

with open(f"{T}/log/router.jsonl", "w") as f:
    f.write(json.dumps({"ts": "2026-09-23T07:00:00Z", "id": "r1", "type": "route",
                        "prompt_sha256": sha16("Draft the intro section of the memo from the outline in outline.md."),
                        "answers": {"intent": {"choice": "new_task", "confidence": 0.9}}}) + "\n")
with open(f"{T}/log/gates.jsonl", "w") as f:
    for check, result in [("prose", "pass"), ("prose", "fail"), ("prose", "pass"), ("evidence", "pass"), ("layout", "skipped")]:
        f.write(json.dumps({"ts": "2026-09-23T08:00:00Z", "check": check, "result": result, "confidence": 0.9}) + "\n")
with open(f"{T}/results/2026-09-23-synthetic-1.json", "w") as f:
    json.dump({"id": "synthetic-1", "date": "2026-09-23T09:00:00", "status": "ok", "score": 0.8, "cost": 0.0123,
               "gate_log": [{"ts": "2026-09-23T09:00:00Z", "check": "evidence", "result": "fail"}]}, f)
EOF
ok "fixtures written under tests/tmp/metrics"

# A jev wrapper that counts calls, so the cache check is a real count.
REAL_JEV="${JEV_BIN:-$HOME/.local/bin/jev}"
cat > "$T/jev-count" <<EOF
#!/usr/bin/env bash
echo call >> "$T/jev-calls"
exec "$REAL_JEV" "\$@"
EOF
chmod +x "$T/jev-count"
: > "$T/jev-calls"

run() {
  JEV_BIN="$T/jev-count" bin/laurelin-metrics --sessions "$T/sessions" --decision-log "$T/log" \
    --results "$T/results" --out "$T/latest.json" "$@"
}
calls() { wc -l < "$T/jev-calls" | tr -d ' '; }

# ---- structural checks without Jev
out="$(run --no-jev --json)" || fail "laurelin-metrics --no-jev --json exited non-zero"
python3 - "$out" <<'EOF' || status=1
import json, sys
r = json.loads(sys.argv[1])
o = r["overall"]
assert r["sessions_read"] == 4, r["sessions_read"]            # the child session is not read as a root
assert r["sessions_not_jobs"] == 1, r["sessions_not_jobs"]     # the question session
assert o["jobs"] == 3, o
assert o["acceptance"] is None and o["messages_unjudged"] == 4, o
assert abs(o["cost_total"] - 0.77) < 1e-9, o["cost_total"]
assert o["time_to_done_median_s"] == 540, o["time_to_done_median_s"]   # (1+2+3+4) minutes minus the first minute
assert list(r["weeks"]) == ["2026-W39"], list(r["weeks"])
assert r["latest_week"]["week"] == "2026-W39"
g = r["gates"]
assert g["prose"] == {"pass": 2, "fail": 1, "skipped": 0, "pass_rate": 0.6667}, g["prose"]
assert g["evidence"] == {"pass": 1, "fail": 1, "skipped": 0, "pass_rate": 0.5}, g["evidence"]   # one from the test-set result
assert g["layout"]["pass_rate"] is None and g["layout"]["skipped"] == 1, g["layout"]
assert r["testset"] == {"runs": 1, "score_mean": 0.8, "cost_total": 0.0123}, r["testset"]
assert any("not judged" in n for n in r["notes"]), r["notes"]
print("ok   --json parses; 3 jobs, child and question sessions ignored, cost, time to done, gate rates, test-set summary")
EOF
[ "$(calls)" = "0" ] && ok "--no-jev makes no Jev call" || fail "--no-jev still called Jev"
run --no-jev >/dev/null && ok "table prints" || fail "table run failed"
run --no-jev --since 2027-01-01 --json | python3 -c "import json,sys; r=json.load(sys.stdin); assert r['overall']['jobs']==0 and not r['gates'], r" \
  && ok "--since after every fixture leaves 0 jobs and no gate rows" || fail "--since filter"
[ -f "$T/latest.json" ] && ok "latest.json written" || fail "latest.json missing"
grep -q "twenty words" "$T/latest.json" && fail "latest.json holds message text" || ok "latest.json holds no message text"

# ---- Jev checks
if [ -z "${TYPESAFE_API_KEY:-}" ]; then
  echo "skip Jev part (no TYPESAFE_API_KEY): acceptance, corrections per job, cache, baseline"
else
  : > "$T/jev-calls"
  out="$(run --json)" || fail "laurelin-metrics --json (with Jev) exited non-zero"
  python3 - "$out" <<'EOF' || status=1
import json, sys
r = json.loads(sys.argv[1])
o = r["overall"]
assert o["jobs"] == 3 and o["jobs_judged"] == 3, o
assert o["accepted"] == 2 and o["acceptance"] == 0.6667, o
assert o["corrections"] == 2 and o["corrections_per_job"] == 0.6667, o
assert abs(o["cost_per_accepted_job"] - (0.12 + 0.35) / 2) < 1e-9, o["cost_per_accepted_job"]
assert r["jev"]["jev_calls"] >= 1 and r["jev"]["judged"] == 4, r["jev"]
print(f"ok   with Jev: acceptance 67%, 0.67 corrections per job, cost per accepted job {o['cost_per_accepted_job']}, {r['jev']['jev_calls']} Jev calls")
EOF
  first="$(calls)"
  [ "$first" -ge 1 ] && ok "first run made $first Jev call(s)" || fail "first run made no Jev call"
  out="$(run --json)" || fail "second run exited non-zero"
  second="$(calls)"
  [ "$second" = "$first" ] && ok "second run made no Jev call (cache hit)" || fail "second run called Jev again ($first -> $second)"
  printf '%s' "$out" | python3 -c "import json,sys; r=json.load(sys.stdin); assert r['jev']=={'jev_calls':0,'cache_hits':4,'judged':0,'unjudged':0}, r['jev']; assert r['overall']['acceptance']==0.6667" \
    && ok "second run: 4 cache hits, same acceptance" || fail "second run counters"
  [ "$(wc -l < "$T/log/intent-cache.jsonl" | tr -d ' ')" = "4" ] && ok "cache has 4 rows" || fail "cache row count"
  grep -q "twenty words\|Put it back\|one paragraph" "$T/log/intent-cache.jsonl" && fail "cache holds message text" || ok "cache holds hashes and labels only"
  # Without the key but with the cache, the numbers still come out.
  ( unset TYPESAFE_API_KEY; HOME="$T/nohome" run --json ) | python3 -c "import json,sys; r=json.load(sys.stdin); assert r['overall']['acceptance']==0.6667 and r['jev']['jev_calls']==0, r['overall']" \
    && ok "cached labels give the number with no key" || fail "cached labels without key"
  # Baseline over a synthetic history file: hashes and labels only.
  python3 - "$T" <<'EOF'
import json, sys
T = sys.argv[1]
rows = [{"display": "No, that is wrong. I asked for one paragraph, not three. Cut it to one.", "timestamp": 1790146800000, "project": "/tmp/x"},
        {"display": "Draft the intro section of the memo from the outline in outline.md.", "timestamp": 1790146900000, "project": "/tmp/x"},
        {"display": "", "timestamp": 1790147000000, "project": "/tmp/x"}]
with open(f"{T}/history-a.jsonl", "w") as f:
    for r in rows: f.write(json.dumps(r) + "\n")
with open(f"{T}/history-b.jsonl", "w") as f:
    f.write(json.dumps({"session_id": "s", "ts": 1790147100, "text": "What does the prose gate check?"}) + "\n")
EOF
  before="$(calls)"
  JEV_BIN="$T/jev-count" bin/laurelin-metrics baseline --history "$T/history-a.jsonl" --history "$T/history-b.jsonl" \
    --decision-log "$T/log" --out "$T/baseline.md" --sample 10 >/dev/null || fail "baseline exited non-zero"
  grep -q "Prompts in the files | 3" "$T/baseline.md" && ok "baseline counts 3 prompts (empty row dropped, Codex seconds read)" || fail "baseline prompt count"
  grep -q "Correction share" "$T/baseline.md" && ok "baseline reports a correction share" || fail "baseline share line"
  grep -q "one paragraph\|outline.md\|prose gate" "$T/baseline.md" && fail "baseline.md holds prompt text" || ok "baseline.md holds no prompt text"
  [ "$(calls)" -gt "$before" ] && ok "baseline judged the uncached prompt through Jev" || fail "baseline made no Jev call for a new prompt"
fi

# ---- footer: laurelin-ui reads latest.json through Prime's loader
PRIME_ROOT=""
for cand in "${PRIME_AGENT_PKG:-}" "$(npm root -g 2>/dev/null)/prime-agent" "$HOME/.local/lib/node_modules/prime-agent"; do
  if [ -n "$cand" ] && [ -f "$cand/dist/index.js" ]; then PRIME_ROOT="$cand"; break; fi
done
if [ -z "$PRIME_ROOT" ]; then
  echo "skip footer check (prime-agent npm package not found; set PRIME_AGENT_PKG)"
else
  printf '{"latest_week":{"week":"2026-W39","acceptance":0.6667}}\n' > "$T/footer.json"
  LAURELIN_METRICS_FILE="$T/footer.json" node tests/metrics-footer-check.mjs "$PRIME_ROOT" "accept 67% (wk)" || status=1
  printf '{"latest_week":null}\n' > "$T/footer.json"
  LAURELIN_METRICS_FILE="$T/footer.json" node tests/metrics-footer-check.mjs "$PRIME_ROOT" "" || status=1
fi

[ $status -eq 0 ] && echo "PASS metrics" || echo "FAIL metrics"
exit $status
