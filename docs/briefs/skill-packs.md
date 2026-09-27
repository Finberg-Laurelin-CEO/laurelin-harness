# Branch `skill-packs`: adopt the marketing, SEO and research packs

Plan: section 8 item 4 (loaded when needed), section 16, section 20 wave 3 (skill packs), the survey summary below. Rule 17: install INSIDE the repo only (`pack/skills/`), never into `~/.agents/skills` or `~/.claude`.

## The survey (9/25) said adopt these
1. `coreyhaines31/marketingskills` (MIT, 51k stars, no keys): `product-marketing`, `seo-audit`, `launch`, `emails`, `content-strategy`, `analytics`, `public-relations`, `copywriting`.
2. `exa-labs/agent-skills` (MIT): `exa-search`, `company-research`. Needs `EXA_API_KEY` (free tier: $10 a month).
3. `firecrawl/skills` (ISC): research index and the deep-research, SEO-audit and competitive-intelligence workflows. Needs `FIRECRAWL_API_KEY` (free 1,000 pages a month).
4. `K-Dense-AI/scientific-agent-skills` (MIT): `literature-review`, `paper-lookup` (open APIs, no key).
5. `199-biotechnologies/claude-deep-research-skill` (MIT): eight-phase deep research; reuses the Exa key.
6. `whyashthakker/agent-skills-marketing` (MIT): `press-release-writer`, `case-study-writer`.
7. `AgriciDaniel/claude-seo` (MIT, plugin-shaped): copy the `skills/seo-technical`, `seo-schema`, `seo-geo`, `seo-agentic` folders only.
Skip: kostja94, OpenClaudia, thatrebeccarae, hyperfx, vercel-labs, the Karpathy repo (already installed as `karpathy-guidelines`; keep that one always on), ecc social-publisher.

## Make
1. `bin/install-skill-packs.sh`: idempotent; uses `npx skills add <repo> --skill <name> --dir pack/skills` (check the `skills` CLI's flags with `npx skills --help`; if it cannot target a folder, `git clone --depth 1` into `tests/tmp/` and copy the named skill folders). Records each skill's source repo, commit, licence and date in `pack/SKILL-SOURCES.md`. Keeps every upstream LICENSE file beside its skill.
2. Tiers in `pack/SKILL-TIERS.md`: always on (`karpathy-guidelines` copied from the installed plugin, `writing-ste`, `jev*`, `investor-research`, `deck-design` when it lands); loaded when needed (all of the above packs); off (anything not listed). Prime loads descriptions always and bodies on demand, so "loaded when needed" costs only the description line; check the total description size stays under about 4,000 tokens and trim descriptions that exceed 300 characters.
3. Keys: add `EXA_API_KEY` and `FIRECRAWL_API_KEY` as optional names in `laurelin-agent keys check`.
4. Conflicts: where two packs ship the same skill name, keep one and note why in SOURCES.md. Where a pack's skill says to open a browser or send anything, add a one-line note at the top of that SKILL.md that the harness's approval gate and headless rule apply.

## Test
`tests/test-skill-packs.sh`: every installed skill has a SKILL.md with a name that matches its folder and a LICENSE beside it; SOURCES.md lists each; the description budget is under the limit; Prime lists the always-on skills through the launcher (`bin/laurelin-agent --no-session -p ...`, or skip without a model).

## Out of scope
Using the skills on real work. Registering MCP servers.
