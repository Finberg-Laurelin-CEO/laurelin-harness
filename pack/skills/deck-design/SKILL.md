---
name: deck-design
description: Build, revise and file a Laurelin investor deck in the live visual system: pull the current style, apply the change Joe describes as one edit, run the deck gates, register the version. Use for "new deck version", "make the rule thinner", "move the ask".
---

# deck-design

This skill holds the method and the tools. Every word on a sheet, every number, every image and every Laurelin fact lives in the vault or the deck kit. The skill repeats none of them.

## Which system is current

The **Laurelin Visual System** (`~/laurelin-visual-system`: bone and carbon grounds, one accent, a grotesque display face and a technical mono, a Swiss 12-column grid, `lrl.css`) is the current style. Joe's words: "the visual style we use now". The current circulating deck is built in it.

The deck kit's cream system (`~/laurelin-deck-kit/laurelin-deck.css`, cream paper, a pixel mono and an italic serif, `bin/build-v8.py`) is legacy. Use it only when Joe names an old deck by version.

The style is never copied into this repo. `style-pull.py` reads it fresh at the start of every run.

## Where things live

| What | Path |
|---|---|
| The rules, and how they rank | `Laurelin/Style Guide/Deck Design — Cote Rules.md` wins over the others until Joe rules otherwise; that note lists the doctrine conflicts one by one and Joe decides each, none averaged. `Non-Technical Deck Doctrine.md` wins over `Deck Design.md` on density, for non-technical audiences only, and is itself superseded for technical or fusion audiences (it carries a dead-rules list and a survivors list; use the survivors). Then `Deck Design.md`, `Deck Format.md` and `Writing Rules.md`. All under the vault; read them through `bin/vault-io` when a direct read is refused |
| The kit's convenience copies of those notes | `~/laurelin-deck-kit/doctrine/` (byte copies, checked by `bin/sync-doctrine.sh --check`) |
| The live visual system | `~/laurelin-visual-system/lrl.css`, `README.md`, `components/`, `fonts/`, `assets/drawing/CLEARANCE.md` |
| The copy of the current deck | `~/laurelin-deck-kit/content/vN-copy.json` (v8 today) |
| The generator the current deck came from | `~/laurelin-deck-kit/lrl-v8-rescued-20260925/` (`gen4.py`, `patch4.py`, `fixflex.py`, the check PNGs) |
| Canonical figures | the newest engineering source the task names, through the `numbers` gate. `laurelin-reactor-calcs` for any physics number |
| Filed decks and the version register | `Laurelin/Investor Research/_circulating-decks/` in the vault: `_index.md` (banner), `versions.jsonl` (register), `_superseded/` |
| Per-firm decks | `Laurelin/investors/<Firm>/` and `Laurelin/Investor Research/<Firm>/` |

Read the vault notes, never their copies, when both are reachable. The `investors` folder is a symlink. File through the real `Investor Research/_circulating-decks` directory only.

## Authority

"Build the deck" grants build, layout, check and filing authority. It grants nothing else.

- Joe writes every word an investor reads. The skill lays words out, checks them and flags them. It never drafts a headline, a body line or an ask.
- A number comes from the canonical source the task names. The skill never re-derives one and never invents an ask.
- Two sources that disagree on a figure are a **conflict**. The skill writes both values, both sources and both dates into the branch of the work log and stops on that sheet. Joe resolves it.
- Two rule notes that disagree are handled the same way: both rules, both notes, stop on that sheet. The notes name their open conflicts (starting point, length, team and traction sheets, memo before deck, prose method, market framing) and the questions only Joe can answer; the skill flags these and never decides them.
- Nothing leaves the machine. No email, no upload, no share link.

## Tools

