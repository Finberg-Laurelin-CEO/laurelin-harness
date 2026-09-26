# Skill sources

Skills adopted from outside packs. Each folder here that appears in the table below is a copy, not a link, pinned to one upstream commit, with the upstream license beside it as `LICENSE`. `bin/install-skill-packs.sh` makes the copies from `bin/skill-packs.manifest` and rewrites the table between the markers. The prose outside the markers is kept by hand.

The survey that chose these packs, and the packs it skipped, is in `docs/briefs/skill-packs.md`. Which skills are always on and which load when needed is in `TIERS.md`.

## What the installer changes in a copy

1. A description over 300 characters is replaced with a shorter one from `bin/skill-pack-descriptions.tsv`. Prime puts every description in the system prompt on every turn, so the size matters. Trigger words are kept.
2. Where a skill browses the web or sends, posts, publishes or submits something, one note line sits at the top of `SKILL.md`: browsing runs headless, and outward steps wait at the approval gate. Jev judged each body for browser and outward instructions. The scores are in `docs/branch-notes/skill-packs.md`.
3. Nothing else in the upstream text is edited.

## Conflicts and choices

- `exa-search` exists in `exa-labs/agent-skills` and in `K-Dense-AI/scientific-agent-skills`. The Exa Labs copy is kept: it is the vendor's own and is current. The K-Dense one is not installed.
- `seo-geo` exists in `AgriciDaniel/claude-seo` and in `whyashthakker/agent-skills-marketing`. The claude-seo copy is kept: it is the fuller one and sits beside `seo-technical`, `seo-schema` and `seo-agentic` from the same author. The agent-skills-marketing one is not installed.
- `seo-audit` from `coreyhaines31/marketingskills` and `firecrawl-seo-audit` from `firecrawl/skills` have different names and both stay. The first is the method with no key. The second is the Firecrawl-driven crawl and needs `FIRECRAWL_API_KEY`.
- `deep-research` (199-biotechnologies) and `firecrawl-deep-research` both stay. The first is an eight-phase method with its own scripts over Exa. The second is a Firecrawl workflow. The router picks by key and by the question.
- `claude-seo` ships `seo-audit` too. It is not installed. The marketingskills one covers the audit method and the four claude-seo folders cover technical, schema, AI-answer and agent readiness.

## Known gaps in the copies

- `seo-technical`, `seo-schema`, `seo-geo` and `seo-agentic` call a helper CLI at `${CLAUDE_PLUGIN_ROOT}/scripts/claude-seo` for page fetches and checks. The plugin's `scripts/` folder is not copied, so those steps fail. The audit checklists and the report shape still apply, and the agent should fetch pages with `fastbrowse` instead. `seo-schema` also links `../seo/references/schema-types.md`, which is not copied.
- `launch`, `emails` and `analytics` link to `../../tools/integrations/*.md` in the marketingskills repo (Mailchimp, Customer.io, GA4 and others). Those integration notes are not copied. The links dangle. The skills work without them.
- `firecrawl-deep-research` points paper questions at `../firecrawl-research-papers/SKILL.md`, which is not installed. `literature-review`, `paper-lookup` and `firecrawl-research-index` cover that.
- `product-marketing` writes its context document to `.agents/product-marketing.md` in the working folder. That file would be Laurelin content, so it belongs in the vault, not in this repo.
- `karpathy-guidelines` is copied from the installed Claude Code plugin checkout (`forrestchang/andrej-karpathy-skills`). The brief names `multica-ai/andrej-karpathy-skills`. The installed marketplace remote is the forrestchang repo, and that is what is recorded. The repo has no `LICENSE` file. The SKILL.md frontmatter and the README declare MIT, and the `LICENSE` file here says so.

## Skills and their sources

<!-- generated:start -->
| Skill | Source repo | Path in repo | Commit | Commit date | License | Adopted |
|---|---|---|---|---|---|---|
| `karpathy-guidelines` | [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) | `skills/karpathy-guidelines` | `2c60614` | 2026-04-20 | MIT (declared) | 2026-09-25 |
| `product-marketing` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/product-marketing` | `5b2c000` | 2026-09-04 | MIT | 2026-09-25 |
| `seo-audit` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/seo-audit` | `5b2c000` | 2026-09-04 | MIT | 2026-09-25 |
| `launch` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/launch` | `5b2c000` | 2026-09-04 | MIT | 2026-09-25 |
| `emails` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/emails` | `5b2c000` | 2026-09-04 | MIT | 2026-09-25 |
| `content-strategy` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/content-strategy` | `5b2c000` | 2026-09-04 | MIT | 2026-09-25 |
| `analytics` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/analytics` | `5b2c000` | 2026-09-04 | MIT | 2026-09-25 |
| `public-relations` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/public-relations` | `5b2c000` | 2026-09-04 | MIT | 2026-09-25 |
| `copywriting` | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `skills/copywriting` | `5b2c000` | 2026-09-04 | MIT | 2026-09-25 |
| `exa-search` | [exa-labs/agent-skills](https://github.com/exa-labs/agent-skills) | `skills/exa-search` | `975171a` | 2026-09-17 | MIT | 2026-09-25 |
| `company-research` | [exa-labs/agent-skills](https://github.com/exa-labs/agent-skills) | `skills/company-research` | `975171a` | 2026-09-17 | MIT | 2026-09-25 |
| `firecrawl-research-index` | [firecrawl/skills](https://github.com/firecrawl/skills) | `skills/core/firecrawl-research-index` | `3a41005` | 2026-09-25 | ISC | 2026-09-25 |
| `firecrawl-deep-research` | [firecrawl/skills](https://github.com/firecrawl/skills) | `skills/workflows/firecrawl-deep-research` | `3a41005` | 2026-09-25 | ISC | 2026-09-25 |
| `firecrawl-seo-audit` | [firecrawl/skills](https://github.com/firecrawl/skills) | `skills/workflows/firecrawl-seo-audit` | `3a41005` | 2026-09-25 | ISC | 2026-09-25 |
| `firecrawl-competitive-intel` | [firecrawl/skills](https://github.com/firecrawl/skills) | `skills/workflows/firecrawl-competitive-intel` | `3a41005` | 2026-09-25 | ISC | 2026-09-25 |
| `literature-review` | [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | `skills/literature-review` | `49c6e97` | 2026-09-21 | MIT | 2026-09-25 |
| `paper-lookup` | [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | `skills/paper-lookup` | `49c6e97` | 2026-09-21 | MIT | 2026-09-25 |
| `press-release-writer` | [whyashthakker/agent-skills-marketing](https://github.com/whyashthakker/agent-skills-marketing) | `.claude/skills/press-release-writer` | `985b4be` | 2026-06-23 | MIT | 2026-09-25 |
| `case-study-writer` | [whyashthakker/agent-skills-marketing](https://github.com/whyashthakker/agent-skills-marketing) | `.claude/skills/case-study-writer` | `985b4be` | 2026-06-23 | MIT | 2026-09-25 |
| `seo-technical` | [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | `skills/seo-technical` | `e77e783` | 2026-09-24 | MIT | 2026-09-25 |
| `seo-schema` | [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | `skills/seo-schema` | `e77e783` | 2026-09-24 | MIT | 2026-09-25 |
| `seo-geo` | [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | `skills/seo-geo` | `e77e783` | 2026-09-24 | MIT | 2026-09-25 |
| `seo-agentic` | [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | `skills/seo-agentic` | `e77e783` | 2026-09-24 | MIT | 2026-09-25 |
<!-- generated:end -->
