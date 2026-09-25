# Test-set baseline (synthetic specs)

Run on 2026-09-25 with `tests/testset/run.sh` on the three synthetic specs. Model: `gpt-6-astra` through the ChatGPT sign-in. Cost is Prime's list-price estimate per job, not a bill. Score is the mean Jev rubric score, 0 to 1. Gates are passed over attached (the gates the spec's check letters name).

| id | name | checks | gates | score | cost | seconds | turns | status |
|---|---|---|---|---|---|---|---|---|
| synthetic-1 | A three-sentence file | A D | 2/2 | 0.95 | $0.4647 | 21 | 3 | ok |
| synthetic-2 | A short memo from an outline | A D E | 3/3 | 0.93 | $0.3268 | 22 | 3 | ok |
| synthetic-3 | A script that renames files | D | 1/1 | 0.92 | $0.5783 | 45 | 5 | ok |

## Per criterion

**synthetic-1**

- The file exists and holds exactly three sentences. `met` (confidence 0.83)
- Every sentence is about keeping a written log of tests. `met` (confidence 0.87)
- The text uses plain words with no headings, lists or filler. `met` (confidence 0.84)
- The final reply says the file was written and nothing more. `met` (confidence 0.95)

**synthetic-2**

- The memo has a title and three sections, one per outline sentence. `met` (confidence 0.75)
- Each outline sentence appears word for word at the start of its section. `met` (confidence 0.73)
- The added text is short, plain and adds no facts that contradict the outline. `met` (confidence 0.79)
- The memo uses no bullet lists, bold text or em dashes. `met` (confidence 0.86)

**synthetic-3**

- The script file exists, is bash, and takes the folder as its first argument. `met` (confidence 0.79)
- The script renames only files that end in .TXT and leaves other files unchanged. `met` (confidence 0.90)
- The script refuses to overwrite a file that already exists. `met` (confidence 0.51)
- The final reply shows a folder listing before and after the run, with the .TXT files renamed. `met` (confidence 0.87)

## Calibration report on these runs

```
sources: 3 result file(s), 0 decision log(s)
decision                  n   min   p20   p50   max labeled threshold  basis
----------------------------------------------------------------------------
gate:location             3  1.00  1.00  1.00  1.00       0      1.00  20th percentile (no labels of both kinds)
gate:prose                2  1.00  1.00  1.00  1.00       0      1.00  20th percentile (no labels of both kinds)
gate:verbatim             1  1.00  1.00  1.00  1.00       0      1.00  20th percentile (no labels of both kinds)
```

The 20 real jobs (`job-01` to `job-20`) are `"enabled": false` and were not run. They need the vault as `--root`, staged inputs and Joe's review; see `docs/branch-notes/testset.md`.
