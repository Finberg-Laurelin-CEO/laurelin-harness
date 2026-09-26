# pgContext design

## Contents

- Data contract
- Retrieval mode
- Lifecycle and validation

Use Polygres AI Context as the default design surface for new semantic
retrieval. If the project already has a pgvector configuration, decide whether
to preserve it temporarily for compatibility or replace it with a native
collection through explicit in-place column migration.

Choose the generation owner with [`embedding-design.md`](embedding-design.md). For a synced project,
select `existing` Context source mode: either an eligible synchronized vector
column or the managed output returned by the embedding Context handoff.
Polygres can generate that output from synchronized text. Source SQL and row
writes remain in the source PostgreSQL database. Re-review the collection when
sync selection removes or resyncs a required table, column, key, or embedding.

## Data contract

Record:

- source schema, table, and exact `id` key semantics;
- `existing`, `add_column`, or `new_table` source mode;
- who owns the table and the collection's shared source lifecycle;
- every vector's exact name and column, `index_kind` (`none` or `hnsw`), who
  owns its column and any managed HNSW index, embedding model and revision,
  dimensions, metric, input construction, and update timing;
- source and query generation owners, the selected vector's configuration
  binding, and the Runtime `query_embedding_generation` capability;
- which vector is the collection default and whether the collection is the
  project default;
- text column, returned result columns, ordinary filters, and JSONB filter paths;
- expected row count, change rate, reconciliation frequency, and freshness SLO;
- whether authorization restricts collection choice or filter values.

Local or external vectors and Polygres generation are supported.
A non-empty external vector source needs a
valid fixed-dimension native Context vector or compatible pgvector column
before registration. An existing pgvector column is eligible for conversion
only when its dimensions match and no stored vector is `NULL`. Do not propose
`add_column` for populated data without an explicit embedding and migration
plan.

Create separate collections when sources, source keys, filters, result columns,
text configuration, authorization policy, or lifecycle differ. Use multiple
named vectors in one collection when the same rows need distinct embedding
models or representations while sharing those collection-level settings. One
initial vector is required and becomes the default. Ranked retrieval can name
another vector exactly; omission uses the collection default. Treat a model or
dimension change as a new vector until its embeddings, index, validation, and
cutover are complete.

For pgvector migration, record the persisted legacy configuration, dependent
indexes and constraints, acceptable lock window, and rollback expectation.
Run Context discovery and preflight first. If a persisted Legacy vector
registration refers to the selected column, obtain approval and explicitly
delete that exact registration before collection creation. The dashboard does
not perform this cleanup automatically. A public CLI, API, or SDK workflow must
therefore include discovery, preflight, explicit Legacy registration cleanup,
creation, operation waiting, and verification. Registration cleanup preserves
the source table, vector column, and stored values.

Converting a pgvector column takes an `ACCESS EXCLUSIVE` lock, drops
non-constraint dependent indexes, converts the column in place, and sets it
`NOT NULL`. A constraint-backed dependent index blocks conversion. Do not
describe a physical-only pgvector index as implicitly registered or usable, and
do not propose the retired Legacy create or update APIs as a way to register or
re-enable it.

## Retrieval mode

Choose the smallest mode that answers the representative questions:

- dense for semantic similarity;
- grouped search for per-key diversity;
- text hybrid when configured lexical evidence measurably helps;
- graph first when a trusted graph anchor defines the useful neighborhood;
- vector first when semantic seeds should acquire graph evidence;
- rank fusion when independent Context and graph ranks should be combined;
- Joint when graph expansion must introduce candidates before exact Context
  rescoring and final fusion;
- recall check for operational HNSW quality, not application retrieval.

Do not recommend graph composition without verified graph registrations, real
row IDs, useful relationships, bounded traversal, and a measurable benefit over
dense or text retrieval. Existing Context methods accept either query
embeddings or text that Polygres embeds using the selected vector's saved
model. A positive Joint lexical weight uses the separate `query` value and a
configured text column. See [`embedding-design.md`](embedding-design.md) for each method's inputs.

## Lifecycle and validation

Plan capability discovery, source discovery, preflight, collection creation,
additional vector creation, operation waiting, default-vector cutover,
per-vector index status, active verification, point synchronization,
diagnostics, reindex triggers, and deletion ownership.
For `index_kind: hnsw`, require the managed physical index to become Ready. For
`index_kind: none`, document exact-scan operation without an HNSW index and do
not invent an index build or reindex requirement.

Define how inserts, vector updates, source deletes, restores, bulk loads, and
embedding-model changes trigger point upsert, delete, reconciliation, or a new
collection. Include idempotency-key ownership and recovery after client
timeouts. For managed output, Polygres processes the source changes and
reconciles its linked Context collections. Track generation progress and
Context pending or failed work separately. A collection over managed output
is attached to that output table, not to source-row writes.

Validate every vector with representative queries, exact dimension failures,
an unknown `vector_name`, omitted-name default behavior, empty and non-finite
embeddings, cosine zero vectors, unknown filter keys, tenant isolation,
text-column absence, graph capability absence, stale mappings, recall
thresholds, degraded per-vector index status, and operation conflicts.
For text input, also validate the saved model binding, capability availability,
query allowance, credit opt-in, and retries with the same logical query key.

The current `context.v1` contract is preview. Record compatibility and fallback
behavior without implying automatic fallback to pgvector or confusing explicit
in-place conversion with the guided Legacy-source onboarding flow.

Managed sources use the embedding generation workflow in
[the MCP tool contract](mcp-tool-contract.md), with a separate Context handoff.
