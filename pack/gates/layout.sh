#!/usr/bin/env bash
# layout gate: stub. Will render each PDF page with pdftoppm, detect overlap and overflow,
# and ask Jev for the verdict. See docs/branch-notes/gates.md.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CHECK=layout
gate_log "$CHECK" '{}' "no page has overlapping or overflowing text" "not built" 1 skipped
printf '%s: not built\n' "$CHECK"
exit 0
