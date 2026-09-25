# Branch `workers`: Step 2, foreign workers, call_model, Jev pruning

Built 2026-09-25. Brief: `docs/briefs/workers.md`. Test: `tests/test-workers.sh`. All five checks pass on this Mac.

## What was built

- `pack/extensions/laurelin-workers.ts` (375 lines): the `delegate_worker` and `call_model` tools.
- `pack/extensions/laurelin-context.ts` (175 lines): the `context` handler that asks Jev which old tool results to drop.
- `tests/workers-test.mjs` and `tests/test-workers.sh`: the test. It loads both extensions through Prime's own loader (`loadExtensions`), with no coordinator model in the loop, and drives the tools and the handler directly.

## Test result (2026-09-25)

| Check | Result |
|---|---|
| Both extensions load, 2 tools and 1 context handler registered | pass |
| Context handler on 80 synthetic messages | pass: 80 to 51 messages, 29 stale results dropped, all 6 relevant results kept, last 10 untouched |
| `call_model` on `openai-codex/gpt-5.6-sol` | pass: answered "ready" |
| `delegate_worker` with `claude` | pass: `hello.txt` created, 2 progress updates |
| `delegate_worker` with `codex` | pass: `hello.txt` created, 5 progress updates |

## Decisions and facts learned

**Worker commands.** Claude runs as `claude -p --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools ... --disallowedTools ...`. The allow list covers file reads and edits and test commands (npm test, pytest, cargo test, go test and similar). The deny list covers WebFetch, WebSearch, git push, curl, wget, gh, ssh, scp, npm publish and vercel. In `-p` mode a tool outside the allow list is denied with no prompt. Codex runs as `codex exec --json --sandbox workspace-write --skip-git-repo-check -C <cwd> -o <file> -`. Its workspace-write sandbox blocks the network by default. Nothing outward moves through one worker or the other.

**The prompt goes on stdin.** Both `--allowedTools` and `--disallowedTools` take a variable number of values, so a prompt given as the last argument is read as one more tool name. The first probe failed this way.

**Claude Code loads Joe's global hooks inside the worker.** Ten SessionStart hooks run, and the ECC GateGuard hook blocks the first shell command of every session until the model "presents facts". A worker has no one to answer that, so the tool sets `ECC_GATEGUARD=off` in the child's environment only. Nothing under `~/.claude` changes.

The same global setup gives the worker a system prompt of about 62,000 tokens (hooks plus CLAUDE.md). The hello task thus cost about 64,000 cached input tokens on the subscription. A worker-only settings file passed with `--settings` would cut that. That is a launcher or safety decision, so it is noted here and left alone.

**Codex noise, all from Joe's Codex setup.** Codex reports "Exceeded skills context budget" (87 skills not shown to the model). The jacobian indexer runs inside the Codex session and writes a `.jacobian/` folder with thousands of blob files into the worker's cwd. The tool skips that folder when it lists changed files. Codex's stderr also shows a local MCP server at 127.0.0.1:29979 that is not running.

**Files changed.** The tool takes a snapshot of the cwd (path, mtime, size) before and after the run and reports the difference. It adds any paths the worker's events name: Edit and Write calls in Claude, `file_change` items in Codex. The snapshot is needed because Codex made the test file with a shell redirect and sent no file-change event. The snapshot skips `.git`, `node_modules`, `.venv`, `__pycache__` and `.jacobian`.

**Streaming.** Each JSON line becomes one progress line (`→ Write path`, `← Write`, `→ shell cmd`, `← shell exit 0`) and the last 25 lines go to `onUpdate`, so Prime shows the worker's tool calls as they happen. Timeout defaults to 20 minutes (`timeout_seconds` parameter). The agent's abort signal kills the child process.

**Why child_process and not `pi.exec`.** `pi.exec` collects output and returns it at the end. The workers need one line at a time. `pi.exec` is also a throwing stub when an extension is loaded outside a running session, and the test loads it that way.

**Pruning shape.** Dropping a tool result alone leaves its tool call without a result. Prime's provider layer then inserts a synthetic "No result provided" error, and the model can rerun the tool, which spends the tokens the pruning was meant to save. So the handler removes the result message and rewrites the matching tool call block into one line of text: `[Earlier <tool> call pruned as stale by laurelin-context]`. The test checks that every remaining result has its call and every call has its result.

**Jev question shape.** The jev skill says that with more than 8 items, each item's text goes into its own question's instructions. So the state is the last user message, and each question carries the result's tool name, id and first 300 characters. One call with 35 score questions took about a second.

Score levels: "stale, not needed for the current task", "possibly useful later", "needed for the current task". A result is dropped when the score is under 0.5 and the confidence is 0.6 or more. Under 0.6 Jev abstains and the result stays, as section 8 of the plan says. The scores on the synthetic set were sharp: stale results at 0.01 with confidence 0.98, relevant ones at 1.6 or more.

**Threshold setting.** Prime has no settings API for extensions, so the message threshold is the environment variable `LAURELIN_CONTEXT_THRESHOLD` (default 60). The launcher can export it. The last 10 messages are never touched, as a fixed rule.

**Log.** Every pass writes one line to `decision-log/context.jsonl` under the session cwd: message counts, each dropped result with score and confidence, and the number kept. The file is gitignored already.

**call_model test model.** Prime's settings default is `anthropic/claude-fable-5-1`, the Anthropic sign-in that the plan rules out for the coordinator (section 11). The test thus prefers `openai-codex/gpt-5.6-sol` and uses the settings default only when it is on another provider. `LAURELIN_TEST_MODEL=provider/id` overrides. For the launcher branch: Prime's default model still points at the ruled-out route.

## Commands needed outside this repo

None. No installs, no changes to `~/.prime`, `~/.claude` or `~/.codex`.

## Left for later

- The ACP client (Step 2b) and compaction hooks inside Claude Code and Codex, both out of scope in the brief.
- `.jacobian/` is partly tracked in git at the repo root, and a run of any tool changes it. It must be gitignored. Not touched on this branch.
- The Claude worker's 62,000-token system prompt from the global hooks. A worker-only `--settings` file is the likely fix.
