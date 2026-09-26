<!-- Generated from ../../../references/mcp-tool-contract.md; source-sha256: 87db018106c0548238a7bf77d6d932b903efeeaf4c2319825a7954bf5b1f4f4b -->

# Polygres MCP tool contract

Contract version: `1.0`

Skills package compatibility: `0.7.0`

## Contents

- Connect and discover
- Common execution flow
- Tool catalog by feature group
- Bounds and results
- Complementary surfaces

## Connect and discover

Use the MCP tools already available in the current agent session. Treat the
discovered catalog as authoritative for that connection.

Canonical URLs:

- local: `http://127.0.0.1:8080/mcp`
- staging: `https://mcp.staging.polygres.com/mcp`
- production: `https://mcp.polygres.com/mcp`

The connection URL accepts `project_id`, `read_only=true`, and a comma-separated
`features` subset. Feature values are `projects`, `database`, `imports`, `sync`,
`context`, `graph`, `debugging`, and `docs`.

Call `whoami` first. In fixed-project mode, project-scoped tool schemas hide
`project_id` and the server injects the approved project. In multi-project mode,
pass one exact `project_id` on every project-scoped call. The server does not
keep a mutable default project.

The visible catalog is the intersection of connection features, read-only
mode, installation scopes, current role permissions, project access, project
mode, project state, and catalog version. A missing tool is unavailable in the
current connection. Use the documented CLI, SDK, or Dashboard fallback instead
of calling it by name.

## Common execution flow

1. Inspect discovered tools and, when reachable, `/compatibility`.
2. Call `whoami` and resolve the project boundary.
3. Use `get_project` or `get_project_status` to resolve project mode and state.
4. Perform the smallest bounded read-only inspection.
5. Choose the required components and prepare exact arguments and stable
   idempotency keys.
6. Use the user's existing authorization for the prepared mutation set. If a
   choice or additional approval is needed, present one consolidated review.
7. Call each selected mutation. When it returns `status: action_required`, show
   `proposed_action` and `confirmation_class` to the user.
8. With the user's authorization, replay the unchanged call with the exact server-returned
   `action_digest` in `confirmation`.
9. Preserve resource, request, job, and operation IDs. Observe durable work with
   `wait_for_operation` or the matching status tool.
10. Verify one serving-path result and report terminal, partial, or nonterminal
    state from observed evidence.

Never calculate an action digest. A change to tool, project, or arguments needs
a new proposal. Reuse the same idempotency key after an ambiguous response to
the same intended mutation. Use a new key for a new action.

## Tool catalog

### Identity and projects

- Read: `whoami`, `list_projects`, `get_project`, `get_project_status`,
  `get_project_creation_options`, `preview_capacity_upgrade`, `list_operations`,
  `get_operation`, `wait_for_operation`
- Write confirmation: `create_standard_project`,
  `retry_project_provisioning`, `create_capacity_upgrade_quote`,
  `cancel_operation`, `retry_operation`
- External-financial confirmation: `upgrade_project_capacity`
- `list_projects`, project creation, synchronized preflight, and table selection
  are multi-project tools and stay hidden in fixed-project mode.
- `list_operations` supports `context` and `import`. `get_operation` and
  `wait_for_operation` support `context`, `import`, `graph`, and `sync`.
  Cancellation supports `context` and `import`; retry supports `context`.

### Standard-project database rows

- Read: `list_tables`, `read_table_rows`
- Validation: `validate_row_write`
- Bounded write: `upsert_row`

These tools require a standard project. `upsert_row` always uses upsert mode and
requires an idempotency key. Use CLI or SDK for insert and ignore modes.

### Dashboard-started imports

- Read: `list_imports`, `get_import`
- Destructive confirmation: `cancel_import`

The Dashboard owns file selection, upload, preview, configuration, and job
start. These tools require a standard project.

### Synchronized projects

- Setup read: `get_synchronized_project_preflight`,
  `list_synchronized_source_tables`
- Setup write confirmation: `select_synchronized_tables`,
  `create_synchronized_project`
- Lifecycle read: `get_synchronization_status`
- Lifecycle write confirmation: `pause_synchronization`,
  `resume_synchronization`, `retry_synchronization`
- Destructive confirmation: `resnapshot_synchronization`

