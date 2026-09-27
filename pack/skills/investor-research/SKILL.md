---
name: investor-research
description: Research investors and build the vault investor records by the playbook: firm hubs, person notes, fit grades with Jev, follow-up triage. Research only, never outreach. Use for "research these investors", "who at <firm>", "update the investor CRM".
---

# investor-research

This skill holds the method. Every fact about Laurelin, an investor or a person lives in the vault. The skill never repeats one.

## Where things live

| What | Vault path (relative to `Laurelin/`) |
|---|---|
| The process this skill encodes | `investors/_Investor Research Playbook.md` |
| Folder and note shapes | `investors/_RESTRUCTURE-SPEC.md` |
| The map of content, with the caveats to read before any outreach | `investors/README.md` |
| Round strategy and cascade tiers | `investors/_Round Strategy — First Check Cascade.md` |
| Connections between firms | `investors/_Network Map — Investor Connections.md` |
| Email discovery workflow | `investors/Finding Emails — Hunter.io.md` |
| The CRM corpus, one folder per firm | `investors/<Firm>/` |
| Connectors and intro sources, one note per person | `contacts/<Firm> — <Person>.md` |
| People who are network nodes, not investors | `network/<Person>.md` |
| Deep pitch programs and circulating decks | `Investor Research/<Firm>/`, `Investor Research/_circulating-decks/` |
| CRM field definitions and the dossier procedure | `CRM/CRM Schema.md`, `CRM/Meeting Attendee and VC Dossier SOP.md`, `CRM/Outreach Guidelines/` |

Inside a firm folder: `_index.md` always. One `<Person>.md` per verified current investor. Optional `People.md`. `Email - <subject> YYYY-MM-DD.md`. `Deck Guidance - <Firm>.md`. `WORK-LOG YYYY-MM-DD — <what>.md`. Newer sub-notes named `Research`, `Sources`, `Relationship`, `Outreach`, `Materials`, `Meeting`, `Application`. Strategy notes sit flat at the top of `investors/` with a leading underscore. Category folders carry an `_index.md` whose status says `not a firm`.

## Authority

"Research these investors" grants research and vault-writing authority. It grants nothing else. The skill does not contact anyone, does not draft a message to send, does not submit a form, and does not infer an email address. Outreach needs Joe's approval for each message and goes through the approval gate (`laurelin-approvals`). A found email is permission to draft, never to send.

## Tools

| Job | Tool | Notes |
|---|---|---|
| Company lookup, people lookup, news | context.dev (MCP at `https://mcp.context.dev/mcp`, skill `context-dev` when installed) | `CONTEXT_DEV_API_KEY` from the environment. People lookups send a name to a third party, so send only names that appear on the firm's public team page. |
| Read a page, a team page, a fund announcement, a FAQ | `fastbrowse` (skill `fastbrowse`) | Headless. Keep the cited quotes and URLs. LinkedIn needs the authenticated gstack browse session. |
| Email discovery and verification | Hunter by REST, `https://api.hunter.io/v2/` | `HUNTER_API_KEY` from the environment, never from a note. Check the account budget first (`GET /account`). Email Finder on name plus domain. Verify any score under 90 and any `accept_all` domain. |
| Fit grade, landmines, follow-up ranking, dedupe choices | Jev (`jev`, `jev-decide`, skills `jev-triage`, `jev-documents`, `building-with-jev`) | The question sets are in `fit.md` and `triage.md`. Confidence under 0.6 escalates to Joe. |
| The vault | Files. Read with the file tools, write with the file tools. | The templates in `templates/` are the shapes. |
| The validator | `pack/gates/investors.sh` | Runs as a gate on autonomous runs when the target is an investors root or a firm folder. |

## The ten steps, in order

Every step writes to the vault or reads from it. Every fact carries a source URL and a capture date, or the words `not publicly verified`. Nothing is guessed: no email, no title, no check size, no warm path, no relationship strength.

