# pgContext

For a synced project, use a collection over synchronized vectors or a managed
embedding output collection. Keep application writes in the source PostgreSQL
database; Polygres can generate embeddings from its synchronized text. See
[`synced-projects.md`](synced-projects.md) for the two setup paths.

## Contents

- [Namespace and boundaries](#namespace-and-boundaries)
- [Capabilities and collection setup](#capabilities-and-collection-setup)
- [Identity and durable operations](#identity-and-durable-operations)
- [Point lifecycle](#point-lifecycle)
- [Choose retrieval](#choose-retrieval)
- [Text queries and model selection](#text-queries-and-model-selection)
- [Query plans](#query-plans)
- [Authorization and result handling](#authorization-and-result-handling)

## Namespace and boundaries

Use the one synchronous namespace:

```python
context = client.project().context
```

Do not create collection handles, bound operations, an async client, or a
separate management client. Existing `project.graph`, `project.vector`,
`project.text`, and `project.hybrid` methods remain independent.

Context collections never accept legacy pgvector configuration IDs. Treat
`project.vector` as compatibility for previously registered configurations and
use `project.context` for new semantic retrieval setup. One collection can own
multiple named vectors over the same source table. Applications can supply
compatible query vectors or pass text for Polygres to embed using the selected
vector's saved embedding configuration.

Use `$polygres-cli` for interactive collection setup and operator workflows.
Use SDK collection mutations only when the application deliberately owns
automated provisioning and the caller has the required management authority.
Set up source embedding generation and its search collection through the
dashboard, CLI, or MCP. The SDK uses that configuration for queries; creating a
Context collection or registering a vector alone does not select a generation
model.

An `existing` Context source may name a compatible `public.vector(n)` column.
Creating the collection then converts that physical column in place to
`pgcontext.vector(n) NOT NULL`; it does not turn a legacy configuration ID into
a collection or use the same-column bridge. Application-owned provisioning
must separately retire any persisted legacy registration before creation and
must present the table-lock and dependent-index impact for approval.

## Capabilities and collection setup

Use Context capabilities rather than general retrieval readiness:

```python
capabilities = project.context.get_capabilities()

if not capabilities.setup:
    raise RuntimeError(f"Context setup unavailable: {capabilities.setup_blocker}")
```

`setup` applies to collection setup. Before retrieval, check the capability for
the exact method the application will call. For example, require `dense_search`
for `search()` and `joint` for `joint()`, and surface the matching blocker:

```python
if not capabilities.dense_search:
    raise RuntimeError(
        f"Context search unavailable: {capabilities.dense_search_blocker}"
    )

if needs_joint_retrieval and not capabilities.joint:
    raise RuntimeError(f"Context Joint unavailable: {capabilities.joint_blocker}")
```

Use the corresponding `count`, `facets`, `grouped_search`, `recall_check`,
`text_hybrid`, `graph_first`, `vector_first`, or `rank_fusion` flag for those
methods. Collection status and verification do not replace feature-specific
capability checks.

The Python SDK performs this check automatically for Context retrieval. Its
first retrieval call fetches and caches capabilities for that project Context
namespace, and later calls validate project-specific limits locally. Calling
`get_capabilities()` explicitly refreshes the cache. Runtime remains the
authoritative enforcement boundary and revalidates every request.
The cache expires after 60 seconds, and unavailable capabilities are refreshed
on the next attempted call.

Text queries also require `query_embedding_generation`. The SDK checks this
capability automatically, including for legacy vector and hybrid text queries.
An unavailable capability raises `PolygresValidationError` with code
`CONTEXT_CAPABILITY_UNAVAILABLE` before sending the search request. Existing
vector calls remain available on compatible older Runtimes.

Discover visible candidates, then preflight the exact collection request before
creating it:

```python
sources = project.context.discover_sources(schema_names=["public"])

source = {
    "mode": "existing",
    "schema_name": "public",
    "table_name": "documents",
    "source_key_column": "id",
}
vector = {
    "column_name": "embedding",
    "dimensions": 768,
    "metric": "cosine",
}

preflight = project.context.preflight(
    "support_docs",
    source=source,
    vector=vector,
    text_column="content",
    result_columns=["title", "url"],
    filter_columns=["tenant_id", "category"],
)

if not preflight.eligible:
    raise RuntimeError(f"Context preflight blocked: {preflight.blockers}")
```

For a pgvector source, inspect blockers specifically for actual `NULL` values,
dimension mismatch, and unsafe index dependencies. A column declared nullable
can pass when every stored vector is populated. Successful creation is atomic:
non-constraint dependent indexes are dropped, the column is converted through
`real[]`, the native type is set `NOT NULL`, and the pgContext collection and
managed index are created in the same database transaction.

Source modes are `existing`, `add_column`, and `new_table`. The latter two can
change database schema and should not be selected implicitly. Preflight is
read-only; successful preflight does not create or reserve a collection.

Create and verify only after blockers and ownership boundaries are accepted:

```python
operation = project.context.create_collection(
    "support_docs",
    source=source,
    vector=vector,
    text_column="content",
    result_columns=["title", "url"],
    filter_columns=["tenant_id", "category"],
    idempotency_key="support-docs-v1",
)
completed = project.context.wait_for_operation(operation)

if completed.collection_id is None:
    raise RuntimeError("Completed collection creation omitted collection_id")

status = project.context.get_collection_status(completed.collection_id)
verification = project.context.verify_collection(completed.collection_id)
if not verification.verified:
    raise RuntimeError(f"Context verification failed: {verification.checks}")
```

An HTTP-successful verification can still report `verified = False`. Inspect
the ordered checks and request ID.

The creation vector becomes the collection's default. Add another vector only
when the same source rows need another embedding model or input representation:

```python
operation = project.context.add_vector(
    completed.collection_id,
    "title_embedding",
    768,
    name="title_semantic",
    mode="existing",
    metric="cosine",
    set_default=True,
    idempotency_key="support-docs-title-vector-v1",
)
project.context.wait_for_operation(operation)
```

`mode` is `existing` or `add_column`. Adding a vector is a durable mutation and
can change database schema. There is no dedicated add-vector preflight method.
For `existing`, inspect the exact source column before mutation. `add_column`
requires the source table to be empty; show the schema and ownership impact
before application-owned automation performs it. Collection responses expose
`vectors` and `default_vector_name`; do not assume collection status describes
every vector index equally.

Change the two independent defaults with their distinct methods:

```python
operation = project.context.update_collection(
    collection_id,
    default_vector_name="title_semantic",
    idempotency_key="support-docs-default-vector-v1",
)
project.context.wait_for_operation(operation.id)

operation = project.context.set_default_collection(
    collection_id,
    idempotency_key="project-default-context-v1",
)
project.context.wait_for_operation(operation.id)
```

## Identity and durable operations

Pass canonical collection UUIDs to administrative collection, filter, point,
and operation methods. Pass a UUID or exact collection name to count, facets,
and ranked retrieval. The project default collection and each collection's
default vector are independent. Do not scan collection pages to resolve names
or infer either default.

Every durable mutation returns immediately and sends one idempotency key. When
the key is omitted, the SDK generates one UUIDv4 and reuses it only for permitted
transport retries within that method invocation. Generated keys are not exposed
for later replay. Pass and persist a caller-owned stable key when recovery must
survive a failed call, a later call, or a process restart.

```python
operation = context.create_collection("support_docs", source=source, vector=vector)
completed = context.wait_for_operation(operation)
collection_response = context.get_collection(completed.collection_id)
collection = collection_response.collection
```

Waiting is explicit, honors server retry guidance, and does not cancel on
timeout. Operation-management methods identify the operation by its operation
UUID, never by a collection UUID. Call `cancel_operation(operation_id)` or
`retry_operation(operation_id)` separately when the application intends that
action. Never read a private operation result payload.

List and get operations to recover state after a process or network failure.
Only failed or cancelled operations are candidates for retry. The server also
enforces its attempt limit and the operation's `retry_until` window, so handle
`CONTEXT_OPERATION_NOT_RETRYABLE`. An accepted retry creates a new operation ID.
Preserve the original ID, replacement ID, collection ID, status, stage, error,
and request ID.

Collection deletion requires `confirm_collection_id` to exactly equal the path
collection UUID. Read the collection as well as its deletion plan first. For
`existing` and `add_column`, deletion preserves the source table and user-owned
data. For a verified owned `new_table` source, deletion drops the managed source
table and its rows. Do not rely on the summarized deletion plan alone; inspect
`source_mode` and `owns_source_table`, and do not hide that deletion is durable.

## Point lifecycle

For a managed embedding output collection, write the source text and let
Polygres generate its records and reconcile their Context points. Source-row
keys and generated chunk keys can differ, so use the generation workflow for
that collection's refresh and recovery.

For collections over application-owned vector columns, use the following
point lifecycle.

Source rows and Context point mappings have separate lifecycles. Upsert known
keys after out-of-band or legacy inserts, existing-row backfills, or vector
changes; delete known keys after source deletion; and reconcile after bulk or
uncertain changes. Never follow a Context-backed `project.rows` write with
`upsert_points()`: that one row operation already completes or durably starts
the required point reconciliation.

For an out-of-band source write, commit the source-row transaction before
calling `upsert_points()` or `delete_points()`. The source database change and
dedicated Context point mutation are not one cross-system transaction. On an
ambiguous outcome, inspect point status and reconcile rather than assuming both
sides committed together.

Point upsert and delete may return either `PointMutationResponse` or
`ContextOperation`:

```python
from polygres import ContextOperation

# The transaction that inserted or updated these source rows has committed.
result = project.context.upsert_points(
    collection_id,
    ["doc-1", "doc-2"],
    idempotency_key="support-docs-upsert-42",
)

if isinstance(result, ContextOperation):
    result = project.context.wait_for_operation(result)
```

Inspect `get_point_status()` before resubmitting after a timeout. Use
`scroll_points()` only for administrative point mappings; it does not expose
vectors or source payloads. Treat its cursor as opaque.

## Choose retrieval

| Need | Method |
| --- | --- |
| Count matching points | `project.context.count()` |
| Aggregate a registered filter | `project.context.facets()` |
| Semantic similarity | `project.context.search()` |
| Rank a known set of Context point IDs | `project.context.candidate_search()` |
| Group by a registered filter | `project.context.grouped_search()` |
| Semantic plus configured full text | `project.context.query()` or `text_hybrid()` |
| Expand from a verified graph anchor, then rank | `project.context.graph_first()` |
| Retrieve semantic seeds, then add graph evidence | `project.context.vector_first()` |
| Fuse independent Context and graph rankings | `project.context.rank_fusion()` |
| Couple semantic, lexical, and graph candidate generation | `project.context.joint()` |
| Compare HNSW results with exact retrieval | `project.context.recall_check()` |

Count and facet requests accept the same registered-filter shape as dense
retrieval. Facet only on a registered filter key:

```python
tenant_filter = {
    "must": [{"key": "tenant_id", "match": authorized_tenant_id}],
}
matching = project.context.count("support_docs", filter=tenant_filter)
categories = project.context.facets(
    "support_docs",
    "category",
    filter=tenant_filter,
    limit=20,
)
```

Dense retrieval uses a collection UUID or exact name:

```python
response = project.context.search(
    "support_docs",
    query_embedding,
    vector_name="title_semantic",
    filter={
        "must": [
            {"key": "tenant_id", "match": authorized_tenant_id},
        ]
    },
    limit=10,
)
```

Every ranked Context method accepts optional `vector_name`. Omit it to use the
collection's `default_vector_name`; otherwise pass its exact registered name.
For the vector example above, construct `query_embedding` with that vector's
model and dimensions. Count and facets operate on collection points and do not
select a vector.

Use `graph_first()` when a verified start entity defines the candidate
neighborhood. Use `vector_first()` when semantic candidates should supply graph
seeds. Use `rank_fusion()` for independent rankings. Use `joint()` when graph
expansion must introduce candidates before exact Context rescoring and final
fusion. A positive Joint lexical weight requires a non-blank query and a
configured text column.

Do not invent graph IDs. Resolve starts from trusted application data or prior
typed results. Bound Context candidates, graph depth, graph candidates,
traversal candidates, final results, elapsed time, and application token use.

## Text queries and model selection

With SDK 0.5.0, use the existing search methods with text:

```python
response = project.context.search(
    "support_docs",
    text="How does replication work?",
    vector_name="content",
    filter={"must": [{"key": "tenant_id", "match": authorized_tenant_id}]},
    limit=10,
    use_credits=False,
    idempotency_key=query_request_id,
    timeout=30.0,
)
```

`vector_name="content"` names a vector registered on the collection. It is not
a source column name, a legacy configuration ID, or a model ID. Polygres resolves
the selected vector's column to one saved embedding configuration and uses that
configuration's exact model, revision, dimensions, and query settings.

A managed output vector already has this connection. To query existing source
vectors with text, confirm their original model during embedding setup through
the dashboard, CLI, or MCP. Equal dimensions alone do not establish model
compatibility. If the model connection is missing or ambiguous, handle
`EMBEDDING_SEARCH_NOT_READY` and complete setup before using text. Continue to
use a compatible application-supplied vector when that is the chosen workflow.

| Methods | Input |
| --- | --- |
| `search()`, `candidate_search()`, `grouped_search()` | Exactly one of `text` or `embedding` |
| `graph_first()`, `vector_first()`, `rank_fusion()`, `joint()` | Exactly one of `text` or `embedding` |
| `query()`, `text_hybrid()` | `query`; optionally supply an `embedding` |
| `query_nearest()` | Exactly one of `text` or `vector` |

`candidate_search()` still requires `candidate_point_ids`. Pass IDs obtained
from Context point mappings or query results. `grouped_search()` requires
`group_by` naming a registered filter field.

`query()` and `text_hybrid()` combine semantic and configured full-text search.
When `embedding` is omitted, Polygres embeds their existing `query` argument:

```python
response = project.context.query(
    "support_docs",
    query="replication failures",
    vector_name="content",
    idempotency_key=query_request_id,
)
```

For `joint()`, `text` is the semantic question and `query` supplies lexical
terms. A positive lexical weight requires both a query and a configured text
column:

```python
response = project.context.joint(
    "support_docs",
    text="How do I recover a failed replication stream?",
    query="replication recovery",
    vector_name="content",
    starts=[start],
    semantic_weight=0.6,
    lexical_weight=0.2,
    graph_weight=0.2,
    max_depth=2,
    limit=10,
    idempotency_key=query_request_id,
)
```

Recall checks and raw vector search use vectors. Recommendation, discovery,
sparse, late-interaction, and full-text methods retain their existing inputs.
Their text or vector arguments are separate from managed query generation.

Generating query embeddings consumes the project's retrieval allowance, valued
using the input tokens and configured model price. `use_credits` defaults to
`False`. Set it to `True` for additional organization-credit usage only when
project spending is enabled, within its cycle limit and available balance.
Use the returned usage amounts and renewal date from the dashboard, CLI, or MCP;
there is no fixed token quota to assume. Supplied query vectors skip generation
and its allowance charge. See [`errors-pagination-testing.md`](errors-pagination-testing.md) for retry identity,
timeouts, and funding errors.

## Query plans

Construct nearest branches locally, then execute the plan against a collection:

```python
plan = project.context.query_nearest(
    text="How does replication work?",
    vector_name="content",
    limit=10,
)
response = project.context.execute_query(
    "support_docs",
    plan,
    use_credits=False,
    idempotency_key=query_request_id,
    timeout=30.0,
)
```

`query_nearest()` sends no request and generates no embedding. Pass spending,
retry, and timeout options to `execute_query()`. For a plan with multiple nearest
branches, each text branch uses its selected vector's model and consumes
retrieval allowance separately. Text and explicit-vector branches can coexist.
Reuse the same idempotency key when retrying the same plan so completed embedding
work can be reused.

## Authorization and result handling

Registered filters constrain retrieval but are not an authorization boundary.
Derive collection choice and tenant filter values from trusted authorization
context. Do not pass arbitrary client-supplied tenant filters directly to
Context retrieval.

Ranked Context responses are typed envelopes, not cursor pages. Preserve server
order, scores, warnings, nullable fields, request IDs, and `to_dict()` output.
Administrative collection, point-scroll, and operation listings use `Page` and
opaque cursors.

`project.context.rank_fusion()` runs independent late fusion.
`project.context.joint()` calls only `/context/hybrid/joint` and preserves its
semantic, lexical, and graph evidence, contribution breakdown, fusion metadata,
trace counts, graph-introduction flag, baseline rank, and rank lift. It is not
an alias for rank fusion or `project.hybrid.joint()`.
For the setup tools, see [Embedding generation](mcp-tool-contract.md#embedding-generation)
in the MCP tool contract.
