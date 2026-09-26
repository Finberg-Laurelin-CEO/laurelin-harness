# The learning loop

When Joe corrects the agent, the correction becomes a rule and a check. Joe approves or rejects each rule. The tests run again before the rule stays. This is PLAN.md Step 10, the feature that section 22 calls the edge.

## The four steps

1. **Detect.** After each message from Joe, the loop looks at that message and the assistant output before it. The router (`laurelin-router`) already labels each message with an intent. When the label is `correction`, the loop records the pair in `decision-log/corrections.jsonl`. When the router is off, the loop asks Jev the same intent question itself.
2. **Draft.** Jev says which kind of rule it is: `prose_style`, `number`, `layout`, `location`, `verbatim`, `evidence`, `process`, `scope` or `other`. Jev also says if the rule carries private Laurelin content. Then the coordinator model writes one rule sentence in plain words, and, when it can, the exact check. Code decides where the change goes:
   - `prose_style`: a pattern for the prose gate in `pack/rules/prose-patterns.txt`. The pattern must match the corrected output and must not match the good example. A pattern that fails that test falls back to a rule line.
   - a generic rule of any other kind: a line in `pack/rules/laurelin.md` under "13. Learned rules", or a sentence added to a criterion in a Jev question file (`pack/skills/*/fit.json`) when the model names one.
   - a private rule: a line in `decision-log/proposed-rules.jsonl`. Joe pastes it into the vault rules note. The loop never writes to the vault.
3. **Approve.** `/learn` shows each pending proposal with three choices: `a` apply, `r` reject, `e` edit in the editor. `/learn list`, `/learn show <id>`, `/learn apply <id>` and `/learn reject <id>` do the same from the keyboard. Nothing applies without Joe.
4. **Rerun.** Apply writes the change to disk and runs `tests/run-all.sh` and the test set. If a test that passed before fails now, the loop puts the file back, marks the rule `reverted` and tells Joe which test broke. If nothing broke, the rule goes into Prime's refine store as a memory (Prime keeps a snapshot, so `/refine rollback` undoes it) and into gstack's learnings store when that store is installed. Private rules stay out of gstack, because its files can sync off the machine.

## An example

The assistant writes an intro that says "We leverage a paradigm to deliver value". Joe replies: "no slop, say 'we use'".

1. The router labels the message `correction` at confidence 0.91. The loop writes one line to `corrections.jsonl` with the two texts and the task file.
2. Jev says the kind is `prose_style` and the rule is not private. The model drafts the rule "Write 'we use'; never 'leverage' or 'paradigm'." It adds the pattern `\b(leverage|paradigm)\b` and the good example "We use a method to build faster." Code checks that the pattern hits the old text and misses the good example. Then it files the proposal as pending.
3. Joe runs `/learn`, reads the proposal, and pushes `a`.
4. The loop appends the pattern to `prose-patterns.txt`, runs the tests, and finds nothing broken. The prose gate now fails on "we leverage a paradigm" with the line `[learned.leverage_paradigm 1.00] ...` and passes on "we use". Prime and gstack store the rule.

If the test run shows a failure in a test that passed before, the loop removes the pattern line again. `/learn list` then shows the rule as `reverted` with the name of the test.

## Where the state lives

All of it is on disk under `decision-log/` (gitignored):

| File | Holds |
|---|---|
| `corrections.jsonl` | one line per detected correction: the two texts, the task, the source of the label and its confidence |
| `learn-proposals.jsonl` | one line per event on a proposal (`pending`, `applied`, `rejected`, `reverted`); the last line per id is the current state |
| `proposed-rules.jsonl` | private rule lines for Joe to paste into the vault note |
| `learn-baseline.json` | which tests passed and failed the last time the loop ran them |
| `learn-backups/<id>/` | the file as it was before an apply, used for the revert |

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `LAURELIN_LEARN` | on | `off` stops detection for the session |
| `LAURELIN_LEARN_THRESHOLD` | 0.6 | Jev confidence under which the loop does not act |
| `LAURELIN_LEARN_RERUN` | `tests/run-all.sh && tests/testset/run.sh` | the command apply runs; `off` skips it |
| `LAURELIN_LEARN_RERUN_TIMEOUT` | 2700 | seconds before the rerun counts as failed |
| `LAURELIN_LEARN_STORE` | global | `local` puts the memory in the session's harness, `global` in the shared one |
| `LAURELIN_PROSE_PATTERNS` | `pack/rules/prose-patterns.txt` | where prose patterns go; the prose gate reads the same variable |
| `LAURELIN_RULES_FILE` | `pack/rules/laurelin.md` | where generic rule lines go |
| `LAURELIN_DECISION_LOG` | `decision-log/` | where the state files go |

## Test

`tests/test-learning-loop.sh` runs the example above headless, through the extension's own functions, and checks every step. Without `TYPESAFE_API_KEY` the Jev parts print `skipped`.
