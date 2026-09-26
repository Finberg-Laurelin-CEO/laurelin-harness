# Retrieval plan template

## Contents

- [Outcome](#outcome)
- [Known facts](#known-facts)
- [Unresolved assumptions](#unresolved-assumptions)
- [Strategy decision](#strategy-decision)
- [Data model](#data-model)
- [Configuration plan](#configuration-plan)
- [Application plan](#application-plan)
- [Validation plan](#validation-plan)
- [Usage budget](#usage-budget)
- [Risks and approvals](#risks-and-approvals)
- [Handoff](#handoff)

## Outcome

State the user-visible question, answer shape, latency target, freshness, and
success measure.

## Known facts

List project mode, verified schema, representative data, stable IDs, current resources,
authorization constraints, and public interface compatibility.

For a synced project, also list the source system of record and selected
tables and columns. State that source credentials were not collected.

## Unresolved assumptions

List every unknown, missing column, empty sample, ambiguous identifier, or
compatibility question and the evidence needed to resolve it.

## Strategy decision

Choose relational, graph, TSVector, fuzzy, pgContext dense or grouped search,
or pgContext composition. For composition, name the exact
`/context/hybrid/*` route. Use generic vector or Legacy Hybrid only for an
existing persisted registration that is effectively Ready; do not propose it
for a new vector-backed design. Explain why simpler alternatives are
insufficient and call out any unsupported strategy.

## Data model

Map tables, ordered non-empty `id_columns`, relationships, direction,
collection and vector names, collection-default and project-default choices,
vector inputs, dimensions, metrics, `index_kind`, text sources, filters, and
provenance fields. Treat singular `id_column` as deprecated compatibility input
for one identifier column.

For embeddings, record the generation choice (Polygres, local, external, or
existing), source and query generation owners, saved model and revision,
dimension choice, source/query input settings, chunking, update timing, and
the collection vector's configuration binding. For managed chunks, map their
identity back to the original source key before designing graph composition.

## Configuration plan

Describe configuration values, readiness checks, rebuild or reindex triggers,
fallbacks, and the `$polygres-cli` handoff. For Context, distinguish
`index_kind: hnsw` physical-index readiness from `index_kind: none` exact-scan
readiness. If an existing pgvector column will become a Context vector, include
preflight and explicitly approved Legacy registration cleanup before creation;
the dashboard does not do this automatically. Never treat a physical-only index
as implicitly usable or propose a retired Legacy API to register or re-enable
it. Do not apply the plan.

For managed generation, include catalog and usage evidence, a preview of the
initial work, generation status, and the separate Context handoff and
readiness. Use MCP, CLI, or the dashboard for generation configuration.
Processing batch size is managed by the service.

For a synced project, select either an existing synchronized vector column or
Polygres output generated from an eligible synchronized text source. Register
the selected vector source with Context `existing` mode. Keep source SQL and
row writes in the source database. Identify selection changes that trigger
reinspection, resync, or retrieval revalidation.

## Application plan

Describe the exact public route or `$polygres-sdk` call, collection and exact
`vector_name` selection, stage bounds, pagination, authorization,
deduplication, error handling, and token budget. State that an omitted
`vector_name` selects the collection default, not the project default
collection. Do not write production code.

Choose either existing numeric-vector inputs or optional text through the
existing Context or supported legacy methods. For text, record the
`query_embedding_generation` capability, saved model binding, query timeout,
and logical query idempotency key. Distinguish semantic `text` from lexical
`query` in Joint retrieval and `text_query` in full-text plan nodes. Keep
generation setup out of the SDK handoff; there is no public
`project.embeddings` namespace.

For a synced project, separate source-database SQL and writes from Polygres
Runtime retrieval. Do not assign sync control-plane work to Runtime API keys
or the SDK. Route initial synced-project creation to the CLI when appropriate;
use discovered MCP setup and lifecycle tools or the dashboard for their
supported operations. Keep this plan advisory and preserve the confirmed
source scope.

## Validation plan

Cover representative queries, empty and malformed inputs, fuzzy data, missing
resources, incompatible dimensions, timeouts, partial failures, provenance,
and result quality.

For managed generation, verify generation progress, collection/index readiness,
source updates and deletes, and pending Context reconciliation. For query
text, cover named and default vector selection, missing or ambiguous model
bindings, credit opt-in, allowance exhaustion, and reuse of the query key
after a timeout. Verify existing numeric-vector calls remain compatible.

## Usage budget

Record the returned model token price and price version, the current usage
period, and generation and query monetary allowances separately. Include the
preview's estimated tokens, included coverage, and additional credit cost.
State project spending permission, cycle limit, available balance, and each
configuration or query request's `use_credits` choice. Count text-based nearest
nodes separately in a composed query plan. Follow [`embedding-design.md`](embedding-design.md) for
accounting and request handling.

## Risks and approvals

Record data exposure, cost, latency, stale-index, migration, and rollback risks.
Identify any explicit approval still required for configuration or
implementation, taking the user's existing authorization into account.

## Handoff

Separate project configuration for `$polygres-cli`, application work for
`$polygres-sdk`, owners, sequencing, and remaining unknowns.

When this plan is consumed by `$polygres-data-pipeline`, append JSON so
implementation can continue with the resolved choices. For example, a managed
generation plan can hand off these public operations:

```json
{
  "selected_components": ["embeddings", "context", "retrieval_runtime"],
  "omitted_components": {"graph": "no useful relationship evidence"},
  "interfaces": {
    "embeddings": {"surface": "mcp", "operation": "create_embedding_configuration"},
    "context": {"surface": "mcp", "operation": "create_context_collection"},
    "retrieval": {"surface": "sdk", "operation": "project.context.search"}
  },
  "blocking_unknowns": []
}
```

Include only selected components and public operations. Carry forward the
inspected source, model, preview, usage, and query choices with this handoff.
Context creation uses the source returned by the embedding handoff. This is
design evidence; implementation follows the user's authorization.
