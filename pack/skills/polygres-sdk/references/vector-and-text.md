# Vector and text retrieval

## Contents

- [Existing vector search](#existing-vector-search)
- [TSVector search](#tsvector-search)
- [Fuzzy search](#fuzzy-search)
- [Filters and authorization](#filters-and-authorization)

## Existing vector search

Use `project.vector` only when the application already depends on a registered
vector configuration that remains enabled and is effectively Ready. An HNSW
configuration requires its exact physical index to be Ready; an existing
`index_kind: none` configuration can be Ready for exact scan without HNSW.
Polygres keeps those reads available for compatibility. A physical pgvector
index without that persisted registration is not implicitly usable, and the
legacy SDK/API cannot register or re-enable it. For new semantic retrieval
setup, use `project.context` and a Polygres AI Context collection instead of
attempting to create another vector configuration.

For application-supplied vectors, use the original embedding model and exactly
match the selected configuration's dimensions. Reject empty embeddings,
non-numeric values, infinity, and NaN locally. Keep the selected configuration
and vector representation consistent.

```python
page = project.vector.search(
    embedding,
    config="documents_embedding",
    filters={"tenant_id": tenant_id},
    min_similarity=0.75,
    limit=20,
)
```

SDK 0.5.0 also accepts text when the configuration's vector column is linked to
one saved embedding configuration with its original model confirmed:

```python
page = project.vector.search(
    text="How does replication work?",
    config="documents_embedding",
    filters={"tenant_id": tenant_id},
    min_similarity=0.75,
    limit=20,
    use_credits=False,
    idempotency_key=query_request_id,
    timeout=30.0,
)
```

Choose `text` or `embedding` for a search. `config` still selects the existing
vector configuration; it is not a model selector. Polygres resolves the saved
model, revision, and dimensions through that configuration's column. Text input
requires Runtime query embedding support and uses the retrieval allowance.
Equal dimensions alone are insufficient to link an arbitrary vector column to a
model. Complete model setup through the dashboard, CLI, or MCP.

The response remains `Page[VectorResult]`. Automatic retries and pagination keep
the same query idempotency key; use a caller-owned key when retrying across
method calls or resuming manually. See [`errors-pagination-testing.md`](errors-pagination-testing.md) for the
spending and recovery rules.

`max_distance` and `min_similarity` are alternative thresholds. Do not send
both. Evaluate threshold quality on representative data instead of presenting
one universal value.

Use an actual row ID for similarity search:

```python
page = project.vector.similar_to(
    result.id,
    config="documents_embedding",
    filters={"tenant_id": tenant_id},
    limit=10,
)
```

`similar_to()` continues to use the stored row vector. It does not generate a
query embedding. TSVector and fuzzy search also retain their existing behavior
and use their text configurations directly.

## TSVector search

Use the exact configured name and a non-empty query:

```python
page = project.text.tsvector(
    "postgres graph retrieval",
    config="documents_body_tsv",
    filters={"status": "published"},
    limit=20,
)
```

TSVector behavior depends on configured source columns and language. A missing
term can reflect stemming or configuration, not an unavailable row.

The SDK queries ready configurations but does not create, update, diagnose, or
reindex them. Route setup and maintenance through the dashboard, public API, or
CLI. Keep `cursor` opaque and reuse it only with the same configuration, query,
filters, and limit that produced it.

## Fuzzy search

Fuzzy retrieval is useful for typos and approximate text, not semantic meaning:

```python
page = project.text.fuzzy(
    "postgress",
    config="documents_title_fuzzy",
    limit=10,
)
```

Reject an empty or whitespace-only query. Test short strings, punctuation,
Unicode, transpositions, repeated characters, and unrelated terms. A fuzzy
match is evidence to rank or present, not permission to silently replace user
data or select an ambiguous resource.

For a compound row key, read every value from `result.key`. Keep using
`result.id` for existing single-key integrations. A filter value of `None`
intentionally matches SQL `NULL`; omit a filter when no filtering is intended.

## Filters and authorization

Filters narrow retrieval but do not replace authorization. Resolve the user's
tenant and permissions before querying, constrain filters with trusted values,
and verify the returned rows are still authorized. Do not allow arbitrary input
to overwrite required tenant or ownership filters.
