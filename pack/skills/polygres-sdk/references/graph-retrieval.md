# Graph retrieval

## Resolve real nodes

A graph start, source, or target identifies a real registered database row with
`schema`, `table`, and `id`. Discover a real row ID from trusted application
data or a prior SDK result. Never invent IDs or accept fuzzy table-name matches
without resolving the exact schema and table.

```python
vector_page = project.vector.search(
    embedding,
    config="documents_embedding",
    limit=5,
)
top = vector_page.results[0]
start = {"schema": top.schema, "table": top.table, "id": top.id}
```

An empty page is a normal result. Do not index `results[0]` without first
handling the empty case in production code.

## Expand and inspect neighborhoods

Use bounded traversal and an explicit direction. Start with a small
`max_depth`, narrow relationship types, filters, and a result limit. Avoid
high-fan-out administrative hubs unless the user intends that expansion.

```python
page = project.graph.expand(
    start,
    max_depth=2,
    relationship_types=["CITES"],
    direction="out",
    filters={"status": "published"},
    limit=25,
)
```

Use a neighborhood for a bounded radius around one node:

```python
page = project.graph.neighborhood(
    start,
    radius=2,
    direction="any",
    limit=50,
)
```

Use related for immediate relationships:

```python
page = project.graph.related(
    start,
    relationship_types=["AUTHORED"],
    direction="any",
    limit=20,
)
```

## Paths and connections

Resolve both endpoints before asking for a path:

```python
response = project.graph.path(
    source,
    target,
    max_depth=5,
    relationship_types=["CITES"],
    direction="out",
)
```

Find a connecting subgraph only for a bounded set of verified entities:

```python
response = project.graph.connection(
    entities,
    max_depth=4,
    direction="any",
)
```

Reject an empty node, missing ID, unsupported direction, `max_depth` outside the
SDK range, and more than ten connection entities before network work. If a real
row is missing from results, verify registration and rebuild readiness through
the CLI rather than changing an ID until it happens to match.

## Live pgGraph fixtures

When a live SDK test needs a temporary source table, create representative rows
and at least one real relationship. Leave both Row Level Security and
`FORCE ROW LEVEL SECURITY` disabled unless the test explicitly targets RLS.
Verify `relrowsecurity = false` and `relforcerowsecurity = false` for every
registered test table before treating a graph build or query failure as a
pgGraph defect. An RLS-induced failure is a fixture/setup incompatibility.
Never disable RLS on a pre-existing user table without explicit approval.
