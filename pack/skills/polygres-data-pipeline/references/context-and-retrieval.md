# Context, embeddings, and retrieval

## Contents

- Select the generation path
- Choose the correct collection source
- Search with text or vectors
- Combine retrieval and retain provenance
- Define retrieval timing and recovery

## Select the generation path

Polygres generates source and query embeddings when a compatible configuration
is set up. Applications can also supply vectors from a local model, external
provider, or existing source column. Follow [`embedding-model-selection.md`](embedding-model-selection.md) and
the user's provider and data-processing preferences. Keep model selection in
the existing setup review.

For Polygres generation, inspect source eligibility, saved configurations,
models, and usage; preview the source work before starting it. Use MCP, CLI, or
the dashboard to manage generation. The Python SDK uses existing retrieval
methods for text queries and does not expose `project.embeddings`.

## Choose the correct collection source

**Managed output:** read `get_embedding_context_handoff` or `embeddings context`
and use the returned managed schema, table, key, vector, dimensions, and result
columns. The current output uses `polygres_embeddings`, key `id`, vector
`embedding`, and fields including `content`, `source_key`, `chunk_index`, and
`source_record`. Copy the returned values rather than guessing a table name.
Each generated chunk has its own managed identity. Configure filters and result
fields so ownership and citations resolve back to the original source record.

Write source text with an ordinary row operation on a standard project, or in
the source database for a synchronized project. Omit Context reconciliation
options on those writes. Polygres generates embeddings and reconciles the
managed output into its linked collection. A CLI bulk import changes source rows
only; generation and search catch up afterward. Verify source persistence,
generation progress, and search readiness as distinct results.

**Application-owned vectors:** for a Context-backed source table, use one
Context-backed rows operation with an explicit collection or exact-one safe
resolution. It writes the source row and completes or starts stable-ID point
reconciliation. Existing-row backfills and deletion repair use the dedicated
point lifecycle. Reconcile rows from a bulk import before claiming this
collection's semantic retrieval is ready.

Use discovered MCP schemas or installed CLI help for collection preflight,
creation, updates, and durable operation tracking. Verify collection and index
status. Reuse approval for unchanged source, schema, provider, and spending
scope. Keep distinct model contracts in separate vectors or reviewed reindexes.

## Search with text or vectors

SDK 0.5.0 accepts text through existing methods:

```python
results = project.context.search(
    "articles",
    text="How does replication work?",
    vector_name="content",
    idempotency_key="replication-question-1",
)
```

`vector_name` is the collection's registered vector name; omitting it uses the
default. Polygres resolves the model, revision, input settings, and dimensions
from that vector's saved configuration. It does not select a model merely
because its dimensions match.

`context.query()` and `text_hybrid()` embed their `query` when `embedding` is
omitted. Joint search uses `text` for semantic search and `query` for lexical
search. `query_nearest(text=...)` creates a local plan; `execute_query()` generates
its query embeddings. Independent text branches may each consume retrieval
allowance. Explicit-vector calls keep their existing behavior.

For CLI 0.5.0, use `context search COLLECTION --text ...`, or `--text-file` for a
file input. MCP `context_search` accepts `text`; Context hybrid tools accept
text in their discovered request structure. Use the existing retrieval tools,
with filters and limits retained. Query generation requires the Runtime
`query_embedding_generation` capability and a valid configured model binding.
Keep older client vector calls available when planning an incremental upgrade.

Text queries use the retrieval allowance. Additional credits default off and
also require project spending permission. Save one idempotency key per logical
query and reuse it with the same text, collection, filters, vector, and options
on retries. SDK pagination preserves the query key; a new query uses a new key.
Allow time for embedding generation within the application's deadline. Inspect
quota and provider error codes instead of retrying every 429 or timeout.

## Combine retrieval and retain provenance

- Relational queries serve exact predicates, dates, joins, and counts.
- Full-text search serves names, terms, IDs, and error strings.
- Context serves semantic similarity.
- Graph follows validated relationships.
- Hybrid retrieval combines selected evidence with deduplication.

Apply authorization before retrieval and again when resolving source rows.
Configure supported ownership filters; filters supplement the application's
access checks. Preserve stable source IDs, request IDs, pagination state, and
partial results. With chunks, deduplicate or group according to the user-facing
result unit and retain the source/chunk citation mapping.

## Define retrieval timing and recovery

For agent memory, choose recall timing for the host: selected prompts, a router,
an explicit command, or an application hook. A small bounded result set such as
3 to 8 candidates is a useful start; tune relevance, deduplication, and token
budget from observed results. Inject labeled evidence when it helps the task.

Use the SDK in trusted application code, or published Runtime endpoints when
the application uses another language. Follow the public authentication,
pagination, error, and idempotency contracts.

On a read outage, use a verified text fallback or continue without memory only
when that behavior fits the user's selected design. Report pending writes
accurately and queue them only with a durable recovery path. Retain uncertain
provider attempts for the specified reconciliation process before choosing a
new query key.
