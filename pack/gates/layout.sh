#!/usr/bin/env bash
# layout gate: no page of the target has text drawn over other text or text past the page edge.
# PDF: pdftoppm renders each page to PNG (the image reference), pdftotext -bbox-layout gives
# word boxes, layout-boxes.py finds overlaps (boxes from different lines sharing more than
# 30 percent of the smaller box) and overflows (boxes past the page edge). For each flagged
# page, Jev answers one yes/no question over the box list: is this a real fault a reader
# would see? A page fails at or above the threshold (LAURELIN_JEV_THRESHOLD, default 0.6).
# HTML: gstack's headless browse daemon loads the file and reports the box of every text
# node; the same detector and question apply. No daemon: "skipped, no renderer".
# Any other target: "skipped, not a PDF or HTML file", exit 0.
#
# Environment:
#   LAURELIN_TARGET      the file to check. See lib.sh.
#   LAURELIN_LAYOUT_DIR  where page images go. Default: $TMPDIR/laurelin-layout/<name>-<pid>
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CHECK=layout
export PATH="$HOME/.local/bin:$PATH"
BOXES="$GATE_DIR/layout-boxes.py"
BROWSE="$HOME/.claude/skills/gstack/browse/dist/browse"
question="no page has text drawn over other text or text past the page edge"

skip() {  # skip WHY: the gate cannot apply; not a failure.
  gate_log "$CHECK" "$(jq -nc --arg t "${target:-}" '{target: $t}')" "$question" "$1" 1 skipped
  printf '%s: skipped, %s\n' "$CHECK" "$1"; exit 0
}

target="$(gate_target)" || gate_fail "$CHECK" "no target: set LAURELIN_TARGET or change a file in the worktree"
[ -f "$target" ] || skip "not a PDF or HTML file: $target"
case "$target" in
  *.pdf|*.PDF) kind=pdf ;;
  *.html|*.htm) kind=html ;;
  *) skip "not a PDF or HTML file: $(basename "$target")" ;;
esac
name="$(basename "$target")"
outdir="${LAURELIN_LAYOUT_DIR:-${TMPDIR:-/tmp}/laurelin-layout/${name%.*}-$$}"
mkdir -p "$outdir"

# Rung 1, code: render, get boxes, detect.
if [ "$kind" = pdf ]; then
  command -v pdftoppm >/dev/null && command -v pdftotext >/dev/null || gate_fail "$CHECK" "pdftoppm or pdftotext not found (poppler)"
  pdftoppm -r 60 -png "$target" "$outdir/page" 2>/dev/null || gate_fail "$CHECK" "pdftoppm could not render $name"
  found="$(pdftotext -bbox-layout "$target" - 2>/dev/null | python3 "$BOXES" pdf)" || gate_fail "$CHECK" "could not read word boxes from $name"
else
  [ -x "$BROWSE" ] || skip "no renderer (gstack browse daemon not installed)"
  abs="$(cd "$(dirname "$target")" && pwd)/$name"
  nav="$("$BROWSE" goto "file://$abs" 2>&1)" || gate_fail "$CHECK" "browse could not open $name: $(printf '%s\n' "$nav" | grep -v '^\[browse\]' | tail -n 1)"
  "$BROWSE" screenshot "$outdir/page-1.png" >/dev/null 2>&1 || true
  js='(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const boxes = []; let n;
        while ((n = w.nextNode())) { if (!n.textContent.trim()) continue; const r = document.createRange(); r.selectNodeContents(n);
          const b = r.getBoundingClientRect(); if (b.width > 0 && b.height > 0) boxes.push({text: n.textContent.trim().slice(0, 60), x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height}); }
        return JSON.stringify({width: window.innerWidth, height: document.documentElement.scrollHeight, boxes}); })()'
  boxes="$("$BROWSE" js "$js" 2>/dev/null | grep -v '^\[browse\]' | tail -n 1)"
  printf '%s' "$boxes" | jq -e .boxes >/dev/null 2>&1 || gate_fail "$CHECK" "browse gave no boxes for $name"
  found="$(printf '%s' "$boxes" | python3 "$BOXES" html)" || gate_fail "$CHECK" "could not read boxes for $name"
