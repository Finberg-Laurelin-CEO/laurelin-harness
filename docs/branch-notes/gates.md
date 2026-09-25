# Branch `gates`: notes from the build (2026-09-25)

Step 4 of `PLAN.md`. Six gate commands in `pack/gates/`, fixtures in `tests/fixtures/`, one test in `tests/test-gates.sh`. The test passed 15 of 15 on 2026-09-25, including a real Prime run of `location.sh` as an autonomous gate.

## What was built

| Gate | Rung of the ladder | How it decides |
|---|---|---|
| `prose.sh` | code + Jev | Runs `jev-sweep` on every `.md`, `.txt` and `.tex` file. Any hit at 0.70 or above fails. "Maybe" rows (0.40 to 0.70) do not fail; the pass line's confidence is 1 minus the top maybe. |
| `location.sh` | code | Target exists and sits under a root in `allowed-roots.txt`. Prints the absolute path. |
| `verbatim.sh` | code | Splits `LAURELIN_ORIGINAL` into sentences and looks for each, whitespace collapsed, in the target text. No model. |
| `evidence.sh` | code + Jev | Reads the newest `gstack-evidence` row and the tail of its log, asks Jev one yes/no question, passes at 0.6 or above. |
| `numbers.sh`, `layout.sh` | stubs | Print `not built`, exit 0, log a `skipped` line. |

Shared code is in `pack/gates/lib.sh`: target lookup, the JSON log line, the pass and fail lines, and the Jev call. Each gate is one executable and can run alone: `LAURELIN_TARGET=some.md pack/gates/prose.sh`.

Every run appends one line to `decision-log/gates.jsonl` (gitignored) with `ts`, `check`, `inputs`, `question`, `answer`, `confidence` and `result`. `LAURELIN_GATE_LOG` moves the file; the test points it at `tests/tmp/`.

## Environment the gates read

| Variable | Used by | Meaning |
|---|---|---|
| `LAURELIN_TARGET` | all | File or folder to check. Unset: the newest changed file in the git worktree (modified, staged or untracked). No changed file: the gate fails and says so. |
| `LAURELIN_ORIGINAL` | verbatim | File of Joe's text. |
| `LAURELIN_CLAIM` | evidence | The claim of done, in words. |
| `LAURELIN_EVIDENCE_LABEL` | evidence | Optional. Use the newest row with this label instead of the newest row. |
| `LAURELIN_ALLOWED_ROOTS` | location | Optional. Another roots file. |
| `LAURELIN_JEV_THRESHOLD` | evidence | Optional. Default 0.6. |
| `LAURELIN_GATE_LOG` | all | Optional. Where the JSON lines go. |
| `GSTACK_HOME` | evidence | Where gstack keeps the ledger. The test sets it to a temp folder so no test row lands in `~/.gstack`. |

## What I learned

- **Prime runs a gate as a plain shell command** with the session's environment and working directory. `prime-agent -e ./pack` accepts the package folder. The one-shot run took one turn on the default model and exited 0 once the gate passed. The test adds `--no-session` so nothing is written under `~/.prime` (rule 17), and caps turns and continuations so a broken gate cannot spend much.
- **`jev-sweep` always exits 0 and has no `--help`.** The gate parses its summary line (`N units, H hits, M maybes`) and the lines under `== HITS`. Hits from the em dash and "X, not Y" heading regexes come back at 1.00, so `prose-bad` fails the same way every time.
- **The brief asks for one output line and also for the first three hits.** The prose gate prints the status line first, then up to three hit lines indented. Prime feeds all of it back to the agent on failure, which is what the agent needs to repair the text.
- **`gstack-slug` resolves this repo to the slug `Joe`,** because `~/package.json` is a project marker and the walk-up picks the outermost one. Every ledger for repos under the home folder lands in `~/.gstack/projects/Joe/`. The gate and the wrapper agree, so the check still works, but that folder is one shared bucket. Fix for Joe to decide: remove or move `~/package.json`, or set `GSTACK_PROJECT_SLUG` in the launcher.
- **`gstack-redact` scans; it does not rewrite.** The evidence gate runs it on the log tail and, on exit code 3 (a credential), sends `<output withheld>` to Jev instead of the text.
- **Jev separates the evidence cases well** with the one question and its `focus` line: 0.93 to 0.94 for a matching claim on a passing row, 0.02 for an unrelated claim on the same row, 0.01 for a success claim on a row that exited 1. The `focus` text carries the rule that a nonzero exit or reported failures do not support a claim of success; without it the question would lean on Jev's own reading of the exit code.
- **The vault's `Laurelin` folder holds symlinked subfolders,** so the location gate compares both the path as given and the path with symlinks resolved against each root. A note under `Laurelin/contacts/` passes even though its real folder is `~/Laurelin_Contacts`.
- **Cost of one test run:** about ten Jev calls (under one cent) and one short Prime turn.

## Decisions for the merge owner

1. The gate output format: `<check>: pass, <why>` or `<check>: fail, <why>`, one line, plus up to three hit lines for prose. The interface branch can grep the first word and the word after the colon.
2. `allowed-roots.txt` ships with two roots: `$REPO` and `~/Documents/Obsidian Vault/Laurelin`. Add roots there, one per line.
3. The evidence gate reads the log tail (last 1500 bytes) as well as the row, since the row alone rarely says what the command found.

## What the stubs need

**`numbers.sh`**
- Input: the draft (target) and a canonical file in `LAURELIN_CANONICAL`, or the newest engineering document when unset (section 5: newest wins).
- Rung 1, code: pull every number with its unit and the sentence around it from both files (a regex for digits, separators, units and currency; tables too).
- Rung 2, Jev: one `jev-documents` claim-against-source question per draft number, with the canonical passage as the source. Numbers that appear in neither the canonical file nor the reactor-calcs output fail as "unsourced". Physics figures go through the `laurelin-reactor-calcs` skill, which owns the arithmetic.
- The canonical file is private Laurelin content and stays in the vault; the gate only reads it.

**`layout.sh`**
- Input: a PDF, or a URL for a web page.
- Rung 1, code: `pdftoppm -r 100` (installed at `/opt/homebrew/bin/pdftoppm`) renders each page to PNG; `pdftotext -bbox-layout` gives word and block boxes. Code finds boxes that intersect and boxes that cross the page edge. Web pages: gstack's browse daemon gives a screenshot and element boxes.
- Rung 2, Jev: one yes/no question per flagged page with the box list, plus a score for white space. Prime's docs say it does not show images, so the first version judges box lists, not pixels.
- Fails naming the page and the kind of fault, for example `layout: fail, p.7 overlap`.

## Nothing outward

No installs, no pushes, no changes under `~/.prime`, `~/.claude` or `~/.gstack` (the test's ledger goes to `tests/tmp/gstack`). No key value was read or written; the gates rely on `jev` and `jev-sweep` reading the key themselves.
