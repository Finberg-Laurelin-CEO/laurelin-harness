# Branch `gates2`: notes from the build (2026-09-25)

Step 4 of `PLAN.md`, wave 2 item 3. The numbers gate and the layout gate replace the two stubs in `pack/gates/`. Fixtures are in `tests/fixtures/numbers/` and `tests/fixtures/layout/`. The test is `tests/test-gates2.sh`. It passed 13 of 13 on 2026-09-25, and `tests/test-gates.sh` passed 15 of 15 with its stubs check replaced by a skip check.

## What was built

| Gate | Rung of the ladder | How it decides |
|---|---|---|
| `numbers.sh` | code + Jev | `numbers-extract.py` pulls every number with its phrase from the draft and from the canonical file. A draft number whose value never appears in the canonical file is "unverified" and fails unless `LAURELIN_NUMBERS_ALLOW_NEW=1`. The rest go to Jev in one batched call, one yes/no question per number. Any answer under 0.6 fails. |
| `layout.sh` | code + Jev | For a PDF, `pdftoppm -r 60` renders each page to PNG and `pdftotext -bbox-layout` gives word boxes. `layout-boxes.py` finds overlaps (word boxes from different lines that share more than 30 percent of the smaller box) and overflows (a box past the page edge). For each flagged page, Jev answers one yes/no question over the box list. A page fails at 0.6 or above. For an HTML file, gstack's headless browse daemon gives the box of every text node and the same detector runs. |

The two Python helpers are not executable on purpose. The launcher runs every executable file in `pack/gates/` as a gate, so a helper with the execute bit would run as a gate and fail.

## Environment the gates read

| Variable | Used by | Meaning |
|---|---|---|
| `LAURELIN_TARGET` | both | File or folder to check. Same rule as the other gates. Numbers reads `.md`, `.txt`, `.tex` and `.pdf` (through `pdftotext`). Layout reads one `.pdf` or `.html` file. |
| `LAURELIN_CANONICAL` | numbers | The canonical file. Unset: key `canonical` in `.laurelin/task.json` in the working directory (the bridge branch writes that file). Neither: `numbers: skipped, no canonical file`, exit 0. |
| `LAURELIN_NUMBERS_ALLOW_NEW` | numbers | `1` lets unverified numbers pass. The pass line still counts them. |
| `LAURELIN_LAYOUT_DIR` | layout | Where the page images go. Default: `$TMPDIR/laurelin-layout/<name>-<pid>`. The fail line and the log line name the folder. |
| `LAURELIN_JEV_THRESHOLD` | both | Default 0.6, from `lib.sh`. |

## Output shape

Same as the other gates: one status line, then up to three detail lines on a fail.

```
numbers: fail, 1 under 0.6, 0 unverified, of 2 numbers in bad.md, first three:
  30 (Jev 0.02): "The team has 30 engineers." [bad.md:4]
layout: fail, p.2 overlap: "text" over "a reader" (shared 0.64, Jev 0.83)
  p.2 overlap: "drawn should" over "right over" (shared 0.64, Jev 0.83)
  and 4 more; images in /tmp/laurelin-layout/bad-43573
layout: skipped, not a PDF or HTML file: note.md
```

## What I learned

- **Jev separates the number cases well.** A right number in a matching phrase scores 0.93 to 0.98. The wrong number in `bad.md` (30 engineers, where the canonical says 30 percent) scores 0.02. Each question carries the draft phrase and the canonical passages with the same value, so Jev compares sentence with sentence. The whole canonical text (first 40,000 characters) rides along as state.
- **Code answers "no counterpart" alone.** A value that appears nowhere in the canonical file cannot be supported by it, so the gate lists it as unverified without a Jev call. Jev only judges numbers whose value exists but may sit in the wrong phrase. This follows the ladder in section 8: code first, Jev second.
- **Value matching normalizes the form.** `$2.85M`, `2,850,000` and `2.85 million` all give the norm `2850000`. Percent signs and units stay in the phrase. List markers, heading numbers, inline code, URLs and digits glued to letters (`A1.4`, `v7`) are skipped.
- **pdftotext regroups overlapping text.** Two strings drawn 4 points apart come back as many small fragment lines, so the "first words" in a fail line are fragments such as `"Title Caption"`. The word boxes still intersect at 0.61 to 0.64 of the smaller box, well above the 0.30 rule. Superscripts and tight leading share thin slivers and stay under it.
- **Jev on the box list gives 0.77 to 0.88 for the broken page**, over three runs. That is above 0.6 but closer to it than the number cases. The threshold has room, but a calibration pass on real decks (job 1, job 4, job 14 in section 15) should come before the gate blocks a real run.
- **The browse daemon works from a gate.** `browse goto file://<abs>` then one `js` call over every text node returns boxes in about one second, headless. A text box past the viewport width counts as overflow. A page that scrolls down stays clean, because a long page is normal.
- **A broken renderer fails the gate. A missing renderer skips it.** No browse binary gives `skipped, no renderer`, but a file the daemon cannot open fails with the daemon's message. A silent skip there would let a broken page pass.
- **The fixtures are fictional.** `tests/fixtures/numbers/canonical.md` holds made-up figures for a made-up plant. No Laurelin number is in the repo (rule 6). `tests/fixtures/layout/make-fixtures.py` rebuilds both PDFs with reportlab. Each PDF is about 2 KB.
- **Cost of one test run:** six Jev calls, a total under 0.01 USD. The test starts no Prime session and installs nothing. Nothing under `~/.prime`, `~/.claude` or `~/.gstack` changed. The browse daemon keeps its own state where gstack put it.

## Decisions for the merge owner

1. `lib.sh` is unchanged. The skip line is printed inline in each gate, because the bridge branch also edits `lib.sh` (a task.json helper). If bridge adds a `gate_skip` helper, both gates can call it.
2. The numbers gate reads `.laurelin/task.json` key `canonical` from the working directory, as the brief says. The bridge branch owns writing that key. `set_task` should accept `canonical` as well.
3. `tests/test-gates.sh` now checks that numbers and layout skip without their inputs, in place of the "not built" check. The full test for both gates is `tests/test-gates2.sh`. `tests/run-all.sh` runs it after `gates`.
4. The HTML cases in the test run only when `~/.claude/skills/gstack/browse/dist/browse` exists. On this machine they ran and passed.

## Not done, on purpose

- Numbers from the `laurelin-reactor-calcs` skill are not checked. The brief names one canonical file. A second source can join the same request as more canonical passages.
- The layout gate judges box lists, not pixels. The page images are rendered and named in the log for a later reviewer rung. Prime does not show images to the model.
- White space (too much of it, section 5) is not scored. The brief did not ask for it.