Source credentials are entered in the Dashboard. Runtime rows, imports,
migrations, and target database access are standard-project surfaces. Source
row writes for synchronized projects remain in the source PostgreSQL database.
Polygres can generate embeddings from synchronized text into managed output.

### Embedding generation

These tools use the `context` feature group and support both project modes:

- Read with Context-read scope: `list_embedding_models`, `get_embedding_usage`,
  `list_embedding_configurations`, `get_embedding_configuration`
- Read with Context-manage scope: `discover_embedding_sources`,
  `preview_embeddings`, `get_embedding_context_handoff`
- Write confirmation: `create_embedding_configuration`,
  `update_embedding_configuration`, `process_embeddings`
- Destructive confirmation: `remove_embedding_configuration`

Discover eligible text columns and stable unique keys, inspect the live model
catalog, and preview the exact proposed configuration. `source_text_column`
is required, including when reusing an existing vector column. Reuse requires
confirmation that the existing vectors came from the selected original model.
Chunking generates new vectors. Preview estimates rows, tokens, storage, and
additional credit usage without calling the embedding provider.

Creation starts the initial copy and generation in both Automatic and Manual
modes. Automatic keeps embeddings current as text changes; Manual uses
`process_embeddings` with `action: run` for later work. Other actions are
`pause`, `resume`, `retry`, and `reconcile`. Inspect configuration progress for
generation, failed rows, and provider outcomes awaiting reconciliation.

Use `get_embedding_context_handoff` to obtain the managed source for the
existing Context collection setup workflow. Generation and Context readiness
are separate: verify the collection and selected named-vector index before
reporting that semantic search is ready. A collection over managed output is
maintained by Polygres; a source-row write only uses Context reconciliation
when that collection is bound to the row's own source table.

Updates accept `expected_version`, `name`, `mode`, and `use_credits`. Source,
model, dimensions, and chunk settings belong to creation. Batch size is managed
by Polygres. Removal requires the current version and an explicit choice to
retain or delete managed output; linked Context collections must be resolved
before deleting their output.

Generation and query usage have separate monetary allowances. Use
`get_embedding_usage` for the current period, included, used, reserved, and
remaining amounts, per-model token costs, and project credit permissions.
Model prices come from `list_embedding_models`; quota values are microcredits,
not token counts. One credit equals 1,000,000 microcredits. Preview's
`estimated_microcredits` is the additional amount after the available
generation allowance. Additional spending needs both `use_credits: true` and
an authorized project grant, available organization credits, and room within
the project's spending limit. `use_credits` defaults to false. The Dashboard
manages the project spending permission and billing settings.

Create calls require an idempotency key. Preserve it for the same intended
creation after an ambiguous response. For provider outcomes awaiting
reconciliation, retain the configuration and request IDs and follow the
returned recovery guidance before processing more work.

### Polygres AI Search

- Collection and point reads: `get_context_capabilities`,
  `discover_context_sources`, `preflight_context_collection`,
  `list_context_collections`, `get_context_collection`,
  `get_context_collection_status`, `verify_context_collection`,
  `get_context_index_status`, `list_context_filters`,
  `get_context_point_status`, `list_context_points`
- Retrieval: `context_search`, `search_full_text`,
  `context_text_hybrid_search`, `hybrid_search`,
  `context_graph_first_search`, `context_first_graph_search`,
  `context_rank_fusion_search`, `context_joint_search`,
  `group_context_results`, `count_context_points`, `get_context_facets`,
  `recommend_context_records`, `explore_context_records`,
  `explain_context_query`, `check_context_recall`
- Write confirmation: `create_context_collection`,
  `update_context_collection`, `reindex_context_collection`,
  `add_context_filter_column`, `add_context_filter_jsonb_path`,
  `upsert_context_points`, `reconcile_context_points`
- Destructive confirmation: `delete_context_collection`,
  `delete_context_points`
- Resource-intensive confirmation: `backfill_context_points`

Hybrid calls that traverse graph require both Context-read and Graph-read
installation scopes. Existing vector queries continue to accept caller-generated
embeddings. With query embedding generation available, the existing ranked
tools accept `text` as an alternative to the query vector:

- `context_search`, `group_context_results`
- `context_graph_first_search`, `context_first_graph_search`,
  `context_rank_fusion_search`, `context_joint_search`
