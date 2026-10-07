# graph-core

Task graphs, the first of four graph-worker pieces (core, runner, verify, trace). Merge to main only on Joe's say.

- A job is a JSON graph of steps. Kinds: work (one worker, one task), merge (combines its inputs, leaves skipped ones out), branch (Jev picks an option; steps listed only under the other options are skipped).
- Every work and merge step has `expects`, the contract for done (from CrewAI's expected_output). Parallel fan-out and fan-in and branch points come from LangGraph. No framework is added; the harness's worktrees and workers run the steps.
- The core is pure: check (ids, inputs, loops, branch targets), ready, skips, finished, waves, the worker prompt, and the Jev request for a branch. Running is graph-runner's job.
- A branch option lists only the steps that run just for that answer. Steps after the branch that always run are not listed (the first example got this wrong, and the test caught it).
- `laurelin-agent graph check <file>` prints the plan as parallel waves.
- Example: pack/graph/examples/dcvc-brief.json. Test: tests/test-graph.sh (10 checks).
