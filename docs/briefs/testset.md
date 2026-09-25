# Branch `testset`: Step 6, the test-set runner

Plan: Step 6 in full; section 15 (the 20 jobs); section 18 group 7; section 20. Read `docs/branch-notes/gates.md` for the gate log shape and `~/.claude/skills/jev-eval/SKILL.md`.

## Make
1. `tests/testset/spec-format.md` and `tests/testset/specs/*.json`: one spec per job with `id`, `name`, `group`, `prompt` (the ask in plain words), `target` (where the result must land, relative to a root given at run time), `canonical` (optional), `original` (optional), `claim`, `checks` (letters A to I from section 15), `rubric` (three to six criteria in words for jev-eval), `source` (vault path of the accepted result, or empty). Write the three synthetic public specs first (a three-sentence file, a small markdown memo from a given outline, a script that renames files), and then the 20 from section 15 with their vault paths as `source` and generic prompts. The 20 must not contain private content beyond the vault paths already in PLAN section 15.
2. `tests/testset/run.sh [--only id,id] [--root <dir>]`: for each spec, writes `.laurelin/task.json`, runs `bin/laurelin --no-session --autonomous --autonomous-max-continuations 3 --mode json -p "<prompt>"` in a temp root, collects: gate results from `decision-log/gates.jsonl`, the session's cost and token totals from the JSON event stream (`usage` on assistant messages), wall time, and a jev-eval score of the result against the rubric (one Score question per criterion in one call). Writes `tests/testset/results/<date>-<id>.json` (gitignored) and prints one table row per job: id, gates passed/total, score, cost, seconds.
3. `tests/testset/baseline.md`: the table from running the three synthetic specs, committed. Do not run the 20 real ones (they need the vault and Joe's review); mark them `"enabled": false`.
4. `tests/testset/calibrate.sh`: reads all results and every `decision-log/*.jsonl`, and prints, per check and per router question, the confidence distribution and a suggested threshold (the point that separates the labeled passes from fails, if labels exist; else the 20th percentile). Output only; it does not change thresholds.

## Test
`tests/test-testset.sh`: `run.sh --only synthetic-1` completes and writes a result file with a score and a cost; `calibrate.sh` runs on it and prints a table. Skips with "skipped: no model" when no model is available.

## Out of scope
Running the real 20 jobs. The learning loop.
