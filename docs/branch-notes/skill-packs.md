# Branch note: `skill-packs` (wave 3, skill packs)

Built 2026-09-25 from `docs/briefs/skill-packs.md`. Test: `tests/test-skill-packs.sh` (six checks, all passing, one model call through the launcher. A seventh opt-in check reruns the installer). Added to `tests/run-all.sh` and `tests/README.md`. Nothing outside the repo was changed. No key value appears anywhere in the branch.

## What landed

| Path | What it is |
|---|---|
| `bin/install-skill-packs.sh` | The installer. Fetches each pinned commit with git into `tests/tmp/skill-packs/src` (gitignored), copies the skill folder into `pack/skills/<name>`, puts the upstream license beside it, applies a trimmed description where the upstream one is over 300 characters, adds the harness note where flagged, rewrites the table in `SOURCES.md`, and prints the description budget. `--offline` uses the clones already on disk |
| `bin/skill-packs.manifest` | One line per adopted skill: source repo, full commit, pin date, license path, path in the repo, folder name, flags (`note`, `local`) |
| `bin/skill-pack-descriptions.tsv` | The fourteen trimmed descriptions, each 300 characters or fewer |
| `bin/skill-frontmatter.py` | Reads or rewrites one frontmatter field. Handles `>` and `\|` block scalars, which six upstream skills use and the one-line awk in `tests/test-pack.sh` cannot read |
| `pack/skills/<24 folders>` | The copies: `karpathy-guidelines` plus the 23 pack skills. Each has `SKILL.md` and `LICENSE` |
| `pack/SKILL-SOURCES.md` | Generated table (skill, repo, path, commit, commit date, license, adopted) between markers, plus hand-kept prose: what the installer changes, conflicts and the choice made, known gaps |
| `pack/SKILL-TIERS.md` | Always on, loaded when needed, off; the budget rule |
| `bin/laurelin-agent` | `EXA_API_KEY` and `FIRECRAWL_API_KEY` added as optional rows in the key table |
| `pack/README.md`, `tests/README.md`, `tests/run-all.sh`, `tests/test-pack.sh` | Docs rows, the new test in the run order, and one prompt wording change (below) |

## Decisions made on this branch (for the merge owner to move into PLAN.md)

1. **git, not the `skills` CLI.** `npx skills add` (checked with `--help`) has `--skill` and `--copy` but no folder flag. It installs into agent folders (`.claude/skills`, `.agents/skills`), writes a lock file and sends telemetry. The brief's fallback applies: a shallow git fetch by full commit hash into `tests/tmp`, then a copy. GitHub serves `fetch --depth 1 origin <sha>`, so every copy is pinned and the rerun is byte for byte the same (checked with a tree checksum, twice).
2. **Pins are in the manifest, not "latest".** Idempotent means the same tree on every run, which needs a fixed commit. To take a newer upstream, change the hash and rerun.
3. **Trimmed descriptions are hand-written, not truncated.** A mechanical cut loses the trigger words that route a request to the skill. The fourteen over 300 characters are rewritten in `bin/skill-pack-descriptions.tsv`, keeping the upstream trigger phrases. Where an upstream description pointed at a sibling skill that is not installed (`schema`, `ai-seo`, `programmatic-seo`, `firecrawl-research-papers`), the trimmed one points at the installed equivalent or drops the pointer.
4. **The harness note goes where Jev or I said the skill browses or sends.** Two Noul questions per skill body (browser, outward). Clear yes at 0.6 or more on nine skills, clear no on five, eight in the 0.4 to 0.6 band, which the `jev` skill says to escalate. I read those eight: each fetches web pages through an API or script, so the headless rule applies and they get the note. `emails` (outward 0.24) also gets it because its integration notes are about sending through Mailchimp and similar. Final: 18 of 23 pack skills carry the note; `product-marketing`, `analytics`, `copywriting`, `press-release-writer` and `case-study-writer` do not. Scores:

   | Skill | browser | outward | Note |
   |---|---|---|---|
   | product-marketing | 0.15 | 0.03 | no |
   | seo-audit | 0.63 | 0.04 | yes |
   | launch | 0.05 | 0.44 | yes (directories, Product Hunt) |
   | emails | 0.03 | 0.24 | yes (sending integrations) |
   | content-strategy | 0.51 | 0.13 | yes |
   | analytics | 0.07 | 0.03 | no |
   | public-relations | 0.85 | 0.58 | yes |
   | copywriting | 0.02 | 0.04 | no |
   | exa-search | 0.51 | 0.39 | yes |
   | company-research | 0.46 | 0.04 | yes |
   | firecrawl-research-index | 0.45 | 0.02 | yes |
   | firecrawl-deep-research | 0.82 | 0.03 | yes |
   | firecrawl-seo-audit | 0.79 | 0.04 | yes |
   | firecrawl-competitive-intel | 0.92 | 0.05 | yes |
   | literature-review | 0.71 | 0.03 | yes |
   | paper-lookup | 0.47 | 0.09 | yes |
   | deep-research | 0.44 | 0.04 | yes |
   | press-release-writer | 0.15 | 0.08 | no |
   | case-study-writer | 0.05 | 0.04 | no |
   | seo-technical | 0.85 | 0.04 | yes |
   | seo-schema | 0.61 | 0.05 | yes |
   | seo-geo | 0.52 | 0.06 | yes |
   | seo-agentic | 0.87 | 0.13 | yes |