- `context_text_hybrid_search`, whose lexical `query` remains separate

Use `vector_name` to select a collection's named-vector definition when needed.
Polygres resolves its source to exactly one embedding configuration and uses
that configuration's saved model version and dimensions. A named vector is a
collection label, such as `content`, rather than a model name. Text requests
need a compatible binding; externally generated vectors remain usable through
the existing vector input.

`search_full_text` accepts a Context query plan. A `nearest` step can contain
`text` or `embedding`; a `text_query` step remains lexical. Query embedding
generation occurs when the plan executes. `hybrid_search` takes the options
inside its selected strategy object. Use the discovered schema for that tool's
exact nesting.

Text requests optionally accept `use_credits` and `idempotency_key`. These
belong to query generation, so supply them only with semantic text. Keep the
same text, options, and key after an ambiguous response, and preserve them
across cursor pages of the same query. Distinct text branches in a plan may
each consume query allowance. Tool request timeouts allow at least 130 seconds
for generation and previews; the bounded operation-wait timeout is separate.
Read `query_embedding_generation` from Context capabilities before choosing
this path. Clients and servers predating it continue to use vector inputs.

### Graph

- Read: `discover_graph_schema`, `get_graph_configuration`,
  `get_graph_status`, `get_graph_system`, `expand_graph`,
  `get_graph_neighborhood`, `find_related_records`, `find_graph_path`,
  `find_graph_connection`
- Write confirmation: `configure_graph`, `update_graph_system`
- Resource-intensive confirmation: `build_graph`, `run_graph_maintenance`

Use verified table identifiers and relationships. Bound direction, depth,
fan-out, filters, and result count.

### Diagnostics

- `get_retrieval_readiness`, `get_context_diagnostics`,
  `get_context_index_diagnostics`, `get_context_index_advice`,
  `get_context_query_stats`, `get_project_capacity`,
  `get_project_storage_usage`, `get_project_metrics`,
  `get_project_metrics_history`

Diagnostics expose bounded public project evidence. Preserve request IDs.
`get_retrieval_readiness` reports graph plus legacy vector and hybrid
compatibility readiness; it does not report Context readiness. A false legacy
`vector.ready` or `hybrid.ready` value is not missing semantic setup and must
not lead to a legacy vector-configuration recommendation. Legacy vector
creation is retired. For new semantic retrieval, inspect
`get_context_capabilities`, `list_context_collections`, collection status,
verification, and named-vector index status before deciding whether Context is
ready.

### Public documentation

- `search_docs`, `get_doc`

Use these for the versioned documentation bundled with the MCP release.

## Bounds and results

Inputs reject unknown fields. JSON input and output are bounded to one MiB,
12 nesting levels, 512 object fields, 10,000 list items, and 100,000 characters
per string. Page limits are normally 1 through 100. `wait_for_operation` accepts
1 through 30 seconds and a poll interval from 0.5 through 5 seconds.

Public failures contain an `error` object with `code`, `message`, `retryable`,
optional `variant` and `details`, plus a top-level `request_id`. Use the code
and retryable flag to choose recovery. An exhausted embedding allowance can
return HTTP 429 and require a funding change; the status alone is not a reason
to retry. Temporary provider or network failures may permit a bounded retry.
Resolve validation, authentication, permission, project-boundary, project-mode,
and compatibility failures before another call. An uncertain provider outcome
needs reconciliation before another chargeable attempt.

## Complementary surfaces

Use the CLI for migrations, Runtime keys, interactive database access, import
start, embedding setup through `polygres embeddings`, and operations absent
from the discovered catalog. Use the Python SDK's existing Context and hybrid
query methods for persistent application integration; configure embedding
generation through MCP, CLI, or the Dashboard. Use the Dashboard for source secret
entry, CSV upload and import start, project deletion, and project pause or
restore. Keep existing pgvector and legacy hybrid integrations on their public
CLI, SDK, or Runtime interfaces.

MCP excludes arbitrary SQL, migrations, Runtime keys, database passwords,
project deletion, project pause or restore, legacy vector and hybrid routes,
Context model registration, embedding migration, bulk Context deletion,
third-party embedding or reranking calls, private observability, and operator
infrastructure.
