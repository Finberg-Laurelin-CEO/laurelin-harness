# Branch `learning-loop`: corrections become rules and checks (Step 10)

Plan: Step 10 in full including the Prime facts; section 18 group 7; section 22; section 17 (gstack learnings store). Read `docs/branch-notes/router.md` (intent question), `safety.md`, `gates.md`, and Prime `docs/extensions.md` sections `session_before_refine`, `refine_complete`, and `docs/rlm-runtime.md` on the harness store.

## Make
1. `pack/extensions/laurelin-learn.ts`:
   - Detect: on each user message that the router (or a Jev call here when the router is off) labels `correction`, capture the pair (the assistant output it corrects, the correction text, the task file if any) and append it to `decision-log/corrections.jsonl`.
   - Draft: ask Jev which kind of rule it is (Choice: `prose_style, number, layout, location, verbatim, evidence, process, scope, other`) and then have the coordinator model draft ONE rule sentence in plain words and, when the kind maps to a gate or a Jev criterion, the exact change: a new line in `pack/rules/laurelin.md` (generic) or in the vault rules note (private; write the proposed line to `decision-log/proposed-rules.jsonl`, never into the vault directly), or a new criterion sentence in the relevant Jev question file (`pack/router/*.json`, `pack/skills/*/fit.json`, `pack/gates/*` question text), or a new `jev-sweep` pattern.
   - Approve: `/learn` shows pending proposals with keys a (apply), r (reject), e (edit in the editor). Apply writes the change on disk and records it in Prime's refine store as a prompt note or memory through `session_before_refine` (so rollback exists), and with `gstack-learnings-log` when present. Nothing applies without Joe.
   - Rerun: after apply, run `tests/run-all.sh` and the enabled test-set specs (`tests/testset/run.sh`); if anything that passed before now fails, mark the rule `reverted` and undo the file change (git checkout of that file) and tell Joe why.
2. `docs/learning-loop.md`: the loop in plain words with an example.

## Test
`tests/test-learning-loop.sh`: feed a synthetic session where the assistant wrote "we leverage a paradigm" and Joe replied "no slop, say 'we use'"; the loop logs a correction, proposes a `prose_style` rule with a jev-sweep pattern, `/learn` apply (driven headless through the extension function) writes the pattern, the prose gate now fails on the old text and passes on the new, and a rejected proposal leaves no file change. Skips Jev parts cleanly without the key.

## Out of scope
Training anything. Writing to the vault.
