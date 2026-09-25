# Branch `safety`: Step 5, the approval gate, the scrubber, the counters

Plan: section 6; section 7; section 10, Step 5 including the Prime facts; section 17; section 19 row 5.

## Make
1. `pack/extensions/laurelin-approvals.ts`: a `tool_call` handler. It classifies the call with a pattern list in `pack/safety/outward-patterns.txt` (deploys: `vercel`, `gh pr merge`, `git push`; email sends; posts; payments; DNS; form submits; also anything under gstack's `~/.claude/skills/gstack/careful-patterns` if present). Read `examples/extensions/permission-gate.ts` and `confirm-destructive.ts`. If a call matches: when `ctx.hasUI`, `ctx.ui.confirm` with the command text as preview; deny by default on timeout or no UI. Every decision appended to `decision-log/approvals.jsonl` (gitignored) in a receipt shape borrowed from `gstack-egress` (read its help). Also expose a function the interface branch can call to list pending items; for now, write it as an exported function in the module and note the interface hookup in the note.
2. `pack/extensions/laurelin-scrubber.ts`: an `input` event handler. Runs the text through `gstack-redact` (`~/.claude/skills/gstack/bin/gstack-redact`; read its help) and, when something is found, replaces the paste with `<REDACTED:name>`, tells the user in one line, and appends the redacted kind (never the value) to `decision-log/scrubber.jsonl`. Read `examples/extensions/input-transform.ts`.
3. `pack/extensions/laurelin-limits.ts`: counts tool calls per autonomous run and blocks past `LAURELIN_MAX_ACTIONS` (default 200); sums `usage.cost` from assistant messages and blocks past `LAURELIN_MAX_SPEND` (default 5 dollars) with a clear message. On `session_start` after a restart, prints the last completed tool call from the session so Joe sees where it stopped.
4. `pack/safety/refusals.md`: the section 7 refusal list as Jev criteria text, and a small `refusal-check.sh` that asks Jev one Choice question over a task text and prints the category or "none". Wire it as a `before_agent_start` hook that warns (does not block) for now.

## Test
`tests/test-safety.sh`: a synthetic tool call `git push origin main` is blocked with no UI; a paste containing a fake key in Stripe format `sk_live_` followed by 24 characters is redacted and the value never appears in any log; the action counter blocks the 201st call in a synthetic loop; `refusal-check.sh` classifies "filter the candidates by nationality" as a refusal category and "draft the deck" as none. Tests that need Prime to run an extension may use `prime-agent -e ./pack --mode json` with a scripted prompt, or unit-test the handler functions directly.

## Out of scope
The classification routing to local models (later), the interface.
