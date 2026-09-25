#!/usr/bin/env bash
# Test for the bridge piece: task state file, gates that read it, live check lights,
# live approvals, worker events. Run from anywhere:  tests/test-bridge.sh
#   (a) set_task writes .laurelin/task.json and the gates read it (no model)
#   (b) evidence.sh and verbatim.sh print "skipped" and exit 0 with no input
#   (c) end to end: a three-sentence file, --target and --claim given, every gate pass or
#       skipped within 2 continuations (one Prime run on the coordinator model)
#   (d) a gate log line makes laurelin-ui receive a laurelin:check event (no model)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [ -f "$HOME/.config/agent-keys/env" ]; then set -a; . "$HOME/.config/agent-keys/env"; set +a; fi
export PATH="$HOME/.local/bin:$PATH"
unset LAURELIN_TARGET LAURELIN_CLAIM LAURELIN_ORIGINAL

TMP="$ROOT/tests/tmp/bridge"
rm -rf "$TMP" && mkdir -p "$TMP"
G=pack/gates
F=tests/fixtures
EVIDENCE="$HOME/.claude/skills/gstack/bin/gstack-evidence"
pass=0; fail=0
ok()   { pass=$((pass + 1)); echo "ok    $*"; }
bad()  { fail=$((fail + 1)); echo "FAIL  $*"; }

PRIME_ROOT=""
for cand in "${PRIME_AGENT_PKG:-}" "$(npm root -g 2>/dev/null)/prime-agent" "$HOME/.local/lib/node_modules/prime-agent"; do
  if [ -n "$cand" ] && [ -f "$cand/dist/index.js" ]; then PRIME_ROOT="$cand"; break; fi
done
[ -z "$PRIME_ROOT" ] && { echo "FAIL prime-agent npm package not found (set PRIME_AGENT_PKG)"; exit 1; }

echo "== (a) and (d): set_task, log line to check light, approvals mirror (Prime's loader, no model)"
U="$TMP/unit"; mkdir -p "$U/task"
cp "$F/verbatim/kept.md" "$F/verbatim/original.txt" "$U/task/"
if node tests/bridge-check.mjs "$PRIME_ROOT" "$U"; then ok "bridge-check.mjs"; else bad "bridge-check.mjs"; fi

echo "== (a) gates read the file set_task wrote (no LAURELIN_* variables set)"
out="$(cd "$U/task" && LAURELIN_GATE_LOG="$TMP/a-gates.jsonl" "$ROOT/$G/verbatim.sh" 2>&1)"; code=$?
if [ "$code" -eq 0 ] && printf '%s' "$out" | grep -q '^verbatim: pass'; then ok "verbatim.sh read target and original from the task file: $out"; else bad "verbatim.sh (exit $code): $out"; fi
out="$(cd "$U/task" && LAURELIN_GATE_LOG="$TMP/a-gates.jsonl" "$ROOT/$G/location.sh" 2>&1)"; code=$?
if [ "$code" -eq 0 ] && printf '%s' "$out" | grep -q '^location: pass'; then ok "location.sh read target from the task file"; else bad "location.sh (exit $code): $out"; fi

echo "== (b) no input: skipped, exit 0"
B="$TMP/empty"; mkdir -p "$B"
for gate in evidence:claim verbatim:original; do
  name="${gate%%:*}"; input="${gate##*:}"
  out="$(cd "$B" && LAURELIN_GATE_LOG="$TMP/b-gates.jsonl" "$ROOT/$G/$name.sh" 2>&1)"; code=$?
  if [ "$code" -eq 0 ] && [ "$out" = "$name: skipped, no $input" ]; then ok "$out (exit 0)"; else bad "$name.sh with no input: exit $code, $out"; fi
done
if [ "$(jq -r 'select(.result == "skipped") | .check' "$TMP/b-gates.jsonl" | sort | tr '\n' ' ')" = "evidence verbatim " ]; then
  ok "both skips logged with result: skipped"
else
  bad "skip log lines: $(cat "$TMP/b-gates.jsonl")"
fi

echo "== (c) end to end: three sentences, --target and --claim, every gate pass or skipped"
E="$TMP/e2e"; mkdir -p "$E"
cat > "$E/note.md" <<'MD'
# Note

