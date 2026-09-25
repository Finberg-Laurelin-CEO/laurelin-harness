# Branch `pack`: Step 1, one home for skills and rules

Plan: section 10, Step 1; section 9; section 16 (context.dev skill); AGENTS rule 6.

## Make
1. `pack/skills/`: the always-on Laurelin skill set as real folders or symlinks, one per skill, each with a `SKILL.md`. Start from what `pack/README.md` lists and from these installed skills in `~/.claude/skills`: `writing-ste`, `laurelin-reactor-calcs`, `fastbrowse`, `jev`, `jev-triage`, `jev-documents`, `jev-eval`, `jev-act`, `jev-patterns`, `building-with-jev`, `humanizer`, `sync-gbrain`. Symlinks are fine for now; record in the note which are links and which are copies.
2. `bin/link-skills.sh`: links `pack/skills` into every tool's skill folder that Prime and pi read (`~/.agents/skills` is the shared one; see Prime `docs/skills.md`). It must be idempotent and must only PRINT the commands that touch folders outside the repo (rule 17); a `--apply` flag runs them, for Joe to use.
3. `pack/rules/README.md` and `pack/rules/laurelin.md`: the rules file. Private content stays out (rule 6). `laurelin.md` holds the generic rules (writing rules, file location rules, evidence rules, what never goes in a document, the section 5 checks in words). Where a rule needs a Laurelin fact (a canonical number, a doctrine, a cryptonym), write the vault path where it lives, not the fact. Also write `pack/rules/VAULT-RULES.md` as a template for the private half that will live in the vault at `Laurelin/LaurelinOS/Harness Rules.md`, with headings only.
4. Update `pack/README.md` to match.

## Test
`tests/test-pack.sh`: checks every skill folder has a `SKILL.md`, `bin/link-skills.sh` in dry-run prints a plan with no errors, and `prime-agent -e ./pack -p "list the Laurelin skills you have"` (or `--mode json`) shows the skills loaded. If Prime cannot make a model call, the test may pass on the first two checks and print the third as "skipped: no model".

## Out of scope
The interface, the launcher, gates, keys.