fi
pages="$(printf '%s' "$found" | jq '.pages')"
flagged_n="$(printf '%s' "$found" | jq '.flagged | length')"
if [ "$flagged_n" -eq 0 ]; then
  gate_log "$CHECK" "$(jq -nc --arg t "$target" --argjson p "$pages" --arg d "$outdir" '{target: $t, pages: $p, flagged: [], images: $d}')" "$question" "no overlap or overflow found by code" 1 pass
  gate_pass "$CHECK" "$pages pages of $name, no overlap or overflow"
fi

# Rung 2, Jev: one question per flagged page, all in one batched call.
request="$(printf '%s' "$found" | jq -c --arg d "$outdir" '
  {state: {document: "page images rendered to \($d)/page-<n>.png; boxes are [xMin, yMin, xMax, yMax] in points from the top-left; ratio is the shared area as a fraction of the smaller box",
           pages: [.flagged[] | {page, page_image: "\($d)/page-\(.page).png", width, height,
                   faults: [.faults[] | if .kind == "overlap" then {kind, text_a: .a, text_b: .b, word_a, word_b, box_a, box_b, shared_ratio: .ratio}
                                        else {kind, text: .a, word, box: .box_a, past_edge: .edge} end]}]},
   questions: ([.flagged[] | {key: "p\(.page)", value: {type: "noul", instructions:
      "On page \(.page) the listed faults are real: a reader would see text drawn over other text, or text cut off past the page edge.",
      focus: "Boxes that share most of their area are text drawn over text. A box that extends past the page width or height is cut off. A thin sliver shared by boxes on neighbouring lines, or a superscript, footnote mark or drop cap touching its line, is not a fault."}}] | from_entries)}')"
raw="$(printf '%s' "$request" | jev --raw 2>&1)" || gate_fail "$CHECK" "Jev call failed: $(printf '%s\n' "$raw" | head -n 1)"
answers="$(printf '%s' "$raw" | jq -c '.answers | with_entries(.value = .value.noul)')" || gate_fail "$CHECK" "Jev returned no answers"

verdict="$(printf '%s' "$found" | jq -c --argjson a "$answers" --arg t "$JEV_THRESHOLD" '
  ($t | tonumber) as $thr
  | [.flagged[] | . + {p: ($a["p\(.page)"] // 0)}]
  | {failed: [.[] | select(.p >= $thr)], cleared: [.[] | select(.p < $thr) | {page, p}], top: ([.[].p] | max)}')"
failed_n="$(printf '%s' "$verdict" | jq '.failed | length')"
top="$(printf '%s' "$verdict" | jq -r '.top')"
inputs="$(jq -nc --arg t "$target" --argjson p "$pages" --argjson f "$found" --argjson v "$verdict" --arg d "$outdir" '
  {target: $t, pages: $p, images: $d,
   flagged: [$f.flagged[] | {page, faults: [.faults[] | {kind, a, b, ratio, edge}]}], cleared: $v.cleared,
   failed: [$v.failed[] | {page, p}]}')"
if [ "$failed_n" -gt 0 ]; then
  gate_log "$CHECK" "$inputs" "$question" "$failed_n of $flagged_n flagged pages are real faults" "$top" fail
  lines="$(printf '%s' "$verdict" | jq -r '.failed[] | .page as $pg | .p as $p | .faults[] |
    if .kind == "overlap" then "p.\($pg) overlap: \"\(.a)\" over \"\(.b)\" (shared \(.ratio), Jev \($p))"
    else "p.\($pg) overflow: \"\(.a)\" past \(.edge) edge (Jev \($p))" end')"
  printf '%s: fail, %s\n' "$CHECK" "$(printf '%s\n' "$lines" | head -n 1)"
  printf '%s\n' "$lines" | sed -n '2,3p' | sed 's/^/  /'
  n="$(printf '%s\n' "$lines" | wc -l | tr -d ' ')"
  [ "$n" -gt 3 ] && printf '  and %s more; images in %s\n' "$((n - 3))" "$outdir"
  exit 1
fi
gate_log "$CHECK" "$inputs" "$question" "Jev cleared $flagged_n flagged pages" "$(printf '%s\n' "$top" | awk '{printf "%.2f", 1 - $1}')" pass
gate_pass "$CHECK" "$pages pages of $name, $flagged_n flagged by code and cleared by Jev (top $top)"
