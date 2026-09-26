#!/usr/bin/env bash
# fit.sh: grade one investor description with Jev, using the question set in fit.json.
#
#   fit.sh DESCRIPTION_FILE [--json]
#
# Prints one line:  laurelin_fit: <A|B|C|D|unverified> (confidence N.NN), landmine: <yes|no> (fee N, agent N, conflict N)
# With --json, prints the raw Jev answers instead. Exit 0 on a grade or a skip, 1 on an error.
# Without TYPESAFE_API_KEY, prints "fit: skipped, no TYPESAFE_API_KEY" and exits 0.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/bin:$PATH"
THRESHOLD="${LAURELIN_JEV_THRESHOLD:-0.6}"

file="${1:-}"; mode="${2:-}"
[ -n "$file" ] && [ -f "$file" ] || { echo "usage: fit.sh DESCRIPTION_FILE [--json]" >&2; exit 1; }
if [ -z "${TYPESAFE_API_KEY:-}" ] && ! grep -q '^export TYPESAFE_API_KEY=\|^TYPESAFE_API_KEY=' "$HOME/.config/agent-keys/env" 2>/dev/null; then
  echo "fit: skipped, no TYPESAFE_API_KEY"; exit 0
fi
command -v jev >/dev/null || { echo "fit: error, jev is not on PATH" >&2; exit 1; }

request="$(jq -nc --rawfile d "$file" --slurpfile q "$HERE/fit.json" '{state: {firm_description: $d}, questions: $q[0]}')"
raw="$(printf '%s' "$request" | jev --raw 2>&1)" || { echo "fit: error, Jev call failed: $(printf '%s\n' "$raw" | head -n 1)" >&2; exit 1; }
printf '%s' "$raw" | jq -e '.answers.laurelin_fit.score' >/dev/null 2>&1 || { echo "fit: error, Jev returned no answers" >&2; exit 1; }

if [ "$mode" = "--json" ]; then printf '%s\n' "$raw" | jq '.answers'; exit 0; fi

printf '%s' "$raw" | jq -r --arg t "$THRESHOLD" '
  ($t | tonumber) as $thr
  | .answers as $a
  | ($a.laurelin_fit.score | . + 0.5 | floor | if . > 3 then 3 elif . < 0 then 0 else . end) as $lvl
  | (["D","C","B","A"][$lvl]) as $letter
  | (if $a.laurelin_fit.confidence >= $thr then $letter else "unverified (Jev said \($letter))" end) as $grade
  | ([$a.fee_for_intro.noul, $a.placement_agent.noul, $a.conflict.noul] | max) as $lm
  | "laurelin_fit: \($grade) (confidence \($a.laurelin_fit.confidence)), landmine: \(if $lm >= $thr then "yes" else "no" end) (fee \($a.fee_for_intro.noul), agent \($a.placement_agent.noul), conflict \($a.conflict.noul))"'
