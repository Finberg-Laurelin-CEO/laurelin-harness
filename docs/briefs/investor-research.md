# Branch `investor-research`: the investor research skill (Step 8.1)

Plan: section 20 wave 3 item 1; section 18 groups 3 and 5; section 21 rules 2 to 5. AGENTS rule 6 is strict here: the skill holds the METHOD only. No firm, person, email, figure or status from the vault goes into this repo. Vault paths are allowed.

## Read first, in the vault (read-only)
- `Laurelin/investors/_Investor Research Playbook.md` (the process; the skill encodes it)
- `Laurelin/investors/_RESTRUCTURE-SPEC.md` (folder and note shapes)
- `Laurelin/investors/README.md` (the MOC), `_Round Strategy — First Check Cascade.md`, `_Network Map — Investor Connections.md`
- `Laurelin/Company Brain/Hermes Skill - Investor Diligence.md`
- `Laurelin/CRM/CRM Schema.md`, `Laurelin/CRM/Meeting Attendee and VC Dossier SOP.md`, `Laurelin/CRM/Outreach Guidelines/`
- Three examples of each note type: a firm `_index.md`, a person note, a `Deck Guidance` note, an `Email -` note, a firm `WORK-LOG`
- `~/.claude/skills/jev-triage/SKILL.md`, `jev-documents`, `building-with-jev`, `fastbrowse`, and the context.dev skill if installed (`~/.agents/skills/context-dev`)

## The structure the skill must match (from the map, 9/25)
- `Laurelin/investors/<Firm>/` is the CRM corpus: `_index.md` always; one `<Person>.md` per verified current investor; optional `People.md`; `Email - <subject> YYYY-MM-DD.md`; `Deck Guidance - <Firm>.md`; `WORK-LOG YYYY-MM-DD — <what>.md`; newer sub-notes `Research`, `Sources`, `Relationship`, `Outreach`, `Materials`, `Meeting`, `Application`.
- Strategy notes sit flat at the top with a leading underscore. Category folders carry an `_index.md` tagged `not a firm`.
- `Laurelin/contacts/<Firm> — <Person>.md` holds connectors and intro sources, not firm records. One canonical note per person vault-wide; never duplicate `network/` or `contacts/` people.
- `Laurelin/Investor Research/<Firm>/` holds deep pitch programs and `_circulating-decks/`, not the CRM.
- Firm frontmatter: `tags, firm, website, domain, stage, check_size, status, updated, source, source_list, laurelin_fit, frege_fit, contact, email, linkedin_company`. Person frontmatter: `tags, person, firm, role, email` or `email_status` (with score and date), `linkedin, status`.
- Links: `[[<Firm>/_index|<Firm>]]`, `[[<Firm>/<Person>|<Person>]]`, people listed between `<!-- investor-people:start -->` and `<!-- investor-people:end -->`; every person links back to the firm hub.
- Every fact carries a source URL and a capture date, or `not publicly verified`.

## Make
1. `pack/skills/investor-research/SKILL.md` with frontmatter (`name: investor-research`, a one-line description that triggers on "research these investors", "find investors for", "who at <firm>", "update the investor CRM", "dossier for <person>"). Body: the ten playbook steps in order as the agent must run them (source dossier, extract and dedupe, firm hub, people notes with Hunter verification, links both ways, deck guidance when materials are planned, status and WORK-LOG, validator, research authority only, ongoing state). For each step: which tool (context.dev for company and people lookups and news; fastbrowse for pages; Hunter by REST with `HUNTER_API_KEY` from the environment; the vault by file), what to write where, and what is forbidden (no contact, no drafting to send, no forms, no guessed emails; outreach needs Joe's per-message approval and goes through the approval gate).
2. `pack/skills/investor-research/templates/`: skeletons for `_index.md`, `<Person>.md`, `Deck Guidance - <Firm>.md`, `WORK-LOG`, and the source-dossier note, with placeholders only.
3. `pack/skills/investor-research/fit.md`: the Jev question set for fit. `laurelin_fit` as a Score with the A to D scale described in words (stage match, check size, thesis fit with fusion and deep tech, defense or dual-use comfort, portfolio precedent, warm path), plus a Noul for "landmine" (fee-for-intro, placement agent, conflict). Criteria text only; no firm names. Confidence under 0.6 marks the grade `unverified`.
4. `pack/skills/investor-research/status.md`: ONE status vocabulary for new writes, chosen from the four in the vault: use the dealflow-worker states (`new, researching, waiting-on-us, waiting-on-them, diligence, approval-needed, stale, closed-pass, closed-no-fit, done`) plus the playbook's research states (`research-only / no outreach sent`), and a mapping table from the old free-text values. Existing notes are not rewritten.
5. `pack/gates/investors.sh`: the validator the playbook asks for and nobody built. Given a root (`LAURELIN_TARGET` or `.laurelin/task.json`), checks: every firm folder has `_index.md` (or `Index.md`, reported), every person file is linked from its firm's people block and links back, every fact line with a URL has a date, frontmatter has the required keys, no email address appears without an `email_status`. Prints `investors: pass|fail, <why>` and logs like the other gates. Skips when the target is not an investors root.
6. Follow-up triage: `pack/skills/investor-research/triage.md`, the `jev-triage` pattern over firm notes (status, last update, next step) that ranks who needs attention this week. Output is a list for Joe, never a send.
7. Folk: note in the skill that Folk is Joe's live CRM (`FOLK_API_KEY`) and the vault corpus is the source of truth; version 1 writes the vault only and prints what a Folk sync would change. No Folk writes.

## Test
`tests/test-investor-research.sh`: builds a throwaway investors root under `tests/tmp/` with two synthetic firms (invented names, invented people, example.com domains), runs the validator (pass on a good tree, fail on a tree missing a person backlink and on an undated fact), and runs the fit question set through Jev on a synthetic firm description and gets a grade with a confidence (skips cleanly without the key). It must not read `~/Laurelin_Investors` or the vault at all. Add the skill to `pack/skills` and the gate to the launcher's gate list (already automatic).

## Out of scope
Any outreach. Any write to the real vault. Folk writes. The deck kit.
