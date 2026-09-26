# MCP RAG pipeline

Read [`mcp-tool-contract.md`](mcp-tool-contract.md) first. Use MCP for interactive setup and verification;
use the SDK reference when the user needs persistent application code.

## Design

Record source ownership, authorization rules, stable source keys, citation
fields, freshness, and deletion behavior. Select one initial retrieval mode:

- `context_search` for semantic similarity
- `search_full_text` for lexical matching
- `context_text_hybrid_search` for semantic and text evidence
- graph-first, Context-first, rank fusion, or Joint for connected evidence

Choose Polygres generation or user-selected local, external, or existing
vectors. Record the model, revision, dimensions, metric, and document/query
input settings. Follow [`embedding-model-selection.md`](embedding-model-selection.md) for source discovery,
model selection, generation preview, allowance checks, and setup.

## Configure

Inspect `get_context_capabilities`. For Polygres embeddings, read
`get_embedding_context_handoff` and use its managed output as the collection
source. For application-owned vectors, discover their source table. Run
`preflight_context_collection` with the matching source. Include the collection request, source schema
effects, filters, point work, egress, and rollback in one review. After approval,
complete each server-issued confirmation and wait for durable operations.

Verify collection status and `verify_context_collection`. When graph contributes
to retrieval, use the graph playbook and verify its build independently.

## Retrieve and answer

For externally generated vectors, generate a compatible query embedding outside
Polygres. For managed embeddings, pass `text` to `context_search` to use the
selected vector's configured model. Keep one idempotency key for retries of the
same query. The query consumes retrieval allowance; additional credits require
query opt-in and project spending permission.
Run one explicit retrieval tool with bounded candidates and result count.
Preserve source keys, scores, stage provenance, and request IDs. Resolve source
rows only when the current authorization and discovered tools support it.

Deduplicate by stable source identity, fit evidence to the application token
budget, and cite only returned records. Return an insufficient-evidence answer
when the results do not support the claim.

## Verify

Use a small labeled question set. Check collection readiness, useful citations,
authorization filtering, freshness, empty results, and latency before calling
the serving path operational.
