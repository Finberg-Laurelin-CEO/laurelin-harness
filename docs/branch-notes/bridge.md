# Branch `bridge`: task state, gate inputs, live panels

Built 2026-09-25. Brief: `docs/briefs/bridge.md`. Test: `tests/test-bridge.sh`, ten checks plus a type check, all pass. The end-to-end run in the test is one real Prime run on the coordinator model.

## What was built

| File | What it does |
|---|---|
| `pack/extensions/laurelin-task.ts` | New. The `set_task` tool writes `.laurelin/task.json` in the working directory. `/task` shows it. Keys: `target`, `claim`, `original`, `classification`, `notes`. A key given as `""` is deleted. The file holds absolute paths. A `classification` value is also sent to the badge. |
| `pack/gates/lib.sh` | Fills `LAURELIN_TARGET`, `LAURELIN_CLAIM` and `LAURELIN_ORIGINAL` from the task file when the variable is unset (`gate_task_env`, runs when a gate sources the file). New `gate_skip CHECK INPUT`: prints `<check>: skipped, no <input>`, logs `result: skipped`, exits 0. |
| `pack/gates/evidence.sh`, `verbatim.sh`, `prose.sh`, `location.sh` | A missing claim, original or target now skips the gate. A target or original that is given but does not exist still fails. |
| `bin/laurelin` | `--target <path>` and `--claim "<text>"` write the task file before Prime starts. Prime does not see the two flags. Other keys in the file are kept. |
| `pack/extensions/laurelin-bridge.ts` | New. Tails `decision-log/gates.jsonl` and sends one `laurelin:check` event per new line. On `session_start` it sends the last result per check first. |
| `pack/extensions/laurelin-ui.ts` | A `skipped` state (amber empty ring) on the checks widget. Drops an approval item when another extension decides it. |
| `pack/extensions/laurelin-approvals.ts` | Sends `laurelin:approval` when Joe is asked and `laurelin:approval-decided` when the call is settled. Listens for the panel's own `laurelin:approval-decided`: if the panel answers first, that answer is used and the confirm dialog closes through its abort signal. |
| `pack/extensions/laurelin-workers.ts` | Sends `laurelin:worker` with the worker name when `delegate_worker` starts and `coordinator` when it returns, also on an error. |
| `.gitignore` | Adds `.laurelin/`. |
| `tests/test-bridge.sh`, `tests/bridge-check.mjs` | The test. Registered in `tests/README.md` and `tests/run-all.sh`. |

## Test result (2026-09-25)

| Check | Result |
|---|---|
| (a) `set_task` writes the file: absolute paths, merge, clear a key, classification event | pass |
| (a) `verbatim.sh` and `location.sh` read the file with no `LAURELIN_*` variable set | pass |
| (b) `evidence.sh` and `verbatim.sh` with no input print `skipped`, exit 0, log `skipped` | pass |
| (c) fixture passes `prose.sh` and `evidence.sh` alone (Jev 0.87 on the claim) | pass |
| (c) `bin/laurelin --autonomous --target note.md --claim ... -p` exits 0 within 2 continuations. Last result per gate: evidence pass, location pass, prose pass, verbatim skipped, numbers skipped, layout skipped | pass |
| (d) a log line already in the file lights `prose` at `session_start`. A new `verbatim` fail line lights `word for word` with its text. A new `evidence` skipped line shows `no claim` | pass |
| (+) an outward tool call shows as `1 waiting`, the panel's `a` key lets the call through and closes the dialog, the receipt says `approved` by `joe`, and a dialog `no` clears the panel | pass |
| `tsc --noEmit` on the five extensions | pass |

The other tests still pass after the change: `test-gates.sh` (15 of 15), `test-safety.sh` (all), `test-interface.sh` (all), `test-workers.sh` (all five). The gates test sets every input by hand, so the new skip path does not change its result.

## Decisions

