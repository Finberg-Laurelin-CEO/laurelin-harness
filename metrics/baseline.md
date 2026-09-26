# Baseline: correction share of the year's prompts

Computed 2026-09-25 by `laurelin-metrics baseline`. Hashes and labels only; no prompt text is stored here or in the cache.

| Item | Value |
|---|---|
| History files read | ~/.claude/history.jsonl, ~/.codex/history.jsonl (2 of 2) |
| Prompts in the files | 7976 |
| Date span | 2025-10-23 to 2026-09-26 |
| Sample size | 500 (seed 20260925) |
| Judged by Jev | 500 |
| Confidence below 0.6 | 140 |
| **Correction share** | **14%** (95% interval 12% to 18%) |

| Label | Count | Share |
|---|---|---|
| correction | 72 | 14% |
| steer | 91 | 18% |
| question | 87 | 17% |
| approval | 45 | 9% |
| new_task | 205 | 41% |

Jev calls this run: 0; cache hits: 500; unjudged: 0.

How to read it: the plan's section 3 estimated that about 35 percent of the year's prompts were corrections, from a manual read. This table is the same question put to Jev over a random sample, with the same five labels the router uses. History prompts carry no record of what the agent said immediately before. Approvals and short steers are harder to tell apart here than inside a session. The interval is a Wilson score interval on the sample.