The gate reads one file. This file holds three sentences. Each sentence states one fact.
MD
cat > "$E/count.py" <<'PY'
import re
text = open("note.md", encoding="utf-8").read().split("\n\n", 1)[1]
print(f"note.md holds {len(re.findall(r'[.!?](?:\s|$)', text))} sentences")
PY
CLAIM="note.md holds three sentences"
export GSTACK_HOME="$TMP/gstack" GSTACK_PROJECT_SLUG=laurelin-harness
(cd "$E" && "$EVIDENCE" run --label e2e -- 'python3 count.py' >/dev/null 2>&1) || bad "gstack-evidence could not record the e2e row"
# The fixture must pass the two model-backed gates on its own before Prime is spent on it.
out="$(cd "$E" && LAURELIN_GATE_LOG="$TMP/c-pre.jsonl" LAURELIN_TARGET="$E/note.md" "$ROOT/$G/prose.sh" 2>&1)"; code=$?
if [ "$code" -eq 0 ]; then ok "fixture passes prose.sh"; else bad "fixture fails prose.sh: $out"; fi
out="$(cd "$E" && LAURELIN_GATE_LOG="$TMP/c-pre.jsonl" LAURELIN_CLAIM="$CLAIM" "$ROOT/$G/evidence.sh" 2>&1)"; code=$?
if [ "$code" -eq 0 ]; then ok "fixture passes evidence.sh: $out"; else bad "fixture fails evidence.sh: $out"; fi

if ! command -v prime-agent >/dev/null 2>&1; then
  ok "skipped: no prime-agent"
else
  LOG="$TMP/c-gates.jsonl"
  out="$(cd "$E" && LAURELIN_GATE_LOG="$LOG" timeout 600 "$ROOT/bin/laurelin" --autonomous \
        --target note.md --claim "$CLAIM" --no-session \
        --autonomous-max-continuations 2 --autonomous-max-turns 8 \
        -p "note.md in this folder is finished, and its target and claim are already recorded for the checks. Reply with the single word done." 2>&1)"; code=$?
  if [ ! -f "$LOG" ] && printf '%s' "$out" | grep -qiE 'api key|auth|credential|no model|not configured|unauthorized|401|403'; then
    ok "skipped: no model"
  else
    task="$(jq -c '{target, claim}' "$E/.laurelin/task.json" 2>/dev/null)"
    if [ "$task" = "{\"target\":\"$E/note.md\",\"claim\":\"$CLAIM\"}" ]; then ok "launcher wrote .laurelin/task.json"; else bad "task file: $task"; fi
    checks="$(jq -r .check "$LOG" 2>/dev/null | sort -u | tr '\n' ' ')"
    last="$(jq -sr 'group_by(.check) | map("\(.[0].check)=\(.[-1].result)") | join(" ")' "$LOG" 2>/dev/null)"
    notok="$(jq -sr 'group_by(.check) | map(.[-1]) | map(select(.result != "pass" and .result != "skipped")) | length' "$LOG" 2>/dev/null)"
    if [ "$code" -eq 0 ] && [ "$checks" = "evidence layout location numbers prose verbatim " ] && [ "${notok:-1}" = 0 ]; then
      ok "prime finished (exit 0) within 2 continuations; last result per gate: $last"
    else
      bad "prime exit $code; gates seen: $checks; last results: $last"; printf '%s\n' "$out" | tail -n 20
    fi
  fi
fi

echo "== type-check the new and changed extensions against Prime's types"
TSC="$(command -v tsc || true)"
[ -z "$TSC" ] && [ -x /opt/homebrew/lib/node_modules/vercel/node_modules/typescript/bin/tsc ] && TSC=/opt/homebrew/lib/node_modules/vercel/node_modules/typescript/bin/tsc
if [ -n "$TSC" ]; then
  cat > "$TMP/tsconfig.bridge.json" <<JSON
{
  "compilerOptions": {
    "noEmit": true, "strict": true, "skipLibCheck": true,
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "types": ["node"], "typeRoots": ["$PRIME_ROOT/node_modules/@types"],
    "baseUrl": ".",
    "paths": {
      "@earendil-works/pi-coding-agent": ["$PRIME_ROOT/dist/index.d.ts"],
      "@earendil-works/pi-tui": ["$PRIME_ROOT/node_modules/@earendil-works/pi-tui/dist/index.d.ts"],
      "@earendil-works/pi-ai": ["$PRIME_ROOT/node_modules/@earendil-works/pi-ai/dist/index.d.ts"],
      "@earendil-works/pi-agent-core": ["$PRIME_ROOT/node_modules/@earendil-works/pi-agent-core/dist/index.d.ts"],
      "typebox": ["$PRIME_ROOT/node_modules/typebox"]
    }
  },
  "files": ["$ROOT/pack/extensions/laurelin-ui.ts", "$ROOT/pack/extensions/laurelin-bridge.ts",
            "$ROOT/pack/extensions/laurelin-task.ts", "$ROOT/pack/extensions/laurelin-approvals.ts",
            "$ROOT/pack/extensions/laurelin-workers.ts"]
}
JSON
  if "$TSC" -p "$TMP/tsconfig.bridge.json"; then ok "tsc --noEmit: five extensions type-check"; else bad "tsc --noEmit"; fi
else
  echo "skip  tsc not found (Prime's loader check above still ran)"
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
