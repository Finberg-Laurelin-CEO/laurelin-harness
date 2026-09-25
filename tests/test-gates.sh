#!/usr/bin/env bash
# Test for the gates piece. Each built gate passes on its good fixture and fails on its bad
# fixture; numbers and layout skip without their inputs; every run logs a JSON line; Prime runs one gate as
# --autonomous-gate. Run from anywhere:  tests/test-gates.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [ -f "$HOME/.config/agent-keys/env" ]; then set -a; . "$HOME/.config/agent-keys/env"; set +a; fi
export PATH="$HOME/.local/bin:$PATH"

TMP="$ROOT/tests/tmp"
rm -rf "$TMP" && mkdir -p "$TMP"
export LAURELIN_GATE_LOG="$TMP/gates.jsonl" GSTACK_HOME="$TMP/gstack"
G=pack/gates
F=tests/fixtures
EVIDENCE="$HOME/.claude/skills/gstack/bin/gstack-evidence"
pass=0; fail=0

# expect pass|fail NAME [VAR=value ...] COMMAND [ARGS]
expect() {
  local want="$1" name="$2"; shift 2
  local out code got=fail
  out="$(env "$@" 2>&1)"; code=$?
  [ "$code" -eq 0 ] && got=pass
  if [ "$got" = "$want" ]; then
    pass=$((pass + 1)); printf 'ok    %-32s %s\n' "$name" "$(printf '%s\n' "$out" | head -n 1)"
  else
    fail=$((fail + 1)); printf 'FAIL  %-32s wanted %s, got exit %s\n%s\n' "$name" "$want" "$code" "$out"
  fi
}

echo "== prose"
expect pass "prose good folder"   LAURELIN_TARGET=$F/prose-good $G/prose.sh
expect fail "prose bad folder"    LAURELIN_TARGET=$F/prose-bad  $G/prose.sh

echo "== location"
OUTSIDE="$(mktemp -d)"; printf 'outside\n' > "$OUTSIDE/note.md"
expect pass "location good file"  LAURELIN_TARGET=$F/prose-good/note.md $G/location.sh
expect fail "location missing"    LAURELIN_TARGET=/nonexistent/laurelin/note.md $G/location.sh
expect fail "location outside"    LAURELIN_TARGET="$OUTSIDE/note.md" $G/location.sh
rm -rf "$OUTSIDE"

echo "== verbatim"
expect pass "verbatim kept"    LAURELIN_ORIGINAL=$F/verbatim/original.txt LAURELIN_TARGET=$F/verbatim/kept.md    $G/verbatim.sh
expect fail "verbatim changed" LAURELIN_ORIGINAL=$F/verbatim/original.txt LAURELIN_TARGET=$F/verbatim/changed.md $G/verbatim.sh

echo "== evidence (ledger under $GSTACK_HOME)"
"$EVIDENCE" run --label unit-test -- 'echo "3 tests passed, 0 failed"; exit 0' >/dev/null 2>&1
expect pass "evidence good row"      LAURELIN_CLAIM="the unit tests passed" $G/evidence.sh
expect fail "evidence unrelated"     LAURELIN_CLAIM="the PDF renders with no overlapping text" $G/evidence.sh
"$EVIDENCE" run --label unit-test -- 'echo "2 of 3 tests failed"; exit 1' >/dev/null 2>&1
expect fail "evidence failed row"    LAURELIN_CLAIM="all unit tests passed" $G/evidence.sh

echo "== numbers and layout skip without their inputs (full test: tests/test-gates2.sh)"
expect pass "numbers no canonical" LAURELIN_TARGET=$F/prose-good/note.md $G/numbers.sh
expect pass "layout not a pdf"     LAURELIN_TARGET=$F/prose-good/note.md $G/layout.sh
if [ "$(LAURELIN_TARGET=$F/prose-good/note.md $G/numbers.sh | cut -d, -f1)" = "numbers: skipped" ] \
   && [ "$(LAURELIN_TARGET=$F/prose-good/note.md $G/layout.sh | cut -d, -f1)" = "layout: skipped" ]; then
  pass=$((pass + 1)); echo "ok    both say skipped"
else
  fail=$((fail + 1)); echo "FAIL  both say skipped"
fi

echo "== decision log"
lines="$(jq -c . "$LAURELIN_GATE_LOG" 2>/dev/null | wc -l | tr -d ' ')"
checks="$(jq -r .check "$LAURELIN_GATE_LOG" 2>/dev/null | sort -u | tr '\n' ' ')"
if [ "$lines" -ge 10 ] && [ "$checks" = "evidence layout location numbers prose verbatim " ]; then
  pass=$((pass + 1)); echo "ok    log has $lines JSON lines for: $checks"
else
  fail=$((fail + 1)); echo "FAIL  log has $lines JSON lines for: $checks"
fi

echo "== prime-agent runs location.sh as a gate"
if ! command -v prime-agent >/dev/null 2>&1; then
  pass=$((pass + 1)); echo "skipped: no prime-agent"
else
  before="$(grep -c '"check":"location"' "$LAURELIN_GATE_LOG")"
  out="$(LAURELIN_TARGET=$F/prose-good/note.md timeout 300 prime-agent -e ./pack --no-session \
         --autonomous --autonomous-gate pack/gates/location.sh \
         --autonomous-max-turns 3 --autonomous-max-continuations 1 -p "say done" 2>&1)"; code=$?
  after="$(grep -c '"check":"location"' "$LAURELIN_GATE_LOG")"
  if [ "$code" -eq 0 ] && [ "$after" -gt "$before" ]; then
    pass=$((pass + 1)); echo "ok    prime finished, gate ran $((after - before)) time(s): $(printf '%s\n' "$out" | tail -n 1)"
  elif printf '%s' "$out" | grep -qiE 'api key|auth|credential|no model|not configured|unauthorized|401|403'; then
    pass=$((pass + 1)); echo "skipped: no model"
  else
    fail=$((fail + 1)); echo "FAIL  prime exit $code, gate ran $((after - before)) time(s)"; printf '%s\n' "$out" | tail -n 20
  fi
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
