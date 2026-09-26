#!/usr/bin/env bash
# investors gate: the investor corpus under the target is complete and wired.
# Every firm folder has _index.md, every person note is linked from its firm's people block and
# links back, every fact line with a URL carries a date, frontmatter has the required keys, and
# no email address appears without an email_status. The rules and the exact checks are in
# investors-check.py (code, no Jev: these are anchors, not judgments).
#
# Environment:
#   LAURELIN_TARGET   the investors root, one firm folder, or a file inside one. See lib.sh.
#                     A target that is none of these prints "skipped" and exits 0.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CHECK=investors
CHECKER="$GATE_DIR/investors-check.py"
question="every firm has an index, every person is linked both ways, every fact with a URL is dated, frontmatter is complete, no email lacks a status"

target="$(gate_target)" || gate_skip "$CHECK" target
[ -e "$target" ] || gate_fail "$CHECK" "target does not exist: $target"

report="$(python3 "$CHECKER" "$target" 2>&1)" || gate_fail "$CHECK" "checker error: $(printf '%s\n' "$report" | tail -n 1)"
kind="$(printf '%s' "$report" | jq -r '.kind')"
if [ "$kind" = "none" ]; then
  gate_log "$CHECK" "$(jq -nc --arg t "$target" '{target: $t}')" "$question" "not an investors root" 1 skipped
  printf '%s: skipped, not an investors root or firm folder: %s\n' "$CHECK" "$target"; exit 0
fi

problems="$(printf '%s' "$report" | jq '.problems | length')"
notes="$(printf '%s' "$report" | jq '.notes | length')"
summary="$(printf '%s' "$report" | jq -r '"\(.firms) firms (\(.categories) categories), \(.people) people, \(.facts) sourced facts"')"
inputs="$(printf '%s' "$report" | jq -c --arg t "$target" '{target: $t, kind, firms, categories, people, facts, problems: (.problems[:20]), notes: (.notes[:20])}')"

if [ "$problems" -gt 0 ]; then
  gate_log "$CHECK" "$inputs" "$question" "$problems problems" 1 fail
  printf '%s: fail, %s problems in %s, first three:\n' "$CHECK" "$problems" "$summary"
  printf '%s' "$report" | jq -r '.problems[:3][] | "  " + .'
  exit 1
fi
gate_log "$CHECK" "$inputs" "$question" "0 problems, $notes notes" 1 pass
extra=""
[ "$notes" -gt 0 ] && extra=", $notes notes (see the gate log)"
gate_pass "$CHECK" "$summary, all linked both ways$extra"
