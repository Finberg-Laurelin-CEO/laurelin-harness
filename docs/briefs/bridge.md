# Branch `bridge`: make the loop real (task state, gate inputs, live panels)

Plan: section 20 wave 2 item 1; Step 4 (gates), Step 5 (approvals), Step 1c (panels). Read `docs/branch-notes/gates.md`, `interface.md`, `safety.md` first.

## The problem found in the first end-to-end run
`bin/laurelin --autonomous` runs `pack/gates/*.sh` through Prime, which starts each gate in a fresh shell. Gates that need per-task input (`evidence.sh` needs `LAURELIN_CLAIM`, `verbatim.sh` needs `LAURELIN_ORIGINAL`, all need `LAURELIN_TARGET`) never see values the agent set, so the run fails at "maxContinuations reached".

## Make
1. Task state file. `.laurelin/task.json` in the working directory (gitignored) with keys `target`, `claim`, `original` (path), `classification`, `notes`. A new extension `pack/extensions/laurelin-task.ts` registers a tool `set_task({ target?, claim?, original?, classification? })` that writes it, and a command `/task` that shows it. `bin/laurelin` gains `--target <path>` and `--claim "<text>"` flags that write the same file before starting Prime.
2. Gates read the file. In `pack/gates/lib.sh`, add a helper that fills `LAURELIN_TARGET`, `LAURELIN_CLAIM`, `LAURELIN_ORIGINAL` from `.laurelin/task.json` when the variable is unset (use `jq` or `python3`). A gate whose input is still missing prints `<check>: skipped, no <input>` and exits 0, and logs `result: skipped`. It must not fail a run for an input nobody gave it.
3. Live checks panel. `pack/extensions/laurelin-bridge.ts` watches `decision-log/gates.jsonl` (see Prime example `file-trigger.ts`) and emits `laurelin:check` events with `{ name, state: pass|fail|skipped, detail }` for each new line, so `laurelin-ui` shows real lights. On `session_start` it replays the last result per check.
4. Live approvals. `laurelin-approvals.ts` emits `laurelin:approval` when an item is created and `laurelin:approval-decided` when decided, with the same shape `laurelin-ui` expects (read `laurelin-ui.ts` for the shape). When the panel approves or rejects, it must resolve the pending `ctx.ui.confirm`; if that is not possible in Prime, note it and keep the confirm dialog as the decision point while the panel mirrors state.
5. Worker events. `laurelin-workers.ts` emits `laurelin:worker` with the worker name while a `delegate_worker` call runs, and `coordinator` after.

## Test
`tests/test-bridge.sh`: (a) `set_task` writes the file and gates read it (unit, no model); (b) `evidence.sh` and `verbatim.sh` print `skipped` and exit 0 with no input; (c) the end-to-end run from the branch note of `ideation` (a file with three sentences, `--target` and `--claim` given) finishes with every gate `pass` or `skipped` within 2 continuations; (d) a synthetic gate log line makes the ui receive a `laurelin:check` event (unit, load the extensions with Prime's `loadExtensions` as `test-interface.sh` does).

## Out of scope
New gates, the router.
