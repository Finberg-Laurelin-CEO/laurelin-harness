# Branch `worker-settings`: cut 62,000 tokens from every Claude Code worker call

Plan: section 20 wave 2 item 2; Step 2. Read `docs/branch-notes/workers.md` first: the global Claude Code hooks add about 62,000 system-prompt tokens per `delegate_worker` call.

## Make
1. `pack/worker/claude-settings.json`: a Claude Code settings file for workers with no hooks, no plugins beyond what a worker needs, and the permission rules the worker already uses (see `laurelin-workers.ts`). Read Claude Code's settings documentation (`claude --help`, and `~/.claude/settings.json` for the shape; do not edit it). Pass it with `--settings` in `laurelin-workers.ts`. If `--settings` cannot disable global hooks, find the flag or env var that does (for example a separate config dir through `CLAUDE_CONFIG_DIR`) and use that, with `auth` still shared so the subscription sign-in works. Record what worked.
2. Measure: run `delegate_worker` with the old and the new setup on the same small task and record input tokens from Claude Code's `--output-format stream-json` usage fields. Put both numbers in the branch note.
3. Same idea for Codex if `codex exec` loads user-level MCP servers or hooks the worker does not need; otherwise note "not needed".

## Test
`tests/test-worker-settings.sh`: the settings file parses; `delegate_worker(claude)` still creates a file; the measured input tokens per call drop by at least half against the old setup (print both numbers). Skips cleanly with "skipped: no model" when Claude Code is not signed in.

## Out of scope
Anything in `~/.claude`. Do not change the user's settings file.
