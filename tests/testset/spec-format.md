# Test-set spec format

One JSON file per job in `tests/testset/specs/`. `run.sh` reads each one, runs the job through `bin/laurelin` in a fresh root, and scores the result. Plan: `PLAN.md` Step 6 and section 15.

## Fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Short name, also the file name. `synthetic-1`, `job-04`. |
| `name` | yes | One line, what the job is. |
| `group` | yes | Job group from section 15: Fundraising, Academic, Engineering, Websites, Operations, Investor research, Vault upkeep, Personal, Media, or Synthetic. |
| `enabled` | no | `false` keeps the spec out of a plain `run.sh`. Name it with `--only` to run it anyway. Default `true`. |
| `prompt` | yes | The ask in plain words, as Joe would type it. `{target}`, `{root}`, `{original}` and `{canonical}` are replaced with the absolute paths at run time. |
| `target` | yes | Where the result must land. Relative paths are under the root given by `--root` (default: a fresh folder under `tests/tmp/testset/`). Paths that start with `/` or `~` are used as they are. |
| `canonical` | no | File the numbers gate checks against. Relative paths are under the repo. |
| `original` | no | File of Joe's text the verbatim gate must find unchanged. Relative paths are under the repo. |
| `claim` | yes | The claim of "done" in one sentence, for the evidence gate and the rubric. |
| `checks` | yes | Letters from section 15: A prose, B numbers, C layout, D location, E word for word, F evidence, G vault first, H outward action, I headless. |
| `rubric` | yes | Three to six criteria in words. Each becomes one Jev score question. |
| `source` | yes | Vault path of the accepted result (relative to `Laurelin/` in the vault, or a home path), or `""` for synthetic jobs. |

## What the checks letters do

Letters A to F attach the matching gate from `pack/gates/` to the run (`LAURELIN_GATES`), and the runner exports the input each gate needs: the target for all, `LAURELIN_ORIGINAL` for E, `LAURELIN_CANONICAL` for B, `LAURELIN_CLAIM` for F. Letters G, H and I have no gate yet. G (vault first) and I (headless) are judged by the rubric; H (outward action) is caught by the approvals handler, and its receipts are in the run's root.

## Rubric criteria

Write each criterion as a positive statement about the result that Jev can check against the file and the agent's final reply, for example "The file has exactly three sentences." Jev scores each one on `not met`, `partly met`, `met`. The job's score is the mean over criteria, 0 to 1.

## Privacy

Specs are committed. They hold only the vault paths already in `PLAN.md` section 15 and generic prompts. Firm, partner and vendor names stay as `<firm>`, `<partner>`, `<vendor>` placeholders, as in the plan.
