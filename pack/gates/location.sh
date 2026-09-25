#!/usr/bin/env bash
# location gate: the target exists and sits under an allowed root. Prints the absolute path.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CHECK=location
ROOTS_FILE="${LAURELIN_ALLOWED_ROOTS:-$GATE_DIR/allowed-roots.txt}"

target="$(gate_target)" || gate_fail "$CHECK" "no target: set LAURELIN_TARGET or change a file in the worktree"
[ -e "$target" ] || gate_fail "$CHECK" "does not exist: $target"

# Two spellings of the absolute path: as given (symlinks kept) and physical (symlinks resolved).
# The vault's Laurelin folder holds symlinked subfolders, so either may be the one under a root.
abs_of() {
  if [ -d "$1" ]; then (cd "$1" && pwd "$2"); else printf '%s/%s\n' "$(cd "$(dirname "$1")" && pwd "$2")" "$(basename "$1")"; fi
}
logical="$(abs_of "$target" -L)"
physical="$(abs_of "$target" -P)"

under() { case "$1" in "$2"|"$2"/*) return 0 ;; esac; return 1; }

[ -f "$ROOTS_FILE" ] || gate_fail "$CHECK" "allowed-roots file missing: $ROOTS_FILE"
matched=""
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|'#'*) continue ;; esac
  root="${line/#\$REPO/$REPO_ROOT}"
  root="${root/#\~/$HOME}"
  root="${root%/}"
  [ -d "$root" ] || continue
  root_p="$(cd "$root" && pwd -P)"
  if under "$logical" "$root" || under "$physical" "$root_p"; then matched="$root"; break; fi
done < "$ROOTS_FILE"

inputs="$(jq -nc --arg t "$target" --arg a "$logical" --arg r "$matched" '{target: $t, absolute: $a, root: $r}')"
question="the target exists and is under an allowed root"
if [ -z "$matched" ]; then
  gate_log "$CHECK" "$inputs" "$question" "outside every allowed root" 1 fail
  gate_fail "$CHECK" "$logical is outside every allowed root in $ROOTS_FILE"
fi
gate_log "$CHECK" "$inputs" "$question" "under $matched" 1 pass
gate_pass "$CHECK" "$logical is under $matched"
