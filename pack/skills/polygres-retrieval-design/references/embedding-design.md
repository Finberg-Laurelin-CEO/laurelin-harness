# Embedding design

Choose how source text and search queries become embeddings, then select the
Context collection and vector that retrieval will use. Preserve an existing
embedding pipeline when it meets the user's needs.

## Contents

- [Generation choices](#generation-choices)
- [Source ownership and readiness](#source-ownership-and-readiness)
- [Query model selection](#query-model-selection)
- [Budget and request handling](#budget-and-request-handling)
- [Setup handoff](#setup-handoff)

## Generation choices

| Choice | Best fit | Plan records |
| --- | --- | --- |
| Polygres generation | Polygres should generate embeddings and keep them current as source text changes | Eligible text source and stable keys, catalog model and revision, dimensions, chunking, processing mode, usage budget, Context handoff |
| Local generation | The user wants inference on their own device or infrastructure | Hardware fit, model revision, source and query input settings, batching, writes, refresh ownership, retrieval dimensions |
| External generation | An application or provider already owns embedding generation | Provider and credential ownership, pinned model and dimensions, source and query settings, cost, writes and refresh ownership |
| Existing vectors | Compatible embeddings are already stored | Exact source and column, original model evidence, dimensions, metric, update owner, query generation choice |

Use the live `list_embedding_models` catalog for managed model choices. Record
the selected model ID, revision, supported dimensions, input limit, and token
price version. Local and external choices use their own verified model
specifications. Provider credentials for Polygres generation are managed by
Polygres.

Use `discover_embedding_sources` to verify the source text column, ordered
unique key columns, and any existing vector column. Read
`get_embedding_usage` and existing configurations before recommending new
work. `preview_embeddings` validates the proposed settings and estimates
copied rows, generated rows, chunks, tokens, storage, and additional credit
usage without calling the embedding provider. Keep estimates labeled as
sampled when the response says they are.

To seed Polygres generation with existing vectors, confirm that the selected
catalog model and dimensions produced them. Matching dimensions alone are
insufficient. This confirmation binds future source and query generation to
that model. Whole-row vectors can seed a whole-row configuration; chunked
generation produces its own chunk embeddings. Source text is required in both
cases so Polygres can generate embeddings for future changes. Existing vector
retrieval can also continue with its current generation owner.

## Source ownership and readiness

Polygres generation reads the selected source and writes a separate managed
embedding table. It supports eligible text sources in both project modes.
For a synced project, an existing synchronized source table can supply text
without having an embedding column. The source PostgreSQL database remains
the owner of source SQL and row writes. Polygres owns the derived output and
its Context point updates.

For local or external generation on a synced project, write embeddings to the
source database and synchronize the selected column. Use `existing` Context
source mode to register either the synchronized vector column or the managed
table returned by `get_embedding_context_handoff`. Reserve `add_column` and
`new_table` plans for supported Standard-project sources.

Track two readiness stages: source generation and Context collection/index
readiness. A completed generation pass does not by itself create a searchable
collection. Inspect the handoff for its exact table, `id` source key, vector
column, dimensions, and result columns. Managed source identity and chunk
identity are separate; preserve `source_key` and `chunk_index` when mapping
results back to source rows.

Automatic mode processes ongoing changes; Manual mode gathers pending work
for an explicit run. Both modes start initial generation when created. Record
freshness expectations accordingly. The service manages processing batch
sizes. Treat source, model and dimension changes as a new configuration and an
explicit retrieval cutover. Definite oversized failures can instead enable
automatic chunking selectively, preserving successful rows.

## Query model selection

The application supplies a collection and, optionally, `vector_name`.
`vector_name` is the exact named vector within that collection. Omission uses
the collection's default vector. It is not a model name or the project default
collection.

For query text, the Runtime resolves the selected vector's source table and
column to one saved embedding configuration, checks matching dimensions, and
uses that configuration's model and revision with its query input settings.
This works with the managed output or an original vector column whose model
was explicitly confirmed. A collection name and matching dimensions alone do
not establish this binding. Inspect it before choosing text input; use the
existing application-generated vector path when that is the intended design.

SDK 0.5.0 extends the existing query methods:

| Application method | Query input choice |
| --- | --- |
| `project.context.search`, `grouped_search`, `candidate_search` | One of `embedding` or `text`, plus an optional `vector_name` |
| `project.context.graph_first`, `vector_first`, `rank_fusion`, `joint` | One of `embedding` or `text`, with the same graph bounds as before |
| `project.context.query`, `text_hybrid` | Required `query` supplies lexical text and, when `embedding` is omitted, semantic text |
| `project.context.query_nearest` | One of `vector` or `text`; the selected vector is recorded on this plan node |
| `project.context.execute_query` | Executes the plan and accepts query credit and idempotency options |

For Joint retrieval, `text` drives semantic embedding generation and `query`
supplies optional lexical ranking. A positive lexical weight requires `query`
and a configured text column. Other lexical methods retain their current
meaning; supplying text for TSVector, fuzzy, or `query_full_text` does not
request an embedding.

For example, this plan node selects a configured `content` vector for semantic
retrieval. Use the actual collection and vector names from discovery:

```json
{
  "kind": "nearest",
  "text": "How does replication work?",
  "vector_name": "content",
  "limit": 10
}
```

Read the Runtime `query_embedding_generation` capability before designing a
text-input integration. Existing numeric-vector calls remain compatible with
older Runtime versions. The SDK has no public `project.embeddings` namespace;
generation setup belongs in MCP, CLI, or the dashboard. Raw vector scoring,
recall checks, sparse and late-interaction queries, and point-based methods
keep their existing vector or point inputs.

## Budget and request handling

Source generation and query generation have separate monetary allowances.
Read their included, used, reserved, and remaining microcredits and the
reported usage period. Estimate cost from input tokens and the selected
model's token rate; different models consume different amounts for the same
token count. One credit equals one US cent, and one credit contains one
million microcredits. Use the returned model prices and allowance values
rather than assuming a fixed token quota.

Use the generation bucket for the initial backfill and later source changes.
Use the query bucket for each semantic query embedding. A plan with several
text-based `nearest` nodes can generate an embedding for each node. Supplying
numeric vectors or running lexical search does not consume Polygres query
embedding allowance.

Included allowance is used first. Additional usage needs an owner or admin
to enable project credit spending, an available organization balance, room
within the project cycle limit, and `use_credits=True` on the relevant
configuration or query request. Source-generation opt-in and query opt-in are
independent; the query default is `False`. Keep spending decisions within the
user's authorization. A generation preview should show that the initial work
fits the available funding before setup is handed off.

Choose a query timeout that includes provider latency; the SDK accepts a
per-request `timeout` and its default is 30 seconds. Keep one
`idempotency_key` for retries of the same logical query and use a new key for
changed inputs. The SDK creates a key when omitted and reuses it for its
transport retries. Application-level retries need to retain their own key.
Include the returned quota or provider error in the recovery plan; a new key
is not a way to resolve an uncertain provider outcome.

## Setup handoff

Return the exact discovery, preview, creation, status, and Context handoff
operations from [`mcp-tool-contract.md`](mcp-tool-contract.md). The CLI provides `embeddings` commands
for the same workflow. In the dashboard, start with **Generate embeddings**,
review the preview and funding, then use **Configure** under **Search
collection** for the Context collection. **Connect** opens application
connection details. Plan queries through the existing SDK or MCP retrieval
tools; the embeddings page is for generation and configuration.

New generation defaults to automatic oversized-only chunking. Retain source keys
and chunk indices when mixing whole documents and passages; group search results
by a registered source key where one result per document is required. Existing
vector copying and explicit legacy policies retain their behavior. Generation
batches stay within a configuration and allow four concurrent provider calls;
this does not promise four times end-to-end throughput. Check index readiness
separately. The CLI recovery workflow requires 0.6.0; SDK queries remain on their
existing API and do not manage generation configuration.
