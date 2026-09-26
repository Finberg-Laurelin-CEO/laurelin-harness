# Tests

One command per piece, run from the repo root. `tests/run-all.sh` runs every one in step order.

| Piece | Command |
|---|---|
| vault-io (vault reads with the privacy-block fallback) | `tests/test-vault-io.sh` |
| pack | `tests/test-pack.sh` |
| launcher (`bin/laurelin-agent`, Steps 1b and 1e) | `tests/test-launcher.sh` |
| interface (theme and `laurelin-ui` extension) | `tests/test-interface.sh` |
| workers (Step 2: delegate_worker, call_model, Jev context pruning) | `tests/test-workers.sh` |
| worker settings (Step 2: worker-only Claude Code settings, token cut) | `tests/test-worker-settings.sh` |
| gates (Step 4: prose, location, verbatim, evidence) | `tests/test-gates.sh` |
| gates2 (Step 4: numbers and layout gates) | `tests/test-gates2.sh` |
| bridge (task file, gates read it, live check lights, live approvals, worker events) | `tests/test-bridge.sh` |
| router (Step 3: Jev picks worker, skill, class, outward, intent; decision log) | `tests/test-router.sh` |
| safety (Step 5: approval gate, scrubber, limits, refusal flags) | `tests/test-safety.sh` |
| test set (Step 6: runner, scoring, calibration) | `tests/test-testset.sh` (runs one synthetic job through Prime, about a minute) |
| investor research (Step 8.1: validator gate, fit question set through Jev, follow-up triage) | `tests/test-investor-research.sh` (synthetic firms only, never reads the vault) |
| metrics (section 22, Step 6: first-pass acceptance, corrections per job, cost, gate pass rates, baseline, footer) | `tests/test-metrics.sh` (synthetic sessions only, never reads Joe's sessions; Jev part skipped without the key) |
| deck design (Step 7: style pull, builder, renderer, layout and deck gates, register, change classifier) | `tests/test-deck-design.sh` (an invented company and drawn images; never reads the deck kit's content or the vault) |
| learning loop (Step 10: correction detected, rule and check drafted, `/learn` apply and reject, prose gate learns a pattern, regression reverts) | `tests/test-learning-loop.sh` (synthetic session, writes only under `tests/tmp/`) |
| skill packs (wave 3: adopted marketing, SEO and research skills, tiers, sources, description budget) | `tests/test-skill-packs.sh` (one model call through the launcher, skipped without a model; `LAURELIN_TEST_INSTALL=1` also reruns `bin/install-skill-packs.sh`) |

## Test-set runner (Step 6)

```
tests/testset/run.sh                      # every enabled spec (the three synthetic ones)
tests/testset/run.sh --only synthetic-2   # one or more ids, comma separated; runs a disabled spec too
tests/testset/run.sh --root <dir>         # put the results in this folder instead of tests/tmp
tests/testset/calibrate.sh                # confidence report over all results and decision logs
```

Results land in `tests/testset/results/<date>-<id>.json` (gitignored). Run artifacts (event stream, gate log, stderr) are under `tests/tmp/testset/<id>/`. The spec format is in `tests/testset/spec-format.md`; the committed baseline is `tests/testset/baseline.md`.

## Manual test: interface (Joe, in Ghostty)

Start Prime with the pack from the repo root:

```
prime-agent -e ./pack
```

(or `bin/laurelin-agent` once the launcher branch is merged). Then:

1. The title screen shows the mark, `L A U R E L I N`, the version, today's date and `jobs today: 0`. Note whether the mark is the PNG image or the ring glyphs. Press any key.
2. Pick the theme: `/settings`, theme, `laurelin` (dark terminal) or `laurelin-bone` (light terminal). Or put `"theme": "laurelin"` in `~/.prime/agent/settings.json`.
3. The footer shows `■ GREEN · <model> · coordinator`. Six check lines sit below the editor, all dim.
4. `/checks demo` four times: lights go green, one turns red with `p.7 overlap: title over image`, then all green, then back to not run.
5. `/approvals demo`, then `/approvals`: a box lists three sample items with a preview. Arrow keys move, `a` approves, `r` rejects, `esc` closes. The line `approvals: N waiting` below the editor counts down.
6. `/classify red`: the badge turns red. `/classify green` turns it back.
7. `/title` shows the title screen again. `LAURELIN_NO_IMAGE=1 prime-agent -e ./pack` forces the glyph mark.
8. Repeat steps 1 to 6 with the other terminal background and the matching theme.
