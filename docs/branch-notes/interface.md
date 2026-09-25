# Branch note: `interface` (Step 1c)

Date: 2026-09-25. Built by an agent under `docs/briefs/interface.md`. Test: `tests/test-interface.sh`, passes.

## What is in the branch

| File | What it is | Size |
|---|---|---|
| `pack/themes/laurelin.json` | Carbon theme: dark ground, orange accent | 55 required tokens |
| `pack/themes/laurelin-bone.json` | Bone theme: light ground, same accent | 55 required tokens |
| `pack/package.json` | One line added: `"themes": ["./themes"]` | 1 line |
| `pack/extensions/laurelin-ui.ts` | Badge, checks widget, approvals line and overlay, title screen | 417 lines |
| `tests/test-interface.sh` | The one-command test | |
| `tests/interface-check.mjs` | Node helper the test calls | |
| `tests/README.md` | Test row plus the manual test for Joe | |

Colors come from `~/laurelin-visual-system/lrl.css`, which exists: orange `#FF4F00`, carbon `#0D0F10` and `#16191B`, bone `#F2F1EF` and `#E9E7E2`. Success, warning and error colors (sage, amber, crimson) are my picks, chosen so RED and YELLOW badges do not blend with the orange accent. Code colors are a warm set around the same values.

## Decisions I made (for the merge owner to move into PLAN.md if wanted)

1. **Two theme files, not one.** A Prime theme cannot set the terminal background. The brief's carbon theme uses `text: ""` (terminal default) so it survives a light terminal, but its dark panel backgrounds do not. The bone file covers a light Ghostty and lets Joe do the "light and dark" check the brief asks for. Delete it if one file is the rule.
2. **`pi.themes` line in `pack/package.json`.** The pack has an explicit `pi` manifest, and Prime then ignores the conventional `themes/` folder. Without the line, the theme never loads.
3. **Title screen only at startup.** `session_start` also fires on `/new`, `/resume` and `/fork`. Showing the screen there would be a nuisance, so it checks `event.reason === "startup"`. `/title` shows it again on demand.
4. **Approvals line hides at zero.** A permanent `approvals: 0 waiting` adds noise. It appears when the first item arrives.
5. **Checks widget is six lines, always shown**, one per check, as the brief says. If Joe finds it heavy, a one-line form is a small change.
6. **API is events on the shared bus**, no shared module. Other extensions emit on `pi.events`:
   - `laurelin:check` with `{ name, state: "pass" | "fail" | "none", detail? }`
   - `laurelin:classification` with `"green" | "yellow" | "red"`
   - `laurelin:worker` with the worker name (default `coordinator`)
   - `laurelin:approval` with `{ id, kind, title, preview }`
   - The extension emits `laurelin:approval-decided` with `{ id, decision }` when Joe presses `a` or `r`.
   The `gates` and `safety` branches wire real checks and approvals through these.
7. **The badge is a footer status item** (`ctx.ui.setStatus`), so Prime's own footer stays. Its colors are baked in when set, so after a theme switch it recolors on the next `/classify` or model change. Minor.

## Findings about Prime (facts, checked 2026-09-25)

1. **`prime-agent -p --mode json` hides extension load errors.** A probe extension that threw at load time gave exit 0, nothing on stderr, and a normal answer. So a `-p` run is not a load check. The test instead calls Prime's own loader (`dist/core/extensions/loader.js`, `loadExtensions`) and fails on its `errors` list, and validates the themes with Prime's `preloadThemeValidator` and `loadThemeFromPath`. Worth adding to the Prime facts in PLAN.md Step 1c and to the `pack` and `launcher` tests, which rely on `-p`.
2. **Two Prime installs.** `prime-agent` on PATH is the standalone binary under `~/.local/share/prime-agent`. The npm package with `dist/`, `docs/` and `node_modules/` is `~/.local/lib/node_modules/prime-agent`. Both are 0.9.5. The test finds the package through `npm root -g`, then that path; `PRIME_AGENT_PKG` overrides.
3. **Type check.** No TypeScript compiler is installed on its own. The test uses the one bundled inside Vercel's CLI (5.9.3) when present, else prints `skip`. The generated tsconfig maps the four `@earendil-works/*` imports to Prime's shipped type files and uses `module: ESNext`, `moduleResolution: Bundler`, because Prime loads extensions through jiti as ES modules and `import.meta.url` is allowed (Prime's own examples use it). The tsconfig is written to `tests/tmp/`, which is gitignored.
4. **Terminal images.** pi-tui's `detectCapabilities` treats Ghostty as Kitty-graphics capable, so the bundled `Image` component will emit Kitty graphics there, despite the docs saying Prime does not draw images. **Not tested in this session**: it ran with no terminal (`TERM_PROGRAM=Orca`, no pty), so Joe's run in Ghostty decides. If the mark does not draw, or leaves artifacts after the screen closes, `LAURELIN_NO_IMAGE=1` forces the glyph mark and can become the default. In any terminal without image support the glyph mark is used automatically. The image is left-aligned; Kitty draws at the cursor.
5. **Theme selection is manual.** A package theme is available but not active. Joe picks it with `/settings` or `"theme": "laurelin"` in `~/.prime/agent/settings.json`. The launcher's `--theme` flag only adds the file. I did not auto-switch the theme from the extension; that would change a user setting.

## What the test checks

- Both theme files parse, carry every one of the 55 required tokens (read from Prime's schema, which matches `docs/themes.md`), carry no unknown token, and load through Prime's theme loader.
- Every extension in `pack/extensions` loads through Prime's loader with no error; `laurelin-ui` registers `/classify`, `/checks`, `/approvals`, `/title` and a `session_start` handler.
- Headless render at 80 columns with a fake screen: the title screen renders on startup, the checks widget has six lines below the editor, `/checks demo` shows the failure text, `/classify red` sets the badge, `/approvals demo` shows `3 waiting`, the overlay renders and one approve plus one reject leave one item. No rendered line exceeds the width.
- `tsc --noEmit` when a compiler is found.
- `prime-agent -e ./pack --mode json -p` answers; informational, prints `skip` with no model.

## Rule 17 check

Nothing outside the repo was changed. The test reads Prime's package and the Vercel-bundled compiler, and writes only to `tests/tmp/`. Keys were sourced into the environment and never read or printed.

## Left for other branches

Real checks and real approvals (`gates`, `safety`) through the events above. The launcher should pass `--theme pack/themes/laurelin.json` and may also pass `--theme pack/themes/laurelin-bone.json`.
