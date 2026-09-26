#!/usr/bin/env bash
# deck gate: a built deck PDF matches its copy JSON and is fit to file.
# Code alone (deck-check.py): page count equals the sheet count, sheet numbers run 1..N in
# order, no grayscale raster image (line art exempt), size under the cap after compression,
# the file sits at its real path (never through the `investors` symlink), and when the PDF is
# in `_circulating-decks` the `_index.md` banner names the pages, the SHA-256 and the build.
#
# Environment:
#   LAURELIN_TARGET         the PDF. See lib.sh. Not a PDF: "skipped".
#   LAURELIN_DECK_COPY      the copy JSON the deck was built from. Unset: key "copy" in
#                           .laurelin/task.json. Neither: "skipped, no copy JSON", exit 0.
#   LAURELIN_DECK_INDEX     an _index.md to check. Unset: the one beside the PDF, required only
#                           inside a folder named _circulating-decks.
#   LAURELIN_DECK_MAX_BYTES size cap. Default 5242880 (5 MB).
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CHECK=deck
export PATH="$HOME/.local/bin:$PATH"
HELPER="$GATE_DIR/deck-check.py"
question="the built deck matches its copy JSON and is fit to file"

skip() {
  gate_log "$CHECK" "$(jq -nc --arg t "${target:-}" '{target: $t}')" "$question" "$1" 1 skipped
  printf '%s: skipped, %s\n' "$CHECK" "$1"; exit 0
}

target="$(gate_target)" || gate_skip "$CHECK" target
[ -f "$target" ] || skip "not a PDF file: $target"
case "$target" in *.pdf|*.PDF) ;; *) skip "not a PDF file: $(basename "$target")" ;; esac
copy="${LAURELIN_DECK_COPY:-}"
if [ -z "$copy" ] && [ -f "$TASK_FILE" ]; then
  copy="$(jq -r '.copy // empty' "$TASK_FILE" 2>/dev/null)"
  [ -n "$copy" ] && copy="$(gate_task_path "$copy")"
fi
[ -n "$copy" ] || skip "no copy JSON (set LAURELIN_DECK_COPY)"
[ -f "$copy" ] || gate_fail "$CHECK" "copy JSON does not exist: $copy"
for t in pdfinfo pdftotext pdfimages; do command -v "$t" >/dev/null || gate_fail "$CHECK" "$t not found (poppler)"; done

args=("$target" "$copy" --max-bytes "${LAURELIN_DECK_MAX_BYTES:-5242880}")
[ -n "${LAURELIN_DECK_INDEX:-}" ] && args+=(--index "$LAURELIN_DECK_INDEX")
tmp="${TMPDIR:-/tmp}/laurelin-deck/$(basename "${target%.*}")-$$"
mkdir -p "$tmp"
report="$(python3 "$HELPER" "${args[@]}" --tmp "$tmp" 2>&1)" || gate_fail "$CHECK" "deck-check.py failed: $(printf '%s\n' "$report" | tail -n 1)"
printf '%s' "$report" | jq -e . >/dev/null 2>&1 || gate_fail "$CHECK" "deck-check.py gave no JSON: $(printf '%s\n' "$report" | tail -n 1)"

n="$(printf '%s' "$report" | jq '.problems | length')"
inputs="$(jq -nc --arg t "$target" --arg c "$copy" --argjson r "$report" '{target: $t, copy: $c} + ($r | del(.problems)) + {problems: $r.problems}')"
if [ "$n" -gt 0 ]; then
  gate_log "$CHECK" "$inputs" "$question" "$n problems" 1 fail
  printf '%s: fail, %s problem(s) in %s, first three:\n' "$CHECK" "$n" "$(basename "$target")"
  printf '%s' "$report" | jq -r '.problems[]' | head -n 3 | sed 's/^/  /'
  exit 1
fi
summary="$(printf '%s' "$report" | jq -r '"\(.pages) pages, \(.numbered) numbered sheets in order, \(.images.images) images (\(.images.colour) colour, \(.images.lineart) line art), \((.bytes / 1048576 * 10 | round) / 10) MB"')"
gate_log "$CHECK" "$inputs" "$question" "$summary" 1 pass
gate_pass "$CHECK" "$summary, $(basename "$target") matches $(basename "$copy")"
