# Graph modeling

Model only relationships that are explicit in verified data.

For a synced project, include a relationship only when both foreign-key
endpoint tables are present in the selected sync scope. If one endpoint is not
selected, record the relationship as source metadata rather than a usable
Polygres traversal.

## Nodes

- Name each source table and its ordered, non-empty `id_columns` used by Runtime
  API results. One column is a simple identity; multiple columns form a
  composite identity whose order is part of the contract. Every component must
  be an existing durable value, not a generated guess.
- Treat singular `id_column` as a deprecated compatibility input for exactly
  one identifier column. New plans use `id_columns` and never send both forms.
- List display, filter, and provenance columns separately from the identifier.
- Reject invented identities, ambiguous tables, empty identifier lists, and
  missing columns.

## Relationships

For every edge, record the source node, target node, relationship source,
cardinality, and direction. Explain whether traversal is outgoing, incoming,
or both. Do not infer a relationship solely from similar names.

Set a bounded depth and a fan-out or candidate limit. State how cycles,
high-degree nodes, deleted rows, and duplicate paths are handled. Include the
maximum returned rows and the application token budget when graph evidence is
used for RAG.

## Lifecycle and validation

Specify the readiness evidence needed before application use and the events
that require a rebuild. Validate known one-hop paths, reverse direction,
missing nodes, cyclic paths, authorization exclusions, and bounded high-degree
nodes. Include a composite-identity case when any node has multiple
`id_columns`. Preserve node table, ordered identity, relationship, depth, and
path as provenance.
