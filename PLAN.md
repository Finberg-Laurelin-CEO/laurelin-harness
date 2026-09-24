# Laurelin Harness Plan

Status: PLAN (2026-09-23). Build work happens in Orca worktrees of this repo.
Location: this file is `~/laurelin-harness/PLAN.md` (git repo). The vault note `Laurelin/LaurelinOS/Laurelin Harness Plan.md` is a symlink to it, so there is one copy.
Related: [[LaurelinOS_RuntimeOS_GBrain_Architecture_Build_Spec]], [[WORK-LOG 2026-09-23 — Laurelin agent harness + gbrain refresh]]

## 1. Goal

One agent harness on Joe's Mac that can do every job Joe has given AI agents in the past year. It uses any model (Claude and ChatGPT subscriptions, Venice, OpenRouter, API keys, local models). It follows Laurelin's rules without being told each time.

Working idea (Joe, 9/24): a "co-founder in a box" for fundraising and design. It researches investors, builds decks and memos, drafts and sends email after approval, and helps think through ideas. Section 12 covers whether it ever becomes a product; for now it is Laurelin's internal tool.

## 2. Decisions so far

| Question | Decision |
|---|---|
| Scope | All work from the past year (see section 4) |
| Models | Any: subscriptions, API keys, Venice, OpenRouter, local, and model plugins |
| Where it runs | Mac. pi and Prime run on the Mac. Hermes stays on the GCP VM |
| Base | Prime Agent (MIT, pi derivative), extended by a package. No fork. Reviewed 9/24, see "Why Prime" below |
| Claude subscription | Use it through the real Claude Code, connected over ACP (decided 9/24). `claude -p` is the fallback. Do not spoof Claude Code from Prime |
| ChatGPT subscription | Use it through the real Codex, connected over ACP (decided 9/24). `codex exec` is the fallback |
| Worker connection | ACP (Agent Client Protocol): the harness sees each worker's steps, tool calls and permission requests as they happen |
| Where the build happens | Git repo `~/laurelin-harness`, worked in Orca worktrees |

### Why Prime (reviewed 9/24)

Prime is the right base for the coordinator. Since the Claude and ChatGPT workers connect over ACP, model access no longer depends on Prime's own sign-in.