### 1. Source dossier

Joe gives a list, a post, a screenshot, an article or a spreadsheet.

- **Tool:** the file tools. `fastbrowse` to capture a URL Joe names.
- **Write:** one note at `investors/<List title> — <author> — YYYY-MM-DD.md` from `templates/Source Dossier.md`. It holds the list as given, the source URL, the author, the publish date and the capture date. Its status says `not a firm`.
- **Forbidden:** correcting names inside the pasted list. Corrections go in the extraction table.

### 2. Extract and dedupe

- **Tool:** code for the name normalization. Jev (`jev-documents` pattern) when a name could be an alias of an existing folder: one Choice per name over the near matches from `ls investors/`, with `none` as an option.
- **Write:** the extraction table in the source dossier. Columns: as named, normalized, kind, existing folder, action. Kinds: firm, person, program, service provider, source-list heading, connector.
- **Forbidden:** a firm folder for a person, a program, a category or a heading. A duplicate of a person who already has a note in `network/` or `contacts/`. Search the vault for the name before creating anything.

### 3. Firm hub

For every actual firm, create or enrich `investors/<Firm>/_index.md` from `templates/_index.md`. The folder name is the firm's exact display name.

- **Tool:** context.dev for the company record and news. `fastbrowse` for the official site, the team page, fund announcements and FAQs.
- **Write, in this order:** official website (the canonical domain, never a directory profile or a similarly named firm). Thesis in the firm's own words as verbatim quotes. Fund mechanics: fund size, stage, typical check, lead or follow, what the vehicle is (read the fine print: a program, a personal vehicle and a placement agent all look like funds at first). Portfolio precedents in energy, fusion and deep tech. A competing investment is a conflict flag, never a warm signal. People and lanes. Warm paths as links to `contacts/` and `network/` notes and the network map. Landmines: fee for intro, placement agent, adjacent lanes, stale valuations. Then the fit read (step 4).
- **Section shape:** `## Research (captured YYYY-MM-DD)` so age is visible. Check any fact older than a few weeks again before a deck, a memo or an email uses it.
- **Frontmatter:** `tags, firm, website, domain, stage, check_size, status, updated, source, source_list, laurelin_fit, frege_fit, contact, email, linkedin_company`. Status from `status.md`. Link the hub back to the source dossier.
- **Forbidden:** a LinkedIn page or a database profile in `website:`. An estimate written as a fact.

### 4. Fit grade

- **Tool:** `fit.sh` with the question set in `fit.json`. Input is a plain description of what step 3 verified. No name, no contact data.
- **Write:** `laurelin_fit:` in the frontmatter (A, B, C, D or `unverified`), the confidence and the run date in `## Fit read`, and any landmine in `## Landmines` with its source. Confidence under 0.6 writes `unverified` and asks Joe.
- **Forbidden:** a grade typed by the model. Jev grades, code maps, the model writes the sentence that explains it.

### 5. People notes

One note per verified current investor relevant to the mandate, from `templates/Person.md`.

- **Tool:** `fastbrowse` on the team page and the person's public pages. context.dev for the person record when the name is public on the team page. Hunter by REST for the address, in this order: resolve the domain free from the web, Email Finder on name plus domain, verify any score under 90 or any `accept_all` domain.
- **Write:** frontmatter `tags, person, firm, role, email` or `email_status` (score and date), `linkedin, status`. A bio: education, path to the firm, what they invest in, boards, public writing, what their background predicts about how they evaluate. **Current employment verified** with a date and a URL before anything else is written. The Hunter result in the note: score, `accept_all`, verification status, date. `accept_all` means probable, not confirmed. Where else the person appears in the vault, linked, never duplicated.
- **Forbidden:** an inferred or pattern-built address. A title, nationality or protected-class detail that no source states. A LinkedIn slug used as a display name. Private context Joe shared about the person.

### 6. Links both ways

