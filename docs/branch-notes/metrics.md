# Branch note: metrics (section 22, Step 6)

Built 2026-09-25. Brief: `docs/briefs/metrics.md`. Test: `tests/test-metrics.sh`, all checks pass with the key and without it. Docs: `docs/metrics.md`.

## What was built

| File | What it does |
|---|---|
| `bin/laurelin-metrics` | Bash wrapper. Finds the repo, loads the key store into the environment (never prints a value), hands over to `bin/metrics.py`. |
| `bin/metrics.py` | The work. Reads the fork's sessions (and Prime's with `--include-prime`), the router rows, the gate log and the test-set results. Asks Jev for the intent of every message after the first reply, one Choice question per message, one call per session (batches of 40). Caches each label in `decision-log/intent-cache.jsonl` by message hash. Prints the table per ISO week or `--json`. Writes `metrics/latest.json` (gitignored) for the footer. `baseline` samples 500 prompts from the two history files and writes `metrics/baseline.md`. |
| `metrics/baseline.md` | Committed. The year's correction share as Jev measures it: counts, shares, a Wilson interval, no text. |
| `pack/extensions/laurelin-ui.ts` | Small edit: the footer badge adds `accept 67% (wk)` from `latest.json`. The item is left out when there is no number. `LAURELIN_METRICS_FILE` points the test at a fixture. |
| `docs/metrics.md` | What each number means and how it is computed. |
| `tests/test-metrics.sh`, `tests/metrics-footer-check.mjs` | The test. Synthetic sessions only. |
| `tests/README.md`, `tests/run-all.sh`, `.gitignore` | One row, one word, one line. |

## Test result (2026-09-25)

| Check | Result |
|---|---|
| Three synthetic jobs (clean, two corrections, steer only): acceptance 67%, 0.67 corrections per job | pass |
| Child session (`rlmDepth` 1) and a session whose first prompt was a question are left out | pass |
| Cost per accepted job, median time to done, gate pass rates (gate log plus a test-set result), test-set summary | pass |
| `--json` parses, `--since` filters, table prints, `latest.json` written | pass |
| Second run makes no Jev call: 4 cache hits, 0 calls, same number | pass |
| Cache, `latest.json` and `baseline.md` hold no message text | pass |
| Cached labels give the number with no key in the environment | pass |
| `baseline` over a synthetic history pair: 3 prompts, empty row dropped, Codex seconds read, one Jev call for the uncached prompt | pass |
| Footer shows `accept 67% (wk)` through Prime's loader, and omits it when the number is null | pass |
| `tests/test-interface.sh` still passes after the UI edit, including `tsc --noEmit` | pass |
| Jev labels on the fixtures | all four right on the first run |

## What the real data says

**Baseline.** 7,976 prompts in the two history files, 2025-10-23 to 2026-09-26. Sample of 500: correction share 14 percent, 95 percent interval 12 to 18 percent. Labels: new task 41 percent, steer 18, question 17, correction 14, approval 9. 140 of the 500 were below 0.6 confidence. The plan's section 3 said about 35 percent from a manual read. The two numbers measure different things. The manual pass could see the whole conversation. Jev saw one prompt at a time with no record of the reply before it. A steer that follows a wrong answer reads as a steer without that context. The session-based number has the context and is the one to trust going forward. Joe can label 50 of the sampled prompts by hand to calibrate. The cache holds the hashes, so a labeled set can be joined to it.

**Report.** 58 root sessions across the fork and Prime, 54 jobs, 4 not jobs. Overall acceptance 67 percent, 2.22 corrections per job, 15.46 dollars per accepted job. The weekly rows tell two stories. Weeks 32 to 38 are Prime sessions from before the harness: long, resumed over days, 1 to 7 corrections per job, acceptance 0 to 70 percent. Week 39 is the fork: 25 jobs, 100 percent acceptance, but these are the wave-2 test runs and one-turn proofs, with no follow-up messages at all, so the number is trivially perfect. The footer shows `accept 100% (wk)` today for that reason. The first real week of daily jobs will give the first honest number.

746 messages judged on the first run, 32 Jev calls, below one cent in total.

## Decisions and what I learned

1. **One question per message, not one state array.** The jev skill says that past 8 items the verdicts shift by a line when questions point at array paths. The text of each message goes in the instructions of its own question, with up to 400 characters of the preceding reply beside it. One call per session, chunked at 40.
2. **The router's criteria, copied.** `INTENT_CRITERIA` is the same map the router uses, so the two judgments agree on what a correction is. The extension exports it, but importing TypeScript from Python is not worth a build step. A change in one must be copied to the other. The comment in both files says so.
3. **Root sessions only.** A child session has `rlmDepth` above zero in its header. Its cost is already folded into the parent's assistant messages by Prime's `child_usage_attributed` entries, so counting it would double the cost and invent jobs.
4. **Job intent from two places.** The router writes a `laurelin_decision` custom entry into the session and a row into `decision-log/router.jsonl`. The session entry is checked first, then the log, both keyed by the first 16 hex characters of the prompt's SHA-256, which is what the router stores.
5. **Threshold on the label.** A `correction` label below 0.6 confidence does not count. The cache stores the confidence, so the threshold can move without a new Jev call. `--threshold` and `LAURELIN_JEV_THRESHOLD` set it.
6. **Time to done spans resumes.** Median first prompt to last assistant message. A session Joe reopened three days later shows three days. A per-turn measure requires a rule for what ends a job, which the learning loop may supply.
7. **Key masking before Jev.** History prompts predate the scrubber. Tokens shaped like keys (`sk-`, `AKIA`, `ghp_`, `glpat-`, `xox`, `AIza`, and any run of 40 or more key characters) are replaced with `[masked]` before the text leaves the machine. Jev is an approved vendor for all material (PLAN section 20), so nothing else is held back.
8. **Skip cleanly without the key.** `jev_available()` checks the environment and then the key store for the name `TYPESAFE_API_KEY` only, the way the `jev` CLI does. Without it, cached labels still count and the table says what is unjudged. The test's Jev section prints `skip` and the structural checks still run.
9. **Beacon is not installed.** Rule 17 forbids installing it. The brief says to work from what is on disk, and the sessions plus the decision logs hold everything needed. When beacon lands, its stream is one more session source.
10. **History file count.** The brief says 7,237 prompts. The files hold 7,976 today: 7,303 Claude Code rows and 671 Codex rows, with empty rows dropped. Two days of new prompts plus a different counting rule in the original inventory explain the gap. The report prints the count it found.

## Hookup for other branches

- **learning-loop**: the cache is a labeled stream of corrections by message hash. The loop can read `decision-log/intent-cache.jsonl` to find which sessions carry corrections, and `--jobs --json` to get the session ids. `router.jsonl` rows carry `outcome: null` today. The loop can set it from the cache.
- **testset**: `calibrate.sh` can read the cache for a sixth confidence table (intent labels with their confidences).
- **interface**: no change to the event bus. The footer reads a file, so the number updates on the next badge redraw after a run.

## Left for the merge owner

- `metrics/latest.json` is gitignored and was written by the real run above, so Joe's footer will show a number at once.
- The 140 low-confidence baseline labels are a calibration set waiting for hand labels. A `--labels FILE` join was not built.
- `pack/package.json` lacks `"type": "module"` (router and safety notes said the same).

## Rule 17 check

Nothing outside the repo changed. The test writes only under `tests/tmp/metrics/`. The real runs wrote `decision-log/intent-cache.jsonl` and `metrics/latest.json`, both gitignored, and `metrics/baseline.md`, committed. Keys were loaded into the environment and never read or printed. No prompt text is in the repo.
