# Skill tiers

Prime loads every skill's name and description into the system prompt on every turn, and loads a skill's body only when the agent opens it. So the two tiers below cost the same at rest: one description line each. The difference is intent. An always-on skill is part of how the agent behaves on every job. A loaded-when-needed skill is a method the router or the agent reaches for when the job calls for it. Anything not listed here is off: it is not in `pack/skills`, so Prime never sees it.

The description budget for the whole folder is about 4,000 tokens (counted as characters divided by four, plus a small allowance per skill for the XML around it). `bin/install-skill-packs.sh` prints the total and fails over the limit. `tests/test-skill-packs.sh` checks it too. A pack skill's description is kept at 300 characters or fewer (`bin/skill-pack-descriptions.tsv`).

## Always on

The Laurelin behavior set. Links into `~/.claude/skills` (see `../README.md`), except where noted.

- `karpathy-guidelines`: coding behavior, think before coding, minimal change, surgical edits, verifiable goals. A copy from the installed plugin. The one Karpathy skill, kept on for every job.
- `fusion-cad`: Autodesk Fusion through the `fusion` MCP server, with Adam and CADAM for generated parts.
- `writing-ste`: Simplified Technical English with the house rules, for every prose deliverable.
- `humanizer`: content-level signs of machine-written text.
- `jev`, `jev-triage`, `jev-documents`, `jev-eval`, `jev-act`, `jev-patterns`, `building-with-jev`: every typed judgment goes to Jev.
- `classifier-dev`: bulk sorting of many texts into labels through the free classifier.dev MCP server, with data sharing off.
- `fastbrowse`: the headless web agent. The only browser.
- `investor-research`: the investor playbook. In this repo, not a link.
- `laurelin-reactor-calcs`: every reactor-physics number through the verified module.
- `sync-gbrain`: keeps the search copy current.
- `deck-design`: when it lands (its brief waits on research). Not in the folder yet.

## Loaded when needed

The adopted packs. All are copies recorded in `SOURCES.md`.

Marketing (coreyhaines31/marketingskills, no key):
- `product-marketing`, `launch`, `emails`, `content-strategy`, `analytics`, `public-relations`, `copywriting`, `seo-audit`

B2B writers (whyashthakker/agent-skills-marketing, no key):
- `press-release-writer`, `case-study-writer`

SEO (AgriciDaniel/claude-seo, no key. Helper CLI not copied, see `SOURCES.md`):
- `seo-technical`, `seo-schema`, `seo-geo`, `seo-agentic`

Research with a key:
- `exa-search`, `company-research` (exa-labs/agent-skills, `EXA_API_KEY`)
- `firecrawl-research-index`, `firecrawl-deep-research`, `firecrawl-seo-audit`, `firecrawl-competitive-intel` (firecrawl/skills, `FIRECRAWL_API_KEY`)

Research with open APIs (K-Dense-AI/scientific-agent-skills, no key):
- `literature-review`, `paper-lookup`

Both keys are optional in `laurelin-agent keys check`. Without a key the skill's calls fail and the agent falls back to the always-on headless browser.

## Off

Everything else: the rest of each surveyed pack, the packs the survey skipped, and every skill in the Claude Code plugin folders. `docs/briefs/skill-packs.md` has the list and the reasons.

### Loaded when needed: memory (from the memory branch, Evokoa/polygres-skills, Apache-2.0)
- `polygres-cli`
- `polygres-data-pipeline`
- `polygres-retrieval-design`
- `polygres-sdk`
