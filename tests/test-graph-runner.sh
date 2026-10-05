#!/bin/bash
# Graph runner: a full run with parallel steps, a branch, a retry, a blocked step, an unsure branch decided
# by hand, and recovery after the loop is killed. Throwaway repo, stand-in worker and stand-in Jev.
cd "$(dirname "$0")/.." || exit 1
REPO="$PWD"; NODE="$(command -v /opt/homebrew/bin/node || command -v node)"
pass=0; fail=0
ok() { pass=$((pass + 1)); echo "ok    $*"; }
bad() { fail=$((fail + 1)); echo "FAIL  $*"; }
command -v wt >/dev/null || [ -x /opt/homebrew/bin/wt ] || { echo "skipped: worktrunk not installed"; exit 0; }
T="$REPO/tests/tmp/graph-runner"; rm -rf "$T"; mkdir -p "$T/repo"
( cd "$T/repo" && git init -q -b main && git config user.email t@example.com && git config user.name t \
  && printf '.laurelin/\n' > .gitignore && echo hi > a.txt && git add . && git commit -qm init ) || { bad "temp repo"; exit 1; }

# Stand-in worker: writes a result naming its step; FLAKY writes nothing the first time; STUCK blocks.
cat > "$T/worker.sh" <<'W'
#!/bin/bash
task="$1"; step="$(printf '%s' "$task" | sed -n 's/^You are one step ("\([^"]*\)").*/\1/p')"
mkdir -p .laurelin
case "$task" in
  *FLAKY*) if [ ! -f "$MARK_DIR/flaky-$step" ]; then touch "$MARK_DIR/flaky-$step"; exit 0; fi ;;
  *STUCK*) echo "BLOCKED: no access to the source" > .laurelin/out.md; exit 0 ;;
esac
sleep "${WORKER_SLEEP:-0.3}"
printf 'result of %s\n' "$step" > .laurelin/out.md
W
# Stand-in Jev: picks "no" at 0.9, or "yes" at 0.4 when the question says UNSURE.
cat > "$T/jev.sh" <<'J'
#!/bin/bash
req="$(cat)"
if printf '%s' "$req" | grep -q UNSURE; then c=yes; p=0.4; else c=no; p=0.9; fi
printf '{"answers":{"choice":{"type":"choice","choice":"%s","confidence":%s,"probabilities":{"%s":%s}}}}\n' "$c" "$p" "$c" "$p"
J
chmod +x "$T/worker.sh" "$T/jev.sh"
export LAURELIN_FAKE_WORKER="$T/worker.sh" JEV_BIN="$T/jev.sh" LAURELIN_GRAPH_INTERVAL_MS=200 MARK_DIR="$T"
R="$NODE $REPO/pack/graph/runner.mjs"

# 1. A full run.
cat > "$T/g1.json" <<'G'
{"id":"g1","goal":"test","steps":[
 {"id":"a","task":"first FLAKY","expects":"text"},
 {"id":"b","task":"second","expects":"text"},
 {"id":"fit","kind":"branch","inputs":["b"],"question":"pick","options":{"yes":[],"no":["extra"]}},
 {"id":"extra","task":"extra work","expects":"text"},
 {"id":"m","kind":"merge","inputs":["a","b","extra"],"task":"combine","expects":"text"}]}
G
out="$(cd "$T/repo" && $R run "$T/g1.json" --foreground 2>&1)"
echo "$out" | grep -q '"finished":true' && ok "a full run finishes (parallel steps, branch, merge)" || bad "run: $out"
G1="$T/repo/.laurelin/graphs/g1"
python3 -c "
import json;s=json.load(open('$G1/state.json'))['steps']
assert s['a']['status']=='done' and s['a']['attempt']==2, s['a']
assert s['fit']['choice']=='no' and s['extra']['status']=='done' and s['m']['status']=='done'" \
  && ok "the flaky step retried once and passed; the branch chose 'no' and its step ran" || bad "state: $(cat "$G1/state.json")"
grep -q "result of m" "$G1/outputs/m.md" && grep -q "result of a" "$G1/outputs/a.md" && ok "outputs are kept per step" || bad "outputs missing"
grep -q '"event":"retry"' "$G1/events.jsonl" && grep -q '"event":"finished"' "$G1/events.jsonl" && ok "events record the retry and the finish" || bad "events"

# 2. Blocked work and an unsure branch, then Joe decides.
cat > "$T/g2.json" <<'G'
{"id":"g2","goal":"test","steps":[
 {"id":"x","task":"STUCK task","expects":"text"},
 {"id":"q","kind":"branch","inputs":[],"question":"UNSURE pick","options":{"yes":["y"],"no":["z"]}},
 {"id":"y","task":"yes path","expects":"text"},
 {"id":"z","task":"no path","expects":"text"}]}
G
out="$(cd "$T/repo" && $R run "$T/g2.json" --foreground 2>&1)"
echo "$out" | grep -q '"finished":false' && grep -q '"blocked"' "$T/repo/.laurelin/graphs/g2/state.json" \
  && ok "a BLOCKED result and an unsure branch stop and wait for Joe" || bad "g2: $out"
(cd "$T/repo" && $R decide g2 q no >/dev/null && $R loop g2 >/dev/null 2>&1)
python3 -c "
import json;s=json.load(open('$T/repo/.laurelin/graphs/g2/state.json'))['steps']
assert s['q']['choice']=='no' and s['z']['status']=='done' and s['y']['status']=='skipped', s" \
  && ok "Joe's decision unblocks the branch; the chosen path runs, the other is skipped" || bad "decide"

# 3. Kill the background loop mid-run, then resume.
cat > "$T/g3.json" <<'G'
{"id":"g3","goal":"crash test","steps":[
 {"id":"s1","task":"one","expects":"text"},
 {"id":"s2","inputs":["s1"],"task":"two","expects":"text"},
 {"id":"s3","inputs":["s2"],"task":"three","expects":"text"}]}
G
(cd "$T/repo" && WORKER_SLEEP=1 $R run "$T/g3.json" >/dev/null)
G3="$T/repo/.laurelin/graphs/g3/state.json"
for i in $(seq 1 60); do
  python3 -c "import json,sys;s=json.load(open('$G3'))['steps'];sys.exit(0 if s['s1']['status']=='done' else 1)" 2>/dev/null && break
  sleep 0.25
done
pid="$(python3 -c "import json;print(json.load(open('$G3')).get('loopPid',''))")"
[ -n "$pid" ] && kill "$pid" 2>/dev/null
sleep 0.5
(cd "$T/repo" && WORKER_SLEEP=0.2 $R loop g3 >/dev/null 2>&1)
python3 -c "
import json;s=json.load(open('$G3'))['steps']
assert all(s[k]['status']=='done' for k in ('s1','s2','s3')), s" \
  && ok "after the loop is killed mid-run, resuming finishes the graph" || bad "resume: $(cat "$G3")"
(cd "$T/repo" && $R status g3) | grep -qE "s3 +DONE" && ok "status shows every step" || bad "status: $(cd "$T/repo" && $R status g3)"

rm -rf "$T"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
