# Go-to-market plan

Status: draft, 2026-09-30. Owner: Joe. Internal.

The customer-input launch plan is [LAUNCH.md](LAUNCH.md).

## Decisions of 2026-10-06

1. Name: the product is **Laurelin Agent**, the same name as the internal build. Frege keeps its name and its governed memory product.
2. Order: users and money come first, the partner pitch comes after. A beta that a stranger can use goes to 5 to 10 people. The aim is one payment. Then Joe pitches classifier.dev and TypeSafe for a listing, with the users' own words as evidence.
3. Spin-out: sell the beta now. Move the product into its own company only on traction (Phase 3).
4. Two versions, one engine: the public build loads a general pack. Joe's build also loads the private Laurelin pack (vault paths, investor and deck skills, fusion tools, canonical-number gates).

## Position

Agents you can trust to finish unattended, for a fraction of the frontier price.

The harness lets a person leave agents running for hours. Checks block a false "done", and nothing outward happens without a recorded approval. A message from the person steers a running job at once, and a live view shows every worktree and worker. A fast decision layer (Jev) makes the many small judgments, so the frontier model only does the thinking and writing.

## Who it is for

1. First: founders and operators who run several agents a day on their own subscriptions and want to leave them running overnight. Joe is user zero.
2. Later: small teams that run fleets of coding and research agents and need to see and trust what the agents did.

## Why now

- TypeSafe launched Jev on 2026-09-15. A decision-only model is new, and developers do not yet know what to build with it. A working harness shows them in five minutes.
- classifier.dev, TypeSafe's labelling service on Jev, offered Joe a free pro plan for a write-up and said it is "super bullish on Jev harnesses".
- Recent YC companies build infrastructure for agent fleets (Jcode, Agent Relay, Herdr). None of them leads on trust: checks before "done" and approval receipts.

## Product shape

A standalone product, not a Prime Agent add-on. A person installs it with one command and adds keys.

| Part | What ships |
|---|---|
| Install | One command (Homebrew or npm). A first-run setup asks for keys. |
| Decision layer | Jev through TypeSafe, with classifier.dev as the fallback and free tier. |
| Models | Any provider with a key (OpenRouter, Bedrock, Cheaper Inference, OpenAI, Anthropic), and ChatGPT or Claude subscription sign-in. |
| Trust | Checks that block "done", approval receipts with a hash chain, a stall watchdog. |
| Control | Instant steering, a worktree dashboard, swarms of workers in worktrees. |
| Memory | Hybrid search over the user's notes with a Jev rerank. Empty until the user adds a source. |
| Left out | Everything from Laurelin: vault paths, investor skills, reactor tools, house rules. |

The license of the base (Prime Agent, MIT) allows this. The original copyright notice stays.

## How to make it cheap to run

1. Cascade: a cheap model does each step, Jev checks the result, and only a failed check goes to the frontier model. On Cheaper Inference, DeepSeek V4 Flash costs $0.09 in and $0.36 out per million tokens. Claude Fable 5.1 costs $7 and $35.
2. Jev for every judgment: routing, relevance and pass or fail cost $0.042 per million input tokens, or nothing on the classifier.dev free tier.
3. Smaller prompts: memory sends only relevant notes, and old tool results that Jev scores as no longer needed leave the context.
4. Early failure: the watchdog and the checks stop a bad run before it burns an hour.
5. Flat-rate subscriptions where the provider allows them, and resellers below list price.
6. Partner pricing: Jev at cost or free in exchange for the showcase.

## How the YC harness companies earn

| Company | Free part | Money |
|---|---|---|
| Jcode | Open source, bring your own keys | Monthly plans from $10 to $1,000 that include double their price in model credit, then usage at provider prices. Reported about $1M a month of inference through it. |
| Agent Relay | Free for one person, self-host under MIT | $15 per member per month, or $149 once. |
| Herdr | Open source, Apache-2.0, no accounts | A hosted cloud is announced and not priced. |

The pattern: the tool is free to spread. Money comes from resold inference, team seats, or a hosted version. Jcode's model fits this product best, with TypeSafe and Cheaper Inference as supply partners.

## Closest competitor: AdaL (SylphAI)

Researched 2026-10-06 with context.dev (repo, product, pricing, company pages, two architecture posts).

