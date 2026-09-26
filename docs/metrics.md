# Metrics: what each number means

`bin/laurelin-metrics` prints one table per ISO week and one line for the whole period. Section 22 of `PLAN.md` names first-pass acceptance as the north-star number. This page says what each column means and how the script computes it.

## Where the data comes from

| Source | What the script reads from it |
|---|---|
| `~/.laurelin/agent/sessions/*.jsonl` | Every session the fork wrote. Each file holds Joe's messages, the agent's replies with their cost, and the router's decision entries. `--include-prime` adds `~/.prime/agent/sessions`. |
| `decision-log/router.jsonl` | The router's intent for each first prompt, keyed by a hash of the prompt. |
| `decision-log/gates.jsonl` and `tests/testset/results/*.json` | One row per gate run: the check name and pass, fail or skipped. |
| `decision-log/intent-cache.jsonl` | The label Jev gave each message, keyed by the message hash. The script writes it. |

A child session (an `rlm.spawn` subagent, `rlmDepth` above zero in the header) is skipped. Its cost is already folded into the parent's assistant messages.

## The columns

**Job.** A root session whose first prompt the router logged as `new_task`. When the session has no router row, the first prompt counts as a job anyway. A session whose first prompt was a question, a steer or an approval is counted under "not jobs" and left out of the rest.

**Correction.** A message from Joe, after the agent's first reply, that Jev labels `correction`: Joe says something the agent did was wrong and says what it should have been. Jev picks one of five labels (`correction`, `steer`, `question`, `approval`, `new_task`) with the same criteria the router uses. A label below the confidence threshold (0.6, `--threshold`) does not count as a correction. Each message goes to Jev one time. The label lands in the cache, so a rerun costs nothing.

**Accept.** First-pass acceptance: the share of jobs with zero corrections after the first reply. A job is counted only when every one of its following messages has a label. When Jev is off, the column shows `-` and the table says how many messages are unjudged.

**Corr/job.** Corrections divided by judged jobs.

**$/accepted.** The sum of `usage.cost.total` on the assistant messages of accepted jobs, divided by the number of accepted jobs. Prime writes the cost on each assistant message and folds child cost into the parent.

**Done (min).** The median time from the first prompt to the last assistant message, in minutes. A session that Joe resumes over several days counts the whole span.

**Gate table.** For each check: pass, fail and skipped counts, and the pass rate as pass over pass plus fail. Skipped runs (a gate with no input) stay out of the rate.

**Test set.** The number of test-set result files, their mean Jev score and their total cost.

## Flags

```
laurelin-metrics                       table, and metrics/latest.json for the footer
laurelin-metrics --json                the same as JSON
laurelin-metrics --since 2026-09-01    jobs and gate rows from that date
laurelin-metrics --include-prime       also read ~/.prime/agent/sessions
laurelin-metrics --no-jev              cached labels only, no Jev call
laurelin-metrics --jobs --json         one row per job
laurelin-metrics baseline              correction share of the year's prompts
```

Folders and files can be pointed elsewhere with `--sessions`, `--decision-log`, `--gate-log`, `--results`, `--cache` and `--out`. `LAURELIN_SESSIONS`, `LAURELIN_DECISION_LOG`, `LAURELIN_GATE_LOG`, `LAURELIN_METRICS_FILE` and `JEV_BIN` do the same from the environment.

## The footer

`laurelin-ui` reads `metrics/latest.json` (gitignored) when it draws the footer and adds `accept 71% (wk)` for the latest ISO week. When the file is missing or the week has no judged job, the item is left out. The number is as old as the last run of `laurelin-metrics`.

## The baseline

`laurelin-metrics baseline` reads `~/.claude/history.jsonl` and `~/.codex/history.jsonl`, draws a random sample of 500 prompts with a fixed seed, asks Jev for the label of each, and writes `metrics/baseline.md`. The file holds counts, shares and a Wilson interval. No prompt text is written to the repo or the cache. History prompts carry no record of what the agent said immediately before, so the baseline is a weaker measurement than the session-based number.

## Privacy

No message text is printed or written by this piece. The cache, `latest.json` and `baseline.md` hold hashes, labels and counts. Text goes to Jev only, and tokens shaped like keys are masked first.
