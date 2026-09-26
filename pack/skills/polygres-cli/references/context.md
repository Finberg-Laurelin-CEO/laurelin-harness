# pgContext AI Search

For a synced project, configure Context only from an existing synchronized
table and column or a managed `polygres_embeddings` output. Do not use
`add-column` or `new-table` on a synchronized source. Managed generation writes
only to its separate project-local destination.

## Contents

- [Boundaries](#boundaries)
- [Plan and preflight](#plan-and-preflight)
- [Create a collection](#create-a-collection)
- [Operate collections](#operate-collections)
- [Synchronize points](#synchronize-points)
- [Choose retrieval](#choose-retrieval)
- [Handle durable operations](#handle-durable-operations)
- [Delete safely](#delete-safely)

## Boundaries

Context is the pgContext-backed AI Search namespace. It is separate from
pgvector configurations and never accepts a vector configuration ID. Use
`polygres context capabilities`, not `polygres ready`, to establish effective
pgContext support and limits.

For externally generated vectors, confirm who generates embeddings, the
stored vector dimensions, the metric, and how new or changed source rows get
embedded before configuring a collection. A collection can contain multiple
named vectors over one source table. Query embeddings must use the model,
revision, dimensions, and settings of the selected vector. For Polygres-managed
generation, follow [embeddings.md](embeddings.md) to create the configuration
and obtain its Context source details.

Use collection UUIDs for collection administration, filters, points, and
operation-linked work. Count, facets, and ranked retrieval accept a UUID or an
exact collection name. Never fuzzy-match a collection name or infer the default
by scanning pages.

## Plan and preflight

Start with read-only evidence:

```bash
polygres --json context capabilities
polygres --json context sources discover --schema public
```

Choose one source mode:

- `existing`: register an existing table and native `pgcontext.vector(n)`
  column, or convert a compatible `public.vector(n)` column in place. Polygres
  does not own the source table or an existing column.
- `add-column`: add a native vector column to an empty existing table. This is
  a schema mutation and requires explicit approval.
- `new-table`: create a minimal source table. This is a schema mutation and
  requires explicit approval.

Preflight the exact create payload before mutation:

```bash
polygres --json context sources preflight --file collection.json
```

Report `eligible`, blockers, warnings, planned actions, and ownership
boundaries. Do not proceed past a blocker or treat a warning as verified safe.
Obtain explicit approval before every durable pgContext mutation. For
`add-column` or `new-table`, show the exact preflight DDL, affected schema
objects, and whether Polygres or the user owns each table, column, and index
before requesting approval.

Treat `existing` as a schema mutation when discovery reports
`type_owner=pgvector`. Before approval, explain that creation takes an
`ACCESS EXCLUSIVE` table lock, drops non-constraint indexes that depend on the
selected column, converts its stored values and type to
`pgcontext.vector(n) NOT NULL`, and creates a new managed index. A nullable
declaration is acceptable only when the live row check finds no `NULL` vectors.
Do not describe this ordinary create path as a bridge.

## Create a collection

For an existing source:

```bash
polygres context collections create support_docs \
  --source existing \
  --schema public \
  --table documents \
  --source-key-column id \
  --vector-column embedding \
  --dimensions 768 \
  --metric cosine \
  --text-column content \
  --result-column title \
  --result-column url \
  --filter-column tenant_id \
  --filter-column category
```

Mutations generate an idempotency key and wait for the durable operation by
default. Use `--no-wait` only when the user wants acceptance without waiting.
Use an explicit stable `--idempotency-key` when recovery must survive a process
restart. A wait timeout does not cancel server work.

If the selected pgvector column has a persisted legacy vector configuration,
list it and obtain explicit approval to delete that exact configuration before
collection creation. Neither the dashboard nor the CLI deletes that registration
as part of creation. Deleting the registration is a separate approved operation
that preserves the source table, column, and vector values.

After creation, retain the operation and collection UUIDs and verify serving:

```bash
polygres --json context collections status <collection-uuid>
polygres --json context collections verify <collection-uuid>
```

A verification response can be HTTP-successful while `verified` is false.
Inspect the checks rather than treating the command exit alone as proof.

The creation vector is the collection default. Use JSON output for collection
list, get, status, and deletion-plan inspection. The current human formatter
does not faithfully render the plural `vectors`, `default_vector_name`, or
plural deletion-plan fields. Preserve those JSON fields when reporting state.

The project default collection is independent of a collection's default vector.
`context collections set-default` changes the project default collection; it
does not change `default_vector_name`. The current CLI has no dedicated command
for adding a vector or changing a collection's default vector. Route those
approved mutations to the dashboard, public Context API, or Python SDK.

## Operate collections

Use public status and diagnostics before a mutation:

```bash
polygres --json context collections get <collection-uuid>
polygres --json context collections status <collection-uuid>
polygres --json context collections diagnostics <collection-uuid>
polygres --json context filters list <collection-uuid>
```

Register only filters required by known application queries. Ordinary columns
use `filters add-column`; JSONB fields use `filters add-jsonb-path`. Filter keys
are retrieval inputs, not an authorization boundary. Applications must derive
tenant filters from trusted authorization context.

Obtain approval before reindexing. Preserve the accepted operation ID and
verify status afterward. The CLI reindex command targets the collection's
current default vector; use the public Context API or SDK when an exact
non-default vector must be reindexed.

Collection status is not a substitute for checking the selected vector's index
state. Report vector names, dimensions, metrics, per-vector index statuses, and
the default vector without collapsing them into one synthetic index.

## Synchronize points

For a collection over managed embedding output, Polygres maintains its records
and point mappings as generation completes. Check `embeddings get` for source
processing and Context progress, then check collection and vector readiness.
Its point keys identify generated records, including individual chunks. Keep
source row IDs in source writes; do not submit them as managed collection point
IDs. The following manual mapping workflow applies to application-owned vector
tables.

Source rows and pgContext point mappings have separate lifecycles. Point status
is saved operational metadata, not a live comparison with the source table:

```bash
polygres --json context points status <collection-uuid>
```

Do not interpret `current` as proof that mappings match rows after out-of-band
changes. For known keys inserted or restored outside a Context-backed `rows`
command, use `points upsert`. For known deleted source keys, use `points
delete`. Use `points reconcile` for bulk loads or unknown row drift; it performs
a live, full two-way reconciliation. Never follow a Context-backed `rows`
command with `points upsert`: the row command already completes or durably
starts the required point reconciliation. Updating an embedding vector does not
by itself change the source-key mapping.

Small key batches may complete synchronously; larger accepted batches return
durable operations. Obtain approval before a durable point mutation and before
deleting mappings that affect serving behavior. Never resubmit after a timeout
until the existing operation has been checked.

Point scroll exposes mappings, not vectors or source payloads. Its cursor is
opaque and must be returned unchanged.

## Choose retrieval

Use aggregates when ranking is unnecessary:

```bash
polygres --json context count support_docs \
  --filter-json '{"must":[{"key":"tenant_id","match":"acme"}]}'
polygres --json context facets support_docs category --limit 10
```

`count` counts visible active points. `facets` aggregates a registered filter
key. Both accept a UUID or exact collection name and optional registered-filter
expressions.

Use the existing ranked commands with either text or a query vector:

| Need | Command |
| --- | --- |
| Semantic similarity | `context search` |
| Results grouped by a registered filter | `context grouped-search` |
| Semantic plus configured full text | `context text-hybrid` |
| Start from a verified graph entity | `context graph-first` |
| Semantic seeds enriched with graph evidence | `context vector-first` |
| Independent Context and graph rankings | `context rank-fusion` |
| Coupled semantic, lexical, and graph candidates | `context joint` |
| Compare HNSW with exact retrieval | `context recall-check` |

In CLI 0.5.0, the first seven commands accept one of `--text`, `--text-file`,
`--embedding-json`, or `--embedding-file`. `--text-file -` reads UTF-8 text from
stdin. `recall-check` continues to require a finite embedding with the selected
vector's exact dimensions.

`--vector-name` selects a registered vector by its exact name. Read that name
from the collection's `vectors`; it is neither a column name nor a model ID.
Omit the flag to use `default_vector_name`. For text input, the Runtime resolves
the selected vector's saved embedding configuration and uses its pinned model,
revision, dimensions, and query settings. Matching dimensions alone does not
establish model compatibility. Set up the binding through managed generation
or confirmed reuse of existing vectors before querying with text.

After verifying the collection and selected vector:

```bash
polygres --json context search support_docs \
  --text "How does replication work?" \
  --vector-name content --limit 10
polygres --json context grouped-search support_docs \
  --text-file question.txt --group-by category
polygres --json context search support_docs --text-file -
```

`text-hybrid` uses `--query` for both semantic and full-text search when no
separate text or embedding input is supplied. Add `--text` to give its semantic
side different wording. Joint always takes a semantic input separately from
its optional lexical `--query`:

```bash
polygres --json context text-hybrid support_docs \
  --query "replication recovery"
polygres --json context joint support_docs \
  --text "How can I recover replication?" --query "replication recovery" \
  --semantic-weight 0.6 --lexical-weight 0.2 --graph-weight 0.2
```

Use real graph row IDs from trusted application data or prior results. Do not
invent start entities. `rank-fusion` and `joint` are different algorithms;
neither is an alias for the other. A positive Joint lexical weight requires a
query and a configured text column.

For JSON input, use `--request query.json` or `--request -`. The positional
collection supplies the collection name or UUID, so leave `collection` out of
the JSON object. Keep all body fields in the file, including `text` or
`embedding`, `vector_name`, `use_credits`, filters, and limits. Combine the file
only with global flags and transport options `--idempotency-key` and
`--timeout`, rather than request-body flags. Example `query.json`:

```json
{
  "text": "How does replication work?",
  "vector_name": "content",
  "use_credits": false,
  "limit": 10
}
```

```bash
polygres --json context search support_docs --request query.json \
  --idempotency-key replication-question-1 --timeout 130
```

Text queries consume the retrieval allowance. `--use-credits` opts this query
into additional organization credit use after the included allowance, subject
to the project's spending permission, balance, and cycle limit. Omit it to stay
within the allowance. These credit and idempotency flags apply to text input;
existing vector requests keep their earlier payloads and do not generate a
query embedding.

The text-query deadline defaults to 130 seconds across retries. Supply a stable
`--idempotency-key` when a retry may span CLI invocations, and replay the same
query with that key after a timeout. Use a new key for a new query. The CLI
generates a key when omitted and keeps it across its own retries. See
[embeddings.md](embeddings.md#usage-and-recovery) for allowance and provider
recovery.

Ranked retrieval has no cursor. Only collections, operations, and point scroll
paginate. Preserve server order, warnings, scores, evidence, and request IDs.

## Handle durable operations

Inspect work without changing it:

```bash
polygres --json context operations list --collection-id <collection-uuid>
polygres --json context operations get <operation-uuid>
polygres context operations wait <operation-uuid> --timeout 1800
```

Cancellation and retry are separate durable mutations and require explicit
approval. Before retrying, inspect the operation. It must be failed or
cancelled, remain inside `retry_until`, and have attempts remaining; otherwise
the server rejects retry with a conflict. Retry creates a new operation; retain
both IDs. Interrupted waiting and client timeouts do not prove that the
operation failed or stopped.

## Delete safely

Read `context collections get` as JSON first and inspect `source_mode`,
`owns_source_table`, and the plural deletion-plan fields. Deletion removes the
collection and verified Polygres-owned indexes. For `existing` and `add_column`
sources it preserves the source table and user-owned data. For a verified owned
`new_table` source, deletion also drops the managed source table and its rows.
Do not rely on the current summarized deletion plan alone when deciding whether
source data will survive.

Obtain explicit approval for the exact collection UUID before using:

```bash
polygres context collections delete <collection-uuid> --yes
```

Never add `--yes` based on prior approval for a different collection or
operation.
