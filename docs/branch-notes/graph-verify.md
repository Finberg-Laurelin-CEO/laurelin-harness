# graph-verify

Each graph step's result is checked against its contract before the next step uses it (built on graph-runner). Merge to main only on Joe's say.

- Cheapest first: (1) if `expects` asks for sources, citations, links or references, the result must contain a link, DOI or numbered reference; (2) gates the step names (`"gates": ["prose", "numbers"]`) run on the result file; (3) Jev answers one yes/no question: does the result fully meet `expects` for `task`? Under 0.6 (LAURELIN_VERIFY_MIN) the step fails.
- A failed check retries the step once with the reason added to its prompt, then marks it failed for Joe (the runner's attempts limit).
- If Jev cannot answer, the contract check is skipped and noted in the trace, so a Jev outage never stalls a graph.
- The checks go into state.json and events.jsonl for graph-trace.
- Borrowed idea: DeepEval's per-output metrics, judged by Jev (cents and seconds) instead of a large model.
- Test: tests/test-graph-verify.sh (4 checks); the runner test still passes with verify wired in.
