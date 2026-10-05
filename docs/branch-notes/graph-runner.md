# graph-runner

Durable runs of task graphs (built on graph-core). Merge to main only on Joe's say.

- `laurelin-agent graph run <file>` starts a graph in the background; `graph status|list|stop|resume <id>`; `graph decide <id> <step> [choice]` answers a branch Jev was unsure about, or retries a blocked step.
- State lives in `<repo>/.laurelin/graphs/<id>/`: graph.json, state.json (saved atomically after every change), outputs/<step>.md, events.jsonl (graph-trace reads this), loop.log.
- Each step runs as a worker in its own worktree (the tracker's start). A worker's result is its `.laurelin/out.md`; text starting `BLOCKED:` waits for Joe; no file is a failed attempt, retried once in a fresh worktree. At most 3 steps run at once (LAURELIN_GRAPH_PARALLEL).
- Branches are decided by Jev (bin/jev, so classifier.dev when TypeSafe has no credits); under 0.6 confidence the branch waits for Joe.
- Write-ahead: a step is saved as "starting" before its worktree is created. After a crash, a starting step whose worktree exists is adopted (asking worktrunk, because the tracker's record can lag the branch). The test kills the loop mid-run and checks a resume finishes; it found exactly this gap first.
- verify() is the hook graph-verify fills in; here it accepts every result.
- tracker.mjs gained one test-only switch, LAURELIN_FAKE_WORKER (a stand-in worker script). Normal runs are unchanged.
- Nothing merges, pushes or removes worktrees. Test: tests/test-graph-runner.sh (8 checks).
