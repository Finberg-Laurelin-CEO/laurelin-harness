# Branch `testset`: notes from the build (2026-09-25)

Step 6 of `PLAN.md`: the test-set runner. Specs in `tests/testset/specs/`, runner `tests/testset/run.sh` with `tests/testset/score.py`, calibration report `tests/testset/calibrate.sh`, baseline `tests/testset/baseline.md`, test `tests/test-testset.sh`. The test passed on 2026-09-25 with a real Prime run of `synthetic-1`.

## What was built

| Piece | What it does |
|---|---|
| `spec-format.md` | The fields of a job spec and what each check letter does. |
| `specs/synthetic-*.json` | Three public jobs: a three-sentence file (A D), a memo from an outline with the outline kept word for word (A D E), a script that renames files (D). |
| `specs/job-01.json` to `job-20.json` | The 20 jobs of section 15, `"enabled": false`. Generic prompts, the vault paths from the plan, a claim, three to six rubric criteria written from the "what went wrong" column, and the accepted result as `source`. Placeholders `<firm>`, `<vendor>` and so on are kept as in the plan. |
| `run.sh` | For each spec: a fresh root under `tests/tmp/testset/<id>/root` (or `--root`), `.laurelin/task.json` in the root, the gates for the spec's letters, then `bin/laurelin --no-session --autonomous --autonomous-max-continuations 3 --mode json -p "<prompt>"` with the root as working directory. `--only id,id` runs named specs even when disabled. |
| `score.py` | Sums `usage` over every assistant `message_end` (tokens and `cost.total`), takes the last gate row per check, shows Jev the target file, the agent's final reply and the gate results, asks one Score question per rubric criterion in one call, and writes `results/<date>-<id>.json`. Score is the mean over criteria of `score / 2` on the levels `not met`, `partly met`, `met`. |
| `calibrate.sh` | Reads every result file (each embeds its gate log) and every `decision-log/*.jsonl`, groups by check or router question, prints n, min, p20, median, max, how many rows carry a label, and a suggested threshold. Output only. |

## One change outside the brief

`bin/laurelin` now reads `LAURELIN_GATES`: a comma list of gate names to attach on `--autonomous`, or `none`. Unset means every executable gate, as before. Without it the runner could not attach only the gates a spec asks for, and on this branch a gate with no input fails (the `bridge` branch makes it skip), so every synthetic job would have spent its three continuations on an evidence gate nobody asked for. Five lines, no change to any other path. The merge owner may prefer to fold this into the launcher's notes.

## What I learned

- **`-p` and `--mode json` work together.** The stream holds a `session` header, then `agent_start`, `turn_start`, `message_start`, `message_update`, `message_end`, `turn_end`, `agent_end`. Usage sits on each assistant `message_end` as `usage.{input,output,cacheRead,cacheWrite,totalTokens,cost.total}`. Prime also prints the odd plain line on stdout (`Shell cwd was reset to ...`), so the parser skips lines that do not start with `{`.
- **Prime's cost is a list price, not a bill.** A 20,000-token one-liner on the ChatGPT sign-in is priced at about 21 cents. Use the number to compare jobs, not to count money.
- **About 20,000 input tokens per turn is the floor.** The system prompt with the pack's rules and skills costs that before the task starts. A three-turn job is about 60,000 input tokens.
- **The synthetic jobs take about 20 seconds and three turns each** on `gpt-6-astra`: one turn to write, one to run the gates, one to say done. All gates passed first time on all three.
- **Jev's rubric scores separate levels but not quality within a level.** All twelve criteria came back `met`, at confidences from 0.51 to 0.95. The 0.51 was "the script refuses to overwrite an existing file" on synthetic-3, where the script's guard is real but buried in a case-insensitive-filesystem branch; that row is under the 0.6 escalation line and is the kind of case the calibration report exists to collect. The score tells a good result from a broken one; it will not rank two good ones. Finer criteria, or a `jev-eval` transcript review, would be the next step.
- **A rerun on the same day overwrites the result file** (`results/<date>-<id>.json`, as the brief names it). The test reran `synthetic-1` after the baseline and got 0.94 against 0.95, so run-to-run noise on the score is about a few hundredths.
- **The gate log's `result` is not a label.** It comes from the threshold the report is meant to set, so `calibrate.sh` only treats `label`, `joe_label`, `correct` or `outcome` fields as labels. With none yet, every suggested threshold is a 20th percentile over rows that are all 1.00 for the code-only gates. The report becomes useful once Joe labels rows or the Jev gates (prose hits, evidence, numbers) have failures in the log.
- **The router log has no per-question key yet.** `calibrate.sh` looks for `question_id`, `question`, `kind`, `decision` or `type`; the router branch should write one of these per decision line so the report can group by question.
- **Check letters G, H and I have no gate.** G and I are judged by the rubric; H is caught by the approvals handler whose receipts sit in the run's root. The 20 real specs keep the letters so the mapping is ready when gates exist.

## Running the real 20

Not done here (the brief says so). What they need: `--root` pointing at the vault's `Laurelin/` folder (or the home folder for the website, club and video jobs), the inputs the prompts name (`{root}/transcript.md`, `{root}/questions.md` and so on) staged by hand, `canonical` and `original` filled where B and E apply, and Joe's review of each result against `source`. Running one costs about three Prime turns plus one Jev call; a run writes into the vault, so Joe approves each before it starts.

## Nothing outward

No installs, no pushes, no changes under `~/.prime`, `~/.claude` or `~/.gstack` (each run keeps its ledger under `tests/tmp/testset/<id>/gstack`). No key value read, printed or written. Prime ran with `--no-session`. Four Prime one-shot runs (one probe, three jobs) and about six Jev calls in the build.
