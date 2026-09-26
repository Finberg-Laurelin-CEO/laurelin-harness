# Branch note: learning-loop (Step 10)

Built 2026-09-25. Brief: `docs/briefs/learning-loop.md`. Test: `tests/test-learning-loop.sh`, 35 of 35 checks pass with live Jev. Plain-words description with an example: `docs/learning-loop.md`.

## What was built

| File | What it does |
|---|---|
| `pack/extensions/laurelin-learn.ts` | The loop. `agent_end` finds Joe's last message and the assistant output before it, reads the router's label from the session, or asks Jev when the router left none. A correction goes to `decision-log/corrections.jsonl`. Jev picks the kind (nine choices) and says if the rule is private (Noul). The coordinator model drafts one rule sentence and the exact check as JSON. Code routes the change: a prose-gate pattern, a line in `pack/rules/laurelin.md`, a criterion sentence in a `fit.json`, or a line in `decision-log/proposed-rules.jsonl` for private rules. `/learn` reviews proposals (`a` apply, `r` reject, `e` edit); `/learn list|show|apply|reject <id>` and `/learn baseline` work from the keyboard. Apply backs the file up, writes the change and reruns the tests. A regression reverts the change. A clean run sends `/refine --global laurelin-learn:<id>` so Prime stores the rule. `session_before_refine` answers that marker with a one-memory proposal. `refine_complete` records the refinement id. gstack's learnings store gets generic rules only. |
| `pack/rules/prose-patterns.txt` | The learned patterns, `name: regex` per line, the same shape as `pack/safety/outward-patterns.txt`. Empty apart from its header until a rule is approved. |
| `pack/gates/prose-patterns.py` | Applies those patterns to a prose file, split into sentences and headings the way jev-sweep does, and prints hits in jev-sweep's format `[name 1.00] sentence`. Also the anchor check the loop uses (`--check REGEX FILE`), so the gate and the loop agree on what a pattern matches. |
| `pack/gates/prose.sh` | One new rung before jev-sweep: the learned patterns. A hit fails the gate with the same output shape and log line. `LAURELIN_PROSE_PATTERNS` moves the file (the test uses a copy). |
| `tests/learning-loop-test.mjs`, `tests/test-learning-loop.sh` | The brief's test on the synthetic "we leverage a paradigm" session. It checks the router label and the Jev label, the kind, the draft, the anchored routing and the headless apply. Then the prose gate fails on the old text and passes on the new. A reject leaves no file change, a regression reverts, the refine hook answers, and an edit round-trips. The test writes only under `tests/tmp/`. |
| `docs/learning-loop.md` | The loop in plain words with the example. |

## Test result (2026-09-25)

| Check | Result |
|---|---|
| Loads through Prime's loader with `/learn`, `input`, `agent_end`, `session_before_refine` and `refine_complete` registered | pass |
| Correction pair from a session branch with the router's `laurelin_decision` entry, with slash commands and first messages skipped | pass |
| Intent from the router's label, and an abstained label is `unsure` | pass |
| Jev labels the message a correction with no router (0.89), kind `prose_style` (1.00), not private (0.94) | pass |
| `corrections.jsonl` line with both texts, the task and the source | pass |
| Draft parsed and routed to a prose-gate pattern. A pattern that misses the corrected text, an invalid pattern, and a private rule each fall back to the right place | pass |
| `propose` end to end with Jev and a canned drafter | pass |
| Headless apply: pattern written with the proposal id, tests rerun, `/refine --global laurelin-learn:<id>` sent, baseline recorded | pass |
| Prose gate: fail on the old text with `[learned.leverage_paradigm 1.00]`, pass on the new text, log names the pattern file | pass |
| Reject: the three files' hashes unchanged | pass |
| Regression (fake rerun with `FAILED: gates`): file restored, status `reverted`, rule not sent to the store | pass |
| Rule line lands under "13. Learned rules" | pass |
| Refine hook: memory edit for our marker, `undefined` for Joe's own `/refine`, `skip` for an id that is not applied. `refine_complete` records the id | pass |
| Rerun output parsing, edit round trip, marker parsing | pass |
| The repo's own `prose-patterns.txt` and `laurelin.md` untouched | pass |
| `tests/test-gates.sh` after the prose gate change | 15 of 15 |
| `tsc --noEmit` on the extension (Vercel's bundled compiler, Prime's types) | pass |

The extension was not run inside a live Prime session on this branch. The test drives every handler directly and checks the `/refine` path at the hook, without Prime's apply code. A live run needs the coordinator model for the draft, one short call per correction. See the first item under "Left for the merge owner".

## Decisions and what I learned

1. **The router's label is read from the session, not from a new event.** The router appends a `laurelin_decision` custom entry with `answers.intent` and `prompt_sha256` (the first 4000 characters of the trimmed message). At `agent_end` the loop walks the branch back from the end. It finds Joe's last message and the assistant message before it, and matches the decision on that hash. The router file is unchanged. Jev runs once per message, in the router. The loop asks Jev itself only when no decision entry is there (router off, or a session without it).

2. **jev-sweep cannot be edited (rule 17), so the "jev-sweep pattern" lives in the repo.** `~/.local/bin/jev-sweep` hard-codes its rules. The prose gate gained a first rung that reads `pack/rules/prose-patterns.txt` and prints hits in jev-sweep's own format, so the interface and the gate log see one shape. If Joe wants the patterns inside jev-sweep, the exact change is a `PATTERNS` file read in `jev-sweep` next to its two regex checks (em dash, "X, not Y"). The file format here already fits.

