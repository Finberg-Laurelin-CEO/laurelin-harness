# Branch `deck-design`: notes from the build (2026-09-25)

Step 7 of `PLAN.md`, wave 3 item "deck-design skill". The brief is `docs/briefs/deck-design.md`. The test is `tests/test-deck-design.sh`. It passed 46 of 46 on 2026-09-25 on this machine. The live visual system, Playwright's Chromium from the deck kit and the Jev key were present. `tests/run-all.sh` now runs it last.

## What was built

| File | Does |
|---|---|
| `pack/skills/deck-design/SKILL.md` | The method in eight steps, the tools per step, the prohibitions, the conflict rule, and the ruling that LRL-DS is current and the kit's cream system is legacy |
| `style-pull.py` | Reads `lrl.css`, `README.md` and `components/` from `~/laurelin-visual-system` at run time and writes `.laurelin/style.json`. Today that holds 8 colours, 3 font stacks, the grid, the rules, the tracking, the opacity steps and the six type classes with their clamp values. It also holds a derived print scale for a 1920 by 1080 sheet, the image and logo rules, 11 devices, 10 pieces of drawing furniture, 18 cards and the 11-item forbidden list. `--print` shows it. No style value is in the repo, and the test checks that |
| `build.py` | The builder, derived from the rescued `gen4.py` and `patch4.py`. Seven sheet types: title, stats, columns, art, chart, close, appendix. Sheet numbers come from the list. One accent element per view. Photos are full colour with the 2 px rule and reticle corners. NDA-gated art renders only with `LAURELIN_NDA=1`, else a drawing slot names the file. Style overrides apply after the live tokens. A manifest sits beside the HTML |
| `render.mjs` | HTML to PDF at 1920 by 1080 through Playwright, resolved from `~/laurelin-deck-kit/node_modules`. Without Playwright it exits 3 with a skip line |
| `change.md`, `change.json`, `change.sh` | A request becomes one edit in one place. Jev labels the kind (`style_token`, `layout`, `copy`, `order`, `art`, `delivery`) with the criteria in `change.json`; under 0.6 the skill asks Joe |
| `register.py` | One JSON row per version into `versions.jsonl` (version, ISO date, pages, SHA-256, bytes, path, changes, build command, registered_at). Prints the row and the banner line. Writes only with `--apply` |
| `doctrine-check.sh` | Step 1: runs the kit's `bin/sync-doctrine.sh --check`, refuses on drift, never writes |
| `pack/gates/deck.sh`, `deck-check.py` | The deck gate. It checks the page count against the copy JSON, the sheet numbers in order, no grayscale raster (line art exempt), size under 5 MB, and the file at its real path and not through the `investors` symlink. Inside `_circulating-decks` it also needs a banner with pages, SHA-256 and build command |
| `pack/gates/allowed-roots.txt` | One line added: the real `_circulating-decks` directory |
| `tests/fixtures/deck/sample-copy.json` | An invented company with invented figures, three sheets, no art |

## Environment the pieces read

| Variable | Used by | Meaning |
|---|---|---|
| `LAURELIN_VISUAL_SYSTEM` | `style-pull.py` | The visual system folder. Default `~/laurelin-visual-system` |
| `LAURELIN_DECK_KIT` | `render.mjs`, `doctrine-check.sh` | The deck kit folder. Default `~/laurelin-deck-kit` |
| `LAURELIN_NDA` | `build.py` | `1` renders art marked `"nda": true`. Otherwise the drawing slot |
| `LAURELIN_DECK_COPY` | `deck.sh` | The copy JSON. Unset: key `copy` in `.laurelin/task.json`. Neither: skipped |
| `LAURELIN_DECK_INDEX` | `deck.sh` | An `_index.md` to check. Unset: the one beside the PDF, required only inside `_circulating-decks` |
| `LAURELIN_DECK_MAX_BYTES` | `deck.sh` | The size cap. Default 5,242,880 |
| `LAURELIN_JEV_THRESHOLD` | `change.sh` | Default 0.6 |

## What I learned

