# laurelin-agent-pack

The Laurelin package for Prime Agent. It also loads in pi, since both read the same package format.

Prime loads it with `prime-agent -e ./pack` for one run, or from the `packages` list in `~/.prime/agent/settings.json` for every run. The `laurelin` command (plan Step 1b) will do this for you.

## Layout

| Folder | Holds | Status |
|---|---|---|
| `skills/` | The always-on Laurelin skill set, one folder per skill, each with a `SKILL.md` | 12 linked skills plus `investor-research` (see below) |
| `rules/` | The generic rules file and the template for the private half in the vault | Written 2026-09-25 |
| `extensions/` | Prime extensions (`*.ts`): the interface, the router, the safety handlers | Built |
| `themes/` | The Laurelin theme JSON | Built |
| `gates/` | Gate commands. Each exits 0 on pass, 1 on fail, and prints one line why | Built |
| `prompts/` | Prompt templates | Built |

`package.json` declares `extensions`, `skills` and `prompts` under the `pi` key. Add `themes` and `gates` when those folders land.

## Skills

Each entry in `skills/` is a symlink to the canonical copy in `~/.claude/skills/<name>`. Later, the canonical copies move here and the other tools point at this folder.

| Skill | What it does |
|---|---|
| `writing-ste` | Writes and lints prose in Simplified Technical English with the Laurelin house rules |
| `humanizer` | Finds and removes the content-level signs of machine-written text |
| `laurelin-reactor-calcs` | Computes or checks every reactor-physics number through the verified calcs module |
| `fastbrowse` | Headless web agent. Jev picks each click, GPT plans and reads, every claim cites a quote |
| `jev` | Shell access to Jev, TypeSafe's judgment model: yes or no, choice, score. Holds the delegation table |
| `jev-triage` | Sorts and ranks records in bulk: inbox, investor CRM, follow-up queues |
| `jev-documents` | Finds, extracts and checks evidence in documents. Claim checks with citations |
| `jev-eval` | Judges outputs against written criteria. Checks every "done" against its evidence |
| `jev-act` | Picks the next action in a browser, desktop or simulation |
| `jev-patterns` | Worked patterns for Jev workflows |
| `building-with-jev` | How to write Jev questions, structure state and set thresholds |
| `sync-gbrain` | Keeps gbrain, the search over the safe vault copy, current with a repo |
| `investor-research` | Researches investors to the vault's own playbook: firm hubs, person notes, deck guidance, Jev fit grade, validator, follow-up triage. Lives in this repo, not linked (Step 8.1) |

### Linking the skills into every tool

Prime and pi both read `~/.agents/skills`. Run this from the main checkout to see the plan:

```bash
bin/link-skills.sh
```

It prints every command that would touch a folder outside the repo and changes nothing. `bin/link-skills.sh --apply` runs them. A second run finds nothing to do. Claude Code keeps reading `~/.claude/skills` directly, so it needs no link.

## Rules

`rules/laurelin.md` is the generic half of the Laurelin rules. Where a rule needs a Laurelin fact, it names the vault note that holds the fact. `rules/VAULT-RULES.md` is the template for the private half, which lives in the vault at `Laurelin/LaurelinOS/Harness Rules.md`. `rules/README.md` explains the split.

## Test

```bash
tests/test-pack.sh
```

It checks that every skill folder has a `SKILL.md` whose name matches the folder, that the link script prints a plan with no errors, and that Prime lists the twelve skills when the pack is loaded. The third check needs a model call. When Prime cannot make one, the test prints "skipped: no model" and passes on the first two.
