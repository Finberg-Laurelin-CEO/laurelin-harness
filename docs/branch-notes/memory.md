# Branch note: `memory` (section 8 item 3, section 20 wave 3)

Built 2026-09-25 from `docs/briefs/memory.md`. Test: `tests/test-memory.sh`, 16 checks pass with `TYPESAFE_API_KEY` (13 without). Added to `tests/run-all.sh` and `tests/README.md`. Nothing outside the repo was changed. The vault was never read. The Polygres part is built and tested in local and dry-run mode only, because the key store has no Polygres key.

**Blocked on Joe:** `bin/laurelin keys add POLYGRES_API_KEY` and `bin/laurelin keys add POLYGRES_RUNTIME_URL`, after the project setup in `pack/memory/README.md`. Until then every search runs on the local copy and `sync.py` only prints or writes CSV files.

## What landed

| Path | What it is |
|---|---|
| `pack/memory/vaultlib.py` | Reads a folder of notes, cuts each into sections (heading-bounded, merged up to 300 words, split at 800), finds wikilinks and resolves them to note paths. Shared by the two programs below. |
| `pack/memory/sync.py` | Sends the safe copy to Polygres as `notes`, `sections` and `links` rows. Incremental by mtime then content hash. Tombstones deleted notes and shrunk sections. `--dry-run --limit N`, `--csv DIR` for the bulk path, SDK `rows.upsert` for daily changes, `--force`. |
| `pack/memory/query.py` | One interface, two modes. Polygres: Context vector search plus tsvector full-text search, fused by reciprocal rank, then one hop along the graph. Local: BM25 over an inverted index of the same sections (cached), then one hop along the wikilinks, forward and back. `--json`, `--stdin`, `--check`. |
| `pack/memory/schema.sql` | The three tables with the foreign keys pgGraph walks. |
| `pack/memory/README.md` | Joe's nine setup steps, the hosted MCP command, every setting. |
| `pack/extensions/laurelin-memory.ts` | Before the coordinator sees a new task: Jev says new task or not, `query.py` returns 20 candidates, Jev scores each on four levels in one call, the five best above 0.6 go in as one `laurelin-memory` message with paths and text. `/memory`, `/memory off|on`, `/memory <words>`. Logs to `decision-log/memory.jsonl` and the session. |
| `pack/skills/polygres-cli`, `polygres-sdk`, `polygres-retrieval-design`, `polygres-data-pipeline` | Copied from `Evokoa/polygres-skills` (Apache-2.0, skills package 0.9.0), unedited, each with `LICENSE` and a `SOURCE.md`. |
| `tests/fixtures/vault-sample/` | Five invented notes (a vendor shortlist, a test stand plan, deck style notes, a weekly log, a glossary in a subfolder) with wikilinks, one dangling on purpose. |
| `tests/test-memory.sh`, `tests/memory-test.mjs` | The test. |

## Test result (2026-09-25)

