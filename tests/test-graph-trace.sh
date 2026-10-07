#!/bin/bash
# Graph trace: after a real (stand-in) run with a retry and a blocked step, the trace, its JSON totals,
# the live graph lines and the worktrees dashboard all show what happened.
cd "$(dirname "$0")/.." || exit 1
REPO="$PWD"; NODE="$(command -v /opt/homebrew/bin/node || command -v node)"
pass=0; fail=0
ok() { pass=$((pass + 1)); echo "ok    $*"; }
bad() { fail=$((fail + 1)); echo "FAIL  $*"; }
command -v wt >/dev/null || [ -x /opt/homebrew/bin/wt ] || { echo "skipped: worktrunk not installed"; exit 0; }
T="$REPO/tests/tmp/graph-trace"; rm -rf "$T"; mkdir -p "$T/repo"
( cd "$T/repo" && git init -q -b main && git config user.email t@example.com && git config user.name t \
  && printf '.laurelin/\n' > .gitignore && echo hi > a.txt && git add . && git commit -qm init ) || { bad "temp repo"; exit 1; }
cat > "$T/worker.sh" <<'W'
#!/bin/bash
task="$1"; step="$(printf '%s' "$task" | sed -n 's/^You are one step ("\([^"]*\)").*/\1/p')"
mkdir -p .laurelin
case "$task" in
  *FLAKY*) if [ ! -f "$MARK_DIR/flaky-$step" ]; then touch "$MARK_DIR/flaky-$step"; exit 0; fi ;;
  *STUCK*) echo "BLOCKED: needs a login to the data room" > .laurelin/out.md; exit 0 ;;
esac
sleep 0.2
printf 'result of %s\n' "$step" > .laurelin/out.md
W
cat > "$T/jev.sh" <<'J'
#!/bin/bash
cat >/dev/null
echo '{"answers":{"choice":{"type":"choice","choice":"no","confidence":0.9},"meets":{"type":"noul","noul":0.9}}}'
J
chmod +x "$T/worker.sh" "$T/jev.sh"
export LAURELIN_FAKE_WORKER="$T/worker.sh" JEV_BIN="$T/jev.sh" LAURELIN_GRAPH_INTERVAL_MS=200 MARK_DIR="$T"
cat > "$T/g.json" <<'G'
{"id":"tr","goal":"trace test","steps":[
 {"id":"a","task":"first FLAKY","expects":"text"},
 {"id":"b","task":"second","expects":"text"},
 {"id":"c","task":"third STUCK","expects":"text"},
 {"id":"fit","kind":"branch","inputs":["a"],"question":"pick","options":{"yes":[],"no":["d"]}},
 {"id":"d","task":"fourth","expects":"text"}]}
G
(cd "$T/repo" && "$NODE" "$REPO/pack/graph/runner.mjs" run "$T/g.json" --foreground >/dev/null 2>&1)
tr="$(cd "$T/repo" && "$NODE" "$REPO/pack/graph/runner.mjs" trace tr 2>&1)"
echo "$tr" | grep -qE "^  a +DONE +laurelin +x2" && echo "$tr" | grep -qE "^  c +BLOCKED .*needs a login" && echo "$tr" | grep -qE "^  fit +DONE +jev .*-> no \(0\.90\)" \
  && ok "the trace shows each step: status, worker, attempts, branch choice, blocked reason" || bad "trace: $tr"
echo "$tr" | grep -q "1 blocked" && echo "$tr" | grep -q "1 retries" && ok "the trace totals count the retry and the blocked step" || bad "totals: $(echo "$tr" | sed -n 2p)"
js="$(cd "$T/repo" && "$NODE" "$REPO/pack/graph/runner.mjs" trace tr --json 2>&1)"
echo "$js" | python3 -c "import json,sys;t=json.load(sys.stdin)['totals'];assert t['done']==4 and t['blocked']==1 and t['retries']==1, t" && ok "the JSON trace carries the same totals" || bad "json: $js"
gl="$(cd "$T/repo" && "$NODE" --input-type=module -e "
  const t = await import('file://$REPO/pack/graph/trace.mjs');
  const id = (s) => s;
  console.log(t.graphLines('$T/repo', 'tr', { ink: id, dim: id, acc: (s) => '<' + s + '>', bold: id }).join('\n'));
" 2>&1)"
echo "$gl" | grep -q "■ a" && echo "$gl" | grep -q "<▲ c>" && echo "$gl" | grep -q "c: needs a login" \
  && ok "the live graph marks done steps and puts only the blocked step in the accent" || bad "graph lines: $gl"
wv="$(cd "$T/repo" && timeout 3 "$NODE" "$REPO/pack/worktrees/tracker.mjs" watch 1000 2>&1 | sed 's/\x1b\[[0-9;?]*[A-Za-z]//g')"
echo "$wv" | grep -q "GRAPHS" && echo "$wv" | grep -q "tr  trace test" && ok "worktrees watch shows the GRAPHS section" || bad "watch: $(echo "$wv" | head -12)"
rm -rf "$T"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
