# Branch `metrics`: first-pass acceptance, the north-star number

Plan: section 22 (the edge), section 3, Step 6, section 16 (agent-beacon). Rule 17: do not install beacon; if it is absent, work from what is on disk.

## Make
1. `bin/laurelin-metrics` (bash plus python3): computes, per ISO week and overall, from the fork's own sessions (`~/.laurelin/agent/sessions/*.jsonl`, and `~/.prime/agent/sessions` when `--include-prime`) and the decision logs (`decision-log/*.jsonl`, `tests/testset/results/`):
   - jobs: a job is a root session's first user prompt that the router logged as `intent: new_task` (or, without a router row, any first prompt);
   - corrections: user messages that Jev classifies as `correction` (ask Jev per user message with a Choice over `correction, steer, question, approval, new_task`; batch in one call per session; cache results in `decision-log/intent-cache.jsonl` keyed by message hash so a message is judged once);
   - first-pass acceptance: share of jobs with zero corrections after the first assistant reply;
   - corrections per job; cost per accepted job (usage on assistant messages); time to done (first prompt to last assistant message);
   - gate pass rate per check from the gate log.
   Prints a table; `--json` for machines; `--since 2026-09-01`. Read Prime's `docs/session-format.md` for the entry types.
2. `laurelin-metrics baseline`: writes `metrics/baseline.md` (committed) from the 7,237-prompt year if `~/.claude/history.jsonl` and `~/.codex/history.jsonl` are readable: only the correction share (Jev over a random sample of 500 prompts, cached), so the year's 35 percent becomes a measured number. Never print a prompt's text into the repo; hashes and labels only.
3. A footer item in `laurelin-ui` (small edit): `accept 71% (wk)` from the last computed number, read from `metrics/latest.json` (gitignored).
4. `docs/metrics.md`: what each number means in plain words and how it is computed.

## Test
`tests/test-metrics.sh`: a synthetic session folder with three sessions (one clean, one with two corrections, one steer only) gives acceptance 67%, 0.67 corrections per job; the cache prevents a second Jev call; `--json` parses; skips the Jev part cleanly without the key.

## Out of scope
Installing beacon. The learning loop.
