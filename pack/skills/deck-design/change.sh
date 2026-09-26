#!/usr/bin/env bash
# change.sh: classify one aesthetic or content change request with Jev (question set in change.json).
#
#   change.sh "make the orange rule thinner"
#   change.sh --json "change the ask to $4M"
#
# Prints one line:  change: <style_token|layout|copy|order|art|delivery> (confidence N.NN)
# Under the threshold (LAURELIN_JEV_THRESHOLD, default 0.6) the kind is "unverified (Jev said X)"
# and the caller asks Joe. Without TYPESAFE_API_KEY, prints "change: skipped, no TYPESAFE_API_KEY"
# and exits 0. change.md says what each kind edits.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/bin:$PATH"
THRESHOLD="${LAURELIN_JEV_THRESHOLD:-0.6}"

mode=""
if [ "${1:-}" = "--json" ]; then mode=json; shift; fi
request="${1:-}"
[ -n "$request" ] || { echo "usage: change.sh [--json] \"<request>\"" >&2; exit 1; }
if [ -z "${TYPESAFE_API_KEY:-}" ] && ! grep -q '^export TYPESAFE_API_KEY=\|^TYPESAFE_API_KEY=' "$HOME/.config/agent-keys/env" 2>/dev/null; then
  echo "change: skipped, no TYPESAFE_API_KEY"; exit 0
fi
command -v jev >/dev/null || { echo "change: error, jev is not on PATH" >&2; exit 1; }

body="$(jq -nc --arg r "$request" --slurpfile q "$HERE/change.json" '{state: {request: $r}, questions: $q[0]}')"
raw="$(printf '%s' "$body" | jev --raw 2>&1)" || { echo "change: error, Jev call failed: $(printf '%s\n' "$raw" | head -n 1)" >&2; exit 1; }
printf '%s' "$raw" | jq -e '.answers.kind.choice' >/dev/null 2>&1 || { echo "change: error, Jev returned no answer" >&2; exit 1; }
if [ "$mode" = json ]; then printf '%s\n' "$raw" | jq '.answers.kind'; exit 0; fi
printf '%s' "$raw" | jq -r --arg t "$THRESHOLD" '
  ($t | tonumber) as $thr | .answers.kind as $a
  | (if $a.confidence >= $thr then $a.choice else "unverified (Jev said \($a.choice))" end) as $kind
  | "change: \($kind) (confidence \($a.confidence))"'
