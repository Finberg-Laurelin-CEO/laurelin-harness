# Branch note: `pack`

Date: 2026-09-25. Brief: `docs/briefs/pack.md` (plan Step 1). Test: `tests/test-pack.sh`, passing.

## What this branch made

| File | What it is |
|---|---|
| `pack/skills/` | Twelve skills. Six existed before (`writing-ste`, `laurelin-reactor-calcs`, `fastbrowse`, `jev`, `humanizer`, `sync-gbrain`). This branch added six (`jev-triage`, `jev-documents`, `jev-eval`, `jev-act`, `jev-patterns`, `building-with-jev`). |
| `bin/link-skills.sh` | Dry run by default. Prints the commands that would touch folders outside the repo. `--apply` runs them. Idempotent. |
| `pack/rules/laurelin.md` | The generic rules. Twelve sections. Where a rule needs a Laurelin fact, it names the vault note. |
| `pack/rules/VAULT-RULES.md` | Template for the private half, headings only, ten sections. |
| `pack/rules/README.md` | Explains the split and how to change a rule. |
| `pack/README.md` | Rewritten to the rule 13 layout with the twelve skills and the test. |
| `tests/test-pack.sh` | The three checks from the brief. Listed in `tests/README.md`. |

## Links or copies

All twelve entries in `pack/skills/` are symlinks with absolute targets in `~/.claude/skills/<name>`. None is a copy. The six older links had the same form, so the style stays the same. When the canonical copies move into the pack, replace each link with the folder. Nothing else changes, because the link script points the tools at `pack/skills/<name>` and never at `~/.claude/skills`.

Git stores each link as a link (mode 120000). A clone on another machine gets a dangling link until that machine has `~/.claude/skills`. That is acceptable for now and is one more reason to move the copies in.

## Decisions

1. **Link into the shared folder only.** Prime and pi both read `~/.agents/skills` (Prime `docs/skills.md`, pi `docs/skills.md`). One link per skill there serves both tools. Links in `~/.prime/agent/skills` and `~/.pi/agent/skills` as well would make each tool load every skill twice, with a name-collision warning each time. So the script links into the shared folder only. It treats a same-named entry in a tool folder as a duplicate. The script removes a duplicate link. It moves a duplicate folder to a sibling folder named `<dir>-replaced-by-laurelin-pack`, where the tool's recursive scan does not look. This also does the "remove duplicate copies" line of plan Step 1. Nine such copies exist in `~/.prime/agent/skills` today.
2. **The script leaves Codex and Claude Code alone.** Claude Code reads `~/.claude/skills`, where the canonical copies are. Codex has links in `~/.codex/skills` that point there too. The brief names Prime and pi. When the copies move into the pack, both tools need a link script pass of their own.
3. **The plan points at the checkout that runs it.** From this worktree the plan names `/Users/Joe/orca/workspaces/laurelin-harness/pack/pack/skills`. Joe runs `--apply` from `~/laurelin-harness` after the merge. The script header says so.
4. **Rules content.** I wrote `laurelin.md` from PLAN.md sections 5 to 8 and the writing-ste house rules. The standing memory notes gave the rest: Bohm doctrine, Cote authorship, advocacy, canonical pitch, deck delivery, classification, cryptonyms, document formats, file locations. Every fact those notes hold stayed out. The file gives the vault path in its place. The STE lint scores it at 1.55 per 100 words. The three em dashes it reports are all inside the file name `Deck Design — Cote Rules.md`.
5. **I did not write the vault note.** The brief asks for the template in the repo. A write into the vault is a change outside the repo (rule 17), so the copy is Joe's step:

```bash
cp ~/laurelin-harness/pack/rules/VAULT-RULES.md "/Users/Joe/Documents/Obsidian Vault/Laurelin/LaurelinOS/Harness Rules.md"
```

## What the test showed

All three checks passed on 2026-09-25 in about nine seconds. Prime made one model call through its default provider, which in `~/.prime/agent/settings.json` is `anthropic` with `claude-fable-5-1`. Plan section 11 says this sign-in identifies as Claude Code, bills as extra usage, and is out for the coordinator. The test does not change the provider (rule 17). Each run of the test costs one short call, about $0.13 by Prime's own cost line. `LAURELIN_TEST_SKIP_MODEL=1` skips the call.

## Things the merge owner should know

1. **The pack loads twice today.** Prime's global settings already list the pack as a package by the relative path `../../laurelin-harness/pack`. The test also passes `-e ./pack`. From this worktree those are two different absolute paths, so both load and every skill appears twice with a warning. The skills listed correctly all the same. The launcher branch must decide which of the two stays, since the `laurelin` command will own the `-e` flag.
2. **How the rules load is open.** Nothing loads `laurelin.md` into a session yet. The launcher (Step 1b) or an extension must put it in the system prompt. `pack/rules/README.md` says so.
3. **`package.json` did not change.** It declares `extensions`, `skills` and `prompts`. Add `themes` and `gates` when those folders land.
4. **No changes outside the repo.** I applied the link script only inside a throwaway `HOME` in the scratchpad to prove idempotence. The real plan has 29 changes and the script only printed it.
5. **`.jacobian/` is tracked and churns.** The index database in `.jacobian/` is in the initial commit, so its lock and shared-memory files show as modified after every session. This commit leaves them out. A `.gitignore` line for the folder is a call for the merge owner.

## Commands to run outside the repo (Joe)

```bash
cd ~/laurelin-harness && bin/link-skills.sh          # read the plan
cd ~/laurelin-harness && bin/link-skills.sh --apply  # make it
```
