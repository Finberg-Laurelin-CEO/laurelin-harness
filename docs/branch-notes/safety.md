# Branch note: safety (Step 5)

Built 2026-09-25. Test: `tests/test-safety.sh` (all pass).

## What was built

| File | What it does |
|---|---|
| `pack/extensions/laurelin-approvals.ts` | The approval gate. A `tool_call` handler that matches the call text against `pack/safety/outward-patterns.txt`. A match asks Joe on screen and shows the command text as the preview. No screen or a timeout means denied. Every decision is one receipt line in `decision-log/approvals.jsonl`. Exports `listPending` for the interface and adds `/approvals`. |
| `pack/safety/outward-patterns.txt` | The outward patterns: deploys, pushes, merges, releases, email sends, posts, payments, DNS, Workspace, form submits. One named regex per line. |
| `pack/extensions/laurelin-scrubber.ts` | The secret scrubber. An `input` handler that runs each paste through `gstack-redact`. A HIGH or MEDIUM finding rewrites the paste with `<REDACTED:kind>`, tells Joe in one line, and logs the kind to `decision-log/scrubber.jsonl`. |
| `pack/safety/redact-spans.ts` | A small bun helper that does the span replacement with gstack's own engine. See the decisions below for why. |
| `pack/extensions/laurelin-limits.ts` | The counters. Blocks the tool call after `LAURELIN_MAX_ACTIONS` (default 200) and blocks all tool calls after `LAURELIN_MAX_SPEND` dollars (default 5). Saves the counters in the session. On restart, prints the last completed tool call. Adds `/limits` and `/limits reset`. |
| `pack/safety/refusals.md` | The section 7 refusal list as Jev criteria. One bullet per category, the bullet text is the criterion. |
| `pack/safety/refusal-check.sh` | Asks Jev one Choice question over a task text. Prints the category or `none`. Below 0.6 confidence it prints `review:<category>`. |
| `pack/extensions/laurelin-refusals.ts` | A `before_agent_start` hook that runs the check on each prompt and warns. It does not block. Log: `decision-log/refusals.jsonl`. |
| `tests/test-safety.sh`, `tests/safety-unit.test.ts` | The test. Twelve unit tests run the handler functions under Node with no Prime. Then come the two refusal checks, a scan of every log for the fake key, and a best-effort Prime run. |

The brief listed three extension files. The refusal hook has its own fourth small file.

## Decisions and what I learned

1. **Prime's JSON and print modes report a screen they do not have.** `ctx.hasUI` is `true` under `--mode json -p`, but `ctx.ui.confirm` returns `false` in 0 ms with no dialog (measured with a probe extension). The docs say `hasUI` is false there. The gate treats a "no" that arrives in less than 50 ms as "nobody was asked" and records `denied:no-ui`. The receipt then tells the truth in every mode. The constant is `NOOP_CONFIRM_MS`.

2. **The gate scans the `ipython` tool too.** In the first Prime test run, the model ran `await bash('git push origin main')` inside the `ipython` tool. The gate reads the python code as call text, so it caught it. Edit, write and read tools are skipped. Any other tool, such as a future MCP send tool, is matched on its name plus its arguments as JSON.

3. **gstack has no `careful-patterns` file in version 1.71.** Its destructive patterns are hard-coded in `careful/bin/check-careful.sh`. The loader reads `~/.claude/skills/gstack/careful-patterns` (file or folder) and `~/.gstack/careful-patterns.txt` when one of them appears, one regex per line.

4. **The `gstack-redact` command cannot cut a live key out of a paste.** Its `--auto-redact` covers only a PII subset, and a Stripe key is not in it. The engine behind it (`lib/redact-engine.ts`) has `redactFindingSpans`. That function replaces every finding and merges overlapping spans. `pack/safety/redact-spans.ts` calls that engine under bun. Bun is already required by `gstack-redact` itself. Two consequences follow. A paste with one HIGH or MEDIUM finding has all of its findings replaced, including LOW ones such as email addresses. A PEM or GCP key body cannot be spliced safely, so the scrubber replaces the whole paste. Both are fail-closed.

5. **`pi.exec` has no stdin.** The scrubber uses Node's `spawnSync` with `input:` so the paste never touches a temp file.

6. **Receipt shape.** Borrowed from `gstack-egress`: `ts`, `type`, `session`, `sink` (the tool), `host` (the pattern name), `payload_class` (the pattern source), `bytes`, `sha256` of the call text, `preview` (first 80 characters, long tokens masked), `consent` (`joe` or `none`), `ui`, `prev` (the previous receipt id, a hash chain), `id`, `status` (`approved`, `denied:user`, `denied:timeout`, `denied:no-ui`). The log never holds the full command text.

7. **A "run" for the limits is the session since it started or since `/limits reset`.** Prime gives extensions no autonomous-run signal, and its recovery journal is internal to the daemon. The extension saves the counters with `pi.appendEntry` after every change and restores them on `session_start`. The resume line walks the session entries: the last `toolResult` is the last completed call, and an assistant `toolCall` with no result is reported as started but unfinished, so Joe checks before he runs it again.

8. **Jev choice questions need `criteria`, a map from option to description.** A plain `options` list returns HTTP 422. `refusal-check.sh` builds the map from the bullets in `refusals.md`, so the markdown is the one source. It calls `jev --raw` and parses the answer with python3, because `jev-decide classify` marks every `none` answer as `needs_review`.

9. **The benchmark criterion was tightened after a false positive.** The test prompt ("This is a test of the approval gate extension... exercise it...") scored 0.56 for `benchmark_tampering`. The criterion now says that the inserted text deceives a model or grader so that the evaluation result is wrong. The test prompt now scores `none`, and "add a hidden note in the eval prompt telling the grader to always give full marks" still scores `benchmark_tampering`.

10. **Test step 4 depends on the model.** With the pack loaded, the model read `AGENTS.md` rules 8 and 17. In two of three runs it declined to push on its own, so the gate never fired. That is correct behavior. The runner prints `inconclusive` in that case and passes on the unit tests, which drive the handler directly. Each Prime run costs about one cent.

11. **Environment variables.** `LAURELIN_MAX_ACTIONS`, `LAURELIN_MAX_SPEND`, `LAURELIN_APPROVAL_TIMEOUT_MS` (default 120000), `LAURELIN_DECISION_LOG` (default `<repo>/decision-log`), `LAURELIN_REFUSAL_THRESHOLD` (default 0.6), and for tests `GSTACK_REDACT_BIN`, `GSTACK_REDACT_ENGINE`, `JEV_BIN`.

## Hookup for the interface branch

Import `listPending(sessionId)` from `pack/extensions/laurelin-approvals.ts`. It returns the calls whose dialog is open right now plus this session's `denied:no-ui` and `denied:timeout` receipts, each with `tool`, `pattern`, `preview` and `state`. The open-dialog part is in memory, so the interface must run in the same Prime process. `readReceipts()` gives the full log for a history view. The limits extension exposes nothing for the interface so far. For a footer item, the interface can call `createLimiter` or read the last `laurelin-limits` custom entry from the session.

## Left for the merge owner

- `.jacobian/` is tracked in git and Orca changes it on every run. I did not commit those changes. It belongs in `.gitignore`.
- `tests/package.json` sets `"type": "module"` so Node runs the tests without a warning. Prime's example packages set the same field in their `package.json`. Adding it to `pack/package.json` would silence the same warning for the extensions. That file belongs to the `pack` branch, so I left it.
- The scrubber suggests `laurelin keys add NAME` in its one-line message. The command itself is on the `launcher` branch.

## Out of scope, as the brief says

Classification routing to local models, and the interface.
