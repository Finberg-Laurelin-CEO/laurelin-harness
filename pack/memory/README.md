# Memory: the vault, searched before every task

The Obsidian vault is the source of truth. This folder makes the agent read it before it starts a task. It has three parts:

| File | What it does |
|---|---|
| `sync.py` | Reads the safe copy of the vault, cuts each note into sections of about 300 to 800 words, and sends the sections and their wikilink edges to Polygres. Incremental: a note is sent again only when its content changed. |
| `query.py` | Finds the sections that match a task. With Polygres: vector search plus full-text search, fused, then one hop along the wikilink graph. Without Polygres: the same interface over the copy on disk (a BM25 rank with an inverted index, cached), then the same one hop. |
| `../extensions/laurelin-memory.ts` | Runs at the start of every new task: Jev decides the message is a task, `query.py` returns 20 candidates, Jev keeps the 5 that matter, and they go into the model's context as one `laurelin-memory` message with the note paths. `/memory` shows what went in. |

`schema.sql` holds the three tables. `vaultlib.py` is the shared reader and chunker.

## What syncs

Only the SAFE copy of the vault syncs: the sanitized set that gbrain imports, at `~/.gbrain/sources/laurelin-safe` (about 3,650 notes). The vault itself is never read by these programs. Joe decided on 2026-09-25 that this copy may leave the Mac to Polygres. Nothing else leaves. The folder `_local-repos` inside the copy is skipped.

The row shape is `{path, section, heading, text, updated, links[]}`. Each resolved wikilink also becomes one row in `links`, from the section that holds it to the note it names. Unresolved links (to notes outside the safe set, or to attachments) stay in the `links` JSON of the section and make no edge.

## Everyday use

```
python3 pack/memory/sync.py --dry-run --limit 20     # what would be sent
python3 pack/memory/sync.py                          # send the changes (SDK, needs the key)
python3 pack/memory/query.py "cryostat vendor"       # search (Polygres, else local)
python3 pack/memory/query.py --local --json --k 5 "..."
python3 pack/memory/query.py --check                 # is Polygres configured and ready
```

Inside a session: `/memory` shows the sections injected for the last task, `/memory off` stops injection for the session, `/memory <words>` searches without injecting. `LAURELIN_MEMORY=off` in the environment starts a session with memory off.

## First load on Polygres (Joe runs these, rule 8)

The rows API takes about 60 writes a minute, so the first load goes through CSV files and the CLI. Steps:

1. Install the tools in a Python environment: `pip install polygres-sdk polygres-cli`.
2. Sign in: `polygres login` (opens a browser page for approval). Then `polygres projects create standard laurelin-memory` and `polygres projects use laurelin-memory`.
3. Apply the schema: `polygres --json migrations apply --file pack/memory/schema.sql`.
4. Write the CSV files: `python3 pack/memory/sync.py --csv /tmp/laurelin-memory-csv`. The command prints the three `polygres import csv` lines. Run them in the order notes, sections, links.
5. Full-text search: `polygres text configs create-tsvector sections_text --table sections --text-column text --generated-column text_tsv --yes`.
6. Meaning search: `polygres embeddings` on `sections.text` (pick the model in the guided flow), then `polygres context collections create sections` over the managed output. The collection name and the text config name are what `query.py` expects (`POLYGRES_COLLECTION`, `POLYGRES_TEXT_CONFIG`).
7. Graph: `polygres graph discover`, check that it lists `links.src_id -> sections.id`, `links.dst_path -> notes.path` and `sections.path -> notes.path`, then `polygres graph config apply --file graph.json` with the export and `polygres graph build`.
8. Keys: `polygres keys create laurelin-harness` prints the project API key one time. Store it and the Runtime API URL (from the project's Connect page) with `bin/laurelin keys add POLYGRES_API_KEY` and `bin/laurelin keys add POLYGRES_RUNTIME_URL`. Never paste either into a file.
9. Check: `python3 pack/memory/query.py --check`, then `tests/test-memory.sh`.

After that, `python3 pack/memory/sync.py` sends daily changes through the SDK. When more than 200 rows changed, it writes CSV files again and prints the import lines.

The Polygres skills (`polygres-cli`, `polygres-sdk`, `polygres-retrieval-design`, `polygres-data-pipeline`) are in `pack/skills/`, so the model can use the SDK and CLI directly for deeper lookups.

## Hosted MCP, read only

Polygres also serves a hosted MCP endpoint. The fork can register it in its own settings folder (`~/.laurelin/agent`, never `~/.prime`). The endpoint signs in through a browser, so a person runs this once, from the repo root, with the project id filled in:

```
bin/build-agent.sh   # once, so bin/laurelin runs the fork and not the installed Prime
LAURELIN_CODING_AGENT_DIR=~/.laurelin/agent bin/laurelin mcp add polygres \
  --url 'https://mcp.polygres.com/mcp?project_id=<PROJECT_ID>&read_only=true&features=context,graph,database' --oauth
```

Without the built fork, `bin/laurelin mcp` forwards to the installed Prime, which writes to `~/.prime`. In that case use `PRIME_AGENT_CODING_AGENT_DIR=~/.laurelin/agent prime-agent mcp add polygres ...` with the same flags. Then `/mcp login polygres` inside a session. `read_only=true` hides every writing tool.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `LAURELIN_SAFE_VAULT` | `~/.gbrain/sources/laurelin-safe` | The folder that syncs and that local search reads |
| `LAURELIN_MEMORY_HOME` | `~/.laurelin/memory` | Sync state and the local index cache |
| `LAURELIN_MEMORY_STATE` | `$LAURELIN_MEMORY_HOME/sync-state.json` | Per-note mtime, hash and section count |
| `LAURELIN_MEMORY_MODE` | `auto` | `auto`, `local` or `polygres` |
| `LAURELIN_MEMORY_MIN_WORDS`, `LAURELIN_MEMORY_MAX_WORDS` | 300, 800 | Section size bounds |
| `LAURELIN_MEMORY_SKIP` | `_local-repos` | Top-level folders of the copy to skip |
| `LAURELIN_MEMORY` | on | `off` starts a session without injection |
| `LAURELIN_MEMORY_JEV` | on | `off` replaces Jev with a word-count heuristic and search order |
| `LAURELIN_MEMORY_THRESHOLD` | 0.6 | Jev confidence needed to keep a section or to skip a message |
| `LAURELIN_MEMORY_KEEP`, `LAURELIN_MEMORY_CANDIDATES` | 5, 20 | Sections kept and candidates reranked |
| `LAURELIN_MEMORY_CHARS` | 1500 | Characters of each section put in the message |
| `LAURELIN_DECISION_LOG` | `<repo>/decision-log` | Where `memory.jsonl` goes (paths and scores, never text) |
| `POLYGRES_API_KEY`, `POLYGRES_RUNTIME_URL` | from the key store | Needed for every Polygres call |
| `POLYGRES_SCHEMA`, `POLYGRES_COLLECTION`, `POLYGRES_TEXT_CONFIG` | `public`, `sections`, `sections_text` | Names on the Polygres side |

## Test

```
tests/test-memory.sh
```

It uses five invented notes in `tests/fixtures/vault-sample` and never reads the vault or the safe copy. Without `TYPESAFE_API_KEY` the Jev checks are skipped. Without a Polygres key the Polygres check prints `skipped: no POLYGRES key`.
