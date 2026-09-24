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