- **For:** autonomous runs that stop only when checks pass; background service; scheduled jobs; `--goal` with a token budget; a persistent Python session; packages; MCP; ACP mode; pi's extension and UI system. MIT license.
- **Against:** young (v0.9.5), controlled by Prime Intellect, and its Anthropic sign-in is already broken for Opus 5.5.
- **Alternatives:** plain pi (upstream, larger community, lacks Prime's autonomous and scheduling features); a custom coordinator on the ACP SDK (full control, far more work); Hermes (runs on the VM, suits always-on jobs).
- **Hedge:** keep the Laurelin package in pi's format. Keep the router, checks and workers in separate modules. Moving to plain pi or a custom ACP coordinator then means changing the launcher, not rewriting the harness.
| Approvals for outward actions | TBD. Section 6 lists the actions |
| How Joe runs it | A `laurelin` terminal command (free on PATH as of 9/24). It is a thin wrapper that starts Prime Agent with the Laurelin package, rules, default model and settings. Prime updates stay separate, and plain `prime-agent` keeps working |

## 3. The source data

7,237 prompts Joe typed from 2025-10-23 to 2026-09-23 (Claude Code history plus Codex sessions). Four read-only passes sorted them by job.

Main finding: only 20 to 30% of prompts start new work. 70 to 80% steer work already in progress, and about 35% are corrections. **The harness saves the most time by getting it right the first time, not by starting work faster.** Every repeated correction below should become an automatic check.

## 4. Job catalog (approximate prompt counts, whole year)

| Group | Jobs | ~Prompts | Still active? |
|---|---|---|---|
| Websites and brand | Laurelin site builds and redesigns (Next.js, Figma, Framer, Paper), mobile, careers page, visual system, social graphics, business cards, merch store | 1,000 | Yes |
| Agents and operations | Hermes, OpenClaw and social bots, AgentMail, GCP and AWS setup, Google Workspace, DNS, Vercel and Neon billing, tax and payroll planning, tool and laptop fixes | 900 | Yes |
| Fundraising documents | Decks (general, Discipulus, FF, sales, DoD), memos, budgets, financial models, data room and binders, applications (YC, FI, PearX, Lightcone), investor Q&A answers | 800 | Yes, top priority |
| Academic writing | Physics papers, thesis, arXiv and journal submission, LaTeX layout | 800 | Mostly Oct 2025 to May 2026 |
| Engineering documents and research | ANOR drawing sets, CAD, vendor spec sheets, BOMs, floorplans, physics research, animations, export-control strategy | 550 | Yes |
| Investor research and email | Firm and partner research, CRM, investor notes, drafting and sending email, hiring shortlists | 500 | Yes |
| Media | Midjourney art direction, video ads and trailers, voice clone, manifesto, Substack and X posts | 400 | Yes |
| Side projects | Handshake Dynamo benchmark tasks, Frege product and YC app, Grid 2050 game, trading bot, early chat product | 900 | Varies |
| Vault upkeep | Filing, wikilinks, indexes, work logs, cryptonym registry, style guides | 200 | Yes |
| Personal | Books and fiction, tweet checks, texts, one-offs | 250 | Yes |

## 5. Rules that become automatic checks

These are the corrections Joe repeated most. Each one gets a check that runs before the agent says "done".

| Repeated correction | Check |
|---|---|
| "Slop", em dashes, metaphors, "not X but Y", hedges, disclaimers | writing-ste lint + jev sweep on all prose |
| Wrong or invented numbers ($2.85M, stale bore sizes) | Compare numbers against the canonical docs and reactor-calcs; newest engineering doc wins |
| Overlapping text, text off the page, too much white space (100+ times) | Render every PDF page to an image and check for overlaps and overflow |
| "I don't see it", "show me the file path" | Check the file exists in the right vault folder; always print the path |
| Changed Joe's prose, deleted things | Diff check: Joe's text unchanged word for word; changes only add |
| Invented data, fake simulation, "you are lying" | The agent must show evidence (file, command output) for each claim of done |
| Didn't read the vault first | Load vault context and gbrain results before starting any Laurelin task |
| Pushed or deployed without asking | Outward actions blocked until approved (section 6) |
| Opened browser windows | Headless browser only (fastbrowse, /browse) |

## 6. Actions that reach the outside world (approval list TBD)

- Email sends (Superhuman, Gmail), scheduled email batches
- Discord and iMessage messages
- Site deploys (Vercel, GitHub push, wisp), DNS and Workspace changes
- Posts: X, Instagram, Substack, LinkedIn
- Money: Stripe live mode, trading bot, paid generation (Higgsfield, ElevenLabs, Venice), cloud GPU spend
- Form submissions: applications, portals, arXiv and journals

## 7. Safety items the year revealed

- **Pasted secrets.** Live keys and passwords were pasted into prompts many times (Stripe, ElevenLabs, Venice, SendGrid, GCP, Bluesky, Gmail app password). They sit in plain text in `~/.claude/history.jsonl`. Rotate them. The harness must catch pasted secrets, move them into the keys store, and remove them from logs.
- **Requests that need a refusal path.** Filtering job candidates by nationality or ethnicity, booking personal costs as business costs, planting misleading text in benchmark tasks, using a real person's likeness in ads, naming an advisor before the agreement is signed. The harness should stop and flag these, not run them.

## 8. Proposed shape

1. **Coordinator:** Prime Agent on the Mac, with the Laurelin package (skills, rules, checks, prompts).
2. **Workers:** Claude Code (Claude subscription), Codex (ChatGPT subscription), Venice and OpenRouter models, local models through Ollama.
3. **Memory:** the Obsidian vault is the source of truth. gbrain gives fast search over the safe copy of the vault (optional for version 1).
4. **Skills:** always on: about 20 Laurelin skills. Loaded when needed: design, video, CAD, legal, grants. Off: the rest.
5. **Checks:** section 5. A job is done only when its checks pass.
6. **Learning loop:** when Joe corrects the agent, it drafts a new rule and check. Joe approves or rejects it. The agent reruns a test set of past jobs to confirm nothing broke.
7. **Classification routing:** Red material stays on local models. Yellow goes to approved vendors only. Green can use any model.
8. **Jev judgment worker (always on):** every typed judgment goes to Jev, not to an LLM. That covers classification, choosing among known options, rubric scores, yes/no over text in hand, reranking and claim-against-source checks. It uses the `jev`, `jev-decide`, `jev-triage`, `jev-documents`, `jev-eval`, `jev-act`, `jev-patterns` and `building-with-jev` skills. Jev runs in about 200 ms at about $0.04 per million input tokens. If Jev's confidence is under 0.6, escalate to an LLM or to Joe. Jev never authorises a send, purchase, merge or deletion. In the harness, Jev also:
   - runs the prose checks in section 5 (jev-sweep);
   - decides which worker or skill a task goes to;
   - triages inbox and investor records;
   - checks each claim of "done" against its evidence (jev-eval);
   - picks browser actions inside fastbrowse.

## 9. Jev skill set

Installed 2026-09-24 in Claude Code, Codex, pi, Prime and `~/.agents/skills` on the Mac, and on the Hermes VM. Only `fastbrowse` and `jev` are in `~/laurelin-harness/pack` so far.

| Skill / command | What it does | Harness use |
|---|---|---|
| `jev` | Shell access to Jev: yes/no, choice, score. Holds the delegation table | Base of every check |
| `jev-decide` (`~/.local/bin`) | Quick one-question decision | Router: picks the worker and skill for each task |
| `jev-triage` | Sorts and prioritises records in bulk | Inbox, investor CRM, follow-up queues |
| `jev-documents` | Finds, extracts and checks evidence in documents | Number checks against canonical docs; claim checks with citations |
| `jev-eval` | Judges outputs against written criteria | Checks every "done" against its evidence; scores the test set |
| `jev-act` | Picks the next action in a browser, desktop or game | Browser and desktop steps (used inside fastbrowse) |
| `jev-patterns` | Worked patterns for Jev workflows | Reference when designing new checks |
| `building-with-jev` | How to write good Jev questions and thresholds | Reference when writing checks |
| `fastbrowse` | Headless web agent: Jev picks clicks, GPT (ChatGPT subscription) plans and reads | All web lookups and forms |

## 10. Build steps

Each step ends with a test that proves it works before the next one starts.

**Step 0: Before building (Joe)**
- Rotate the secrets found in chat history.
- Decide which model accounts to fund (Venice cap, others optional).
- Decide the approval list, or accept a default of "everything outward waits for Joe".

**Step 1: One home for skills and rules**
- Make `~/laurelin-harness/pack` the single source for all Laurelin and Jev skills, and link every tool (Claude Code, Codex, pi, Prime, Hermes VM) to it.
- Remove duplicate copies.
- Write one rules file from the memory notes (writing rules, canonical numbers, file locations, Bohm doctrine, what never goes in documents).
- Test: every tool lists the same skills and the same rules.

**Step 1b: The `laurelin` command**
- A small script at `~/.local/bin/laurelin` that starts Prime Agent with the Laurelin package, the rules file and Laurelin settings.
- Usage (proposed):
  - `laurelin`: open the interactive session.
  - `laurelin "build the Ironstead deck"`: start with a task.
  - `laurelin -p "..."`: one answer, then exit (for scripts).
  - `laurelin --autonomous "..."`: run until every check passes.
  - `laurelin agents`: see and reattach to running jobs.
  - `laurelin schedule`: recurring jobs.
- Test: `laurelin` starts, lists the Laurelin skills, and answers one prompt.

**Step 1c: The Laurelin interface**
Built with Prime's theme file and one extension (setHeader, setFooter, setStatus, setWidget, overlays, Image component). Look taken from the Laurelin visual system (`~/laurelin-visual-system`): carbon background, bone text, Laurelin orange accents. Full color in images, never grayscale.
- **Title screen:** on launch, show the Laurelin wheel logo as a real image (Ghostty displays images), with the wordmark, version and today's jobs. Any key continues. Text fallback for terminals without image support.
- **Theme:** Laurelin colors across all Prime color settings (UI, markdown, diffs, code, thinking borders).
- **Header:** wordmark, classification badge (GREEN / YELLOW / RED, always visible), active model and worker.
- **Checks panel:** one light per check (prose, numbers, layout, location, word for word, proof), updating live, naming the failure (for example "layout p.7 overlap").
- **Approvals panel:** everything waiting on Joe. Opening an item shows a pop-up preview of the email, post or deploy, with approve and reject.
- **Jev decisions:** each routing and check decision shown with its confidence score.
- **Footer:** running jobs, today's cost, vault sync age, active worker, skill count.
- **Optional banner art:** the orange ANOR blueprint plate.
- Logo source: the Laurelin rings mark (eight small rings on a circle). Canonical files in `~/Laurelin_Brand_Assets/imagery/reference/brand/`: `laurelin-mark.png` (white, for the dark title screen) and `laurelin-ring-dark.png`. Black and white variants also exist in `~/laurelin-marketing/videos/*/assets/brand/`. An SVG would be better for sharp scaling; trace one if none exists.
- Test: `laurelin` opens on the title screen and shows each panel during a sample job. Check that it reads well in Ghostty light and dark.

**Step 2: Workers**
- A Prime extension that hands a task to `claude -p` (Claude subscription), `codex exec` (ChatGPT subscription), Venice or a local Ollama model, and collects the result.
- Option to evaluate: connect Claude Code and Codex through ACP (Agent Client Protocol) adapters. ACP gives structured progress, tool calls and permission requests. Plain `-p` output gives only final text. Prime itself also speaks ACP (`--mode acp`), so `laurelin` could later run inside ACP apps such as Zed or keel.
- Test: one small task finishes on each worker.

**Step 3: The Jev router**
- `jev-decide` reads each incoming task and picks the worker and skill. Below 0.6 confidence, it asks Joe.
- Test: 20 past prompts route to the same place Joe would send them.

- Router rules borrowed from keel (section 13): Jev may **abstain** when no option fits, and the harness **checks the choice is allowed** before acting on it. Every routing and check decision is written to a **decision log** (task, options, choice, confidence, outcome, Joe's correction if any). The log feeds the test set and, later, training.

**Step 4: Checks (section 5)**
- Prose: writing-ste lint + jev-sweep.
- Numbers: `jev-documents` against the canonical docs and reactor-calcs.
- Layout: render each PDF page and check for overlap and overflow.
- Location: file exists in the right vault folder; path printed.
- Word for word: Joe's text unchanged.
- Evidence: `jev-eval` confirms each "done" claim.
- These run as Prime's autonomous gates: a job is done only when every check passes.
- Test: each check catches a real past mistake from the inventory.

**Step 5: Safety**
- Approval gate on every outward action (section 6).
- Secret scrubber on everything Joe pastes.
- Refusal flags for the requests listed in section 7.
- Classification routing (Red stays local).
- Test: a fake send stops for approval; a pasted fake key is caught.

**Step 6: Test set**
- Pick 15 to 20 past jobs with known good results. Run them and score them with `jev-eval`. This is the baseline.

**Step 7: First real job area: fundraising documents**
- Decks, memos and applications, end to end, through the checks and the approval gate.
- Test: Joe's correction count on these jobs drops against the past year.

**Step 8: Expand in order**
1. Investor research and email drafting (`jev-triage`, fastbrowse).
2. Engineering documents (ANOR drawing sets, spec sheets).
3. Vault upkeep.
4. Websites and media.
5. Operations and side projects.

**Step 9: Memory**
- Decide on gbrain: finish the local embedding, then move to one shared Postgres server (optionally with the Polygres extensions).
- Test: Claude Code, Prime and Hermes all get the same search results.

**Step 10: Learning loop**
- When Joe corrects the agent, it drafts a new rule and check. Joe approves or rejects it. The test set reruns to confirm nothing broke.

## 11. Current state (as of 2026-09-24)

Built on 9/23 before the plan-only decision. All of it can be kept or undone.

- **Laurelin package:** `~/laurelin-harness/pack`, registered in Prime. Holds links to writing-ste, laurelin-reactor-calcs, fastbrowse, jev, humanizer and sync-gbrain. Not yet confirmed to load (no working model call).
- **Duplicate skills:** Prime also has its own copies of fastbrowse, jev and humanizer in `~/.prime/agent/skills`. Remove them once the package load is confirmed.
- **gbrain:** upgraded to 0.54.1. Holds the safe vault copy (3,766 notes, refreshed 9/23). Meaning-based search runs locally and free (Ollama, snowflake-arctic-embed2). 4,960 of 13,178 sections are embedded. Running `gbrain migrate embeddings --to ollama:snowflake-arctic-embed2 --dim 1024 --yes` again finishes the rest.
- **gbrain limit:** 12 `gbrain serve` processes (one per Claude or Codex session) share one database file that only one process can use safely at a time. Fix: one shared server on real Postgres.

### Model access

| Route | Status |
|---|---|
| Claude subscription | Works in Claude Code. Prime's direct sign-in is blocked (Opus 5.5 needs a newer client version). Plan: call `claude -p` as a worker |
| ChatGPT subscription | Works in Codex. Plan: call `codex exec` as a worker. The subscription does not cover the OpenAI API |
| OpenAI API key | Valid, but the account has $0 credit. Stored in `~/.config/agent-keys/env` |
| Venice | Lists claude-opus-5-5. The key hit its spending cap; raise it in the Venice dashboard |
| OpenRouter | Name exists in `~/.hermes/.env`, but the value is empty. Optional: no current tool needs it |
| Jev (TypeSafe) | Works. Needs only `TYPESAFE_API_KEY` (in `~/.zshrc`). No OpenRouter |
| fastbrowse | Works. Jev + GPT on the ChatGPT subscription through the Codex sign-in (`FASTBROWSE_CODEX_TOKEN_CMD`). If the token expires, run `codex` once |
| Anthropic API key | None exists |
| Local (Ollama) | Running on the Mac. Has the embedding model; no chat model pulled yet |

### Memory and search options

- **gbrain:** the full system. It reads the vault, keeps it in sync, and gives agents search and memory.
- **Polygres** (polygres.com): a Postgres database with keyword, meaning-based and connection-following (graph) search. It does not read or sync the vault, so it can hold data under gbrain but cannot replace it. Its core parts are open source and free to self-host. The hosted service launched 2026-07-31, has no public team, and is not charging yet. Proposal: self-host its extensions under gbrain later. Do not use the hosted service for vault content.
- **Plain vault search:** agents read the vault folder directly. Slower and exact-words only, but it needs no upkeep.

## 12. Possible open-source release (later)

Decision (2026-09-24): internal tool first. Do not sell it and do not put it on the Laurelin website.

- **When:** only after the harness has run Laurelin work for one to two months and the test set shows fewer corrections.
- **Where:** Joe's personal GitHub, not the Laurelin site or org.
- **What ships:** the generic parts only: the `laurelin`-style launcher pattern, the check gates, Jev routing, the approval gate, the secret scrubber and the correction-to-rule loop.
- **What never ships:** Laurelin rules and doctrine, vault content, canonical numbers, classification and cryptonym material, investor or contact data, keys, and anything under export control. Run a sanitizer pass and a secrets scan before any push.
- **License:** keep the Prime Agent MIT notice (Zechner and Prime Intellect). Check the fastbrowse and Jev skill licenses before including them.
- **Why:** founder-velocity exhibit (consistent with the 7/13 office-hours verdict), a hiring signal for engineers, and a door to Prime Intellect and TypeSafe.
- **Signal to revisit selling it:** outside users star it and ask for a hosted version. Until then, no product.
- **Reasons against selling now:** the value is in private Laurelin content; the generic layer competes with Claude Code, Codex, Prime and Hermes; subscriptions cannot be resold; a software product on the fusion site blurs the investor story; it repeats the Frege build-before-validate pattern.

## 13. Related project: keel

[keel](https://github.com/codejunkie99/keel), reviewed 2026-09-24. A Rust macOS desktop coding workspace (editor, terminal, provider connections). A selector picks which coding route runs each task. The selector is either Laya (a local Core ML model), Jev (TypeSafe, opt-in; it ships a `jev-core` crate) or none. Agents connect through ACP. It keeps decision records and has a decision inspector. MIT license. 11 stars, 3 commits, v0.2.0, dev builds only, no installer. It does not train from its records and does not coordinate multiple agents.

- **Fit:** same core idea as this plan (Jev chooses the route; the host checks the choice). Different product: keel is a GUI for coding. `laurelin` is a terminal harness for all company work.
- **Adopt the ideas, not the code:** abstain, host-checks-the-choice and the decision log (added to Step 3); ACP for workers (added to Step 2 as an option). A decision inspector view could go in the interface (Step 1c).
- **Do not adopt the app:** too early (3 commits), coding-only, and a GUI.
- **Contact:** the authors build on Jev too. They are worth knowing, alongside TypeSafe and Prime Intellect.

## 14. Open questions

- Approval list (section 6).
- Should the academic-writing and Dynamo work be in scope, or only Laurelin?
- gbrain in version 1, or later? Finish the local embedding?
- Test set: which 15 to 20 past jobs define "done right"?
- Which model accounts to fund: Venice cap, OpenRouter key, OpenAI credit, Anthropic API key?
- Rotate the secrets found in chat history (section 7).

## Change log

- 2026-09-23: Plan created from the 7,237-prompt inventory.
- 2026-09-24: Added current state, model access table, memory and search options, and new open questions.
- 2026-09-24: Jev is an always-on judgment worker (shape item 8). Corrected: fastbrowse uses the ChatGPT subscription, not OpenRouter; Jev needs only the TypeSafe key.
- 2026-09-24: Added the Jev skill set (section 9) and step-by-step build steps (section 10), replacing the short build order.
- 2026-09-24: Added the `laurelin` terminal command (decision table, Step 1b).
- 2026-09-24: Added section 12, possible open-source release after internal use; not a product, not on the Laurelin site.
- 2026-09-24: Added Step 1c, the Laurelin interface: title screen with the wheel logo, theme, badge, checks, approvals, Jev confidence, footer.
- 2026-09-24: Moved to git repo `~/laurelin-harness` (PLAN.md; package in `pack/`); vault note is now a symlink. ACP chosen for Claude Code and Codex workers. Added "Why Prime" review and the co-founder-in-a-box framing.
- 2026-09-24: Logo files located. Added section 13 (keel review) and borrowed three ideas: abstain, host-checks-the-choice, decision log; ACP workers as an option.
