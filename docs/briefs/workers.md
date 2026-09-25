# Branch `workers`: Step 2, foreign workers, call_model, Jev pruning

Plan: section 10, Step 2 including the Prime facts and the model-swap list; section 19 rows 2 and 2b; section 18 group 2.

## Make
1. `pack/extensions/laurelin-workers.ts` with `pi.registerTool` for:
   - `delegate_worker({ worker: "claude" | "codex", task, cwd?, files? })`: runs `claude -p --output-format stream-json` (Claude subscription; add `--permission-mode` and `--allowedTools` flags that permit reading, editing files under `cwd`, and running tests, and forbid anything outward) or `codex exec --json` (ChatGPT subscription; equivalent sandbox flags). Streams each tool call event to the tool's `onUpdate` so Prime shows progress, and returns the final text plus a short list of files changed. Timeout and cancellation through the `signal`.
   - `call_model({ model, prompt, files? })`: one question to any configured Prime model, answer returned as text, using the pattern in Prime's `qna` or `summarize` examples (`ctx.modelRegistry.getApiKeyAndHeaders` then `complete`). About 30 lines.
2. `pack/extensions/laurelin-context.ts`: a `context` event handler that, when the message list is over a size threshold (setting, default 60 messages), sends the list of old tool results (id, tool name, first 300 chars) to Jev with one Score question per result ("how likely is this result still needed for the current task", state = last user message plus the result snippet) using the `jev` CLI in one batched call, and drops results scoring low. Never drops the last 10 messages. Logs what it dropped to `decision-log/context.jsonl` (gitignored). Read `docs/compaction.md` and `examples/extensions/custom-compaction.ts`.
3. Read `docs/extensions.md` sections on `registerTool`, `context`, and the `rlm.md` note on native subagents. Do not build a Prime-model worker; Prime's `rlm.spawn` already does that.

## Test
`tests/test-workers.sh`: `delegate_worker` with worker `claude` and task "create a file hello.txt containing hello in the cwd" in a temp folder inside the repo returns text and the file exists; same for `codex` if the `codex` command is present; `call_model` with the current default model returns a non-empty string; the context handler, fed a synthetic list of 80 messages, returns fewer messages and never fewer than the last 10. Tests that need a model print "skipped: no model" and pass when none is available.

## Out of scope
The ACP client (Step 2b, later). Compaction hooks inside Claude Code and Codex (later).
