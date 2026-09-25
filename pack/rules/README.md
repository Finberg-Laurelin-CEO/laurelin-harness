# Rules

The Laurelin rules come in two halves.

| File | Where it lives | What it holds |
|---|---|---|
| `laurelin.md` | This repo | The generic rules: who writes, writing, file locations, evidence, what never goes in a document, the checks before "done", outward actions, refusals, classification, Jev. Where a rule needs a Laurelin fact, it gives the vault path. |
| `Laurelin/LaurelinOS/Harness Rules.md` | The Obsidian vault | The private half: canonical numbers, doctrines, people rules, cryptonyms, the current article and revision names. `VAULT-RULES.md` here is its template, headings only. |

The split follows AGENTS.md rule 6. This repo can be open-sourced one day, so no vault content, investor or contact data, canonical number, classification or cryptonym material goes in `laurelin.md`. The vault half is never copied into the repo.

## How the rules load

The `laurelin` command (plan Step 1b) puts `laurelin.md` in the system prompt of every session and points the agent at the vault half. Until that lands, read the file at the start of each Laurelin task.

## How to change a rule

1. Generic rule: edit `laurelin.md` on a branch and say why in the commit message.
2. Laurelin fact or doctrine: edit the vault note. Update the path in `laurelin.md` only if the note moved.
3. The learning loop (plan Step 10) drafts new rules from Joe's corrections. Joe approves each one before it lands in one of the two files.

## Sources

`laurelin.md` was written on 2026-09-25 from PLAN.md sections 5 to 8 and the writing-ste skill. The standing memory notes in Claude Code gave the rest. The facts those notes hold stayed in the vault.
