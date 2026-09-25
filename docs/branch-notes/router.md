# Branch note: router (Step 3)

Built 2026-09-25. Brief: `docs/briefs/router.md`. Test: `tests/test-router.sh`, all pass, 20 of 20 fixtures route as expected (the brief asks for 16).

## What was built

| File | What it does |
|---|---|
| `pack/extensions/laurelin-router.ts` | The router. Before the coordinator model sees a message from Joe, it asks Jev five questions in one call over one state (the message, the last assistant message, `.laurelin/task.json` if present): worker, skill, classification, outward, intent. It thresholds each answer, abstains under the threshold, asks Joe on screen for an abstained worker, skill or classification, checks the worker and skill against the live menu, adds one routing note to the model's context, emits `laurelin:classification` and `laurelin:worker`, and logs the decision three ways. Commands `/route` and `/route off|on`. |
| `pack/router/thresholds.json` | Per-question confidence thresholds. All 0.6 today. The test-set branch's `calibrate.sh` is meant to suggest better ones. |
| `tests/fixtures/router-cases.json` | Twenty generic past-prompt-style messages, each with the expected worker and intent. Five carry a `last_assistant` line so approvals and corrections have something to answer. |
| `tests/router-test.mjs`, `tests/test-router.sh` | The test. Loads the extension through Prime's own loader, checks the pure pieces (menu, shortlist, abstain, allowed-choice, defaults without Jev), the handler plumbing (slash commands and extension-injected messages skipped, `/route off`), then runs the twenty fixtures through Jev and reads the log back. Without `TYPESAFE_API_KEY` the Jev part prints `skipped` and exits 0. |

## Test result (2026-09-25)

