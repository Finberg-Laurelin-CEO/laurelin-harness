# Branch note: `investor-research` (Step 8.1)

Built 2026-09-25 from `docs/briefs/investor-research.md`. Test: `tests/test-investor-research.sh` (20 checks with `TYPESAFE_API_KEY`, 17 without, all passing). Added to `tests/run-all.sh` and `tests/README.md`. Nothing outside the repo was changed. Nothing was written to the vault.

## What landed

| Path | What it is |
|---|---|
| `pack/skills/investor-research/SKILL.md` | The method: where things live in the vault, authority, tools, the ten playbook steps with tool, output and prohibitions per step, the forbidden list, Folk note |
| `pack/skills/investor-research/templates/` | Skeletons for `_index.md`, `Person.md`, `Deck Guidance - Firm.md`, `WORK-LOG.md`, `Source Dossier.md`. Placeholders only |
| `pack/skills/investor-research/fit.md`, `fit.json`, `fit.sh` | The Jev fit question set, what it means, and a runner that prints grade, confidence and landmines |
| `pack/skills/investor-research/status.md` | One status vocabulary for new writes plus a mapping table from the old free-text values |
| `pack/skills/investor-research/triage.md`, `triage.sh`, `triage.py` | Follow-up ranking over firm notes, the jev-triage pattern. Prints a list, writes nothing |
| `pack/gates/investors.sh`, `investors-check.py` | The validator the playbook asked for. Same output shape and log as the other gates. Picked up by the launcher's gate list automatically |
| `pack/README.md` | Lists the new skill. It is a real folder in the repo, the other twelve are links |

## Decisions made on this branch (for the merge owner to move into PLAN.md)

1. **Fit is one Score plus three Nouls.** The brief asked for a Score with an A to D scale and "a Noul for landmine (fee-for-intro, placement agent, conflict)". `building-with-jev` says one property per question, so the landmine is three Nouls (`fee_for_intro`, `placement_agent`, `conflict`) and code takes the maximum. The grade and the landmine stay separate, so a strong thesis fit with a conflict shows as both. Levels are ordered D, C, B, A (Jev scores low to high) and mapped to letters in code. Confidence under 0.6 prints `unverified`.
2. **Validator scope.** The brief's firm frontmatter list has fifteen keys. In the corpus only 5 of 227 indexes carry `laurelin_fit` and 27 carry `check_size`, so requiring all fifteen fails everything. The gate requires `tags, firm, status, website, updated` for a firm and `tags, person, firm, status` for a person. The other ten keys are "recommended" and reported as a note in the gate log without failing. Category folders need only `tags, status, updated`.
3. **Dated facts.** A URL line passes with a date on the line, or a date on its enclosing heading (the playbook's `## Research (captured YYYY-MM-DD)`), or the words `not publicly verified`. Frontmatter URLs are identity fields and are exempt.
4. **Email rule.** A note that holds an address needs `email_status:` in its frontmatter, or every address line must carry a verification marker (`Hunter`, `verified`, `not found`). `Email -` notes are records of real mail and are exempt.
5. **Roster links.** A person note must appear in the people block as `[[<Firm>/<Person>|...]]` (the spec's folder-qualified form). A roster link that points to no file is reported as a note, not a failure, because the playbook says an unresolved link marks research debt.
6. **`Index.md`** is accepted as the hub and reported as a note. Missing both fails.
7. **Status vocabulary.** The ten dealflow states plus `research-only / no outreach sent`. Detail moves to `status_note:`, priority to `tier:`. The validator does not check the field, as the brief said existing notes are not rewritten.
8. **Triage** ranks by a Jev attention Score (three levels) and an owner Choice, one pair of questions per firm with the record inside the question (the jev skill's lesson for more than eight items). Days since update is computed in code. Firms past 30 days in a waiting state are proposed as `stale`, never written.
9. **The gate has no Jev call.** The validator's checks are file facts (an anchor, section 21 rule 4). Jev sits in `fit.sh` and `triage.sh`.

## Findings

- **The real corpus fails the validator today.** A read-only run over the investors root (log sent to a scratch folder, nothing written) took under a second and found 242 folders, 385 person notes, about 2,600 problems: roughly 1,600 URL lines with no date on the line or heading, about 550 missing required keys, about 250 addresses without a status marker, about 90 person notes not in their people block, 58 indexes with no people block, 17 person notes with no backlink, 11 folders with no index. Decide whether a one-time dating pass runs over the corpus, or whether the gate gets a legacy mode. The gate runs only when the task target is an investors root or a firm folder, so it costs nothing elsewhere.
- **Triage confidence is low on synthetic rows** (about 0.3 to 0.5). The attention question needs labeled examples from real firm notes before its threshold means anything. The rows say `low confidence: ask Joe` until then.
- **Four vault notes could not be read** from this worktree: `Company Brain/Hermes Skill - Investor Diligence.md`, `CRM/CRM Schema.md`, `CRM/Meeting Attendee and VC Dossier SOP.md` and `CRM/Outreach Guidelines/`. The sandbox refused them (`Operation not permitted`); only the `investors` symlink resolved. The skill lists them under "Where things live" from the brief. Nobody on this branch checked that the skill matches the CRM schema. The merge owner should.
- **The context.dev skill is not installed** at `~/.agents/skills/context-dev`. The key is in the key store. The skill points at the MCP endpoint and the skill name, and falls back to `fastbrowse`.
- **`HUNTER_API_KEY` is not in the key store.** The vault's Hunter workflow note carries the key as a literal in its body. The skill reads the key from the environment only. Joe's command, optional and outside this repo: `bin/laurelin keys add HUNTER_API_KEY`, then remove the literal from the vault note.
- `FOLK_API_KEY` is set. Version 1 makes no Folk call.

## Test

`tests/test-investor-research.sh` builds `tests/tmp/investor-research/` from the templates with two invented firms, two invented people on `example.com`, one source dossier and one category folder. It checks: pass on the good tree, on one firm folder and on one person file; `Index.md` accepted with a note; fail on a lost backlink, an undated fact, a lost roster link with an unmarked email, and a missing index, each named in the output; skip on a folder that is not an investors root; the fit set through Jev on a good description (grade A at 0.9) and a fee-for-intro description (landmine yes); the no-key skip; triage over the two firms; the gate log has pass, fail and skipped rows. It never reads the vault.

## Out of scope, confirmed

No outreach. No vault write. No Folk write. No deck kit. No change under `~/.prime`, `~/.claude`, `~/.codex` or `~/.zshrc`.
