# Branch `router`: Step 3, the Jev router

Plan: section 8 (LLM creates, Jev decides, code executes); Step 3 in full including the Prime facts and the keel rules (abstain, allowed-choice check, decision log); section 18 groups 1 and 3; section 17 (decision log store). Read `~/.claude/skills/jev/SKILL.md`, `~/.claude/skills/building-with-jev/SKILL.md`, and `docs/branch-notes/safety.md` (Jev Choice takes `criteria`, not `options`).

## Make
1. `pack/extensions/laurelin-router.ts`. On the `input` event for a new user message (not slash commands), build the state (the message, the last assistant message if any, `.laurelin/task.json` if present) and ask Jev in ONE call with parallel questions:
   - `worker` (Choice): `coordinator` (Prime itself), `claude` (delegate_worker claude: writing, design, long documents), `codex` (delegate_worker codex: code, scripts, file operations), `abstain`.
   - `skill` (Choice): the menu is built fresh from the skills Prime has loaded (`pi.getAllTools`, or list `pack/skills/*/SKILL.md` descriptions) plus `none`. Cap at 40 options; filter obvious mismatches in code first (keyword overlap with the message).
   - `classification` (Choice): `green`, `yellow`, `red` with criteria from AGENTS.md rule 6 and PLAN section 8 item 7.
   - `outward` (Noul): does the task involve an action in PLAN section 6.
   - `intent` (Choice): `new_task`, `steer`, `correction`, `question`, `approval`.
2. Rules: any answer under its threshold (default 0.6, per-question override in `pack/router/thresholds.json`) becomes `abstain` and the router asks Joe with `ctx.ui.select` when a screen exists, else leaves the default (coordinator, none, green). The chosen worker and skill are checked against the live menu before use (allowed-choice check). The router never blocks the message; it prepends a short routing note to the model's context through `before_agent_start` ("Route: worker claude, skill writing-ste, class GREEN, outward no, confidence 0.91") and emits `laurelin:classification` and `laurelin:worker` events for the panel.
3. Decision log: every routing decision appended with `pi.appendEntry("laurelin_decision", {...})` (stays out of model context) AND to `decision-log/router.jsonl` (gitignored) with task, options, choice, confidence, threshold, outcome placeholder. If `gstack-decision-log` (`~/.claude/skills/gstack/bin/`) is present, also write there; read its help.
4. Commands: `/route` shows the last decision; `/route off|on` disables the router for the session.

## Test
`tests/test-router.sh`: twenty past-prompt-style messages in `tests/fixtures/router-cases.json` (write them yourself, generic, no private content: deck rewrite, fix a script, research a firm, "don't change my prose", "push it", "what does gbrain do") each with the expected worker and intent; at least 16 of 20 must match, and every case must log one decision line with a confidence. Needs the TYPESAFE key; skips cleanly without it.

## Out of scope
Executing the route (the coordinator still decides to call `delegate_worker`); the test set.