| Check | Result |
|---|---|
| Loads through Prime's loader; `/route`, `input`, `before_agent_start` registered | pass |
| Skill menu from `pack/skills` | pass, 12 skills with descriptions |
| Shortlist cap | pass, 60 skills cut to 40 with keyword matches first |
| Abstain under threshold, allowed-choice check, defaults when Jev is down | pass |
| Twenty fixtures, worker and intent both right | 20 of 20 (first run 18 of 20, see decision 4) |
| One log line per case with a confidence | pass |
| Panel events | pass, both emitted 20 times |
| Twenty Jev calls | 6 to 10 seconds in total |
| gstack store holds labels only, never the message | pass |
| `tsc --noEmit` on the extension (Vercel's bundled compiler) | pass |
| Live run: `prime-agent -e ./pack --mode json --no-session -p "..."` | the note `[Laurelin router] Route: worker coordinator, skill none, class GREEN, outward no, intent question, confidence 0.86` appears in the session and one line lands in `decision-log/router.jsonl` |

Two fixtures land on `coordinator` by abstaining (worker confidence 0.42 and 0.53) rather than by a confident pick. Both are steers or questions, where `coordinator` is also the default, so the answer is right either way. The calibration step will tell whether 0.6 is the right line for the worker question.

## Decisions and what I learned

1. **The Jev call runs in `before_agent_start`, not in `input`.** The brief puts it on the `input` event. Prime chains `input` handlers in load order, and `laurelin-router` sorts before `laurelin-scrubber`, so the router would see a pasted key before the scrubber cut it and send it to Jev's API. `before_agent_start` sees the scrubbed prompt. The `input` handler now only records where the message came from, so extension-injected messages (`sendUserMessage`, source `extension`) are not routed. Slash commands are skipped either way.

2. **The routing note is an injected message, not a system-prompt change.** `before_agent_start` returns `{ message: { customType: "laurelin-route", content: "[Laurelin router] Route: ...", display: true } }`, the same shape the refusal hook uses. It persists in the session, so a resumed session keeps its routes.

3. **The live worker menu.** With a bound session, `claude` and `codex` are offered only when the `delegate_worker` tool is registered (`pi.getAllTools`). Outside a session, where Prime's runtime stubs throw, the `claude` and `codex` binaries on PATH stand in. `coordinator` and `abstain` are always offered. The skill menu is read fresh from `pack/skills/*/SKILL.md` on every message, so a linked or removed skill shows up at once. Multi-line `description: |` blocks (humanizer) are parsed.

4. **One criteria revision, judged on the labeled fixtures.** The first run missed a correction and a steer (both went to `claude` at 0.71 and 0.74) and four coordinator cases only passed by abstaining. The coordinator criterion said nothing about who takes a question, approval, steer or correction. Adding "it also takes every question, approval, steer and correction, because only the coordinator holds the conversation" and the matching `not_for` on the two workers took the score from 18 to 20 and lifted those four cases to 0.77 to 0.99. No other question changed.

5. **Skill shortlist.** Keyword overlap between the message and each skill's name plus description ranks the skills; zero-overlap skills are dropped only when the list is over the cap of 40. With 12 skills nothing is dropped, which follows the jev skill's advice to keep the full option set. `none` is always an option.

6. **The outward question is a Noul.** Its "confidence" for thresholding is the distance from 0.5, doubled. Under the threshold it abstains to `no` and the note says `(unsure)`. The approval gate on `tool_call` is the real stop; this flag is for the note and the panel.

7. **Three logs.** `pi.appendEntry("laurelin_decision", ...)` in the session (out of model context); `decision-log/router.jsonl` (path from `LAURELIN_DECISION_LOG`, default `<repo>/decision-log`, gitignored) with `ts`, `id`, `prompt_chars`, `prompt_sha256`, every answer with `choice`, `confidence`, `threshold`, `abstained`, plus `options`, `confidence` (the minimum), `note`, `outcome: null`; and gstack's store through `gstack-decision-log`. The gstack row carries labels and the prompt hash only. Its validator rejects secrets and instruction-like text, and its files can sync off the machine if artifacts sync is ever turned on, so Joe's message text never goes there. `LAURELIN_GSTACK_DECISIONS=0` turns that write off. The write is fire-and-forget with a 15 second cap.

8. **gstack's project slug.** From this worktree `gstack-decision-log` filed the rows under the project `Joe`, because `~/package.json` confuses its repo detection (PLAN section 20 already notes this). The launcher sets `GSTACK_PROJECT_SLUG`, so under `bin/laurelin` the rows go to the right project. The test sets `GSTACK_HOME` to a folder under `tests/tmp`, so it never writes to Joe's real store.

9. **Asking Joe.** For an abstained worker, skill or classification with a screen, `ctx.ui.select` offers the live menu. A pick that returns in under 50 ms is treated as unanswered, since Prime's `-p` and JSON modes report a screen and answer at once (safety note, item 1). Joe's pick is checked against the menu too. Intent and outward are informational and never prompt.

10. **Jev question shape.** Choice questions take `criteria` as a map (safety note, item 8). Instructions are objects with `question`, `inspect`, `note` or `focus`, naming state paths in backticks, as `building-with-jev` asks. The state is a JSON object, not a string.

11. **Live run cost.** The one Prime run in the table above ran on Prime's default `anthropic/claude-fable-5-1` and cost about 49 cents, nearly all cache write of the pack's system prompt. That is Prime's default when the pack is started with `prime-agent -e ./pack` directly; `bin/laurelin` sets the coordinator model to the ChatGPT sign-in. The test does not run Prime; the twenty Jev calls cost a fraction of a cent.

12. **Environment variables.** `LAURELIN_DECISION_LOG`, `LAURELIN_GSTACK_DECISIONS`, `LAURELIN_ROUTER=off` (start disabled), `JEV_BIN`, `GSTACK_DECISION_LOG_BIN`, and for the test `PRIME_AGENT_PKG`.

## Hookup for other branches

- The interface already listens for `laurelin:classification` and `laurelin:worker`, so the badge and the worker name follow each route with no change.
- The bridge branch's `.laurelin/task.json` is read as `task` in the state. Its `classification` key is named in the classification question as the class the job started with.
- The test-set branch's `calibrate.sh` can read `decision-log/router.jsonl`: every line has one confidence per question and the threshold in force. `outcome` is `null` and waits for a correction signal from the learning loop.
- Executing the route is out of scope, as the brief says. The coordinator still decides to call `delegate_worker`. The note tells it what Jev picked.

## Left for the merge owner

- `pack/package.json` still lacks `"type": "module"`, so Node prints a module-type warning when the test imports the extension directly (the safety note said the same). One line in the pack's manifest silences it.
- The two abstaining fixtures (13 and 15) suggest the worker threshold may sit a little high for steers and questions. Leave it until the calibration step has real data.

## Rule 17 check

Nothing outside the repo changed. The test writes only under `tests/tmp/` and the decision log folder it names. Keys were sourced into the environment and never read or printed.