3. **The pattern is anchored before it is proposed (section 21 rule 4).** The same Python checker the gate runs judges each drafted pattern. The pattern must match the corrected output and must not match the model's good example. A pattern that fails either test falls back to a rule line with a note saying why. The test covers both fallbacks.

4. **Private goes to the proposal file, never the vault.** Jev's Noul decides. Under the threshold the loop treats the answer as private, the safe side. The line lands in `decision-log/proposed-rules.jsonl` for Joe to paste, and never in the open repo. The loop also keeps private rules out of gstack's learnings store, whose files can sync off the machine.

5. **Generic rule lines go under a new section "13. Learned rules" in `pack/rules/laurelin.md`,** created on first use, one bullet per rule with the kind, the date and the proposal id. A line inside an existing numbered section would need renumbering and would make the revert fragile. The rules extension already injects the whole file each turn, so the new section reaches the model at once.

6. **Prime's refine store is written through `/refine`, not by direct file writes.** `pi.sendUserMessage("/refine --global laurelin-learn:<id>")` parses as a session command (Prime's `_prompt` keeps `parseSessionCommands` on for extension-sent messages). `session_before_refine` sees the marker in `instructions`. It loads the applied proposal from disk and returns a one-edit proposal (`create memory`). Prime's own apply path validates it and keeps before-and-after snapshots, so `/refine rollback <id>` works. Any other `/refine` returns `undefined` and Prime's planner runs as before. The marker for an id that is not applied returns `skip`, so a stale or forged marker cannot store anything.

7. **Global scope by default.** Local harness state is per session, and a rule learned today should hold tomorrow. `LAURELIN_LEARN_STORE=local` switches. Global state lives in the agent's own settings folder (the fork's, under the launcher).

8. **The rerun compares against a baseline instead of a bare exit code.** "Anything that passed before and fails now" needs a record of what passed before. The first apply with no baseline runs the tests once before the change and records `learn-baseline.json`. `/learn baseline` does the same on demand. The parser reads `run-all.sh` headers and `FAILED:` lines and the test-set table rows. A test-set row whose status is not `ok` counts as failed. A run that fails with no named test counts as a regression only when the baseline run passed.

9. **The revert restores a backup copy, not `git checkout`.** The brief says git checkout of the file. A checkout would also discard any other uncommitted edit in that file. The vault rules note and the proposal file are not in git at all. The backup under `decision-log/learn-backups/<id>/` is the file as it was the moment before apply. That is what a checkout gives when the tree is clean, and it is safer when the tree is not clean.

10. **Only the file change is reverted, not the store.** The loop never sends a reverted rule to Prime or gstack, because both writes happen after the rerun passes. To remove an applied rule, run `/refine rollback <refinement id>` (the id is in `learn-proposals.jsonl`) and delete the line by its `learn <id>` stamp.

11. **The default rerun is slow and costs money.** `tests/run-all.sh && tests/testset/run.sh` takes minutes and runs Prime turns. `/learn` says so before it starts. `LAURELIN_LEARN_RERUN` can point at a shorter command. `off` skips the rerun, and then nothing is ever reverted. The test uses two tiny scripts in run-all's output shape.

12. **Jev question shapes.** Two questions in one call for the kind and the privacy, with the state keys `correction` and `corrected`. `askJev` comes from the router with a cast, because its state type is the router's. The intent question reuses the router's `INTENT_CRITERIA` verbatim, so the two paths cannot drift.

13. **Test import.** A direct import of the extension under jiti needs the same package aliases Prime's loader sets (`@earendil-works/pi-ai` and friends). Without them `pi-ai` is not found. The test builds that alias map from the installed Prime package.

14. **gstack also has a `/learn` skill** (Claude Code side, "manage project learnings"). Prime's `/learn` here is a different namespace, so there is no clash in a Prime session.

## Hookup for other branches

- The interface can listen for `laurelin:learn` (the pending proposal) to show a "1 rule to review" line.
- The metrics branch (first-pass acceptance) can count `decision-log/corrections.jsonl` lines per job: each has `ts`, `prompt_sha256`, `task` and `intent_confidence`.
- The router's `outcome: null` field is still null. The loop does not yet write the correction id back to the router's decision line. The metrics branch can join on `prompt_sha256`.
- `calibrate.sh` can read `kind_confidence` and `private_confidence` from `learn-proposals.jsonl` once there are labeled examples.

## Left for the merge owner

- One live run in a Prime session with the pack: say something, correct it, watch `Learned a correction (...)` appear, run `/learn`, push `a`. The draft call uses the coordinator model. With `bin/laurelin` that is the ChatGPT sign-in. Cost is one short completion.
- The brief lists `pack/router/*.json` and `pack/gates/*` question text as criterion targets. The router's criteria are in the `.ts` file and the gates' questions are inline shell strings, so the loop offers `pack/skills/*/fit.json` paths only. Other kinds land as a rule line. Moving the router criteria and the gate questions into JSON files would make them targets with no change to the loop.
- `.gitignore` now lists `decision-log/learn-baseline.json` and `decision-log/learn-backups/`.
- PLAN section 20: the learning loop landed. Section 22 item 2 ("build the learning loop before more skills") is done on this branch.

## Rule 17 check

Nothing outside the repo changed. The test writes under `tests/tmp/` only, points `GSTACK_HOME` there and turns gstack writes off. Keys were sourced into the environment and never read or printed. No vault path was read or written.
