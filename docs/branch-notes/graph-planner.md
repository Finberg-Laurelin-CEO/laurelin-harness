# graph-planner

A planner over the graph pieces: a task and what "done" means become a checked task graph. Built on graph-trace. Merge to main only on Joe's say.

- `laurelin-agent graph plan "<task>" --done "<criteria>" [--id <id>] [--run]`. Prints the waves, the contract and the coverage score, and saves the plan to `.laurelin/graphs/plans/<id>.json`. `--run` starts the plan right away; without it, the command prints `graph run <file>`, so Joe can read the plan first.
- Drafting: one-shot `laurelin-agent -p --no-session`, with memory and the router off for that call. `LAURELIN_PLANNER_MODEL="provider/model"` picks the drafting model. `LAURELIN_PLANNER_CMD` swaps in a stand-in for tests.
- Checks on each draft:
  1. The graph core check.
  2. The plan has exactly one final step (the deliverable).
  3. A Jev yes/no check: does the plan cover "done"? Under 0.6 counts as a problem.
  The drafter never grades its own plan. Problems go back to the drafter as feedback. It gets at most `LAURELIN_PLANNER_ATTEMPTS` drafts (default 3), and every attempt goes to `<id>.log.jsonl`.
- If Jev is down, the coverage check is skipped and noted. It never blocks a plan, which matches graph-verify.
- The plan carries `contract: { task, done }`. The runner ignores the field today. A later step can pass the contract to the final step's worker and to verify.
- Borrowed idea: AdaL's "engineer" layer, which turns a task and its success criteria into a contract and a set of workers. Here the output is a normal graph file, so the durable runner, verify and trace apply unchanged. See docs/GTM.md, the AdaL section.
- Test: tests/test-graph-planner.sh (6 node tests plus 1 CLI check). The core, runner, verify and trace tests all pass on this branch.
- Not yet done: a live plan with a real model. That waits for the merge, because the worktrees have no built fork.
