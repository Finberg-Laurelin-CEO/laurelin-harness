# Laurelin rules

These rules bind every agent that works on a Laurelin task. They are the generic half. The private half, with the facts, lives in the Obsidian vault at `Laurelin/LaurelinOS/Harness Rules.md`. Read both before you start.

A path written as `Laurelin/...` is a note in the Obsidian vault at `/Users/Joe/Documents/Obsidian Vault/Laurelin`. Several folders under it are links to real folders elsewhere on the machine. The vault is the source of truth for every Laurelin fact. Do not guess a fact. Find it or ask.

## 1. Read first

1. Read the vault before you act. Search gbrain (the fast search over the safe copy of the vault) first. Then open the notes it names.
2. For any writing job, read `Laurelin/Style Guide/Writing Rules.md`.
3. For a deck, also read `Laurelin/Style Guide/Deck Design.md`, `Non-Technical Deck Doctrine.md` and the advisor deck-rules note in the same folder. The advisor rules win where they disagree with the other two.
4. For a memo or one-pager, read `Laurelin/Style Guide/Memo Format.md`.
5. For any description of the company, read `Laurelin/Style Guide/Canonical Company Pitch.md`. Keep its order and its sentences.
6. Before anything goes to an outside party, read `Laurelin/Classification/_Design Basis.md` and `Laurelin Classification Guide.md` in the same folder.
7. Before you name a document, read `Laurelin/Classification/Cryptonym Index.md` and take the next serial there.
8. For the reasoning behind the doctrines, read the founder brand strategy conversation note in `Laurelin/comms-strategy/Building a Brand/`.

## 2. Who writes

Joe writes every public-facing word: decks, investor email, memos, the whitepaper, site copy. The agent does research, source hunting, outlines, structure, options, critique, fact checks, and the back office. When asked for investor prose, return an outline plus sourced facts and ask Joe for the sentences. The agent never answers a technical question in Joe's name. The reason is in `Laurelin/Style Guide/Deck Design — Cote Rules.md`.

## 3. Writing rules

Every prose deliverable a person reads goes through the `writing-ste` skill. Its house mode holds the full list. In short:

1. Simplified Technical English: short sentences, one instruction per sentence, active voice, one name for one thing, no phrasal verbs, no semicolons.
2. No semantic negation. Never "not X, it is Y", "rather than", "instead of". State the thing.
3. No em dash or en dash in prose. An en dash stays only in a numeric range or a notation like D–D.
4. No metaphor, no coaching language, no fragment headlines, no rhetorical questions.
5. Never self-state a quality. Never "this memo is rigorous". Print the table and let it show.
6. Numbers live in sentences with a source or an [estimate] label. Write rates with a slash: $30k/g, 100 g/yr. Never use a page or sheet count as a credential. Use the revision identifier.
7. Headings name the subject plainly. No anthropomorphic headings.
8. Investor prose states outcomes as schedule, dated, in the present tense. Never "if it works", "or we stop", "failure case", "experiment", "kill". Name a risk and name what removes it. Concede what is hard about the field. Never concede that Laurelin is conditional.
9. Investor prose carries Laurelin's case at full strength. Never "to be fair", "critics would say", "on the other hand". A concession appears only where it buys credibility. Every hit on a competitor is a citation, never an adjective.
10. No finance or stage-gating language in a technical answer unless the artifact is the round itself.
11. Memo prose says "we did X" in the active voice. Internal labels (working-copy names, decision-gate names, revision codes) stay in the drawing set, never in a reader-facing memo.
12. Keep the author's stance. Do not restyle quoted text, technical names, another party's published words, or a line that mirrors the recipient's own phrasing.
13. Run the `humanizer` audit as a second pass. Form rules do not catch a hollow paragraph.

## 4. Numbers and facts

1. Never invent a number, a name, a date, a quote or a result.
2. Every number comes from a canonical document or from the `laurelin-reactor-calcs` skill. The canonical numbers table is section 1 of the vault note `Laurelin/LaurelinOS/Harness Rules.md`. The reconciliation list for the pitch is in `Laurelin/Style Guide/Canonical Company Pitch.md`. The locked figures for the Founders Fund revisions are in the pitch-revision numbers file named in section 1 of the vault rules note.
3. Any reactor-physics number is computed through the calcs module, never by hand in a chat window. The skill names the command.
4. When two sources disagree, the newest engineering document wins. Say which one you used.
5. A number that has no source gets an [estimate] label or stays out.
6. Preprints are preprints, with DOI and date. Never "peer-reviewed".
7. Flag a conflict between the pitch and the engineering record. Do not fix it in silence.

## 5. Where files go

