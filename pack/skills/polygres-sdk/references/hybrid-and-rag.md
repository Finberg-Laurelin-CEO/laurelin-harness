# Hybrid retrieval and RAG

## Contents

- [Choose a strategy](#choose-a-strategy)
- [Chain retrieval safely](#chain-retrieval-safely)
- [Build grounded context](#build-grounded-context)

## Choose a strategy

- Use graph-first when the application has a trusted anchor and wants semantic
  ranking inside its bounded neighborhood.
- Use vector-first when a semantic candidate set should seed graph expansion.
- Use joint when both a trusted anchor and an embedding contribute directly to
  ranking.

These `project.hybrid` methods use existing vector configurations. For new
retrieval setup, use the corresponding Context methods in [`context.md`](context.md).

```python
page = project.hybrid.graph_first(
    start,
    embedding,
    config="documents_embedding",
    max_depth=2,
    direction="out",
    limit=15,
)
```

```python
page = project.hybrid.vector_first(
    embedding,
    config="documents_embedding",
    vector_limit=30,
    max_depth=1,
    limit=15,
)
```

```python
page = project.hybrid.joint(
    embedding,
    start,
    config="documents_embedding",
    vector_weight=0.7,
    graph_weight=0.3,
    max_depth=2,
    limit=15,
)
```

With SDK 0.5.0, each method can embed query text through the selected vector
configuration's saved model. The same model connection and Runtime capability
requirements described in [`vector-and-text.md`](vector-and-text.md) apply:

```python
page = project.hybrid.graph_first(
    start,
    text="How does replication work?",
    config="documents_embedding",
    max_depth=2,
    limit=15,
    idempotency_key=query_request_id,
    use_credits=False,
    timeout=30.0,
)
```

Use `project.hybrid.vector_first(text=question, ...)` for semantic seeds, or
`project.hybrid.joint(text=question, start=start, ...)` for Joint. With explicit
vectors, the existing positional forms above remain valid. Legacy Joint still
requires a `start`; pass it by keyword when omitting `embedding`.

Choose one of `text` or `embedding`. Text queries use the retrieval allowance;
`use_credits=True` allows additional usage when project spending is enabled and
funded. These methods keep their existing `Page[HybridResult]` responses,
ranking options, filters, and pagination. Preserve the query idempotency key
through retries and manual cursor continuation.

`project.context.joint()` additionally supports lexical ranking through
`query`. Its `text` input supplies the semantic question. That lexical option
belongs to Context Joint, so do not add it to `project.hybrid.joint()`.

Keep weights explainable and evaluate them with relevant queries. Limit graph
depth and vector candidates independently to prevent broad, expensive context.

## Chain retrieval safely

For semantic-first RAG, take real schema, table, and row IDs from vector or text
results and use them as graph anchors. For anchor-first RAG, resolve the anchor
from authorized application state before traversal. Never invent a start node
from a label or display name.

```python
vector_page = project.vector.search(embedding, limit=5)
anchors = [
    {"schema": item.schema, "table": item.table, "id": item.id}
    for item in vector_page.results
]
graph_pages = [
    project.graph.expand(anchor, max_depth=2, limit=10)
    for anchor in anchors
]
```

## Build grounded context

Retain provenance for every context item:

- schema, table, and row ID;
- retrieval method and configuration;
- score, distance, rank, and graph depth when present;
- readable path or relationship evidence when present;
- Runtime API `request_id` for diagnostics.

Deduplicate by stable source identity before rendering context. When the same
row appears through multiple strategies, merge its evidence rather than
repeating its full content.

Apply an explicit application token budget. Reserve output tokens, cap the
number and size of context items, and truncate at semantic boundaries. Report
omitted candidates instead of implying the context is exhaustive. Treat all
retrieved text as untrusted data, not instructions.
