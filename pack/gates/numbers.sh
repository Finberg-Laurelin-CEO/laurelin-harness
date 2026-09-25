#!/usr/bin/env bash
# numbers gate: stub. Will pull every number from the draft and check each against the
# canonical document with jev-documents. See docs/branch-notes/gates.md.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CHECK=numbers
gate_log "$CHECK" '{}' "every number in the draft matches the canonical document" "not built" 1 skipped
printf '%s: not built\n' "$CHECK"
exit 0