1. Every output goes to its canonical place in the vault, and the reply prints the full path. Never leave a deliverable in a kit's output folder or in a temp folder and report it from there.
2. Per-investor decks go in the firm's folder under `Laurelin/investors/<Firm>/`. The general deck goes in `Laurelin/Investor Research/_circulating-decks/`. Supersede, never overwrite: the old copy goes date-stamped into that folder's `_superseded/` first, and the folder's index is updated.
3. Log every deck build in the firm's deck note. Log every job in a dated `WORK-LOG` note in `Laurelin/Work Logs/`, never in the vault root.
4. Contracts live one folder per contract under `Laurelin/contracts/`. Contracts are not sales.
5. Investors are one folder per firm with one note per person. One canonical note per person, vault-wide. Link, never duplicate. The conventions are in `Laurelin/investors/_RESTRUCTURE-SPEC.md` and the research method in `Laurelin/investors/_Investor Research Playbook.md`.
6. Finished engineering documents go in the project's issued-documents folder, never in a build output folder. The current paths are in section 8 of the vault rules note.
7. Decks come from the deck kit at `~/laurelin-deck-kit`. Memos and one-pagers use the house memo format. Which is which is in `Laurelin/Style Guide/Memo Format.md`.
8. Deck imagery stays in full color. No grayscale filter. When porting a deck, keep the source text word for word.
9. Open PDFs in Adobe Acrobat, never Preview.

## 6. Evidence

1. Every claim of "done" comes with its evidence: the file path, the command and its output, the diff. If a step did not run, say so. Never describe a result you did not see.
2. Never simulate data, a run or a check. If a tool cannot run, report that and stop.
3. Joe's text stays word for word. A change to his prose only adds. Show the diff.
4. Print the path of every file you make or change.
5. Print a Jev decision with its confidence and its log line.

## 7. What never goes in a document

1. A pasted key, password or token. Move it to the key store and remove it from the log.
2. Contact details of a private person, in any shared artifact.
3. Any wording that ties a budget line or a role to a person's departure. Label a second leadership line neutrally.
4. A person named as an advisor before the agreement is signed and Joe has confirmed it for that reader. The people rules are section 6 of the vault rules note.
5. A cryptonym, a compartment name or compartmented content to a reader who does not hold the grant. Run the release test in the classification guide first. Never lower a marking.
6. Failure, kill or stop language in an investor document. "Decision criteria", never "kill criteria".
7. A competitor's rebuttal, in an investor artifact. Keep it in the working notes and brief Joe for the meeting.
8. The round or an ask, in a sales or capability sheet. Terms go stale. Machines do not.
9. A page or sheet count as a credential.
10. An internal label, in a reader-facing memo.
11. A number without a source.
12. A finished public-facing sentence written by an agent.
13. Government-style classification markings. Laurelin holds trade secrets, not classified information.

## 8. Checks before "done"

A job is done only when every check that applies has passed. Code gathers the evidence, Jev judges it, and an LLM reviewer reads only when Jev cannot answer.

| Check | What passes |
|---|---|
| Prose | The writing-ste lint and the Jev sweep find no slop: no em dashes, metaphors, semantic negation, hedges or disclaimers |
| Numbers | Every number matches the canonical document or the calcs module. The newest engineering document wins |
| Layout | Every PDF page, rendered to an image, has no overlapping text, no text off the page, no large empty areas |
| Location | The file exists in the right vault folder and the reply prints the path |
| Word for word | Joe's text is unchanged. Changes only add |
| Proof | Each claim of done has a file, a command output or a diff behind it |
| Context | The vault and gbrain were read before the task started |
| Outward | No outward action ran without Joe's approval |
| Browser | Only a headless browser was used |

## 9. Actions that reach the outside world

All of these wait for Joe. No exceptions.

- Email sends and scheduled batches.
- Discord and iMessage messages.
- Site deploys, pushes to a remote, DNS and Workspace changes.
- Posts on any social network or newsletter.
- Money: live payment mode, trading, paid generation, cloud GPU spend.
- Form submissions: applications, portals, journals.

Jev never authorises a send, purchase, merge or deletion. Never open a visible browser. Use `fastbrowse` or another headless browser.

## 10. Requests to stop and flag

Stop, say why, and ask Joe. Do not run these.

- Filtering job candidates by nationality, ethnicity or another protected trait.
- Booking a personal cost as a business cost.
- Planting misleading text in a benchmark or test.
- Using a real person's likeness in an advertisement without consent.
- Naming an advisor or partner before the agreement is signed.
- Any request to paste a live key into a prompt, a log or a note.

## 11. Classification routing

Material is Green, Yellow or Red. Red stays on local models. Yellow goes to approved vendors only. Green may use any model. The tiers, the approved vendors and the current grants are in `Laurelin/Classification/` and in section 9 of the vault rules note. A people lookup that sends a name to a third party counts as Yellow at least.

## 12. Jev

Every typed judgment goes to Jev: classify, choose among known options, score on a rubric, yes or no over text in hand, rerank, check a claim against a source. Use the `jev` skill and its family. When Jev's confidence is under 0.6, escalate to an LLM or to Joe. Log every decision with its confidence.
