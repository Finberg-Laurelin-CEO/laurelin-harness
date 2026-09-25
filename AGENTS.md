# Rules for agents in this repo

1. Read `PLAN.md` before doing anything. It holds every decision so far.
2. The project is in planning. Discuss and plan unless Joe says to build. Ask before you install, upgrade or change config outside this repo.
3. When a decision lands, update `PLAN.md` and add a dated line to its change log.
4. Build steps are in `PLAN.md` section 10. Each step ends with a test. Do not start a step until the one before it passes.
5. Never commit secrets. Keys live in `~/.config/agent-keys/env`, never in this repo.
6. Keep private Laurelin content out of this repo: vault notes, investor or contact data, canonical numbers, classification or cryptonym material, anything export-controlled. Link to the vault path instead. The repo may be open-sourced later (section 12).
7. Laurelin facts come from the Obsidian vault (`/Users/Joe/Documents/Obsidian Vault/Laurelin`). Do not guess them.
8. Nothing leaves the machine without Joe's approval: email, posts, deploys, pushes to a remote, payments.
9. Write to Joe in plain words. Define any technical term the first time you use it.
10. Use Jev for typed judgments (classify, choose, score, yes/no, rerank, claim checks). Use fastbrowse or headless browsing for the web. Never open a visible browser.

## Build conventions (from 2026-09-25)

11. You are building one piece on one child branch. Your brief is in `docs/briefs/<branch>.md`. Read `AGENTS.md`, then `PLAN.md` (at least sections 8, 10, 18, 19 and your step), then the brief. Do only what the brief says.
12. Do not edit `PLAN.md`. Write what you learned and decided in `docs/branch-notes/<branch>.md`. The merge owner moves decisions into `PLAN.md`.
13. Layout: `bin/` for the `laurelin` command and helper scripts; `pack/extensions/*.ts` for Prime extensions; `pack/themes/` for theme JSON; `pack/gates/` for gate commands (each exits 0 on pass, 1 on fail, prints one line why); `pack/skills/` for skills; `pack/prompts/` for prompt templates; `tests/` for tests. Every piece ships with a test that a person can run with one command, listed in `tests/README.md`.
14. Prime Agent is the base. Its docs are at `/Users/Joe/.local/lib/node_modules/prime-agent/docs/` and its extension examples at `/Users/Joe/.local/lib/node_modules/prime-agent/examples/extensions/`. Read the doc and the nearest example before writing an extension. Reuse Prime's own hooks, widgets, gates, subagents and modes before writing anything new.
15. Jev makes every typed judgment. The `jev`, `jev-decide` and `jev-sweep` commands are in `~/.local/bin`; their skills are in `~/.claude/skills/jev*` and `~/.claude/skills/building-with-jev`. gstack's binaries are under `~/.claude/skills/gstack/bin/`.
16. Keys come from the environment only. Source `~/.config/agent-keys/env` in tests. Never read, print or copy a key value. Never write one into the repo, a log or a note.
17. Nothing outward: no pushes, no installs outside this repo (`npm install` inside the repo is fine), no changes to `~/.prime`, `~/.claude`, `~/.codex` or `~/.zshrc`. If a piece needs one, write the exact command in your branch note and stop there.
18. Do not open a visible browser. Do not run `gbrain serve`.
19. When your test passes, set the Orca worktree comment to "ready: <one line>" and stop. If blocked, set it to "blocked: <one line>" and stop.
