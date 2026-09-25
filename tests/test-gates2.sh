#!/usr/bin/env bash
# Test for the gates2 piece: the numbers gate and the layout gate. Each passes on its good
# fixture, fails on its bad fixture with the expected first line, and skips cleanly when
# its input is absent. Run from anywhere:  tests/test-gates2.sh
# Needs: TYPESAFE_API_KEY in ~/.config/agent-keys/env (for Jev), poppler (pdftotext,
# pdftoppm), python3. The HTML case runs only when gstack's browse daemon is installed.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [ -f "$HOME/.config/agent-keys/env" ]; then set -a; . "$HOME/.config/agent-keys/env"; set +a; fi
export PATH="$HOME/.local/bin:$PATH"

TMP="$ROOT/tests/tmp/gates2"
rm -rf "$TMP" && mkdir -p "$TMP"
export LAURELIN_GATE_LOG="$TMP/gates.jsonl" LAURELIN_LAYOUT_DIR="$TMP/layout"
G=pack/gates
N=tests/fixtures/numbers
L=tests/fixtures/layout
pass=0; fail=0

# expect pass|fail NAME FIRST_LINE_REGEX [VAR=value ...] COMMAND
expect() {
  local want="$1" name="$2" re="$3"; shift 3
  local out code first got=fail
  out="$(env "$@" 2>&1)"; code=$?
  first="$(printf '%s\n' "$out" | head -n 1)"
  [ "$code" -eq 0 ] && got=pass
  if [ "$got" = "$want" ] && printf '%s' "$first" | grep -qE "$re"; then
    pass=$((pass + 1)); printf 'ok    %-28s %s\n' "$name" "$first"
  else
    fail=$((fail + 1)); printf 'FAIL  %-28s wanted %s matching /%s/, got exit %s:\n%s\n' "$name" "$want" "$re" "$code" "$out"
  fi
}

echo "== numbers"
expect pass "numbers good"        '^numbers: pass, 3 numbers'                LAURELIN_CANONICAL=$N/canonical.md LAURELIN_TARGET=$N/good.md $G/numbers.sh
expect fail "numbers wrong"       '^numbers: fail, 1 under 0\.6, 0 unverified' LAURELIN_CANONICAL=$N/canonical.md LAURELIN_TARGET=$N/bad.md  $G/numbers.sh
expect fail "numbers new"         '^numbers: fail, 0 under 0\.6, 1 unverified' LAURELIN_CANONICAL=$N/canonical.md LAURELIN_TARGET=$N/new.md  $G/numbers.sh
expect pass "numbers new allowed" '^numbers: pass, .*1 unverified allowed'   LAURELIN_NUMBERS_ALLOW_NEW=1 LAURELIN_CANONICAL=$N/canonical.md LAURELIN_TARGET=$N/new.md $G/numbers.sh
expect pass "numbers no canonical" '^numbers: skipped, no canonical file'     LAURELIN_TARGET=$N/good.md $G/numbers.sh
mkdir -p "$TMP/task" && printf '{"canonical": "%s"}\n' "$ROOT/$N/canonical.md" > "$TMP/task/.laurelin-task.json"
( cd "$TMP/task" && mkdir -p .laurelin && mv .laurelin-task.json .laurelin/task.json )
out="$(cd "$TMP/task" && LAURELIN_TARGET=$ROOT/$N/good.md "$ROOT/$G/numbers.sh" 2>&1)"; code=$?
if [ "$code" -eq 0 ] && printf '%s' "$out" | grep -q '^numbers: pass, 3 numbers'; then
  pass=$((pass + 1)); echo "ok    numbers from task.json         $out"
else
  fail=$((fail + 1)); echo "FAIL  numbers from task.json: exit $code: $out"
fi

echo "== layout"
expect pass "layout good pdf"     '^layout: pass, 2 pages of good\.pdf'  LAURELIN_TARGET=$L/good.pdf $G/layout.sh
expect fail "layout bad pdf"      '^layout: fail, p\.2 overlap: '        LAURELIN_TARGET=$L/bad.pdf  $G/layout.sh
expect pass "layout not a pdf"    '^layout: skipped, not a PDF or HTML' LAURELIN_TARGET=$N/good.md  $G/layout.sh
if [ -f "$LAURELIN_LAYOUT_DIR/page-1.png" ] && [ -f "$LAURELIN_LAYOUT_DIR/page-2.png" ]; then
  pass=$((pass + 1)); echo "ok    layout rendered both pages   $LAURELIN_LAYOUT_DIR"
else
  fail=$((fail + 1)); echo "FAIL  layout page images missing under $LAURELIN_LAYOUT_DIR"
fi
if [ -x "$HOME/.claude/skills/gstack/browse/dist/browse" ]; then
  mkdir -p "$TMP/html"
  printf '<html><body><h1 style="position:absolute;top:10px;left:10px">Title text</h1><p style="position:absolute;top:14px;left:20px">Caption over title</p><p style="position:absolute;top:200px;left:10px">Clean line</p></body></html>' > "$TMP/html/bad.html"
  printf '<html><body><h1>Title text</h1><p>A clean paragraph.</p></body></html>' > "$TMP/html/good.html"
  expect pass "layout good html"  '^layout: pass, 1 pages of good\.html' LAURELIN_TARGET=$TMP/html/good.html $G/layout.sh
  expect fail "layout bad html"   '^layout: fail, p\.1 overlap: "Title text" over "Caption over title"' LAURELIN_TARGET=$TMP/html/bad.html $G/layout.sh
else
  echo "skipped: no gstack browse daemon, HTML cases not run"
fi

echo "== decision log"
lines="$(jq -c . "$LAURELIN_GATE_LOG" 2>/dev/null | wc -l | tr -d ' ')"
results="$(jq -r '.check + ":" + .result' "$LAURELIN_GATE_LOG" 2>/dev/null | sort -u | tr '\n' ' ')"
if [ "$lines" -ge 9 ] && [ "$results" = "layout:fail layout:pass layout:skipped numbers:fail numbers:pass numbers:skipped " ]; then
  pass=$((pass + 1)); echo "ok    log has $lines JSON lines: $results"
else
  fail=$((fail + 1)); echo "FAIL  log has $lines JSON lines: $results"
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