1. **The task file lives in the working directory, not the repo.** `lib.sh` reads `$PWD/.laurelin/task.json`. Prime runs each gate with the session's working directory, and `set_task` writes to `ctx.cwd`, so the two always agree. The launcher writes to the folder it is started from. Relative paths in a hand-written file count from that folder.
2. **A missing target skips a gate.** The brief lists the target as an input like the claim and the original. `prose.sh` and `location.sh` first look for the newest changed file in the worktree, as before. The gate skips only when there is no changed file. A target that is given but does not exist fails, because that is a wrong input.
3. **A missing evidence ledger still fails the evidence gate.** With a claim given and no ledger row, the agent claimed done and recorded nothing. That is the case the gate exists for. The end-to-end test records the row itself with `gstack-evidence run --label e2e` before Prime starts. The gate's failure text tells the agent the command to run.
4. **The log is polled, not watched.** `laurelin-bridge` reads the file every 500 ms with `ctx.setInterval`, Prime's own timer, which is cancelled on unload. The example `file-trigger.ts` uses `fs.watch`, but the log and its folder can be absent when the session starts, and a gate writes from another process. A partial last line is left for the next read. If the file shrinks, the tail starts over.
5. **Check names.** The gate log says `verbatim`. The panel says `word for word`. The bridge maps the one to the other. Every other name is the same on both sides.
6. **Detail text on a light.** A fail or a skip shows the log's `answer` (for example `1 of 3 sentences missing`, `no claim`). A pass shows `jev 0.87` when the confidence is under 1, else nothing.
7. **The confirm dialog stays the decision point.** Prime's `ctx.ui.confirm` puts a Yes/No selector in the editor's place and takes the focus (`showExtensionSelector` in `interactive-mode.js`). While it is open, Joe cannot type `/approvals`. So the panel mirrors the wait, and the dialog settles it. The wiring for the other direction is in place. `decideCall` races the dialog against a `laurelin:approval-decided` event for its id. When the panel answers first, it aborts the dialog's signal, and that closes the dialog. The unit test drives that path. A keyboard shortcut that opens the panel over the dialog would make it useful in practice.
8. **The `laurelin:approval-decided` event carries a `source`** (`panel`, `dialog`, `timeout`, `no-ui`) beside the `{ id, decision }` the interface expects. The interface ignores the extra field.
9. **`set_task` sends the classification to the badge.** The brief did not ask for it. It is one line, and the badge is the only place the classification shows.

## Facts learned

- `loadExtensions(paths, cwd, eventBus)` takes the bus as its third argument. Passing one made by `createEventBus()` from `dist/core/event-bus.js` lets a test listen on the same bus the extensions use. Handlers registered with `bus.on` run inside an async wrapper, so a handler with no `await` still runs before `emit` returns.
- The confirm dialog's `signal` closes it: `showExtensionSelector` listens for `abort`, hides the selector and resolves `undefined`, which `confirm` turns into `false`.
- Bash 3.2 rejects `"${arr[@]}"` on an empty array under `set -u`. The launcher uses `${fwd[@]+"${fwd[@]}"}`.
- `tests/test-gates.sh` deletes `tests/tmp` at its start, so any scratch file another test leaves there is gone after it runs. The bridge test keeps its files under `tests/tmp/bridge`.
- The launcher skips `-e <pack>` when Prime's settings already list the pack, so the end-to-end run loaded the pack through the settings file on this Mac.
- The branch note the brief names for the end-to-end run, `docs/branch-notes/ideation.md`, does not exist on any branch. The test builds the run from the brief's own description: a file with three sentences, `--target` and `--claim` given.

## Nothing outward

No installs, no pushes, no changes under `~/.prime`, `~/.claude` or `~/.gstack`. The test's evidence ledger goes to `tests/tmp/bridge/gstack`. No key value was read or printed.

## Left for the merge owner

- `PLAN.md` section 20, wave 2 item 1 is done. The Prime facts above belong beside the ones in Step 1c and Step 5.
- `tests/README.md` manual test for the interface could add one line: run `bin/laurelin --autonomous --target <file> --claim "<text>"` and watch the lights change as the gates run.
