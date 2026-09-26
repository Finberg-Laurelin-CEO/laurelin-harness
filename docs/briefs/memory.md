# Branch `memory`: vault plus Polygres, retrieval autoloaded

Plan: section 8 item 3, section 11 (memory options), section 20 wave 3 (memory, revised), section 22. The survey (9/25) found: Polygres skills at `Evokoa/polygres-skills` (Apache-2.0; `polygres-data-pipeline`, `polygres-cli`, `polygres-sdk`, `polygres-retrieval-design`); SDK `pip install polygres-sdk` with `project.rows.upsert`, `project.vector.search`, `project.text.tsvector`, `project.graph.expand`, and a hybrid endpoint; CLI `polygres import csv`; hosted MCP at `https://mcp.polygres.com/mcp?project_id=<id>` with a read-only option; free Nano tier 500 MiB, 100k vectors, 100k graph units, which fits about 3,800 notes and 13,000 sections with room. There is no markdown importer: the harness chunks notes into rows itself.

Rule 6 and rule 8: the SAFE copy of the vault is what syncs (the sanitized set gbrain used; find how it was produced from `Laurelin/Work Logs/WORK-LOG 2026-09-23 — Laurelin agent harness + gbrain refresh.md` and `~/.claude/skills/sync-gbrain/SKILL.md`). Joe decided the copy may leave the Mac to Polygres. Nothing else leaves. If `POLYGRES_API_KEY` (or whatever the SDK needs; read its README) is not in the key store, build everything against a local dry-run mode and set the worktree comment to `blocked: needs POLYGRES key: laurelin-agent keys add <NAME>`.

## Make
1. `pack/memory/sync.py`: reads the safe vault copy, splits each note into sections (heading-bounded, about 300 to 800 words), and upserts rows `{path, section, heading, text, updated, links[]}` with wikilinks as graph edges; incremental by mtime and content hash; `--dry-run` prints counts; `--limit N` for tests. Uses the SDK; falls back to `polygres import csv` for the first bulk load.
2. `pack/memory/query.py`: hybrid search (vector plus text plus graph expand one hop) returning the top k sections with path and heading; `--local` mode that greps the vault copy with the same interface for when Polygres is unreachable.
3. `pack/extensions/laurelin-memory.ts`: on `before_agent_start` for a new task (not steers), builds a query from the message and the task file, calls `query.py` (Polygres, else local), reranks the top 20 with Jev to 5 (section 18 group 2), and injects them as a custom message `laurelin-memory` with paths, so the model reads the vault before it starts (section 5, "didn't read the vault first"). `/memory` shows what was injected; `LAURELIN_MEMORY=off` disables. Install the Polygres skills into `pack/skills/` (rule 17: repo only) so the model can use the SDK directly for deeper lookups.
4. Register the hosted MCP read-only in the fork's own settings folder only (`~/.laurelin/agent`, never `~/.prime`): write the exact command to the branch note; do not run it if it needs a browser sign-in; the launcher can run it later with Joe.

## Test
`tests/test-memory.sh`: sync `--dry-run --limit 20` over `tests/fixtures/vault-sample/` (write five invented notes with wikilinks) prints 20 sections and the edges; `query.py --local` on the sample returns the note that mentions the query term first; the extension, fed a synthetic message, injects a memory message with paths (load through Prime's `loadExtensions` as other tests do). Polygres calls run only when the key is present and are otherwise reported `skipped: no POLYGRES key`.

## Out of scope
gbrain. The GCP machine. Syncing the raw vault.
