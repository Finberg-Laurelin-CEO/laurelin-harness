# Tests

One command per piece. Each branch adds its line.

| Piece | Command |
|---|---|
| pack | `tests/test-pack.sh` |
| launcher (`bin/laurelin`, Steps 1b and 1e) | `tests/test-launcher.sh` |
| interface (theme and `laurelin-ui` extension) | `tests/test-interface.sh` |

## Manual test: interface (Joe, in Ghostty)

Start Prime with the pack from the repo root:

```
prime-agent -e ./pack
```

(or `bin/laurelin` once the launcher branch is merged). Then:

1. The title screen shows the mark, `L A U R E L I N`, the version, today's date and `jobs today: 0`. Note whether the mark is the PNG image or the ring glyphs. Press any key.
2. Pick the theme: `/settings`, theme, `laurelin` (dark terminal) or `laurelin-bone` (light terminal). Or put `"theme": "laurelin"` in `~/.prime/agent/settings.json`.
3. The footer shows `■ GREEN · <model> · coordinator`. Six check lines sit below the editor, all dim.
4. `/checks demo` four times: lights go green, one turns red with `p.7 overlap: title over image`, then all green, then back to not run.
5. `/approvals demo`, then `/approvals`: a box lists three sample items with a preview. Arrow keys move, `a` approves, `r` rejects, `esc` closes. The line `approvals: N waiting` below the editor counts down.
6. `/classify red`: the badge turns red. `/classify green` turns it back.
7. `/title` shows the title screen again. `LAURELIN_NO_IMAGE=1 prime-agent -e ./pack` forces the glyph mark.
8. Repeat steps 1 to 6 with the other terminal background and the matching theme.
| workers (Step 2: delegate_worker, call_model, Jev context pruning) | `tests/test-workers.sh` |
| gates | `tests/test-gates.sh` |
| safety (Step 5: approval gate, scrubber, limits, refusal flags) | `tests/test-safety.sh` |