| | AdaL CLI | This harness |
|---|---|---|
| Pitch | "Automation-first agent harness", issue to tested PR | Agents you can trust to finish unattended |
| User | Software engineers | Founders and operators: research, investors, email, CAD, writing |
| Source | Closed binary; the public repo is a community page (107 stars) | Fork of an MIT-licensed agent |
| Checking | Separate LLM evaluator with its own context | Jev checks (calibrated, about 1 s, fractions of a cent), gates, approval receipts |
| Orchestration | "AdaL Engineer" writes a shared contract.md and assigns workers | Graph workers with per-step contracts, durable runs, steering; planner (graph-planner) |
| Cost | Routes to cheap models (MiniMax M3, GLM) | Jev for judgments, cheap models per graph step |

Their architecture converges on ours: generator plus separate evaluator, a shared contract, a harness that improves from failures, cheap-model routing. Our evaluator is cheaper because Jev replaces an LLM judge.

What to copy from their business model:

1. One credit unit across all models, priced on Claude's ladder: Pro $20, Max $100, Max+ $200 a month. The gap between the credit price and the cost of cheap routing is the margin.
2. A free tier that runs on the user's own credits, ChatGPT subscription, or API keys.
3. Weekly usage windows on top of monthly allowances; sub-agents draw from the same allowance.
4. Student pricing (50% off) and a community skills repository.
5. Teams and enterprise up to 150 seats with SSO and onboarding.

What to copy from their architecture: the engineer layer that turns a task and its success criteria into a plan of workers (our graph planner), and the public story that the worker never grades itself.

What not to copy: the coding-only focus (the crowded lane), an IDE or cloud surface (too costly for one person), a closed binary (it undercuts a trust story).

## Partners

| Partner | They give | They get |
|---|---|---|
| classifier.dev | Pro plan now. Later: listing, keys bundled with the harness. | A public write-up and a reference harness for their users. |
| TypeSafe | Credits, co-marketing, a listing as a harness built on Jev. | Proof that Jev is useful in a real agent, in five minutes. |
| Cheaper Inference | Wholesale rates for bundled plans. | Usage routed through the harness. |

Credits are expected. A paid contract is unlikely, so the plan does not count on one. The value is distribution and credibility: co-marketing and a listing.

## Phases

### Phase 1: usable beta (about one week, target 2026-10-13 to 10-15)

1. Split the pack: a public general pack and a private Laurelin pack that only Joe's install loads.
2. Send every Jev call through `bin/jev`, with the classifier.dev free tier as the default. On 2026-10-06 nine test files failed because the gates call TypeSafe directly and TypeSafe was out of credits.
3. First-run setup: keys or ChatGPT sign-in, a cheap default model, memory empty until the user adds a folder.
4. A private install (npm package or Git link) for beta users. Nothing is published without Joe's approval.
5. A 60-second demo: `graph plan`, the live graph view, a check that blocks a false "done", an approval receipt.
6. A founding-plan payment link: $20 a month or $149 one time. No credit resale until a wholesale deal exists.

Exit: a person outside Laurelin installs it and gets a result in five minutes.

### Phase 2: paid beta (seven days, the plan in LAUNCH.md)

10 conversations, 3 quoted people, 1 payment.

Exit: one person pays.

### Phase 3: partner pitch and public release

1. Write the classifier.dev post (an X thread with the demo). Joe writes the final words.
2. Pitch classifier.dev and TypeSafe for a listing or co-marketing, with the beta users' quotes.
3. Publish the repository and the install command. Launch through the partners' channels and Hacker News.

Exit: 100 weekly active users, or partners asking for more.

### Phase 4: spin-out decision

Spin out only on traction. Signals: weekly active users growing for six weeks, or teams asking for shared features. Without them, Laurelin Agent stays Laurelin's internal tool, and nothing is lost.

## Risks

- A free competitor already exists for each part (jev-dev-harness for Jev checks, Agent Relay for approvals). The answer is the combination and the trust story.
- TypeSafe can build the same features. Partnering makes that a strength.
- Free tiers can run dry. Bundled plans need wholesale pricing first.
- Time: Laurelin comes first. Phase 2 starts only after a partner says yes.

## Next actions

1. Joe signs up for the classifier.dev pro plan and sends his email.
2. Draft the X thread and a 60-second demo (router, checks, steering, dashboard).
3. Build the stall watchdog and the cascade, so the demo shows both.
