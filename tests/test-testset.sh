#!/usr/bin/env bash
# Test for the test-set piece (PLAN.md Step 6). Run from anywhere:  tests/test-testset.sh
#   1. every spec is valid JSON with the required fields; the 20 real jobs are disabled
#   2. run.sh --only synthetic-1 completes and writes a result file with a score and a cost
#   3. calibrate.sh runs on it and prints a table
# Prints "skipped: no model" for 2 and 3 when Prime has no model to run.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
pass=0; fail=0
ok()   { pass=$((pass + 1)); echo "ok    $1"; }
bad()  { fail=$((fail + 1)); echo "FAIL  $1"; }

echo "== specs"
n=0; problems=""
for f in tests/testset/specs/*.json; do
  n=$((n + 1))
  id="$(basename "$f" .json)"
  if ! jq -e '(.id | type == "string") and (.name | type == "string") and (.group | type == "string")
              and (.prompt | type == "string") and (.target | type == "string") and (.claim | type == "string")
              and (.checks | type == "string") and (.rubric | type == "array" and length >= 3 and length <= 6)
              and (.source | type == "string")' "$f" >/dev/null 2>&1; then
    problems="$problems $id"
  fi
  [ "$(jq -r .id "$f")" = "$id" ] || problems="$problems $id(id)"
  case "$id" in job-*) [ "$(jq -r '.enabled' "$f")" = "false" ] || problems="$problems $id(enabled)" ;; esac
done
if [ "$n" -ge 23 ] && [ -z "$problems" ]; then ok "$n specs valid; real jobs disabled"; else bad "specs:$problems ($n files)"; fi
if ! grep -rEl 'sk-[A-Za-z0-9]{8,}|[A-Za-z0-9_-]{40,}' tests/testset/specs >/dev/null; then ok "no key-shaped string in specs"; else bad "key-shaped string in a spec"; fi

echo "== run.sh --only synthetic-1"
if ! command -v prime-agent >/dev/null 2>&1; then
  ok "skipped: no model (no prime-agent)"; echo; echo "$pass passed, $fail failed"; exit 0
fi
before="$(ls tests/testset/results/*-synthetic-1.json 2>/dev/null | wc -l | tr -d ' ')"
out="$(LAURELIN_TESTSET_TIMEOUT=600 tests/testset/run.sh --only synthetic-1 2>&1)"; code=$?
row="$(printf '%s\n' "$out" | grep '^synthetic-1' | tail -n 1)"
printf '%s\n' "$out" | tail -n 2
result="$(ls -t tests/testset/results/*-synthetic-1.json 2>/dev/null | head -n 1)"
if printf '%s' "$row" | grep -q 'skipped: no model'; then
  ok "skipped: no model"
elif [ "$code" -eq 0 ] && [ -n "$result" ] && printf '%s' "$row" | grep -q ' ok$' \
     && jq -e '(.score | type == "number") and (.cost | type == "number") and (.gates.total | type == "number") and (.seconds | type == "number")' "$result" >/dev/null; then
  ok "result $(basename "$result") has score $(jq .score "$result"), cost $(jq .cost "$result"), gates $(jq -r '"\(.gates.passed)/\(.gates.total)"' "$result")"
else
  bad "run.sh exit $code, row: ${row:-none}"; printf '%s\n' "$out" | tail -n 20
fi

echo "== calibrate.sh"
cal="$(tests/testset/calibrate.sh 2>&1)"; code=$?
if [ "$code" -eq 0 ] && printf '%s\n' "$cal" | grep -q '^decision ' && printf '%s\n' "$cal" | grep -q '^gate:'; then
  ok "calibrate printed a table with $(printf '%s\n' "$cal" | grep -c '^gate:') gate row(s)"
  printf '%s\n' "$cal" | head -n 6
elif printf '%s' "$row" | grep -q 'skipped: no model'; then
  ok "skipped: no model (no rows to calibrate)"
else
  bad "calibrate exit $code"; printf '%s\n' "$cal" | tail -n 10
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
