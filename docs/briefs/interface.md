# Branch `interface`: Step 1c, theme and panels

Plan: section 10, Step 1c including the Prime facts paragraph; section 19 row 1c. Joe: keep Prime's own layout; add only the theme, the badge, the checks panel, the approvals panel and the title screen.

## Make
1. `pack/themes/laurelin.json`: every token Prime's `docs/themes.md` requires. Colors from the Laurelin visual system: carbon background, bone text, Laurelin orange accent. Read `~/laurelin-visual-system` for the exact values if it exists; otherwise pick close values and note it. Diffs, code and thinking borders get sensible colors.
2. `pack/extensions/laurelin-ui.ts`, one extension, guarded by `ctx.hasUI`:
   - Footer badge with `ctx.ui.setStatus`: classification `GREEN` / `YELLOW` / `RED` (default GREEN; read from a session flag the extension exposes as a command `/classify green|yellow|red`), active model, and active worker name (default "coordinator").
   - Checks widget with `ctx.ui.setWidget("checks", ..., { placement: "belowEditor" })`: one line per check with a light (green pass, red fail, dim not run) and the failure text. Expose a tiny API other extensions can call: `pi.events` or a shared module function `setCheck(name, state, detail)`. For this branch, feed it with a command `/checks demo` that cycles sample states.
   - Approvals overlay: a widget line "approvals: N waiting" and a command `/approvals` that opens `ctx.ui.custom(..., { overlay: true })` listing items with preview text and keys a (approve), r (reject), Esc. For this branch, items come from a `/approvals demo` command. Approve or reject only updates the list.
   - Title screen on `session_start`: a custom view with the wordmark, version (from `pack/package.json`), today's date, and a placeholder count of jobs; any key dismisses. Try the bundled `Image` component with `~/Laurelin_Brand_Assets/imagery/reference/brand/laurelin-mark.png` and record in the note whether Ghostty drew it (Prime docs say no; the component has a Kitty path). Fallback: a block-glyph mark.
   - Read Prime `docs/extensions.md`, `docs/tui.md`, `docs/themes.md` and the examples `custom-footer.ts`, `custom-header.ts`, `overlay-test.ts`, `model-status.ts`, `border-status-editor.ts` first.
3. Keep it under about 500 lines. No custom layout beyond these pieces.

## Test
`tests/test-interface.sh`: the theme JSON parses and has every required token (list them from `docs/themes.md`); the extension type-checks (`npx tsc --noEmit` against Prime's types, or Prime's own load check via `prime-agent -e ./pack --mode json -p "hi"` which must not error on extension load). Manual test for Joe, written in `tests/README.md`: run `bin/laurelin` (or `prime-agent -e ./pack`) in Ghostty, see the title screen, run `/checks demo`, `/approvals demo`, `/classify red`, and confirm light and dark.

## Out of scope
Wiring real checks or real approvals (branches `gates` and `safety` do that through the API you expose).
