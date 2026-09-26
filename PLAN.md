# Laurelin Harness Plan

Status: BUILD (Joe, 2026-09-25). Build work happens in Orca child worktrees of the `ideation` branch, one per piece, merged in step order after each test passes. A `testing` worktree collects merged pieces for Joe to launch himself. No push to GitHub until it works locally end to end and Joe says push (Joe, 9/25).
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
| Base | Prime Agent (MIT, pi derivative). Joe (9/25): the harness is a Prime Agent clone, Prime plus the Laurelin pack. Two ways to be one: a soft clone (a package on top of Prime, Prime's updates for free; the current build) or a hard fork (own name and binary, upstream merged by hand; what Prime itself did to pi). Prime's source is public at github.com/PrimeIntellect-ai/prime-agent. The pieces are the same code either way. Joe chose the hard fork on 9/25 ("we have the code, clone it"). Prime's source lives in this repo under `agent/` as a git subtree (upstream merges with `git subtree pull`), renamed `laurelin` through its `piConfig.name` field, built with `npm run build`. The pack still works on stock Prime, so the soft clone remains the fallback |
| Claude subscription | Use it through the real Claude Code, connected over ACP (decided 9/24). `claude -p` is the fallback. Do not spoof Claude Code from Prime |
| ChatGPT subscription | Use it through the real Codex, connected over ACP (decided 9/24). `codex exec` is the fallback |
| Worker connection | Version 1: `claude -p --output-format stream-json` and `codex exec --json` inside a `delegate_worker` tool, with permissions preset per task; every tool call still streams. ACP client second (Step 2b), for live permission forwarding, since Prime has no ACP client and the outward gate lives in the harness anyway (revised 9/25) |
| Where the build happens | Git repo `~/laurelin-harness`, worked in Orca worktrees |
| Scope edges | Academic writing is in. Handshake Dynamo is out (decided 9/24) |
| Model funding | None. Version 1 runs on the Claude and ChatGPT subscriptions, the existing Jev key, and local models. The `laurelin` command keeps Prime's provider system whole: any key from any provider, any login Prime supports (decided 9/24) |
| Secrets in chat history | Joe declined rotation (9/24). The scrubber in Step 5 still runs on new pastes |
| Coordinator model | Prime's ChatGPT sign-in (`openai-codex`, gpt-6-astra). It is the only subscription route that does not spoof Claude Code. No local fallback (Joe, 9/24). See "Subscription-only coordinator" in section 11 |
| Memory | gbrain is in version 1, pinned at 0.54.1 (commit 6040075), as one `gbrain serve --http` on the GCP machine `laurelin-bot`, with the Mac and Hermes as thin clients. Polygres is skipped: it duplicates what gbrain already does and cannot host it (9/24) |
| Keys | One store, `~/.config/agent-keys/env`, sourced by the `laurelin` command; Prime names keys by variable; `laurelin keys` manages them; the scrubber files pasted keys (Step 1e, 9/24) |
| gstack | Reuse its scrubber, tool gates, evidence ledger, decision log and learnings store. Jev keeps every judgment. Section 17 (9/24) |
| Outside services | context.dev as an MCP tool for research; boat as a paid remote worker behind the money gate; Polygres unused. Section 16 (9/24) |

### Why Prime (reviewed 9/24)

Prime is the right base for the coordinator. Since the Claude and ChatGPT workers connect over ACP, model access no longer depends on Prime's own sign-in.

- **For:** autonomous runs that stop only when checks pass; background service; scheduled jobs; `--goal` with a token budget; a persistent Python session; packages; MCP; ACP mode; pi's extension and UI system. MIT license.
- **Against:** young (v0.9.5), controlled by Prime Intellect, and its Anthropic sign-in is already broken for Opus 5.5.
- **Alternatives:** plain pi (upstream, larger community, lacks Prime's autonomous and scheduling features); a custom coordinator on the ACP SDK (full control, far more work); Hermes (runs on the VM, suits always-on jobs).
- **Hedge:** keep the Laurelin package in pi's format. Keep the router, checks and workers in separate modules. Checked 9/25 (section 19): the package, theme, hooks and modes carry over to pi, but the gates, native subagents and daemon are Prime-only, so a move to pi would mean rewriting those three.
| Approvals for outward actions | Every action in section 6 waits for Joe. No exceptions in version 1 (decided 9/24) |
| How Joe runs it | A `laurelin-agent` terminal command (renamed 9/25: `laurelin` on Joe's PATH is a different program, the Laurelin chat platform's Python client). It is a thin wrapper that starts Prime Agent with the Laurelin package, rules, default model and settings. Prime updates stay separate, and plain `prime-agent` keeps working |

## 3. The source data

7,237 prompts Joe typed from 2025-10-23 to 2026-09-23 (Claude Code history plus Codex sessions). Four read-only passes sorted them by job.

Main finding: only 20 to 30% of prompts start new work. 70 to 80% steer work already in progress, and about 35% are corrections. **The harness saves the most time by getting it right the first time, not by starting work faster.** Every repeated correction below should become an automatic check.

## 4. Job catalog (approximate prompt counts, whole year)

| Group | Jobs | ~Prompts | Still active? |
|---|---|---|---|
| Websites and brand | Laurelin site builds and redesigns (Next.js, Figma, Framer, Paper), mobile, careers page, visual system, social graphics, business cards, merch store | 1,000 | Yes |
| Agents and operations | Hermes, OpenClaw and social bots, AgentMail, GCP and AWS setup, Google Workspace, DNS, Vercel and Neon billing, tax and payroll planning, tool and laptop fixes | 900 | Yes |
| Fundraising documents | Decks (general, Discipulus, FF, sales, DoD), memos, budgets, financial models, data room and binders, applications (YC, FI, PearX, Lightcone), investor Q&A answers | 800 | Yes, top priority |
| Academic writing | Physics papers, thesis, arXiv and journal submission, LaTeX layout | 800 | Yes, in scope (9/24) |
| Engineering documents and research | ANOR drawing sets, CAD, vendor spec sheets, BOMs, floorplans, physics research, animations, export-control strategy | 550 | Yes |
| Investor research and email | Firm and partner research, CRM, investor notes, drafting and sending email, hiring shortlists | 500 | Yes |
| Media | Midjourney art direction, video ads and trailers, voice clone, manifesto, Substack and X posts | 400 | Yes |
| Side projects | Frege product and YC app, Grid 2050 game, trading bot, early chat product. Handshake Dynamo is out of scope (9/24) | 900 | Varies |
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

## 6. Actions that reach the outside world (all wait for Joe)

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

One rule runs through the shape (Joe, 9/24): **the LLM creates, Jev decides, code executes.** Any yes/no, choice, score, route or approval that an LLM answers in prose today becomes a Jev question with a typed answer, a confidence and a log line. Memory is a separate service the harness talks to over MCP, not a part of the harness; Laurelin's gbrain is one instance of it.


1. **Coordinator:** Prime Agent on the Mac, with the Laurelin package (skills, rules, checks, prompts).
2. **Workers:** Claude Code (Claude subscription), Codex (ChatGPT subscription), Venice and OpenRouter models, local models through Ollama.
3. **Memory:** the Obsidian vault is the source of truth. gbrain gives fast search over the safe copy of the vault. In version 1 (decided 9/24): one gbrain server on the GCP machine, the Mac and Hermes attached as clients (Step 1d).
4. **Skills:** always on: about 20 Laurelin skills. Loaded when needed: design, video, CAD, legal, grants. Off: the rest.
5. **Checks:** section 5. A job is done only when its checks pass. Each check climbs a ladder: code gathers evidence, Jev judges it, an LLM reviewer reads only when Jev cannot answer, and Jev judges the reviewer's findings (Step 4).
6. **Learning loop:** when Joe corrects the agent, it drafts a new rule and check. Joe approves or rejects it. The agent reruns a test set of past jobs to confirm nothing broke.
7. **Classification label:** every task carries Green, Yellow or Red in its task file, the badge and the logs. Decided 9/25 (Joe): it is a label, not a gate. No model, and not Jev, is blocked by it in version 1. The plug-in point for a restricted deployment later (a GovCloud Jev, a local model) is the endpoint setting of each worker and of the Jev command, so a policy can be added without touching the harness. The `jev` command already reads `TYPESAFE_BASE_URL` and `TYPESAFE_DEFAULT_MODEL`, so a GovCloud Jev is two lines in the key store.
8. **Jev judgment worker (always on):** every typed judgment goes to Jev, not to an LLM. Section 18 is the full catalogue of those judgments. That covers classification, choosing among known options, rubric scores, yes/no over text in hand, reranking and claim-against-source checks. It uses the `jev`, `jev-decide`, `jev-triage`, `jev-documents`, `jev-eval`, `jev-act`, `jev-patterns` and `building-with-jev` skills. Jev runs in about 200 ms at about $0.04 per million input tokens. If Jev's confidence is under 0.6, escalate to an LLM or to Joe. Jev never authorises a send, purchase, merge or deletion. In the harness, Jev also:
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
- Rotate the secrets found in chat history. Joe declined on 9/24; the keys stay live and stay in `~/.claude/history.jsonl`.
- Model accounts: fund none (9/24). Version 1 runs on subscriptions, the Jev key and local models. See "Subscription-only" in section 11.
- Approval list: everything outward waits for Joe (9/24).
- **Vault access (found 9/25 evening, cause confirmed).** macOS attributes a process started from a terminal to the terminal's app. In Ghostty, which has Full Disk Access, the vault reads. In Orca, the app behind the terminal is Orca (`com.stablyai.orca`), which has no grant, so the same signed Claude binary that was granted access on 9/23 is refused, and so is anything Orca's build agents run. **Joe says Orca already has Full Disk Access (9/25 night), and reads still fail. The reason: the terminals are spawned by `Orca Helper.app` (`com.stablyai.orca.helper`, a separate bundle inside Orca.app under Contents/Frameworks) running directly under launchd, not under the main Orca process, so the main app's grant does not carry. The grant has to be on the helper too: in Full Disk Access press the plus, go to `/Applications/Orca.app/Contents/Frameworks/` and add `Orca Helper.app`.** Until then the harness has a built-in fallback: `bin/vault-io read|ls|exists|write` tries the path directly and, on a privacy denial, goes through the AnorBridge file proxy on the loopback port that Joe's memory notes document (it keeps its own grant; nothing leaves the machine). The rules extension uses it; the memory and skill scripts should call it for vault paths. Verified 9/25: the bridge listed and read Style Guide notes the shell could not.

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
- Prime facts (9/25): there is no `--package` flag; the launcher runs `prime-agent -e <pack>` or lists the pack under `packages` in a settings file. `agents`, `attach`, `send`, `schedule`, `-p` and `--mode json` are Prime's own commands, so the wrapper only forwards them. A separate settings folder is likely possible through `PRIME_AGENT_CODING_AGENT_DIR` (pi documents the twin variable; Prime's is in the code, untested); `auth.json` lives in that folder, so it would be symlinked to keep the sign-ins.
- Test: `laurelin` starts, lists the Laurelin skills, and answers one prompt.

**Step 1c: The Laurelin interface**
Joe (9/24): keep Prime's own interface and layout. Laurelin adds the theme, the badge, the checks and approvals panels, and the title screen, nothing more. No custom layout; the mockup is settled once it is built and Joe can see it.
Prime facts (9/25): Prime has no fixed top bar; `setHeader` replaces the startup banner, which scrolls away. Anything that must stay visible lives in the footer (`setStatus` adds an item, `setFooter` replaces it), the status line, or a widget above or below the editor (`setWidget`). Pop-ups are `ctx.ui.custom` with `overlay: true`; the simple case is `ctx.ui.confirm`. The title screen is a custom view on `session_start` that any key dismisses. Terminal images: Prime's docs say it does not draw them, but the bundled Image component still carries the Kitty path, so a test in Ghostty decides; the fallback is a block-glyph mark. All of it guarded by `ctx.hasUI`, since `-p` and JSON mode have no screen. So: badge in the footer, not a header. One extension file of 350 to 500 lines plus one theme JSON.
Built with Prime's theme file and one extension (setHeader, setFooter, setStatus, setWidget, overlays, Image component). Look taken from the Laurelin visual system (`~/laurelin-visual-system`): carbon background, bone text, Laurelin orange accents. Full color in images, never grayscale.
- **Title screen:** on launch, show the Laurelin wheel logo as a real image (Ghostty displays images), with the wordmark, version and today's jobs. Any key continues. Text fallback for terminals without image support.
- **Theme:** Laurelin colors across all Prime color settings (UI, markdown, diffs, code, thinking borders).
- **Header:** wordmark, classification badge (GREEN / YELLOW / RED, always visible), active model and worker.
- **Checks panel:** one light per check (prose, numbers, layout, location, word for word, proof), updating live, naming the failure (for example "layout p.7 overlap").
- **Approvals panel:** everything waiting on Joe. Opening an item shows a pop-up preview of the email, post or deploy, with approve and reject.
- **Jev decisions:** each routing and check decision shown with its confidence score.
- **Footer:** running jobs, today's cost (from the beacon stream), vault sync age, active worker, skill count.
- **Optional banner art:** the orange ANOR blueprint plate.
- Logo source: the Laurelin rings mark (eight small rings on a circle). Canonical files in `~/Laurelin_Brand_Assets/imagery/reference/brand/`: `laurelin-mark.png` (white, for the dark title screen) and `laurelin-ring-dark.png`. Black and white variants also exist in `~/laurelin-marketing/videos/*/assets/brand/`. An SVG would be better for sharp scaling; trace one if none exists.
- Test: `laurelin` opens on the title screen and shows each panel during a sample job. Check that it reads well in Ghostty light and dark.

**Step 1d: Memory (gbrain, moved up from Step 9 on 9/24)**
- Pin gbrain at 0.54.1 (`github:garrytan/gbrain#6040075`). Releases land almost daily (15 between 9/15 and 9/24) and the npm package named `gbrain` is an unrelated project. Upgrade on purpose, never by accident. The only change in 0.54.1.1 is admin commands for a shared HTTP server.
- Why change anything: gbrain today stores the brain in one file (`~/.gbrain/brain.pglite`, an embedded Postgres) that only one process may open. Each Claude Code, Codex or Prime session starts its own `gbrain serve`, so the second session on waits or fails. On 9/24 twelve such processes were fighting for the file.
- Fix (decided 9/24, the cheaper path): one `gbrain serve --http` process, and every session attaches to it as a thin client with `gbrain connect <url> --token`. Cost in money: zero either way. Cost on the Mac: this path adds nothing, since one gbrain server already runs; a Postgres server would add a second background service and an install.
- Where the one server lives (decided 9/24): on the GCP machine `laurelin-bot` (us-west1-a, already running, already paid for), because Hermes lives there and runs while the Mac sleeps. The Mac attaches as a thin client over SSH. Hosting on the Mac would cut Hermes off whenever the Mac sleeps. Vercel cannot host it: it has no long-running processes. Polygres cannot host it (above).
- What this means: the safe copy of the vault (the sanitized set, not the vault itself) is copied to the GCP machine and re-synced from the Mac, over SSH, on a schedule or after each vault edit. That is Laurelin content leaving the Mac to Joe's own machine. Joe approves the first copy (rule 8). The brain file and the embeddings then live on the VM, and embedding runs there with Ollama on CPU, which is fine for small daily changes.
- The Mac keeps a read-only fallback: if the VM is unreachable, agents read the vault folder directly (plain search).
- Polygres credits cannot host it. Polygres gives passwordless connection strings and never hands out the database password, and its SDK goes through its own runtime API. gbrain needs a full Postgres login to create extensions and run its 160-plus migrations. It would also put the vault copy on a hosted service.
- Alternative, only if the single server proves slow: move the brain to a real Postgres server (`gbrain init --prefer-postgres` or `gbrain migrate --to supabase --url <postgres-url>`, lossless). Needs the `vector`, `pg_trgm` and `pgcrypto` extensions. That is an install outside this repo and Joe approves it first.
- Finish the local embedding: `gbrain migrate embeddings --to ollama:snowflake-arctic-embed2 --dim 1024 --yes`. Free and local.
- Stop registering `gbrain serve` per Claude session (the `setup-gbrain` skill's default does this and caused the 12-process lock). Register the shared server instead. In Prime, register it with `prime-agent mcp add remote --url ... --bearer-token-env-var NAME` in user settings (project-level MCP entries are ignored). Prime's model calls MCP tools from its Python kernel with `mcp.call_tool`, so there is no tool-name clash.
- Test: Claude Code and Prime on the Mac, and Hermes on the VM, all get the same search results from the one server at the same time, and still do after the Mac has slept.

**Step 1e: Keys (designed 9/24)**
Today keys are spread over three places: `~/.config/agent-keys/env` (three keys, permissions owner-only), `~/.zshrc` (three more, one duplicated), and Prime's `auth.json` (the two subscription sign-ins plus OpenRouter). The Hermes machine has its own `~/.hermes/.env`.
- One store on the Mac: `~/.config/agent-keys/env`, one `NAME=value` per line, owner-only permissions. Every API key moves there. `~/.zshrc` keeps no values; it gets one line that sources the store, so ordinary shells still work.
- The `laurelin` command sources the store at launch. Prime, the Jev commands, fastbrowse, the context.dev tool, and the Claude Code and Codex workers all inherit the keys as environment variables. Nothing reads the file itself.
- Prime's `auth.json` names keys by environment variable, never by value (Prime supports this). Subscription sign-ins stay in `auth.json`; Prime refreshes them.
- `laurelin keys` subcommands: `add NAME` (prompts, never echoes, writes the store), `list` (names and which tool uses each, never values), `check` (which names each installed tool or skill expects, and which are missing).
- The paste scrubber (Step 5, `gstack-redact`) catches a key typed into a prompt, offers to file it under a name, and replaces the paste with the name. Session logs and decision logs are redacted before they are written.
- The Hermes machine keeps its own store with only the keys Hermes needs. Joe copies changes by hand over SSH. No automatic sync of keys between machines.
- Prime facts (9/25): Prime's sign-ins (ChatGPT, Claude, Copilot, xAI) live in `auth.json`, owner-only, and refresh themselves. An `auth.json` key entry may be a literal, an environment variable name, or a shell command such as `!security find-generic-password -ws NAME`, so the Keychain path costs nothing extra. MCP server secrets must be environment variable references, never literals. Prime has no key command on the CLI (`/login` and `/logout` inside a session only), so `laurelin keys` is still written.
- Keychain: since Prime reads `!command` keys, the store can move into the macOS Keychain whenever Joe wants, with the same `laurelin keys` commands. Not required for version 1.
- Test: `laurelin keys check` shows every expected name present; a search of `~/.zshrc`, this repo, and the log folders finds no key values.

**Step 2: Workers**
- Prime facts (9/25): Prime has native subagents. The model calls `rlm.spawn(prompt, name, model)` in its Python kernel; children run in the same process or as daemon workers, in parallel, each on any configured Prime model, with messaging back to the parent, `rlm.collect` for results, and cost folded into the parent turn. They survive compaction and restarts. Use them as they are for all Prime-model fan-out (research, reviewers, triage) on the ChatGPT sign-in.
- Foreign workers (Claude Code for Opus writing, Codex): Prime has no registry for them and no ACP client. The bundled ACP SDK does ship the client half (`ClientSideConnection`, `requestPermission`). So the harness registers one tool, `delegate_worker`, that the model calls. Version 1 of that tool runs `claude -p --output-format stream-json` and `codex exec --json`, which stream every tool call as events, with permissions preset per task (about 150 lines). The ACP client (spawn Zed's adapter, answer its permission requests through `ctx.ui.confirm`) is Step 2b, built when live permission forwarding is needed. This changes the 9/24 "ACP first" decision to "ACP second"; the outward-action gate lives in the harness either way, so nothing outward moves through a worker.
- A Prime extension that hands a task to `claude -p` (Claude subscription), `codex exec` (ChatGPT subscription), Venice or a local Ollama model, and collects the result.
- Remote worker option: boat (boat.dev). The `boat` command (1.0.9) is installed and the account is set up in `~/.zshrc`. `boat prompt` drives Claude Code, Codex, pi or Prime inside a cloud Linux machine with a desktop and a real Chrome. Use it for jobs that must not load the Mac or that need a headed browser behind a bot check (test-set job 8). It bills per second (about $0.036 an hour, $20 a month minimum), so starting a machine is a money action and waits for Joe (section 6). Vault content sent to a boat machine leaves the Mac, so only Green material goes there.
- ACP adapters exist and are open source: `@zed-industries/claude-code-acp` (npm) for Claude Code and `zed-industries/codex-acp` for Codex, both by Zed. The harness spawns the adapter and speaks ACP to it. To confirm in the Step 2 test: the Claude adapter uses the Claude subscription sign-in, not an API key.
- Model swap (Joe, 9/25), three ways, all through Prime's own model system so any provider or key works:
  1. The coordinator's own model can change mid-session with `/model`, keeping the conversation. This is the one that "calls the main model": the loop carries on with the new model.
  2. A tool the coordinator can call, `call_model(model, prompt, files)`: one question to another model, answer returned as text, the coordinator's model unchanged. For a second opinion or a one-off strong-model rewrite without switching. Prime's `qna` and `summarize` examples show the pattern in about ten lines (`modelRegistry.getApiKeyAndHeaders` then `complete`). Prime also has `/btw` and `/side` for a side question, and `providerBackupModel` for quota fallback.
  3. Handing a whole task to a worker over ACP is the same swap at task level: the router picks Claude Code or Codex and the model tier inside it.
- Option to evaluate: connect Claude Code and Codex through ACP (Agent Client Protocol) adapters. ACP gives structured progress, tool calls and permission requests. Plain `-p` output gives only final text. Prime itself also speaks ACP (`--mode acp`), so `laurelin` could later run inside ACP apps such as Zed or keel.
- Coordinator context: Prime's `context` event fires before every model call and returns a filtered message list; that is the hook. A second hook, `session_before_compact`, can replace the summary. The extension has Jev score every tool result still in context for relevance and drops the low scores. It filters what is sent, not the saved session, so it runs each turn. One user reported a session going from about 1M tokens to 86K in one second this way. This matters because the ChatGPT cap is shared with the workers.
- The same compaction inside each worker, not only the coordinator: a Claude Code hook and a Codex hook that call Jev to score and drop stale tool results before the context is re-sent. The subscription caps are counted where the tokens are spent, and most are spent inside the workers, in long sessions where the whole context goes back with every turn.
- Where subscription tokens go, in order: long sessions that re-send context every turn; rework after a correction; subagent fan-out that re-reads the same files; and last, decisions answered in prose. Jev helps the first through compaction, the second through the checks, the third through routing to the other subscription, and the fourth directly.
- Model tier inside a worker: Jev picks the cheaper model for mechanical tasks (file moves, renders, lookups, format fixes) and the strong one for anything that is written or designed. Writing always gets the strongest model available (Joe, 9/24).
- Test: one small task finishes on each worker.

**Step 3: The Jev router**
- `jev-decide` reads each incoming task and picks the worker and skill. Below 0.6 confidence, it asks Joe.
- Test: 20 past prompts route to the same place Joe would send them.

- Router rules borrowed from keel (section 13): Jev may **abstain** when no option fits, and the harness **checks the choice is allowed** before acting on it. Every routing and check decision is written to a **decision log** (task, options, choice, confidence, outcome, Joe's correction if any). The log feeds the test set and, later, training.
- Store the log with gstack's `gstack-decision-log` and search it with `gstack-decision-search` (section 17). No new store. Inside Prime, each decision is also written to the session with `pi.appendEntry`, a custom entry that stays out of the model's context, so a session replays with its decisions.
- Build the menu fresh each time: the options Jev chooses from are the workers and skills that exist and are free right now, rebuilt after every state change. Never a fixed list.
- Ask in parallel: worker, skill, classification (Green, Yellow, Red), urgency, and whether the task touches an outward action, all in one call on the same state. Questions cannot read each other's answers, so anything that needs a search result comes after the search.
- Long lists (investors, 23-plus skills, inbox): filter in code, Jev scores the rest, then Jev chooses from the shortlist. Choice takes up to 255 options.
- Write each question so the requirement is in the question text, with evidence in separate fields from the request. Jev does not see field names.

**Step 4: Checks (section 5)**
- Prose: writing-ste lint + jev-sweep.
- Numbers: `jev-documents` against the canonical docs and reactor-calcs.
- Layout: render each PDF page (`pdftoppm`) or web page (gstack's browse daemon: screenshot plus element bounding boxes), then Jev gives the overlap verdict on the image or box list.
- Location: file exists in the right vault folder; path printed.
- Word for word: Joe's text unchanged.
- Evidence: every verify command runs inside `gstack-evidence run --label`, which records the command, exit code and file hashes. `jev-eval` reads that ledger row, never the agent's own claim.
- Prime facts (9/25): a gate is any shell command given as `--autonomous-gate <cmd>`, repeatable, with retries and a timeout; a failed gate's output is fed back to the agent to repair. So each check is a small command that gathers evidence, asks Jev, and exits 0 or 1. No Prime change needed. Reviewer subagents are `rlm.spawn` children.
- These run as Prime's autonomous gates: a job is done only when every check passes. The completion check is independent of the worker: it looks at the file, the ledger row or the diff, never at the worker's own report that it is done.
- **The check ladder (Joe, 9/24).** The supervisor (Prime) runs each check up a ladder and stops at the first rung that answers with confidence:
  1. Code gathers the evidence: render the PDF, diff Joe's text, pull every number from the draft and from the canonical doc, list the files written. No model.
  2. Jev answers typed questions on that evidence: overlap yes/no, number matches yes/no, claim supported by source yes/no, score against the rubric. About 200 ms, near free. Most checks end here.
  3. If Jev abstains or its confidence is under the threshold, or the question needs reading (does this paragraph derive its result or assert it; does this deck section match what Joe said on the call), the supervisor spawns one LLM reviewer subagent with a narrow brief. It returns findings in a fixed form: claim, where in the document, the evidence it relied on, severity. It never rewrites anything.
  4. Jev judges each finding: real or not, blocks "done" or not, and whether to pass, send back for a fix, or escalate to Joe. Only confirmed findings reach the worker or Joe.
- Reviewer subagents are the only rung that spends subscription tokens. They run on the cheaper model tier, or on the other subscription from the one the worker used, so a check never drains the cap it is protecting. Several reviewers can run at once on different checks.
- Every rung writes to the decision log: evidence used, question asked, answer, confidence, and what happened next.
- Test: each check catches a real past mistake from the inventory.

**Step 5: Safety**
- Prime facts (9/25): the `tool_call` event can block a call or rewrite its arguments, and any handler can await `ctx.ui.confirm` with a timeout, so the approval gate is one handler. The `input` event can rewrite a paste before the model sees it, which is where the scrubber runs. `pi.exec` calls gstack's scripts. Prime has no permission mode of its own and no dollar or action-count limit (its limits are continuations, turns, tokens and time), so those two counters are written. On restart Prime avoids replaying uncertain side effects and keeps a recovery journal of tool starts and ends; the resume step reads that journal to show Joe the last completed action.
- Approval gate on every outward action (section 6). Build it from gstack's `check-careful.sh` and `check-freeze.sh` (standalone bash; Prime needs a small hook adapter). Add Laurelin's outward patterns (deploys, merges, email sends, posts, payments) to `~/.gstack/careful-patterns.txt`. Log each approval in the `gstack-egress` receipt format.
- Secret scrubber on everything Joe pastes: `gstack-redact` (44 patterns, exit code 3 blocks).
- Refusal flags for the requests listed in section 7.
- Classification carried as a label (see section 8 item 7); no routing by it in version 1.
- Limits on every autonomous run: an action count, a spend cap, and saved progress after each action. On resume after an interruption, the harness inspects the last completed action before repeating anything, since a confident answer cannot prove a file was saved or a message was sent.
- Test: a fake send stops for approval; a pasted fake key is caught; a run stops at its action limit and resumes without repeating a step.

**Step 6: Test set**
- The 20 jobs are in section 15 (chosen 9/24). Run them and score them with `jev-eval`. This is the baseline.
- The runner is `prime-agent -p --mode json` per job. Prime stores tokens and cost on every assistant message and folds child cost into the parent, so cost per job comes from the session file.
- Use the decision log from these runs to set the confidence threshold per decision type. The 0.6 default is a guess; confidence is not an accuracy percentage, so each threshold comes from labeled examples.
- Correction counting comes from agent-beacon's single event stream once it is installed (section 16). Until then, the prompt inventory needs no separate copy (9/24). It was built from files the tools keep anyway: Claude Code's `~/.claude/history.jsonl` (every prompt) and `~/.claude/projects/` (full transcripts), Codex's `~/.codex/history.jsonl` and `~/.codex/sessions/`. Rebuild it from those when Step 3 or Step 6 needs it. Prime and pi keep their own sessions under `~/.prime/agent/sessions/` and `~/.pi/agent/sessions/`.

**Step 7: First real job area: fundraising documents**
- Decks, memos and applications, end to end, through the checks and the approval gate.
- Build memos and applications with gstack's `make-pdf --strict` (fails on missing images).
- Test: Joe's correction count on these jobs drops against the past year. Count it from the beacon stream, which sees every tool.

**Step 8: Expand in order**
1. Investor research and email drafting (`jev-triage`, fastbrowse, context.dev).
2. Engineering documents (ANOR drawing sets, spec sheets).
3. Vault upkeep.
4. Websites and media.
5. Operations and side projects.

**Step 9: Memory**
- Moved to Step 1d on 9/24. Polygres dropped (section 11).

**Step 10: Learning loop**
- When Joe corrects the agent, it drafts a new rule and check. Joe approves or rejects it. The test set reruns to confirm nothing broke.
- Prime facts (9/25): Prime's `/refine` reviews a session and writes small edits to a persisted store of prompt notes, memories, skill descriptions and subagent specs, with before-and-after snapshots for rollback. It is an LLM proposing memories, with no approval gate, no check, and no test rerun. The `session_before_refine` hook lets the harness replace that planner with its own flow: Jev detects the correction, the harness drafts the rule and its check, Joe approves, the rule lands in Prime's store as a prompt note or memory (so rollback is free), and the test set reruns.
- Approved rules are stored with `gstack-learnings-log` and recalled with `gstack-learnings-search` at the start of each job. Jev writes the check.
- Corrections are detected in the beacon stream (a prompt that follows an agent reply and Jev classifies as a correction), so the loop sees corrections made in Claude Code or Codex directly, not only inside `laurelin`.

## 11. Current state (as of 2026-09-24)

Built on 9/23 before the plan-only decision. All of it can be kept or undone.

- **Laurelin package:** `~/laurelin-harness/pack`, registered in Prime. Holds links to writing-ste, laurelin-reactor-calcs, fastbrowse, jev, humanizer and sync-gbrain. Not yet confirmed to load (no working model call).
- **Duplicate skills:** Prime also has its own copies of fastbrowse, jev and humanizer in `~/.prime/agent/skills`. Remove them once the package load is confirmed.
- **gbrain:** upgraded to 0.54.1. Holds the safe vault copy (3,766 notes, refreshed 9/23). Meaning-based search runs locally and free (Ollama, snowflake-arctic-embed2). 4,960 of 13,178 sections are embedded. Running `gbrain migrate embeddings --to ollama:snowflake-arctic-embed2 --dim 1024 --yes` again finishes the rest.
- **gbrain limit:** 12 `gbrain serve` processes (one per Claude or Codex session) share one database file that only one process can use safely at a time. Fix: one shared server on real Postgres.

### Model access

| Route | Status |
|---|---|
| Claude subscription | Works in Claude Code (the worker, over ACP). Prime's own Claude sign-in also works for fable-5-1, but it identifies as Claude Code, is billed as extra usage per token, and Prime 0.9.6's changelog warns it can get the account restricted. Not used for the coordinator. Opus 5.5 fails with "Claude Code 2.1.261 does not support this model"; pi 0.87.1 fixed this and Prime gets it when it merges that release |
| ChatGPT subscription | Works in Codex (the worker, over ACP) and in Prime's `openai-codex` sign-in (228 logged calls to gpt-6-astra). Coordinator runs here. One cap covers both, and the log shows it was hit on 9/21 and 9/22. The subscription does not cover the OpenAI API |
| OpenAI API key | Valid, but the account has $0 credit. Stored in `~/.config/agent-keys/env` |
| Venice | Lists claude-opus-5-5. The key hit its spending cap; raise it in the Venice dashboard |
| OpenRouter | Prime holds a free-tier key. Free models are rate-limited per day and one already refused. Light use only |
| Jev (TypeSafe) | Works. Needs only `TYPESAFE_API_KEY` (in `~/.zshrc`). No OpenRouter |
| fastbrowse | Works. Jev + GPT on the ChatGPT subscription through the Codex sign-in (`FASTBROWSE_CODEX_TOKEN_CMD`). If the token expires, run `codex` once |
| Anthropic API key | None exists |
| Local (Ollama) | Running on the Mac. Has the embedding model only. The two chat entries in Prime's `models.json` are stale. No chat model will be pulled: Joe says it slows the Mac (9/24). No local fallback for the coordinator |

### Subscription-only coordinator (checked 9/24)

Joe's rule: fund nothing new; it must run on subscriptions, or explain why not. It can.

| Route for the coordinator | Status |
|---|---|
| ChatGPT sign-in in Prime (gpt-6-astra, gpt-5.6-sol, gpt-5.5) | Works now. Chosen. Shares the Pro cap with the Codex workers |
| Claude sign-in in Prime (fable-5-1, opus-5, sonnet-5) | Works now, but spoofs Claude Code and is billed as extra usage. Ruled out by the 9/24 decision |
| Local Ollama chat model | Declined 9/24: it slows the Mac. When the ChatGPT cap is hit, the coordinator waits |
| OpenRouter free models | Light use only |
| Prime Inference, Venice, OpenAI key | Pay per token. Not funded |

Prime's provider system stays whole in the `laurelin` command. Sign-ins: ChatGPT, Claude, GitHub Copilot, xAI. Keys: about twenty providers, as a literal, an env var name or a shell command. Custom: any server that speaks the OpenAI, Anthropic or Google API, through `~/.prime/agent/models.json`.

### Memory and search options

- **gbrain:** the full system. It reads the vault, keeps it in sync, and gives agents search and memory.
- **Polygres** (polygres.com): skipped on 9/24. Its credits cannot host gbrain (Step 1d). It is a managed Postgres service by Evokoa with two open-source extensions, pgGraph (graph walks over foreign keys) and pgContext (filtered vector plus text search). gbrain already does keyword, vector, hybrid and graph search on its own tables and has no code path that calls either extension, so installing them changes nothing. Revisit only if gbrain ships a pgGraph engine. The hosted platform is not open source and has no self-host docs. Do not use it for vault content.
- **Plain vault search:** agents read the vault folder directly. Slower and exact-words only, but it needs no upkeep.

## 12. Possible open-source release (later)

Decision (2026-09-24): internal tool first. Do not sell it and do not put it on the Laurelin website.

Direction added later on 9/24 (Joe): this is likely to spin out as a **Jev-native harness**, the "co-founder in a box". The gates below stay: internal use first, then release. What changes now is the build: from day one the generic layer (launcher, router, checks, approval gate, scrubber, correction loop, decision log) must run with no Laurelin content, memory must be a separate service behind MCP, and every decision must go through the one Jev layer so it can be inspected, priced and swapped. The Laurelin package is then one tenant of the harness. The spin-out question itself is revisited after the internal run, with the test-set numbers in hand. TypeSafe, Prime Intellect and the keel authors are the natural first conversations.

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

- Joe approves the first copy of the safe vault set to the GCP machine when Step 1d runs.

Closed 9/24: approval list (all outward actions wait), scope (academic writing in, Dynamo out), model funding (none, ChatGPT sign-in runs the coordinator), secret rotation (declined), no Ollama chat model, gbrain in version 1 pinned at 0.54.1 as one shared server with thin clients, Polygres skipped, no separate prompt-inventory copy, gstack pieces adopted (section 17), outside services placed (section 16), test set chosen (section 15).

## 15. Test set (chosen 9/24)

Twenty past jobs with an accepted result on disk. Vault paths are relative to `Laurelin/` in the vault. Firm, partner and vendor folder names are left out here; the real names are in the vault folders. Check letters: A prose, B numbers, C layout, D location, E word for word, F evidence, G vault first, H outward action, I headless.

| # | Job | Group | Accepted result | Checks | What went wrong the first time |
|---|---|---|---|---|---|
| 1 | General deck v4 rebuild (8/22) | Fundraising | `Investor Research/_circulating-decks/Laurelin-General-Deck.pdf` | A B C D G | 21 slides of slop; three stale claims; deck left in the build folder, not filed |
| 2 | Deck numbers pass (8/21) | Fundraising | `Deck Rewrite 2026-08/PLAN.md` | B G | Retired figures in three live docs; agent cited stale memos as the source |
| 3 | Whitepaper memo in LaTeX (8/22 to 8/30) | Fundraising | `Deck Rewrite 2026-08/Laurelin Deck Memo.pdf` | A C D E | Agent changed Joe's prose and claims |
| 4 | Deck v7 from a call transcript (9/9, 9/17) | Fundraising | `Investor Research/_circulating-decks/Laurelin-General-Deck-v7.pdf` | B C E F H | Ownership row misread; a discrepancy resolved instead of flagged |
| 5 | Investor follow-up answers (9/2) | Fundraising | `investors/<firm>/<partner>/Reply Draft — 2026-09-02 — Joe edits before send.md` | A B G H | Slop before the STE pass; stale figure and advisor status from memory |
| 6 | Due-diligence binder and short deck (7/10, 8/5) | Fundraising | `Investor Research/<accelerator>/Due Diligence/` binder PDF and markdown | A B C D | Salary talk in the FAQ; de-slop pass ordered |
| 7 | Grant application draft (8/22) | Fundraising | `Investor Research/<grant fund>/Application — Round 1 2026-08.md` | A D G H | Stray top-level folder created |
| 8 | Accelerator portal application (9/17) | Fundraising | `Investor Research/<accelerator 2>/Blueprint II Application - Answers.md` | A F H I | Visible browser used for a bot check |
| 9 | Yang-Mills Paper IX (12/2025 to 1/2026) | Academic | Drive: `Writing/Yang-Mills/Paper IX - Mass Gap/main.pdf` | C D E F | Equations and figures off the page; deleted a section instead of commenting it out; asserted instead of derived |
| 10 | Large-N gravity arXiv paper (2/2026) | Academic | Drive: `Writing/On Large-N Sparse CFTs .../sn-article-v3.pdf` | A C F I | Drafted into a side file, not the paper; no log; visible window |
| 11 | Oxford thesis (12/2025 to 2/2026) | Academic | Drive: `Writing/OxfordTeXThesis/Oxford_Thesis.pdf` | C E F H | References missing; figures not the exact ones; overnight auto-approve asked for |
| 12 | Vendor requirements matrix and classification guide (8/20) | Engineering | `Organizations/<vendor>/... Disclosure Matrix.md`, `Classification/Laurelin Classification Guide.md` | B D G | Wrong letterhead; did not read the vault |
| 13 | Tritium memo in house style (9/23) | Engineering | `tritium/Issued Documents/` PDF | A B C D | |
| 14 | Reactor page label overlaps (5/11) | Websites | `~/Laurelin_YC_Website/app/reactor/page.tsx` | C H | Still overlapped; pushed without asking |
| 15 | Site art refresh and careers page (8/28) | Websites | `~/laurelin-beautiful-website/app/careers/page.tsx` | A E F H | Deleted existing roles; production promote needs approval |
| 16 | Neon billing cleanup (9/9) | Operations | `WORK-LOG 2026-09-09 — Neon billing cleanup ...md` | B F H | Deletions and a support request are outward actions |
| 17 | Model data questions (9/17) | Investor research | Evidence notes under `tritium/` | I | "Stop using a browser window", three times |
| 18 | Vault index rebuild (9/22) | Vault upkeep | `Company Brain/Vault Index/Overview.md`, `00 Vault Index.md` | D F G | |
| 19 | Club application PDF (8/19) | Personal | Filled PDF under `~/Documents/Members Clubs/` | D E F | Wrong school order; wrong email of record |
| 20 | Video script with provenance (7/24) | Media | `~/orca/workspaces/Laurelin-PR/video-production/outputs/` script and provenance file | A F | |

Coverage: every check has at least three jobs. Headless-only (I) is thinnest with three. Not verified: note names for job 17, content of job 20, and three academic folders from the inventory that are gone or renamed on Drive.

## 16. Outside services loaded on demand (reviewed 9/24)

Joe asked that context.dev and boat.dev run natively in the harness when needed. Neither is a skills library. Both plug in through Prime's own loaders: `prime-agent mcp` for tool servers, `prime-agent package` and the shared `~/.agents/skills` folder for skills.

| Service | What it is | Account | How it loads | Harness use |
|---|---|---|---|---|
| context.dev | Web data API: scrape, crawl, search, structured extraction, company and people lookups, news, file parsing, site change monitoring. Hosted MCP server at `https://mcp.context.dev/mcp` plus one skill (`npx skills add https://docs.context.dev --skill context-dev`, lands in `.agents/skills/context-dev/`) | Key exists (`CONTEXT_DEV_API_KEY` in `~/.zshrc`; move it to `~/.config/agent-keys/env`). Free tier: 1,000 credits a month | Register once with `prime-agent mcp`; the Jev router picks it for research tasks | Step 8.1 investor and firm research beside fastbrowse. People lookups send a name to a third party, so Yellow and Red contact data stays out |
| boat.dev | Cloud Linux machines for agents, with desktop, Chrome, Docker, snapshots and forks. `boat prompt` runs Claude Code, Codex, pi, OpenCode or Prime inside one | CLI 1.0.9 installed, account set up. Paid per second | Step 2 remote worker | Heavy jobs off the Mac; headed-browser jobs; throwaway test machines |
| Polygres | Managed Postgres with graph and vector add-ons | Credits exist per Joe | Not loaded | Cannot host gbrain (Step 1d). No use in version 1 |
| agent-beacon (Asymptote Labs, MIT, Go, 1.5k stars, active) | A local daemon that records every session from Claude Code, Codex, pi, Prime, Hermes and about 20 other agents into one event stream (`~/.beacon/endpoint/logs/runtime.jsonl`): prompts, replies, tool calls, commands, file edits, approvals, MCP calls, token use. CLI `beacon traces` and a local dashboard | None needed in local mode. Install is Homebrew, so Joe approves it | Runs once as a background service; each agent is hooked or polled | Steps 6, 7 and 10: one stream to count corrections across every tool, to feed the learning loop, and to fill the cost line in the footer (Step 1c). Replaces the hand-built prompt inventory. Rules: local mode only, never the managed forwarding (rule 8); the scrubber must run on its log too, since it is one more plain-text copy of every prompt. Whether beacon redacts secrets itself is not verified |

## 17. gstack pieces to reuse (reviewed 9/24)

gstack (v1.71, `~/.claude/skills/gstack`) is prompt workflows backed by about 80 binaries and persistent state in `~/.gstack/projects/<repo>/`. The Jev skills are three CLIs plus prompt workflows with no state. Rule: gstack keeps records and gates; Jev makes every judgment.

| Plan need | Verdict | Use |
|---|---|---|
| Prose check | Jev better | `jev-sweep`. gstack's slop scan is for code diffs only |
| Layout check | Complementary | browse daemon or `pdftoppm` renders and measures; Jev judges |
| "Done" evidence | Complementary | `gstack-evidence` proves a command ran; `jev-eval` judges whether it supports the claim. Stronger against fake results because the ledger is not a judgment |
| Browser | Complementary | fastbrowse for lookups and forms; browse daemon for QA screenshots and assertions |
| Learning loop | gstack better for storage | `gstack-learnings-log` and `-search`, with confidence decay and pruning. Jev writes the check |
| Approvals and safety | gstack better | `check-careful.sh`, `check-freeze.sh`, `gstack-redact`, `gstack-egress` receipts. Hooks are in Claude Code format; Prime needs a small adapter |
| Decision log | gstack | `gstack-decision-log`, `gstack-decision-search --semantic` (uses gbrain) |
| Reviewing this plan | gstack only | `/autoplan`, `/plan-eng-review`, `/review`, `/codex` for a second model's opinion |
| PDF build | Complementary | `make-pdf --strict` builds; `jev-documents` checks numbers |
| Interface QA (Step 1c) | Neither | `/qa` and `/design-review` drive web pages; Step 1c is a terminal UI |
| Open-source release (section 12) | gstack | `/cso` before any push |

Two cautions. gstack keys its state by repo, so run the harness from one repo. gstack's artifact sync can push learnings to a private sync repo if consented; private Laurelin content must never enter `~/.gstack/projects/`.

## 18. Jev decision catalogue (9/24)

Joe: the plan underweights Jev. This section lists every point in the harness where a typed decision happens, grouped by where it sits in the loop. Each is a Jev question with a confidence, a threshold and a log line. The ones marked **new** were not in the plan before 9/24. Steps in brackets say where each lands.

**1. The supervisor's own loop.** Today an LLM decides what to do next between every tool call. Here the loop itself is Jev-driven and the LLM is called only to create something.
- Next action each step, from a menu rebuilt from the current state: continue, call a worker, spawn a reviewer, ask Joe, stop. [Step 3] **new**
- Is the goal met? Stop early? Is this a loop (the same action repeating)? [Step 5] **new**
- Escalate or continue: is this worth interrupting Joe for? [Step 5] **new**
- Which queued job runs next, and which to pause when a cap is near. [Step 1b `laurelin agents`] **new**
- How much to spend on this job: a score of value and difficulty sets the action and spend limits. [Step 5] **new**

**2. What goes into the context.** These replace LLM reading and cut tokens directly.
- Compaction: score every old tool result, drop the stale ones. [Step 2]
- Retrieval rerank: gbrain returns 50 candidates, Jev keeps the 5 that matter. Replaces an LLM rerank and shrinks the context. [Step 1d] **new**
- Skill selection: score every installed skill's description against the task; load only the top few of the 100-plus. [Step 3] **new**
- Vault note selection and learnings recall: which notes and which past rules are relevant to this job. [Step 10] **new**
- Model tier: cheap or strong model for this task. [Step 2]

**3. Before any LLM sees the prompt.**
- Intent of Joe's message: new task, steer, correction, question, approval. Drives the learning loop trigger and the router. [Step 3] **new**
- Classification of the material: Green, Yellow, Red. [Step 5]
- Refusal-path detection against the section 7 list. [Step 5]
- Secret detection beside the regex scrubber: does this token look like a key in context? [Step 5] **new**
- Route: worker, skill, urgency, outward-action flag, in one parallel call. [Step 3]

**4. After the LLM produces something.**
- The check ladder: prose, numbers, layout, location, word for word, evidence. [Step 4]
- Readiness: ready for Joe, ready to send, ready to publish. Three separate questions. [Step 5]
- Writing stays with the strongest model. Joe (9/24): no cheap-model variants picked by Jev; the best writer writes once. Jev may still pick between two strong-model drafts when Joe asks for options, and it judges the result, never the writer. [Step 7]
- Cross-document consistency: does the deck claim match the memo claim, sentence against sentence. [Step 4] **new**
- Audience fit: does this draft suit this reader (a seed investor, a DoD program, a journal editor). [Step 7] **new**
- Reviewer findings: real, blocking, pass, fix or escalate. [Step 4]

**5. Jobs at a scale where an LLM is too slow or too costly.** Jev does thousands of items in seconds for cents.
- Live labeling of every prompt in the beacon stream: job group, intent, correction or not. The 7,237-prompt inventory becomes a running number instead of a one-off. [Step 6] **new**
- Investor research: score hundreds of firms and partners against the thesis, classify news, rank follow-ups. [Step 8.1]
- Inbox and CRM triage. [Step 8.1]
- Vault upkeep: classify every note into its folder, flag duplicates, score candidate wikilinks. [Step 8.3] **new**
- Physics literature: classify and rank papers by topic and relevance for the academic work. [Step 8] **new**
- Engineering documents: every BOM line and spec-sheet value checked against its source, claim by claim. [Step 8.2] **new**
- Grant and program matching: score programs against Laurelin, rank by fit and deadline. [Step 8.1] **new**

**6. Browser and desktop.** Jev picks the next click from the live page; a small model types when a field needs text. [fastbrowse, jev-act]

**7. Learning and testing.**
- Rules become criteria, not prompt text. When Joe corrects the agent, the loop edits the criteria of a Jev question, so the rule is enforced by a typed decision rather than hoped for in a prompt. [Step 10] **new**
- Threshold calibration per decision type from the decision log. [Step 6]
- The test set reruns at decision level in seconds, so a rule change is checked against every past decision before it lands. [Step 6, Step 10] **new**

**8. Several workers at once.**
- When two workers disagree, rerank their outputs. Detect duplicated work. Pick which result to keep. [Step 2] **new**

**What Jev cannot do, so the harness must.** It writes nothing and explains nothing. It sees only the state the harness puts in front of it, so every question needs the evidence gathered first (rung 1 of the ladder). Confidence is not accuracy; thresholds come from labeled examples. Calls are about 200 ms, so a long serial chain adds up; independent questions go in one parallel call. Choice takes up to 255 options, so long lists are filtered in code first.

**Why this is the spin-out.** The generic layer of section 12 is this catalogue: a set of typed decisions with logs, calibrated thresholds and a test set, that any harness can call. The labeled decision log from real use is the part nobody else has.

## 19. Build size (revised 9/25 after reading Prime)

Four readers went through Prime's docs (36 files) and its compiled source. Joe was right: Prime already has most of the machinery. What follows replaces the first estimate. "Prime has" is reused as is. "Write" is code this repo owns.

| Step | Prime has | Write | Size |
|---|---|---|---|
| 1 skills home | Package loader; skill folders including `~/.agents/skills` and the Claude and Codex skill paths | Link script; the rules file (prose) | Small, about 50 lines |
| 1b `laurelin` | `-e <pack>`, `-p`, `--mode json`, `--autonomous`, `agents`, `attach`, `send`, `schedule` | Thin wrapper that sources the key store and forwards flags | Small, 60 to 100 |
| 1c interface | Theme JSON; footer, status, widgets, overlays, confirm; custom view for the title screen | Theme file; one extension: badge in the footer, checks widget, approvals overlay, title screen | Medium, 350 to 500 |
| 1d memory | `mcp add remote`, `mcp.call_tool` from the kernel | VM service files; sync script for the safe copy | Small, 100 to 200, plus VM ops |
| 1e keys | `auth.json` with env-var and `!command` values; sign-ins that refresh | `laurelin keys add`, `list`, `check` | Small, 80 to 150 |
| 2 workers | Native subagents (`rlm.spawn`, parallel, per-child model, cost attribution); `context` hook for pruning; `complete()` for one-shot calls | `delegate_worker` tool over `claude -p` and `codex exec` (150); `call_model` (30); Jev pruning handler (60); compaction hooks inside Claude Code and Codex | Medium, 250 to 400 |
| 2b ACP client | The SDK's client half is bundled | Spawn the adapter, implement the client side, forward permissions to `ctx.ui.confirm` | Medium, 300 to 500, later |
| 3 router | `input` and `before_agent_start` hooks; `getAllTools` for the live menu; `appendEntry` for the log | Menu builder, parallel Jev call, allowed-choice check, abstain | Medium, 200 to 300 |
| 4 checks | Shell gates with retries and fed-back output; `rlm.spawn` for reviewers | Six gatherer commands and their Jev questions; ladder logic | Large, 600 to 900 |
| 5 safety | `tool_call` block, `ui.confirm`, `input` rewrite, `pi.exec`, token and turn and time limits, no-replay recovery with a journal | Pattern lists; Jev refusal and classification calls; dollar and action counters; resume step that reads the journal; egress receipts | Small to medium, 150 to 250 |
| 6 test set | `-p --mode json`; cost on every message | Runner, scoring, calibration; 20 job specs (prose) | Small to medium, 150 to 200 |
| 7 fundraising | Skills and prompt templates | Wiring | Small, about 100 |
| 10 learning loop | `/refine` store with rollback; `session_before_refine` to replace its planner | Correction detection, rule and check draft, approval, test rerun | Medium, 200 to 300 |
| Total | | | About 2,000 to 3,200 lines without the ACP client, 2,300 to 3,700 with it. The first estimate of 3,000 to 5,000 assumed Prime lacked subagents, gates, hooks and budgets |

**Smallest useful build.** Steps 1, 1b, 1e, the `delegate_worker` tool for Claude Code, a fixed two-option router, the prose and evidence gates, and the approval and scrubber handlers. About 1,000 lines. It delivers the first fundraising document through the checks and the gate.

**Where the risk sits now.** The layout check (measuring overlap on a rendered page) and the title-screen image test. The ACP client is no longer on the critical path.

**What Prime does not have, so the harness owns it:** an ACP client, a decision log, a check store, a test-set rerun, a dollar or action-count limit, a permission mode, terminal images (to be tested), and a key command.

**What is not code.** The rules file, the 20 job specs, and the text of every Jev question and its criteria. As long as the code.

### The pi hedge, checked 9/25

Survives a move to plain pi: the theme format, footer and widget and overlay APIs, the package format and folders, skill folders including `~/.agents/skills`, prompt templates, `auth.json` with `!command` keys, `-p`, JSON and RPC modes, the SDK, the separate settings folder variable. pi also draws terminal images.

Prime only: ACP server mode, daemon and resident workers, `--goal`, the `--autonomous` flags and gates, `schedule` and `agents` and `attach` and `send`, the Python kernel with `rlm.spawn`, Prime Inference sign-in. The harness leans on the gates, the subagents and the daemon, so a move to pi would mean writing those three, not the launcher alone. The hedge is weaker than section 2 says and is now recorded as such.

Versions: pi 0.79.4 installed, 0.87.1 latest, and 0.87.1 carries the Anthropic sign-in fix and Opus 5.5 that Prime 0.9.5 lacks. Prime gets them when it merges that release.

## 20. Build log (from 2026-09-25)

**Wave 1, 9/25.** Six child branches built in parallel by Claude Code sessions in Orca worktrees, each from a brief in `docs/briefs/`, each with a test, all merged into `ideation` in step order with every test passing on the merged tree (`tests/run-all.sh`). A `testing` worktree is cut for Joe. Nothing outside the repo was changed. No key values and no private content found in review; three vault pointers that named an investor firm and two advisers were made neutral after review.

What each piece does now:
- **pack** (Step 1): twelve skills as links into `~/.claude/skills`; `bin/link-skills.sh` prints the linking commands and applies them only with `--apply`; `pack/rules/laurelin.md` (generic rules, twelve sections) and `pack/rules/VAULT-RULES.md` (template for the private half, to live at `Laurelin/LaurelinOS/Harness Rules.md`). A `laurelin-rules` extension appends both to the system prompt each turn.
- **launcher** (Steps 1b, 1e): `bin/laurelin` sources the key store, starts Prime with the pack, the theme and every executable gate on `--autonomous`, defaults the model to `openai-codex/gpt-6-astra` (override with `LAURELIN_MODEL` or `--model`), skips `-e` when Prime's settings already list the pack, and sets `GSTACK_PROJECT_SLUG`. `laurelin keys add|list|check` never shows a value. `PRIME_AGENT_CODING_AGENT_DIR` confirmed to move Prime's settings folder.
- **interface** (Step 1c): themes `laurelin` (dark) and `laurelin-bone` (light); `laurelin-ui` extension with footer badge, checks widget, approvals overlay, title screen; commands `/checks demo|reset`, `/approvals demo`, `/approvals`, `/classify`, `/title`. Other extensions talk to it through `pi.events` (`laurelin:check`, `laurelin:classification`, `laurelin:worker`, `laurelin:approval`). Image draw in Ghostty unverified; `LAURELIN_NO_IMAGE=1` forces glyphs.
- **workers** (Step 2): `delegate_worker` over `claude -p --output-format stream-json` (prompt on stdin; outward tools denied) and `codex exec --json` (workspace sandbox); `call_model`; `laurelin-context` prunes old tool results with Jev (drop when score under 0.5 at confidence 0.6 or more, threshold `LAURELIN_CONTEXT_THRESHOLD`).
- **gates** (Step 4): `prose.sh` (jev-sweep, hits at 0.70 or more fail), `location.sh`, `verbatim.sh`, `evidence.sh` (gstack-evidence row plus one Jev Noul question, fail under 0.6); `numbers.sh` and `layout.sh` are stubs. Output shape `<check>: pass|fail, <why>`; every run appends to `decision-log/gates.jsonl`.
- **safety** (Step 5): `laurelin-approvals` (`tool_call` handler, patterns in `pack/safety/outward-patterns.txt`, deny by default without a screen, receipts with a hash and a masked preview), `laurelin-scrubber` (`input` handler over gstack-redact), `laurelin-limits` (`LAURELIN_MAX_ACTIONS` 200, `LAURELIN_MAX_SPEND` 5 dollars, `/limits`), `laurelin-refusals` (warns, does not block).

Facts learned in the build: Prime's `-p` and JSON modes report a screen but answer every confirm with "no" in 0 ms, so a fast "no" is logged as `denied:no-ui`; `-p --mode json` hides extension load errors, so tests load extensions directly; Jev Choice questions take `criteria`, not `options`; `gstack-redact` cannot splice a Stripe key, so the scrubber calls its span function; global Claude Code hooks add about 62,000 system-prompt tokens to every worker call.

**Wave 2, 9/25, merged the same day.** Five more branches, all tests passing on the merged tree (eleven tests, `tests/run-all.sh`):
- **bridge**: `.laurelin/task.json` in the working folder holds target, claim, original, canonical, classification; `set_task` tool and `/task` command write it; `bin/laurelin --target --claim` write it before start; gates read it when their variables are unset and skip (exit 0) when an input is missing; `laurelin-bridge` polls the gate log and lights the checks panel; approvals and worker events are live. The confirm dialog stays the decision point.
- **worker-settings**: Claude Code workers run with `--safe-mode` plus `pack/worker/claude-settings.json`: 134,446 to 34,697 input tokens on the same task (74 percent cut). `--bare` and a separate config folder both lose the subscription sign-in. Codex workers run with `--ignore-user-config` (83,133 to 39,044) and no longer start `gbrain serve` through the user MCP config.
- **gates2**: `numbers.sh` (Jev per number against a canonical file, unverified numbers fail unless allowed) and `layout.sh` (`pdftotext -bbox-layout` overlap and overflow, Jev confirms flagged pages).
- **router**: one Jev call per message with five parallel questions (worker, skill, class, outward, intent), abstain under threshold, allowed-choice check, three logs including Prime session entries and gstack's decision log, 20 of 20 on the fixture cases. Runs in `before_agent_start` so the scrubber sees the text first.
- **testset**: 23 specs (3 synthetic enabled, the 20 from section 15 disabled until Joe stages their inputs), `run.sh` through `-p --mode json` with gates, Jev rubric scoring and cost from the session, `baseline.md` committed, `calibrate.sh` prints confidence tables.

**Hard fork, 9/25.** Prime's source is in this repo under `agent/` as a git subtree (0.9.6), manifest name `laurelin`, own background-service socket, built by `bin/build-agent.sh` in about ten seconds. The launcher prefers the built fork. First fork change: gates always rerun when a task file exists (Prime skipped reruns while the git tree was unchanged, which blocked every target outside git, including the vault).

**Policy point from review, closed 9/25 (Joe):** Jev is an approved vendor for every classification. The router and the scorer send text to Jev regardless of label. The earlier interim bypass for red tasks is removed. Section 8 item 7 now reads as a label, with the endpoint setting as the plug-in point for a restricted Jev later.

**Wave 3, item 1 landed 9/25: investor-research.** `pack/skills/investor-research/` holds the method (the vault playbook's ten steps with tool, output and prohibitions per step), placeholder templates for the five note types, the Jev fit set (one Score for the A to D grade, three Nouls for fee-for-intro, placement agent and conflict; under 0.6 prints `unverified`), one status vocabulary for new writes (the ten dealflow states plus `research-only / no outreach sent`; detail in `status_note`, priority in `tier`), and a follow-up triage that ranks firms by a Jev attention score and proposes `stale` after 30 days waiting, never writing. `pack/gates/investors.sh` is the validator the playbook asked for: file facts only, no Jev; required keys are the five the corpus actually carries, the other ten are notes; a URL line passes with a date on the line or its heading, or `not publicly verified`; an address needs `email_status` or a verification marker; `Index.md` is accepted with a note. Test builds two invented firms and never reads the vault.

Findings for Joe: the real corpus fails the validator today (many problems, mostly undated facts, missing keys, unmarked addresses and roster gaps; the exact counts are in the gate log, not here). Decide between a one-time dating pass and a legacy mode for the gate. The Hunter key must move from the vault note into the key store (`laurelin-agent keys add HUNTER_API_KEY`). Triage confidence is low until labeled examples exist. Four CRM notes could not be read from the build sandbox, so the skill was not checked against the CRM schema; the merge owner does that next. context.dev's skill is not installed; the skill falls back to fastbrowse.

**Wave 3 additions (Joe, 9/25 evening):**
- **deck-design skill**: maps how Joe designs decks today (Style Guide notes, the deck kit, the visual system, the circulating-decks register), pulls the current visual style automatically, reads the current deck, applies the aesthetic changes Joe describes, and files a new version through the layout, numbers, prose and verbatim gates. Research first, then a brief.
- **Skill packs**: survey marketing, SEO and research skill packs on the web and adopt rather than write where a good one exists. Use the Karpathy skills (`github.com/multica-ai/andrej-karpathy-skills`) throughout. Survey first, then a curated install list for the pack.
- **Memory, revised**: the Obsidian vault stays the source of truth. Joe (9/25 night): Polygres is not a clone of the vault, it works with it: a derived index of sections and link edges that answers with vault paths, and the note itself is read from the vault. Polygres returns as the hosted search and graph layer over that derived set, through its own skills and SDK rather than through gbrain (Joe has credits and asked for it; the copy leaving the Mac is his decision, recorded here). Memory retrieval is autoloaded: a `laurelin-memory` extension queries the vault and Polygres at the start of every task and injects the top hits, the way the rules extension injects the rules. The 9/24 finding that Polygres cannot host gbrain still stands; this is a different use.

**Skill-pack survey, 9/25 (details in `docs/briefs/skill-packs.md`).** Adopt: coreyhaines31/marketingskills (the one general pack, no keys), exa-labs and firecrawl skills (free tiers, keys), K-Dense literature review and paper lookup (open APIs), a deep-research skill, two B2B writers, and four SEO folders. Skip five packs for breadth, paid hooks or staleness. The Karpathy repo is one behaviour skill, already installed twice; it has no memory features, so "with the vault and Polygres" means: always on for behaviour, memory elsewhere. Polygres: its skills, SDK, CLI and a hosted read-only MCP exist; no markdown importer; the free tier fits the whole safe vault copy.

**Deck research, 9/25 (details in `docs/briefs/deck-design.md`).** Two visual systems exist; the current deck (v8-NVS, 9/23) is in the new Laurelin Visual System, built by a generator that lived only in a temp session folder. Rescued to `~/laurelin-deck-kit/lrl-v8-rescued-20260925/`. Decision (Joe's words, "the visual style we use now"): LRL-DS is current, the kit's cream system is legacy. The deck kit's doctrine copies have drifted from the vault on six notes. The skill pulls the live style at run time, builds from a copy JSON, runs the layout, numbers, prose, verbatim and a new deck gate, files into the real circulating-decks directory, and registers versions in a machine-readable file beside the banner. Figure conflicts are flagged, never resolved.

**Wave 3 landed 9/25 (evening): metrics and deck-design.**
- **metrics**: `bin/laurelin-metrics` computes first-pass acceptance, corrections per job, cost per accepted job, time to done and gate pass rates per ISO week from the fork's sessions (and Prime's with a flag), the router rows, the gate log and test-set results. Intent per message comes from Jev, one question per message, cached by hash so each message is judged once. The footer shows `accept N% (wk)`. **Baseline measured**: over a 500-prompt sample of the year's 7,977 prompts, Jev labels 10 percent as corrections at or above 0.6 confidence (interval 7 to 13; 14 percent counting every label), against the 35 percent from the manual read in section 3. The two measure different things: the manual pass saw whole conversations, Jev saw one prompt without the reply before it. The session-based number is the one to trust from here; Joe can hand-label 50 sampled prompts to calibrate. Today's report: 58 root sessions, 67 percent acceptance overall, 2.22 corrections per job; the fork's first week reads 100 percent only because its sessions were one-turn test runs. The first real week gives the first honest number.
- **deck-design**: the skill (eight steps, LRL-DS current, cream legacy), `style-pull.py` (live tokens from the visual system into `.laurelin/style.json`, nothing committed), `build.py` (seven sheet types from the rescued generator, one accent per view, full-colour photos, NDA art only with `LAURELIN_NDA=1`), `render.mjs` (Playwright from the deck kit), `change.sh` (Jev labels a request as style, layout, copy, order, art or delivery), `register.py` (`versions.jsonl` beside the banner), `doctrine-check.sh` (refuses to build on drift), and `pack/gates/deck.sh` (page count, sheet order, no grayscale raster with line art exempt, size cap, real path not the symlink, banner fields). 46 checks pass. The build sandbox could not read the vault, so the method was written from the kit's doctrine copies; the merge owner reads the three rule notes against the skill once.

**Wave 3 landed 9/25 (night): learning-loop, skill-packs, memory.**
- **learning-loop** (Step 10): `laurelin-learn` watches each turn's end; a message the router labeled `correction` (or Jev labels one when the router is off) is logged with the output it corrects; Jev picks the kind and whether the rule is private; the coordinator drafts one rule sentence and the exact check; code routes it to a learned prose pattern (`pack/rules/prose-patterns.txt`, a new first rung of the prose gate), a line in the generic rules, a Jev criterion, or a proposal file for private rules (never the vault). `/learn` applies or rejects; apply backs up, writes, reruns the tests, reverts on regression, and stores the rule in the fork's refine store through `session_before_refine`. 35 checks. Not yet run inside a live session; the first live correction is the acceptance test.
- **skill-packs**: 23 third-party skills pinned by commit into `pack/skills/` with licences and `SOURCES.md`, plus `karpathy-guidelines`; `TIERS.md` sets 12 always-on, the rest loaded on demand; descriptions trimmed by hand to a 300-character budget; a harness note (headless, approval gate) on 18 skills that browse or send. Installer is `bin/install-skill-packs.sh` (git fetch by hash, not the `skills` CLI, which writes to agent folders and sends telemetry). `EXA_API_KEY` and `FIRECRAWL_API_KEY` are optional keys.
- **memory** (local mode only until Joe adds keys): `pack/memory/sync.py` chunks the safe vault copy (`~/.gbrain/sources/laurelin-safe`) into sections with wikilink edges, CSV for the first load and the SDK for changes, tombstones for deletes; `query.py` does hybrid search on Polygres or BM25 plus link hops locally (a 48 MB index, rebuilt on change); `laurelin-memory` decides with Jev whether a message is a task, retrieves, reranks the top 20 to 5 with one Score per candidate, and injects them before the model starts, with paths only in the log. **Joe must add** `POLYGRES_API_KEY` and `POLYGRES_RUNTIME_URL` to the key store for the hosted mode; the hosted read-only MCP registration command is in `pack/memory/README.md` and needs a browser sign-in. How the safe copy is produced from the vault is not yet written in the repo.

**Next pieces (wave 3), in order:**
0. **Fork isolation and rebrand** (9/25, in progress): the fork gets its own settings folder so the installed Prime is never touched, and calls itself Laurelin Agent everywhere.
1. **Investor skills** (Joe, 9/25; Step 8.1; brief `docs/briefs/investor-research.md`, branch started 9/25): a skill set that finds investors and partners, researches them (context.dev, fastbrowse), scores fit with Jev, and builds and keeps the investor database in the vault (`Laurelin/investors`, `Laurelin/Investor Research`), with follow-up triage. Private data stays in the vault; the skill holds only the method. Joe: the vault already has the workflow, the place and the folder structure; the skill is written to match them, not to invent them.
2. **`laurelin graph`** runner (section 21).
3. **Step 1d memory**: deferred (Joe, 9/25: no memory on the GCP machine yet). Agents read the vault directly for now.
2. **Step 7**: the first real fundraising document through the whole loop. The private rules note in the vault is distilled from the Claude memory notes that already hold the memo and design rules (Joe, 9/25), not written from scratch.
3. **Step 2b**: the ACP client for live permission forwarding, if the print-mode workers prove limiting.
4. **Learning loop** (Step 10) on top of Prime's refine store.
5. Fork branding: the fork still says "Prime Agent" in its help text and prompts; a rename pass through `agent/` when the spin-out needs it.

**Joe's own commands (rule 17), all optional:** `ln -s <repo>/bin/laurelin ~/.local/bin/laurelin`; `bin/link-skills.sh --apply`; `bin/laurelin keys add CONTEXT_DEV_API_KEY` and `GITLAB_TOKEN`, then drop those lines from `~/.zshrc`; copy `pack/rules/VAULT-RULES.md` to the vault as `Laurelin/LaurelinOS/Harness Rules.md` and fill it; move or delete `~/package.json` (it confuses gstack's repo detection) or keep the launcher's `GSTACK_PROJECT_SLUG`.

## 21. Graph rules for multi-agent runs (from Joe, 9/25)

From an essay on "graph engineering" Joe passed on. These rules govern any run in the harness that uses more than one agent (Prime's `rlm.spawn` children, `delegate_worker` calls, the test-set runner, the check ladder).

1. **Draw the graph, then cut the fake edges.** For every "and then", ask whether the step needs the previous step's result. If not, the wait is fake; run them at once. The remaining real edges set the speed limit (Amdahl: at 95 percent independent work, sixteen agents give about nine times, not sixteen).
2. **One node, one job, one contract.** A node does one bounded job and returns a fixed shape enforced by a schema, never free text the next node has to guess at. Prime's `rlm.spawn` children and `delegate_worker` results get schemas.
3. **Fan out, reduce in code, verify fresh, synthesize once.** Reduce (flatten, dedupe, filter) is plain code and costs no tokens. Verify with a separate node that never saw the worker's context, and with more than one lens; a worker grading its own work favours itself. This is the check ladder, and rung 1 is the anchor.
4. **Anchors that cannot be argued with.** A test that ran, a file that exists, a ledger row, a frozen rule. A graph is only as honest as the parts that refuse to move. The gates are anchors; Jev judges evidence, never claims.
5. **Route in code.** A model classifies; the branch taken is plain code, the same branch every time for the same input. That is the Jev router: the decision is logged, the routing is deterministic.
6. **Cheap nodes, strong nodes.** Repetitive high-volume nodes on the cheap tier; the reviewer and anything that writes rules or prose on the strong tier (section 18, Step 2). Fast checks run inline after every node; slow checks run once at the end, with errors grouped by cause.
7. **Layer the fan-in.** Never pour a thousand raw results into one synthesis; batch, summarize each batch, synthesize from summaries.
8. **Loops must go dry.** Loop-until-dry with three stop conditions stacked: consecutive dry rounds, a token budget, a max iteration count. Dedupe against everything ever seen the moment it is found, not after it is judged.
9. **Disk-first.** State lives in files, not in a conversation: the queue rebuilds from the filesystem, a crash resumes where it stopped. Prime's session files, `.laurelin/task.json`, the decision logs and the gate log are that state.
10. **Test the judge by breaking it.** Every gate has a bad fixture that must fail before the good one counts (Steps 4 and 6 already do this). Never hand-patch an output to match what a rule should have said; fix the rule and regenerate.
11. **Findings cite a rule.** A reviewer output names the rule violated. The same rule cited across three files is one badly written rule, not three problems.
12. **Shard by worktree.** Parallel agents write in separate git worktrees, and a worker's rules forbid `git stash` and `git reset` (Orca already does this; AGENTS rule 17 says the rest).
13. **Earn the fan-out.** Cap the first run small, read the usage, and ask three questions: did the fan-out find what one agent could not, did the verifier catch what the worker missed, did the result justify the cost. Only three yeses double the cap. Skip the graph for small, exploratory or step-by-step work; a single steerable agent is right there.

Where this lands: a `laurelin graph` runner in wave 3 that expresses a job as nodes with schemas over Prime's native subagents, with the reduce steps in code, the verifiers on the check ladder, and the gates as anchors.

## 22. The edge (ideated 9/25)

Joe asked what edge the "co-founder in a box" has. Honest answer: not the fork, not the terminal, not being an agent. Anyone can fork Prime in an afternoon. The edge is in four things that compound with use, and a north-star metric that proves them.

**1. It learns the founder's standards as typed checks, not as prompt text.** Every correction Joe makes becomes a rule, the rule becomes a Jev criterion or a gate, the test set reruns, and the next job cannot fail the same way. Other tools remember preferences as prose that a model may or may not honour. Here a standard is enforced by a decision with a confidence and a log line. This is Step 10 and section 18 group 7, and it is the feature.

**2. It is measured by the second prompt, not the first.** The year's data says 35 percent of prompts were corrections. Every competitor optimises how fast work starts. This harness optimises whether the first result is accepted. The north-star metric is **first-pass acceptance**: the share of jobs Joe accepts without a correction, per week, with corrections per job and cost per accepted job beside it. Beacon and the decision log measure it; nothing else in the market reports it.

**3. It ships with a company's operating procedures, not an empty box.** The investor playbook, the deck doctrine, the memo format, the classification labels, the canonical-numbers rule, the outward-action gate. The method is generic and open; the data stays in the founder's vault. A new founder gets a working company brain on day one and fills it with their own facts.

**4. It is safe to leave running.** Nothing outward moves without approval, every claim of done has a ledger row, every decision is logged with its evidence, and limits stop a run before it spends. A solo founder's real fear is the agent sending the wrong email at 3 a.m. Receipts and gates make overnight runs a normal thing.

Supporting, not decisive: subscription-only cost with Jev at cents per thousand decisions; any model, any subscription, swap when a cap hits; disk-first state so a crash resumes.

**What is not an edge, said plainly.** The generic layer is thin and competes with Claude Code, Codex, Prime and Hermes. The value is in the private content and the labeled decision log, which only accrue with use. Jev is one vendor. Prime moves fast upstream.

**What "run really well" means, in order.**
1. Instrument first-pass acceptance now (beacon stream plus the decision log), so every later change is judged by the number.
2. Build the learning loop (Step 10) before more skills. A skill without the loop is a prompt; a skill with the loop gets better every week.
3. Run real jobs, small, daily: one investor batch, one deck change, one memo section. Each correction feeds the loop.
4. Only then widen: more skills, the graph runner, Polygres.

**The spin-out pitch, in one line.** Your company's standards, enforced by decisions you can inspect, with a correction rate that falls every week and a log that proves it.

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
- 2026-09-24: Closed four open questions: all outward actions wait for Joe; academic writing in scope, Handshake Dynamo out; no new model funding, subscriptions only, Prime's any-key and any-login kept; secret rotation declined.
- 2026-09-24: Checked subscription-only running: coordinator on Prime's ChatGPT sign-in; Prime's Claude sign-in ruled out (spoofs Claude Code). gbrain in version 1, pinned at 0.54.1, on shared Postgres (new Step 1d); Polygres skipped as not additive. Added section 15 (test set, 20 jobs) and section 16 (gstack pieces). Three new open questions for Joe.
- 2026-09-24: No Ollama chat model (slows the Mac). Step 1d default is one shared `gbrain serve --http` with thin clients, no Postgres install. Prompt inventory needs no copy; it rebuilds from the Claude Code and Codex history files.
- 2026-09-24: Thin-client gbrain confirmed as the cheaper path; Polygres credits cannot host gbrain. Added section 16: context.dev as an MCP research tool, boat as a paid remote worker, Polygres unused. gstack moved to section 17.
- 2026-09-24: The one gbrain server goes on the GCP machine `laurelin-bot` so Hermes can reach it while the Mac sleeps; Vercel and Polygres ruled out. Added Step 1e, the key store design.
- 2026-09-24: Added agent-beacon (section 16) as the one event stream across all tools, for correction counting, the learning loop and the cost line. Local mode only.
- 2026-09-24: Interface follows Prime's own layout (Step 1c). From a Jev roadmap article: menu rebuilt per step, parallel questions, shortlist scoring, context compaction, model tiers, run limits and resume checks, threshold calibration. Section 8 rule: LLM creates, Jev decides, code executes; memory is a separate MCP service. Section 12: Jev-native harness spin-out direction, gates unchanged.
- 2026-09-24: Compaction hooks inside Claude Code and Codex, not only the coordinator; noted where subscription tokens actually go.
- 2026-09-24: Added the check ladder to Step 4: code gathers, Jev judges, LLM reviewer subagents only when Jev cannot answer, Jev judges their findings.
- 2026-09-24: Added section 18, the Jev decision catalogue: supervisor loop control, context selection, intent and readiness, best-of-N, scale jobs, rules as criteria, worker disagreement. Marks what was new.
- 2026-09-24: Dropped best-of-N with cheap models. Writing always goes to the strongest model; Jev judges results, never replaces the writer.
- 2026-09-25: ACP adapters confirmed (Zed's claude-code-acp and codex-acp). Model swap defined three ways in Step 2. Added section 19, build size: about 3,000 to 5,000 lines, smallest useful build about 1,500; risk in Step 2 and the layout check.
- 2026-09-25: Four readers went through Prime's docs and source. Section 19 rewritten: about 2,000 to 3,200 lines, smallest useful build about 1,000. Prime facts added to Steps 1b, 1c, 1d, 1e, 2, 3, 4, 5, 6, 10. Workers: `-p` stream mode first, ACP client second. Badge moves to the footer. Hedge to pi weakened and recorded.
- 2026-09-25: Joe said build. Status BUILD. First wave of child branches: pack, launcher (1b plus 1e), interface (1c), workers (2), gates (4), safety (5). Memory (1d) waits for Joe's approval of the VM copy. Briefs in `docs/briefs/`.
- 2026-09-25: Joe: this is a Prime Agent clone. Recorded soft clone now (package on Prime), hard fork as a later option; Prime's source is public and MIT.
- 2026-09-25: Wave 1 built and merged (section 20). Review fixes: executable-only gates in the launcher, `/approvals-log` rename, neutral vault pointers, `.jacobian` untracked, `--no-session` in tests, default coordinator model in the launcher, rules extension added.
- 2026-09-25: Joe: no GitHub push yet; prove it works locally first, then build out wave 2 for Joe to test.
- 2026-09-25: Hard fork started on branch `fork`: Prime source (0.9.6, MIT) as `agent/` subtree, manifest name `laurelin`, builds in 8 seconds, launcher prefers the built fork. Settings folder stays `~/.prime/agent` for now so the sign-ins keep working.
- 2026-09-25: Wave 2 merged (bridge, worker-settings, gates2, router, testset) and the hard fork landed; fork change so gates rerun for targets outside git. New open question on Jev as a vendor for Yellow and Red text.
- 2026-09-25: End-to-end proof through the fork: evidence gate failed, agent recorded evidence, gates reran; prose gate caught slop, agent rewrote, gates reran; all passed before done. Router skips Jev for RED tasks.
- 2026-09-25: Joe: Jev is approved for all material; classification is a label, not a gate; endpoint settings are the plug-in point for a GovCloud Jev or local model later. Red bypass removed from the router.
- 2026-09-25: Added section 21, graph rules for multi-agent runs, and the investor skill set and graph runner to wave 3. Joe: the fork must never touch the installed Prime Agent.
- 2026-09-25: Fork isolated: own folder `~/.laurelin/agent` (sign-in linked, nothing else shared), own service socket keyed to the build. Before this the fork had written five sessions, a kernel rebuild and a default-model change into `~/.prime/agent`; the default model was restored (backup kept) and Prime verified working. Rebrand: Laurelin rings logo, "Laurelin Agent" in 41 files, `laurelin` in command hints. Launcher always loads this repo's pack (Prime's settings pointed at the old checkout).
- 2026-09-25: Command renamed to `laurelin-agent`; `laurelin` on Joe's interactive PATH is the chat platform's Python client. `bin/laurelin` stays as a link for scripts.
- 2026-09-25: Joe launched `laurelin-agent` on his light terminal: title screen, theme and input readable. First accepted look. Remaining work listed in section 20 wave 3.
- 2026-09-25: Joe: no GCP memory yet; private rules come from the Claude memory notes; investor skill must follow the vault's existing workflow and folders.
- 2026-09-25: Vault investor workflow mapped (playbook, restructure spec, CRM schema, SOP). Findings kept in the vault, not here. Gaps found: a key in plain text inside a vault note (move to the key store); two CRMs (vault corpus and Folk) with no sync rule; four status vocabularies; the playbook's validator never built; financing figures differ across notes. The investor-research skill encodes the playbook, adds the validator as a gate, and picks one status vocabulary for new writes.
- 2026-09-25: investor-research skill merged with its validator gate, fit set, status vocabulary and triage. Corpus validator findings recorded for Joe.
- 2026-09-25: Rule-6 review of investor-research: no names, contacts, figures or keys; one verbatim house rule and one playbook sentence replaced; counts trimmed from notes. The `frege_fit` key is kept because the vault's own notes use it; section 12's sanitizer pass decides its fate at release.
- 2026-09-25: Joe: deck-design skill from his current workflow; survey marketing, SEO and research skill packs; Karpathy skills throughout; Polygres plus the vault for memory with retrieval autoloaded. Two research passes started.
- 2026-09-25: Added section 22, the edge: standards as typed checks, first-pass acceptance as the north-star metric, shipped procedures, safe to leave running. Order: instrument, learning loop, real jobs, then widen.
- 2026-09-25: Skill-pack survey recorded. Briefs written and branches started for metrics, learning-loop, skill-packs and memory, in the section 22 order. Deck-design brief waits on its research.
- 2026-09-25: Deck workflow mapped; current deck's generator rescued from a temp folder into the deck kit; LRL-DS declared current; deck-design brief written and branch started.
- 2026-09-25: Joe confirmed the cream deck system is legacy. Karpathy guidelines added to the pack as an always-on skill (copied from the installed Claude Code plugin, MIT); the harness lists it and Claude Code loads its own copy.
- 2026-09-25: metrics and deck-design merged. Baseline correction share measured at 14 percent by Jev over a sample, against 35 percent from the manual read; recorded both with the reason they differ.
- 2026-09-25: Vault reads blocked by macOS privacy for the harness's process tree; added to Step 0 for Joe. Deck skill's rule sections unchecked against the vault until then.
- 2026-09-25: Vault block explained (Orca is the responsible app); `bin/vault-io` fallback through the local file bridge added and wired into the rules extension. Deck-design review fixes: leak check reads live values, scrim derived from the carbon token, loud fallbacks, temp folder inside the repo. Baseline recomputed with the confidence threshold: 10 percent.
- 2026-09-25: learning-loop, skill-packs and memory merged; memory runs local mode until Joe adds the two Polygres values.
- 2026-09-25: Vault block narrowed further: Orca.app has the grant but its helper bundle spawns the terminals under launchd; the helper needs its own Full Disk Access entry.
- 2026-09-25: Searched the Mac and the vault (by name only) for Polygres values: none exist here; only this repo's own plan and briefs mention Polygres. The Hermes machine (`laurelin-bot`, project `laurelin-social-bot`) was checked after Joe signed in to gcloud: nothing there either. The two values come from the Polygres project's Connect page and Joe adds them with `laurelin-agent keys add`.
- 2026-09-25: Polygres connected. Project `p2495c9ba5fd18ee4650b092` registered as MCP server `polygres` (exact URL with nine features) in the fork's own settings folder (sign-in on first session use) and in Claude Code (signed in through Joe's Orca terminal; a fresh session made eleven read-only calls, no errors). The project is empty: standard mode on Polygres's database, no tables, no collections, graph not built. The Polygres values Joe was asked for are not needed for the MCP path; the SDK key only matters for `sync.py` live mode.
- 2026-09-25: Joe gave the Polygres project key; stored as `POLYGRES_API_KEY` in the key store. Polygres is a derived index over the vault, not a copy; retrieval returns paths, the vault stays the source.
- 2026-09-26: Polygres loaded through the CLI (installed in the repo's temp venv, signed in from Joe's terminal): 3,657 notes, 10,200 sections, 16,023 unique links (1,321 duplicate pairs removed; sync.py now dedupes at the source). Schema applied through the MCP SQL tool. Graph built from the foreign keys: 29,880 nodes, 84,492 edges. Embeddings job started on section text (text-embedding-3-small, 1024 dims, about 9.8M tokens, zero additional credits within the free allowance). Runtime URL stored by name from `polygres env`.