| Job | Tool |
|---|---|
| Doctrine drift check | `doctrine-check.sh` (wraps the kit's `bin/sync-doctrine.sh --check`) |
| The live style as tokens | `style-pull.py` writes `.laurelin/style.json`. `--print` shows it |
| Build the HTML | `build.py --copy <json> --style .laurelin/style.json --out <html>` |
| Print to PDF | `render.mjs <html> <pdf>` (Playwright from the kit's `node_modules`) |
| Compress | `gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -o <small.pdf> <pdf>` |
| Classify a change request | `change.sh "<request>"` with the question set in `change.json`. `change.md` says what each kind edits |
| The checks | `pack/gates/layout.sh`, `numbers.sh`, `prose.sh`, `verbatim.sh`, `location.sh`, `evidence.sh`, `deck.sh` |
| Register a version | `register.py --version vN --pdf <pdf> --changes "..." --build "..." [--apply]` |
| Prose lint on the copy JSON | `writing-ste` (`ste-lint.py --house --dict`), `jev-sweep`, `humanizer` (check only; it never rewrites a line, Joe writes every public word) |
| Look at every sheet | `pdftoppm -r 60 -png <pdf> <dir>/page`, then read each image |

## The steps, in order

Every step ends with a check. Do not start the next step while the check fails.

### 1. Doctrine

- **Run:** `doctrine-check.sh`.
- **Pass:** `doctrine: pass`. On `doctrine: fail`, stop and give Joe the sync command it prints. The skill never writes the kit's `doctrine/` folder.
- Read the three rule notes in the order above. Read the firm's `Deck Guidance - <Firm>.md` for a per-firm deck.
- Ask Joe whether this version adapts the filed deck or starts from a blank deck; the notes disagree on the starting point, and one of them asks for a one-to-two-page memo before any deck.
- For a per-firm deck, a tailoring pass against the firm's guidance note: mirror what the firm says it wants, never invent alignment, never cite another firm's interest.

### 2. Ground

- **Read:** the current filed deck (the PDF in `_circulating-decks`, page by page as images), its copy JSON and its `_index.md` banner. Read the newest engineering source the task names for every figure.
- **Write:** `.laurelin/task.json` with `target` (the PDF you will produce), `copy` (the copy JSON), `canonical` (the figure source), `original` (a file of Joe's own lines) and `claim`. The gates read it.
- **Forbidden:** working from memory of the deck. Guessing a figure. Reading `content/vN-copy.json` as a fact source for anything but the words.

### 3. Style
- The full-colour photo rule comes from Joe's spoken ruling recorded in a memory note; the visual system README still says the opposite and calls the system a draft. Ask Joe to record both rulings in the vault. Until then the skill follows Joe's ruling and says so in the work log.

- **Run:** `style-pull.py`. It reads `lrl.css`, `README.md` and `components/` and writes `.laurelin/style.json`.
- **Pass:** the line names the system (`LRL-DS-001` today), its colour count, its type classes and its forbidden list.
- Photos are full colour in a deck (Joe, 2026-09-23). The README's desaturation rule is recorded in `style.json` as overruled, with its source.

### 4. The change
- An `order` request that adds a team sheet, a traction sheet or a table-and-boxes sheet, or a `copy` request that touches one of the notes' open questions, stops and asks Joe before any edit.

- **Run:** `change.sh "<Joe's request>"`. Jev labels it `style_token`, `layout`, `copy`, `order`, `art` or `delivery`. Under 0.6 confidence, ask Joe which it is.
- **Edit** only what `change.md` allows for that kind. Style and layout changes edit `style.json` overrides or a sheet's `type`, never the words. Copy changes go through the verbatim gate. Order changes edit the `sheets` list.
- **Write:** a new copy JSON `content/v(N+1)-copy.json` in the kit. Never edit the current version in place. Never edit the generated HTML.

### 5. Build and render

- **Run:** `build.py --copy content/v(N+1)-copy.json --style .laurelin/style.json --out _out/deck-v(N+1).html`, then `render.mjs`, then `gs` `/ebook`.
- **Pass:** the build line reports the sheet count you expect. The render line reports the same count. `pdfinfo` reports that many pages at 1440 by 810 points.
- NDA-gated art renders only with `LAURELIN_NDA=1`, and only when the sheet's `art` carries `"nda": true`. Without it the sheet keeps its place with a drawing slot that names the file. A deck with NDA art stays private. `CLEARANCE.md` says which files are cleared.

### 6. The checks
- The prose gate must catch the deck-specific banned patterns the notes name: semantic negation in any form, emphasis with no fact under it, boxes that say little, unnamed bets, a metric used before it is explained in plain words, framing that contradicts what the customer buys, and any line that would survive being said about another company.
- The eye pass also looks for arrows that miss their box, a chart that does not fill its frame, line art scaled below about 60 percent, and a figure with no source tag on the sheet. Every number on a sheet carries its source; a derived figure states its basis; nothing a single phone call could kill; no investor names.
- Report the sheet count against both lengths the notes give (about ten, or the longer range); Joe picks.
- The ten-second read test per sheet, and the room test: can Joe answer the sheet aloud with no agent.

Run every gate with `LAURELIN_TARGET` on the compressed PDF. Read the one line each prints.

| Gate | Catches |
|---|---|
| `layout.sh` | text over text, text past the edge, on every page |
| `numbers.sh` | a figure the canonical source does not support (`LAURELIN_CANONICAL`) |
| `prose.sh` | a house-rule hit in the copy JSON's text (export the strings to a `.md` first) |
| `verbatim.sh` | one of Joe's lines changed (`LAURELIN_ORIGINAL`) |
| `deck.sh` | page count against the copy, sheet numbers out of order, a grayscale photo, over 5 MB, filed through the symlink, a banner without pages, SHA-256 or build |
| `location.sh` | the file outside the allowed roots |
| `evidence.sh` | a claim of done with no ledger row (wrap the render in `gstack-evidence run --label`) |

Then look at every page image. The layout gate judges boxes. Only eyes catch a chart past the frame, a clipped viewer, a rotated graphic or a label over a caption. Past corrections to look for: a chart past the frame, sheet numbers that drift, a photo in grayscale, people listed after they left, a competitor figure gone stale, the bore size retired, a page count used as a credential.

### 7. File
- Per-firm deck: the PDF goes into the firm's folder under `Laurelin/investors/<Firm>/`, a row under `## Built decks` in that firm's guidance note, and the work log in the firm folder. A memo is not a deck and is filed as a memo.
- The deck kit exported at 13.333 by 7.5 inches; this skill renders 1920 by 1080 pixels (1440 by 810 points). Say which geometry a version uses in the register row.

- **Copy** the PDF into the real `Laurelin/Investor Research/_circulating-decks/` directory. Move the old current deck to `_superseded/`.
- **Run:** `register.py --version vN --pdf <filed.pdf> --changes "<one line>" --build "<the build.py command>"`. Read the row and the banner. Then `--apply` to append the row to `versions.jsonl`. Put the banner line at the top of `_index.md`, word for word.
- **Write:** `WORK-LOG YYYY-MM-DD — deck vN.md` in that folder: what changed, every gate line, every conflict flagged, what Joe still decides.
- **Run** `deck.sh` and `location.sh` once more on the filed path.
- **Forbidden:** leaving the deck in `_out/`. Filing through `investors/`. Opening a visible browser or Preview. Sending anything.

### 8. Joe's pass

The batch ends with the work log and the gate lines. Joe reads the deck aloud, then opens the filed PDF in Acrobat. Nothing goes to an investor before that.

## Forbidden in every step

- No drafting of investor prose. No "improving" a line of Joe's.
- No number from memory. No invented ask. No re-derived figure.
- No resolving a figure conflict. Flag it with both sources.
- No second accent colour, no grey that is not an opacity of ink, no third typeface, no border radius, no shadow, no gradient outside a photograph, no mid-size heading between display and body (the visual system's forbidden list, pulled live).
- No NDA-gated drawing without `LAURELIN_NDA=1` and Joe's direction for that deck.
- No edit to the deck kit's `doctrine/`, to the vault's rule notes, or to a generated HTML.
- No visible browser. No send, no upload, no share link.

## Files in this skill

| File | Holds |
|---|---|
| `style-pull.py` | The live style as tokens, into `.laurelin/style.json` |
| `build.py` | The builder: seven sheet types, computed numbering, one accent per view, NDA gating, a manifest |
| `render.mjs` | HTML to PDF at 1920 by 1080 through Playwright |
| `change.md`, `change.json`, `change.sh` | How a request becomes a diff, and the Jev question that labels it |
| `register.py` | One JSON row per version into `versions.jsonl`, and the banner text |
| `doctrine-check.sh` | Step 1 |
| `../../gates/deck.sh`, `../../gates/deck-check.py` | The deck gate |

Test: `tests/test-deck-design.sh`. Fixture: `tests/fixtures/deck/sample-copy.json`, an invented company.