- **The vault is not readable from this build sandbox.** Every read of `~/Documents/Obsidian Vault/Laurelin/...` returned "Operation not permitted". That held through the shell and through the file tool, with the sandbox on and off. The investor-research branch hit the same wall. So the method in `SKILL.md` names the vault notes by path. I wrote it from the deck kit's `doctrine/` copies, which the brief says drift on six notes. The merge owner should read the three rule notes in the vault against sections 1, 4 and 6 of `SKILL.md` once.
- **From the sandbox, `sync-doctrine.sh --check` reports all ten notes as drifted.** The vault files exist but cannot be read, so `cmp` fails. From Joe's shell the brief's count of six holds. `doctrine-check.sh` reports what the kit's script says and prints the sync command. It does not run it.
- **Font stacks carry double quotes.** `lrl.css` sets `--font-display` to a quoted family list. Put into an inline `style="..."` attribute, the quotes end the attribute. Every declaration after `font-family` is lost. The first render had no padding and a serif fallback for that reason. `build.py` swaps the quotes to single quotes.
- **The type scale is derived, not typed.** `style.json` `deck.type` holds each role's print size from one rule. Evaluate the class's clamp at the README's 1024 px breakpoint, multiply by 1920/1024, round to 4 px. The display faces stop at their CSS max. Today that gives display 208, anchor 144, title 48, sub 32, body 28, small 20. The rescued generator used 220, 80, 44, 28, 24 by hand. A different scale is a `style.json` override, not a code edit.
- **`browse pdf` cannot print a sheet.** gstack's daemon prints at Letter and ignores `@page`. Playwright from the kit's `node_modules` prints 1920 by 1080 (1440 by 810 points). There is no second renderer, so the test prints a skip line for the PDF cases when Playwright is absent.
- **Grayscale detection has to exempt line art.** The visual system's drawings are black line on transparent. A colour-space check alone would fail every drawing. `deck-check.py` extracts each raster with `pdfimages`. An image is line art when 85 percent or more of its pixels are pure black, pure white or transparent. The rest are judged by mean saturation, and under 0.03 is gray. `pdfimages` numbers images from 0.
- **Reticle corners are 2 px borders too.** A check for "the accent rule changed to 1 px" must look for the rule helper's own pattern (`solid <colour>; padding-top:16px`), not for any 2 px border.
- **Jev labels change requests cleanly.** "make the orange rule thinner" gives `style_token` at 1.0. "change the ask to $4M" gives `copy` at 1.0. "move the ask to sheet 3" gives `order` at 0.97. The choice question uses `criteria` as an object of option to description, the shape the router uses.
- **The symlink check is a path comparison.** `os.path.abspath` against `os.path.realpath` of the PDF: any symlinked component fails. The `investors` link in the vault resolves to `~/Laurelin_Investors`, which is the case the brief names.
- **Cost of one test run:** five Jev calls (two layout pages, three change requests), well under 0.01 USD. Playwright launches Chromium five times, about 12 seconds in all. Nothing external to the repo changed. I installed nothing.

## Decisions for the merge owner

1. **Photos full colour is recorded as an override with its source** in `style-pull.py` (`OVERRIDES`) and in `style.json` `images.photo_filter_source`. The visual system README still says imagery is desaturated. Joe changes the README, or the override stays as the record of his ruling. I did not edit the README.
2. **The circulating-decks root** is a second line in `allowed-roots.txt`. The vault's `Laurelin` folder was already a root, so this is documentation of intent more than a new permission.
3. **`.laurelin/task.json` gains a `copy` key** that `deck.sh` reads. `set_task` in `laurelin-task.ts` does not accept it yet. One line in `KEYS` and `PATH_KEYS` there would close that.
4. **The evidence gate is wired by the method, not by code.** `SKILL.md` step 6 says to run the render inside `gstack-evidence run --label` so `evidence.sh` has a row. Nothing in this branch changes `evidence.sh`.
5. **A new sheet type is a branch.** `change.md` says so. Seven types cover the current deck's sheets. The exceptions are the two-sheet team layout, the schematic panel and the ruler block, which were hand-drawn devices in `gen4.py`. They come back as `art` sheets from exported SVGs, or as new types.

## Not done, on purpose

- No real deck was built. No vault write, no deck kit write, no edit to the kit's v4 scripts (out of scope in the brief).
- The skill is not linked into `~/.claude/skills` or `~/.agents/skills`. `bin/link-skills.sh` will pick it up when Joe runs it with `--apply`.
- White space (too much of it) is not scored, as in gates2.
- The method runs the `numbers`, `prose` and `verbatim` gates on the copy JSON's text and the PDF. The test runs `layout`, `deck` and `location` on the built PDF. The other three gates have their own tests.
