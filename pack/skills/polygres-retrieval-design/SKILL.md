---
name: polygres-retrieval-design
description: Design and review Polygres retrieval using available read-only MCP evidence across relational, graph, text, hybrid, and Polygres AI Context. Use for retrieval and embedding strategy selection, Context or graph design, grounded RAG planning, and compatibility review before implementation.
---

# Polygres Retrieval Design

Produce a reviewable plan before retrieval configuration or application work.
This skill is advisory: it must not mutate a project directly.

When Polygres MCP tools are available, read
[`references/mcp-tool-contract.md`](references/mcp-tool-contract.md) and use discovered read tools for bounded
inspection. Call `whoami`, respect the connection's project boundary, and keep
this skill read-only even when change tools are visible.

## Workflow

1. Extract the user outcome, authorization, latency, freshness, and expected
   result shape from the prompt and inspected application. Ask only for a
   missing fact that changes the recommendation; representative questions are
   useful evidence, not a mandatory interview.
2. Resolve project mode, then inspect the supplied schema, verified row identifiers, sample data, and
   existing retrieval configuration. Label missing evidence as unresolved;
   never infer production facts from a table or column name.
3. Select the smallest sufficient strategy using
   [`references/strategy-selection.md`](references/strategy-selection.md). Reject an unsupported strategy rather
   than inventing a capability.
4. For semantic retrieval, use [`references/embedding-design.md`](references/embedding-design.md) to compare
   Polygres generation, local or external generation, and existing vectors.
   For graph retrieval, apply [`references/graph-modeling.md`](references/graph-modeling.md). For an existing
   vector configuration, TSVector, or fuzzy retrieval, apply
   [`references/vector-and-text-design.md`](references/vector-and-text-design.md).
   When MCP Graph tools are available, also read
   [`references/mcp-graph-retrieval.md`](references/mcp-graph-retrieval.md) for evidence and handoff requirements.
5. For pgContext collections, point synchronization, registered filters, or
   Context retrieval modes, apply [`references/context-design.md`](references/context-design.md).
6. For multi-stage retrieval or RAG, apply
   [`references/hybrid-and-rag-plan.md`](references/hybrid-and-rag-plan.md).
7. Write the result with [`references/plan-template.md`](references/plan-template.md). When called by
   `$polygres-data-pipeline`, return the selected and omitted components plus
   exact public-interface handoffs in a machine-readable section so the caller
   can continue without another interview.
8. In a design-only request, return the plan. In an active data-pipeline
   setup, return control to the orchestrating skill with the user's existing
   authorization and any remaining decisions.

## Design rules

- Prefer relational retrieval for exact predicates, joins, aggregates, and
  transactions that do not need a retrieval index.
- For a synced project, keep exact SQL, transactions, and source mutations in
  the source PostgreSQL database. Use only the supported Runtime retrieval and
  retrieval-configuration surfaces on Polygres.
- Treat graph, vector, text, and Context indexes and point mappings as derived
  project resources whose readiness and refresh behavior must be validated.
- Use exact schema identifiers and stable row ID values from verified data.
  Do not use invented row IDs or fuzzy-match schema names.
- Bound graph direction, depth, fan-out, result count, and cycle behavior.
- Record who generates source and query embeddings, the saved model and
  revision, dimensions, metric, input construction, and separate generation
  and query budgets. Check the collection's selected vector before proposing
  query text through the existing SDK methods.
- Default new semantic retrieval plans to a Polygres AI Context collection.
  Decide explicitly whether distinct embeddings belong as named vectors in one
  collection or require separate collection-level source and policy settings.
  Record any existing pgvector configuration that must remain compatible or
  needs a migration plan. Never treat those resources as interchangeable.
  On a synced project, choose either Polygres generation from an eligible
  synchronized text source or existing synchronized vectors. Polygres manages
  derived embedding output; source SQL and row writes stay in the source
  PostgreSQL database.
- State TSVector language/configuration choices and fuzzy thresholds.
- For hybrid retrieval, define stage order, provenance, deduplication,
  authorization, and token budget.
- Include rebuild or reindex triggers, readiness checks, and rollback or
  fallback behavior.

## Boundaries

- This skill must not mutate a project, generate secrets, or claim that a plan
  has been applied.
- Do not write mutating command examples. Route approved configuration work to
  `$polygres-cli` and approved Python integration to `$polygres-sdk`.
- Filters are not an authorization boundary. Apply access control before data
  enters retrieval and again when results are resolved.
- If required columns, stable IDs, or a usable sample are absent, make a
  reversible provisional recommendation when possible. Stop only when the
  missing evidence makes every safe recommendation invalid.

## Completion

Return the completed reviewable plan, unresolved assumptions, and public
handoffs for setup and application queries. Identify any decision or approval
still needed, taking the user's existing authorization into account.