5. **Budget formula.** Characters of every description in `pack/skills`, plus 80 per skill for the XML wrapper Prime adds, divided by four. Today: about 3,548 tokens for 37 skills, under the 4,000 limit. The installer fails over the limit. The test checks it too.
6. **Conflicts.** `exa-search`: Exa Labs' own copy over the K-Dense one. `seo-geo`: claude-seo's over agent-skills-marketing's. `seo-audit` and `firecrawl-seo-audit`, and `deep-research` and `firecrawl-deep-research`, have different names and both stay. Reasons in `SOURCES.md`.
7. **Karpathy source.** Copied from the installed plugin checkout at `~/.claude/plugins/marketplaces/karpathy-skills`, whose remote is `forrestchang/andrej-karpathy-skills` at `2c60614`. The brief and PLAN name `multica-ai/andrej-karpathy-skills`. The installed one is what is recorded. The installer falls back to fetching from GitHub when the plugin folder is missing. Neither that repo nor `claude-deep-research-skill` ships a `LICENSE` file. Both declare MIT in README or frontmatter, and the generated `LICENSE` beside each says so with the source and commit.
8. **One line changed in another branch's test.** `tests/test-pack.sh` check 3 told the model "There should be about twelve" skills. With 37 loaded, one run answered with only Prime's built-ins and failed. The next run passed. The prompt now says to list all of them. Its expected list of twelve is unchanged.

## Findings

- **Four claude-seo skills call a helper CLI that is not copied** (`${CLAUDE_PLUGIN_ROOT}/scripts/claude-seo`, Python scripts under the plugin's `scripts/`). The brief said to copy the four folders only. The checklists and report shapes still work. The fetch steps do not. If Joe wants them to run, the plugin's `scripts/` and `requirements.txt` would come too, which is a bigger install decision.
- **Dangling links in copies:** marketingskills' `../../tools/integrations/*.md` (from `launch`, `emails`, `analytics`), `seo-schema`'s `../seo/references/schema-types.md`, `firecrawl-deep-research`'s `../firecrawl-research-papers/SKILL.md`. Listed in `SOURCES.md`. Not patched, because the brief allows only the one-line note as an edit.
- **`deep-research` has 58 files** including tests and a `requirements.txt`. Its scripts need those packages. Nothing was installed.
- **Seven always-on descriptions are over 300 characters**: `laurelin-reactor-calcs` 696, `writing-ste` 681, `fastbrowse` 561, `investor-research` 536, `jev` 457, `humanizer` 434, `jev-triage` 353. All but `investor-research` are links into `~/.claude/skills`, so trimming them means editing outside the repo (rule 17). Left alone. The budget still fits. If the budget tightens, these are the next to trim.
- **Prime discovers `SKILL.md` folders recursively**, so a nested skill inside a copied folder would load as its own skill. None of the 24 copies has one. The installer does not check for it. Worth a line in the test if a future pack nests skills.
- **Nothing secret-shaped came in.** A scan of the copies for key-like strings, `.env` files and files over 200 KB found nothing.
- **Skill names in the pack do not collide** with anything in `~/.agents/skills`, `~/.prime/agent/skills`, `~/.laurelin/agent/skills` or `~/.claude/skills`.

## Joe's own commands (rule 17), all optional

- `bin/laurelin-agent keys add EXA_API_KEY` and `bin/laurelin-agent keys add FIRECRAWL_API_KEY` when the accounts exist. Without them the research skills fall back to `fastbrowse`.
- `bin/link-skills.sh --apply` from the main checkout, if the 24 new folders should reach `~/.agents/skills` too. The dry run now plans 54 changes.

## Out of scope, confirmed

No skill was used on real work. No MCP server was registered. No vault read or write. No push. Nothing under `~/.prime`, `~/.claude`, `~/.codex` or `~/.zshrc` changed.
