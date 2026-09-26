# Fit: the Jev question set

Jev grades fit. The agent gathers the facts first and writes them as a short plain description, sourced and dated, then runs `fit.sh` on that text. The exact questions live in `fit.json`. This file says what they mean and how code reads the answers.

## Input

One text: `firm_description`. It holds what the dossier verified about the firm: stage, check size, thesis in the firm's own words, comfort with defense or dual-use work, portfolio precedent in energy or fusion hardware, warm paths, and any fee, agent or conflict signal. Facts only. A fact the research did not verify is left out, so Jev treats it as absent. No firm name is needed. No contact data goes in.

## Questions

**`laurelin_fit`, a Score with four levels.** Code maps the levels to letters, low to high:

| Level | Grade | The situation it describes |
|---|---|---|
| 0 | D | Ruled out by stage, check size, a stated exclusion of hardware or energy, or a board-seat conflict. |
| 1 | C | Nothing rules the company out and nothing points to it. Generalist, no relevant theme, no precedent, no warm path. |
| 2 | B | Seed-size checks and a deep-tech, hardware, energy or dual-use theme, or one energy or hardware portfolio company. No fusion precedent, no warm path. |
| 3 | A | Seed-size checks, a thesis that names fusion, nuclear or national-security hardware in the firm's words, a fusion or nuclear or pulsed-power portfolio company or stated defense comfort, and a warm path or a first-check habit. |

The six factors from the playbook (stage match, check size, thesis fit with fusion and deep tech, defense or dual-use comfort, portfolio precedent, warm path) are written into the level descriptions. Jev judges each level as a whole situation.

**Landmines, three Nouls.** Each asks one property, and code combines them:

| Question | Yes means |
|---|---|
| `fee_for_intro` | Founders pay for an introduction, a meeting or access. Never pay. |
| `placement_agent` | A finder or placement agent, not a fund. Finder-fee risk. Route to counsel. |
| `conflict` | A competing fusion, pulsed-power or compact-reactor holding, or a board seat at one. No technical disclosure. |

## Reading the answers (code, not prose)

- Grade: round `score` to the nearest level and map 0, 1, 2, 3 to D, C, B, A.
- Confidence under 0.6: the grade is `unverified`. Write `laurelin_fit: unverified` and the Jev letter in `status_note:`, then get more facts or ask Joe.
- Landmine: any Noul at 0.6 or above flags the firm. Write the flag in `## Landmines` with its source. A landmine does not change the grade. Code keeps the two apart so a strong thesis fit with a conflict stays visible as both.
- Every run logs the request, the answers and the confidence in the WORK-LOG for the firm.

## Run

```sh
pack/skills/investor-research/fit.sh description.txt          # one line: grade, confidence, landmines
pack/skills/investor-research/fit.sh description.txt --json   # the full answer
```

Without `TYPESAFE_API_KEY` in the environment, `fit.sh` prints `fit: skipped, no TYPESAFE_API_KEY` and exits 0.

## What is not here

No firm names and no examples from the corpus. The criteria describe situations. Change a level only with labeled examples in hand, and change one level at a time (see `building-with-jev`).