- **Tool:** the file tools.
- **Write:** in `_index.md`, the block between `<!-- investor-people:start -->` and `<!-- investor-people:end -->` lists every person as `[[<Firm>/<Person>|<Person>]] — <Role>`. Every person note links back with `[[<Firm>/_index|<Firm>]]`. Firm links elsewhere use `[[<Firm>/_index|<Firm>]]`. Update `investors/README.md` when the firm belongs in an operating list, and the network map when the firm touches an existing cluster.
- **Forbidden:** removing the people block. A person listed only in `People.md`.

### 7. Deck guidance, when materials are planned

- **Tool:** `fastbrowse` for the verbatim criteria and the firm's recurring words.
- **Write:** `Deck Guidance - <Firm>.md` from the template: bottom line, what they publicly say they want, vocabulary to mirror, framing calls settled before the build, ask sizing, and an empty `## Built decks` for the deck pipeline. Words only. Canonical numbers and claims never bend to fit (the deck source of truth is `Style Guide/Deck Design.md`).
- **Forbidden:** writing the deck. Finished investor prose is Joe's.

### 8. Status and WORK-LOG

- **Tool:** the file tools. `status.md` for the vocabulary.
- **Write:** `status:` and `updated:` in every touched note, the same day. One `WORK-LOG YYYY-MM-DD — <what>.md` per session from the template: the source, the steps in order with their tools, the Jev runs with their confidence, the key findings with sources, the validator line, and the boundaries paragraph.
- **Forbidden:** a status left stale after a state change. A session with no log.

### 9. Validator

- **Tool:** `pack/gates/investors.sh` with `LAURELIN_TARGET` set to the firm folder or the investors root. It also runs as a gate on autonomous runs.
- **Pass means:** every firm folder has `_index.md`, every person note is in its firm's people block and links back, every fact line with a URL is dated (on the line or on its heading), frontmatter has `tags, firm, status, website, updated` for a firm and `tags, person, firm, status` for a person, and no email address appears without an `email_status`.
- **Write:** the one-line result into the WORK-LOG. A batch is incomplete while the gate fails.

### 10. Research authority only, and ongoing state

- The batch ends with the WORK-LOG and the validator line. It does not end with a message.
- Follow-ups: `triage.sh` over the investors root ranks who needs attention this week and proposes `stale` moves. It prints a list for Joe and writes nothing (`triage.md`).
- Folk is Joe's live CRM (`FOLK_API_KEY`). The vault corpus is the source of truth. Version 1 writes the vault only. When a sync is asked for, print what a Folk sync would change (firm, field, old value, new value) and stop. No Folk writes.

## Forbidden in every step

- No contact with anyone, by any channel.
- No message, DM, form answer or application drafted for sending. A draft for Joe's approval is a separate task that goes through the approval gate.
- No form submission.
- No guessed or pattern-built email address. No email in a note without `email_status`.
- No fact without a source URL and a capture date, or `not publicly verified`.
- No firm folder for a person, a program, a category or a heading.
- No duplicate of a person who already has a note elsewhere in the vault.
- No fee paid, ever, to anyone who sells introductions.
- No Laurelin fact from memory. Read the vault note that holds it.

## Files in this skill

| File | Holds |
|---|---|
| `templates/_index.md` | Firm hub skeleton, placeholders only |
| `templates/Person.md` | Person note skeleton |
| `templates/Deck Guidance - Firm.md` | Deck guidance skeleton |
| `templates/WORK-LOG.md` | Session log skeleton |
| `templates/Source Dossier.md` | Source-list note skeleton |
| `fit.md`, `fit.json`, `fit.sh` | The Jev fit question set, its meaning, and the runner |
| `status.md` | The one status vocabulary and the mapping from old values |
| `triage.md`, `triage.sh`, `triage.py` | Follow-up ranking, the jev-triage pattern |
| `../../gates/investors.sh`, `../../gates/investors-check.py` | The validator |

Test: `tests/test-investor-research.sh`.
