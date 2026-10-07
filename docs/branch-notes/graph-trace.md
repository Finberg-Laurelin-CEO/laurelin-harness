# graph-trace

One trace per graph run, a live graph view, and graphs in the worktrees dashboard (built on graph-verify). Merge to main only on Joe's say.

- `laurelin-agent graph trace <id>`: one line per step (status, worker or jev, attempts, time, checks, branch choice with confidence, blocked or failed reason) and totals (done, running, blocked, failed, skipped, retries, elapsed). `--json` for the same as data.
- `laurelin-agent graph watch <id>`: live view, wave by wave. ■ done, ● running with a timer, □ pending, – skipped, ▲ blocked, ✕ failed. Only blocked and failed steps use the accent; their reasons are listed underneath.
- `laurelin-agent worktrees watch` shows a GRAPHS section with every run above the worktree list.
- Reads only graph.json, state.json and events.jsonl; writes nothing. Must not import the runner (the runner imports the tracker, the tracker imports this).
- Borrowed idea: Langfuse's per-step trace, kept local. No OpenTelemetry export yet; events.jsonl has what an exporter needs.
- Test: tests/test-graph-trace.sh (5 checks). Core, runner, verify and worktrees tests all pass on this branch.

## Cheap models for graph steps (added 2026-10-06)

- A step can name a model for its laurelin worker: `"model": "cheaperinference/deepseek-v4-flash"`. The worker runs with `--provider` and `--model`; the trace shows the model in place of the worker name. Claude and Codex workers cannot take a model (checked).
- Use it for bulk reading and extraction steps; keep merge and writing steps on the default frontier model. Cheaper Inference's wallet is funded: a one-line call to DeepSeek V4 Flash answered on 2026-10-05.
- Tested with a stand-in worker that records the flags it receives. A live run waits for the merge: the worktrees have no built fork, so a real worker cannot start from them.