| Check | Result |
|---|---|
| `sync.py --dry-run --limit 20` over the sample | 20 section lines and 15 edge lines. 22 sections in all, 1 unresolved link |
| Wikilinks resolve by note name across folders. The dangling one is marked | pass |
| Chunker on a synthetic note: short sections merged, a 2,400-word section split into 555 to 800-word parts, a 1,920-word table split by lines, a `#` inside a code fence ignored | pass |
| `--csv` writes the three files with the schema columns and prints the import commands. a second run reports 0 changed. An edited note and a deleted note are detected | pass |
| `query.py --local "cryostat vendor"` ranks the vendor note first. a typography query pulls the style note first and the plan through its link | pass |
| JSON shape, `--stdin`, cache reuse, a missing copy is an error | pass |
| Extension loads through Prime's loader. `/memory`, `input`, `before_agent_start` registered | pass |
| Pure pieces: `buildQuery`, `decideKeep`, `formatMessage`, `worthReading` | pass |
| Without Jev: injects a `laurelin-memory` message naming the vendor note. Skips a short steer. a two-letter message with a task file pulls the note the claim names. `/memory` shows the last run. `/memory <words>` searches. `/memory off` stops injection | pass |
| With Jev: intent `new_task` at 0.99, 5 of 16 candidates kept (levels 2 to 3, confidence 0.73 to 0.81), about 600 ms for both calls. a steer is skipped at 0.92 | pass |
| `tsc --noEmit` on the extension (the compiler inside Vercel's CLI) | pass |
| Polygres | `skipped: no POLYGRES key` |
| `tests/test-pack.sh`, `tests/test-router.sh` after adding four skills | pass (the router menu now has 17 skills) |

Local mode on the real safe copy (read only, from a scratch folder): 3,657 notes become about 10,400 sections with a median of 327 words and none over 800. About 17,000 edges and 12,000 unresolved links (mostly attachments and notes outside the safe set). The first query builds the index in about 7 seconds. Every query after that takes about 0.6 seconds.

## Decisions on this branch (for the merge owner to move into PLAN.md)

1. **The safe copy is `~/.gbrain/sources/laurelin-safe`.** The brief pointed at the 9/23 work log and the `sync-gbrain` skill for how the copy was produced. The work log could not be read from this worktree: the vault folder returns `Operation not permitted` in the sandbox, as the investor-research note also found. And `sync-gbrain` is gstack's code-repo sync, not the vault import. gbrain's own import checkpoint names the folder, so that is the source. How the sanitized set is produced from the vault is not yet written down in this repo. The merge owner must read the work log and write one paragraph into `pack/memory/README.md`.
2. **Bulk load through CSV, daily changes through the SDK.** Polygres limits the rows API to about 60 writes a minute per project. The first load is about 14,000 rows, which is four hours row by row and under a minute as CSV. `sync.py` picks CSV on a first run or above 200 rows (`--max-rows`), the SDK otherwise. A CSV import appends, so a re-import of changed rows needs the SDK path or a fresh table. The program says so when it prints the commands.
3. **Three tables, not one.** pgGraph builds edges from foreign keys. `links(src_id -> sections.id, dst_path -> notes.path)` gives the graph a section-to-note edge, and `sections.path -> notes.path` closes the loop, so a one-hop expand from a section reaches the sections of the linked note in three key hops. Unresolved wikilinks would break the foreign key, so they stay in the section's `links` JSON and make no edge.
4. **Deletes are tombstones.** The rows API has no delete. A vanished note gets `deleted_at` on its note row and on each of its section rows. The ids derive from path and index, and the state file remembers the count. `query.py` in Polygres mode does not filter tombstones yet. The local mode never sees them. Filtering belongs with the first live run.
5. **Section bounds are a tunable.** The chunker merges short sections forward until 300 words and splits long ones at 800, with even part sizes. About 40 percent of the real sections stay under 300 because a note's last section, or a whole short note, has nothing to merge with. The test fixture uses `LAURELIN_MEMORY_MIN_WORDS=40` because its notes are short. The defaults are unchanged.
6. **Local search is BM25 plus links, cached.** Meaning-based search on the Mac needs an embedding model, and PLAN section 11 says no local chat model. The embedding model gbrain uses is not wired here. So local mode ranks by words (BM25 with heading and title bonuses) and adds one hop along the wikilinks, forward and back, at half and 0.4 of the hit's score. The index (sections plus postings) is one JSON file under `LAURELIN_MEMORY_HOME`, about 48 MB for the real copy, rebuilt when any note's mtime or size changes.
7. **Polygres mode is written against the SDK's real signatures but never ran.** The SDK (0.6.0) was installed in a scratch folder only to read its method signatures. `context.search(collection, text=...)`, `text.tsvector(query, config=...)` and `graph.expand(start, max_depth, direction, limit)` are called as documented. Result field names are guessed defensively (`properties`, `payload`, `row`, `id`, `source_key`) and section text comes from the local copy by id when the copy is present. Any failure falls back to local and says so in `note`. The first live run will need an hour with the real result types.
8. **The extension asks Jev for intent itself.** The router already asks Jev for intent, but `laurelin-memory` sorts before `laurelin-router`, so it runs first in `before_agent_start` and cannot read the router's answer. One extra Choice call (about 200 ms) is cheaper than reordering or coupling the two files. Without Jev (`LAURELIN_MEMORY_JEV=off` or a failure) a heuristic decides. The first prompt of a session, a changed task file, or twelve or more words is a task. The heuristic's verdict always counts. Jev's counts when it clears the threshold. When Jev is unsure, memory is injected, because the failure this piece fixes is not reading the vault.
9. **Rerank is one Score question per candidate.** The jev skill's rule for more than eight items applies: each candidate's text (700 characters) sits inside its own question, and the state holds only the task. Levels: not related, background, useful, needed. Kept: level useful or above, confidence at or above 0.6, best first, five at most. When nothing clears, the message says so and names the three closest by search, so the model can still open them. Retrieval order is used when Jev fails.
10. **What the log holds.** `decision-log/memory.jsonl` has the prompt hash and length, mode, timing, candidate count, intent with confidence and source, and for each kept section the path, section index, heading, level, confidence and retrieval score. No section text. Nothing goes to gstack's decision store, because vault paths can name people and firms. The same object goes to the session as `laurelin_memory`.
11. **The hosted MCP is written down, not run.** It signs in through a browser. The command is in `pack/memory/README.md`, in two forms: through the built fork (`LAURELIN_CODING_AGENT_DIR=~/.laurelin/agent bin/laurelin mcp add polygres --url '...&read_only=true&features=context,graph,database' --oauth`) or, when the fork is not built, `PRIME_AGENT_CODING_AGENT_DIR=~/.laurelin/agent prime-agent mcp add ...`. Plain `bin/laurelin mcp` without the built fork forwards to the installed Prime and would write to `~/.prime`, which rule 17 forbids.
12. **Four skills, not five.** The upstream package has a fifth, `polygres-troubleshooting`. The brief and the survey name four, so four were copied. The `polygres-sdk` skill is part of the repo's `skills/` folder even though the survey's tree listing showed only the plugin copies.

## Findings for Joe

- **Polygres needs two values, not one.** The SDK wants `POLYGRES_API_KEY` (a project key, shape `poly_live_` plus 32 hex) and `POLYGRES_RUNTIME_URL` (the per-project Runtime API URL from the Connect page). Both go in the key store. The CLI signs in through a browser (`polygres login`) and stores its own token. It does not use the key.
- **The free tier fits.** The survey's numbers hold: about 10,400 sections and 17,000 edges against 100,000 vectors and 100,000 graph units.
- **Embeddings cost Polygres credits.** Meaning search needs `polygres embeddings` over `sections.text`, which uses the project's embedding allowance or organization credits. The setup step in the README leaves the model choice to the guided flow.
- **The first index build reads the whole copy.** About 7 seconds, once per change to the copy. When gbrain refreshes the copy, the next task start pays that once. If that wait is a problem, a `laurelin memory index` step after each refresh hides it.
- **The sample notes are invented.** Vendor Alpha, Beta and Gamma, the test stand and the weekly log exist only in `tests/fixtures/vault-sample`. Nothing from the vault or the safe copy is in the repo.

## Rule 17 check

Nothing outside the repo changed. The SDK was installed in the session's scratch folder, not on the machine. The test writes only under `tests/tmp/memory`. A real-copy timing run wrote its cache to the scratch folder, not to `~/.laurelin`. Keys were sourced into the environment and never read or printed. The test greps its own output folder for a key-shaped string and fails if it finds one.
