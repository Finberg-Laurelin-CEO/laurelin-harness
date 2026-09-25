# Branch `gates2`: the numbers gate and the layout gate

Plan: section 5; Step 4; section 15 (jobs that exercise B and C); section 20 wave 2 item 3. Read `docs/branch-notes/gates.md` and `pack/gates/lib.sh` first, and follow the output shape and log line the other gates use.

## Make
1. `pack/gates/numbers.sh`: extracts every number with its surrounding phrase from the target (markdown, text, tex; for PDF use `pdftotext` if present), and from a canonical file given by `LAURELIN_CANONICAL` (or `.laurelin/task.json` key `canonical` once branch `bridge` lands; read the variable first). For each number in the target, ask Jev one question per number in one batched call, using the `jev-documents` skill pattern (`~/.claude/skills/jev-documents/SKILL.md`): "Does the canonical text support this number in this phrase?" Fail on any number under 0.6, printing the first three with the phrase. Numbers with no counterpart in the canonical file are listed as "unverified" and fail unless `LAURELIN_NUMBERS_ALLOW_NEW=1`. Skip with exit 0 when no canonical file is given.
2. `pack/gates/layout.sh`: for a PDF target, render each page with `pdftoppm -r 60 -png`, then detect text-box overlap and overflow. First try a deterministic path: `pdftotext -bbox-layout` gives word boxes; two boxes from different lines that intersect by more than 30 percent of the smaller box's area is an overlap; a box past the page edge is an overflow. Then, for each page flagged, ask Jev one Noul question with the page image reference and the box list: "Is this a real overlap a reader would see?" (Jev takes text; describe the boxes). Fail listing `p.<n> overlap: <first words>`. For HTML targets, use gstack's browse daemon (`~/.claude/skills/browse/SKILL.md`, `goto file://`, `js` for bounding boxes) if available; otherwise print `skipped, no renderer`. Skip with exit 0 when the target is not a PDF or HTML file.
3. Fixtures in `tests/fixtures/`: a small canonical text and a target with one right and one wrong number; a two-page PDF made with any local tool (LaTeX, `make-pdf`, or a tiny reportlab script) with one page clean and one page with two overlapping text boxes. Commit the PDFs (small).

## Test
`tests/test-gates2.sh`: each gate passes on its good fixture and fails on its bad fixture with the expected first line, and both skip cleanly when inputs are absent. Add the two gates to the `tests/test-gates.sh` stubs check (they are no longer stubs).

## Out of scope
The bridge, the panels, real Laurelin documents.
