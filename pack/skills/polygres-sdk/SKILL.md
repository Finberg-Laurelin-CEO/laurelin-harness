---
name: polygres-sdk
description: Use available Polygres MCP tools for interactive grounded retrieval and the Polygres Python SDK for application code, text or vector queries, graph and hybrid retrieval, standard-project row writes, pagination, and typed error handling.
---

# Polygres SDK

Build Python application code against the public `polygres-sdk` package and a
project's Runtime API. Use `$polygres-cli` instead for human authentication,
control-plane project administration, imports, migrations, and API-key management.

For an interactive grounded answer, prefer available Polygres MCP tools. Read
[`references/mcp-tool-contract.md`](references/mcp-tool-contract.md) and
[`references/mcp-grounded-context.md`](references/mcp-grounded-context.md), then use the discovered read catalog.
Continue with the SDK workflow for persistent Python application integration,
backend-owned automation, or an MCP fallback.

## Workflow

1. Inspect `pyproject.toml`, requirements files, and existing client setup.
2. Confirm the installed `polygres-sdk` and `polygres-cli` versions before live
   or end-to-end testing. If testing a Polygres source checkout, create an
   isolated environment, reinstall both packages from that checkout under its
   dependency-installation policy, and verify their versions and import origins.
   Do not substitute PyPI packages for the checkout under test.
3. Outside a source checkout, compare both installed versions with the
   application requirements or current skill compatibility record. Obtain
   approval before installing or changing dependencies.
4. Resolve `POLYGRES_API_KEY` and `POLYGRES_RUNTIME_URL` from server-side
   environment configuration. Never log or embed either value.
5. Confirm that the URL is the per-project Runtime API URL, not the Polygres
   control-plane URL or a direct or pooled Postgres URL.
6. Resolve project mode before selecting a namespace. For a synced project,
   construct `client.project(project_mode="synced")` and read
   [`references/synced-projects.md`](references/synced-projects.md).
7. Check `project.readiness()` before relying on graph, existing vector, or
   legacy hybrid retrieval. For new semantic retrieval, prefer Polygres AI
   Context: call `project.context.get_capabilities()` and then inspect collection
   status or verification. Use `project.connection_info()` only for passwordless
   connection metadata.
8. Keep every pgContext call on the flat `project.context` namespace. Prefer
   `$polygres-cli` for interactive setup. Use SDK mutations for explicit,
   backend-owned automation, return them immediately, and wait only when the
   application workflow requires a terminal result.
9. Choose one focused retrieval call. With SDK 0.5.0, pass text when the selected
   vector is linked to a saved embedding configuration and the Runtime supports
   `query_embedding_generation`. Otherwise use an application-supplied vector
   with the matching model and dimensions. Use real row IDs returned by the SDK
   or verified application data for graph anchors.
10. Bound depth, candidate counts, result limits, pagination, and application
   token budget. Apply authorization before retrieval because filters are not
   an authorization boundary.
11. Preserve result provenance, request IDs, and typed models through RAG
   assembly. Deduplicate before constructing context.
12. Handle the documented exception hierarchy and test success, malformed
   responses, fuzzy or empty queries, invalid dimensions, and transient errors.

## Reference routing

- Read [`references/client-setup.md`](references/client-setup.md) for installation, environment variables,
  endpoint selection, readiness, and passwordless connection information.
- Read [`references/synced-projects.md`](references/synced-projects.md) for synced-project API-key limits,
  unavailable write and database surfaces, source-authoritative writes, and
  CLI or dashboard control-plane handoff.
- Read [`references/graph-retrieval.md`](references/graph-retrieval.md) for graph calls, real row-ID discovery,
  direction, depth, and fan-out limits.
- Read [`references/vector-and-text.md`](references/vector-and-text.md) for text input on existing vector
  configurations, vector compatibility, TSVector, fuzzy retrieval, and thresholds.
- Read [`references/hybrid-and-rag.md`](references/hybrid-and-rag.md) for graph-first, vector-first, joint
  retrieval, chaining, provenance, deduplication, and context budgets.
- Read [`references/context.md`](references/context.md) for pgContext collection identity, named vectors,
  model selection, text queries and query plans, operations, and point lifecycle.
- Read [`references/rows.md`](references/rows.md) for validated single-row insert, upsert, ignore,
  retry, ambiguous-commit, and pipeline checkpoint behavior.
- Read [`references/errors-pagination-testing.md`](references/errors-pagination-testing.md) for typed models, cursors,
  automatic pagination, exceptions, retries, and mocked tests.
- Read [`references/mcp-grounded-context.md`](references/mcp-grounded-context.md) for interactive grounded answers
  through the available MCP Context tools.

## Boundaries

- Use only public SDK methods. Never reverse-engineer a private endpoint or
  private route, and never call the control-plane from application retrieval
  code.
- Use `project.context` for backend-owned pgContext collection configuration.
  Activate `$polygres-cli` for interactive human workflows and control-plane work.
- Use `project.vector` only with a previously registered, enabled configuration
  that is effectively Ready. HNSW requires its exact physical index to be Ready;
  `index_kind: none` can serve exact scan without HNSW. Do not infer a
  registration from a physical-only index or design new setup around
  vector-configuration creation; use
  `project.context.create_collection()` instead.
- Select Context vectors by their registered names. For text queries, Polygres
  resolves the saved model, version, dimensions, and query settings. Configure
  generation through the dashboard, CLI, or MCP; the SDK consumes that setup.
  SDK collection management remains available for application-owned provisioning.
- Keep caller-supplied vectors compatible with the selected model and dimensions.
  Existing 0.4.1 vector calls keep their signatures and result types. Use
  `use_credits=True` only when the application intends additional credit usage
  and the project has spending permission.
- Never print headers, environment variables, API keys, or database secrets.
- Treat `connection_info()` as passwordless metadata. It does not return a
  database password. Never call it for a synced project.
- Never use `project.rows` for a synced project or use rows validation as a
  capability probe. Mutate the source database instead.
- Do not claim a query is authorized merely because it includes filters.
- Do not retry validation, authentication, or permission errors blindly.
- Do not hide partial pagination, malformed payloads, timeouts, or request IDs.

## Completion report

State project mode and the Runtime API context without secrets, retrieval strategy, filters and
bounds, pagination behavior, provenance fields retained, tests run, and any
readiness or configuration work still required through `$polygres-cli`.
