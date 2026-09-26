# Schema and graph design

## Normalize without losing provenance

Keep the original source identity, revision, timestamp, ownership, content
hash, and metadata. Use one stable primary key and explicit tenant ownership.
Distinguish missing, empty, deleted, excluded, and unreadable values.

For one text column with one memory per row, add only the fields needed by the
selected capture and retrieval behavior. A fuller conversation-memory model
may use:

```text
id, owner_id, source_type, source_record_id, conversation_id, role, content,
created_at, updated_at, deleted_at, content_hash, metadata, embedding
```

Do not add conversation, role, embedding, or deletion fields when the source
and selected behavior do not need them. If no stable ID exists, derive or add
one before Context or graph configuration.

## Choose the smallest retrieval surface

- Use relational SQL for exact filters, joins, dates, and aggregates.
- Use text retrieval for words, IDs, names, and error messages.
- Use pgContext for semantic similarity over compatible source-provided,
  Polygres-generated, local, or external-provider embeddings. Managed generation
  creates its own output table, so the source needs text and a stable key rather
  than a new vector column.
- Recommend pgGraph when validated relationships make the requested retrieval
  clearer or more useful than ordinary joins.

A one-column memory table often needs only text or pgContext. That is a default,
not a prohibition: self-references, conversation membership, citations, or
other useful relationships can justify graph when the data supports them.

## Create graph evidence conservatively

Accept edges from foreign keys, reply or thread IDs, explicit hyperlinks,
citations, file references, event relationships, or a validated closed-schema
extractor. For extracted relationships, store source record or chunk, allowed
relationship type, confidence, extractor version, timestamp, and evidence
location.

Do not create embedding-similarity edges by default. Similarity normally
belongs in retrieval and can change with the model. If the user explicitly
needs materialized similarity relationships, record the model contract,
threshold, evidence, refresh policy, and deletion behavior so the edges remain
explainable and repairable.

Keep large content in source tables and Context. Keep graph nodes compact and
structural. Bound direction, depth, fan-out, result count, and cycles.

## Review migrations

Generate forward SQL separately from the plan. Quote identifiers, use verified
types, explain locks and backfill, and obtain approval before applying it. Do
not overwrite an existing table or column silently. Verify primary keys,
ownership, vector dimensions, and row counts after the migration.

## Verify graph behavior

Choose graph tests that match the selected behavior. A useful starting set is a
known edge, direction, missing node, bounded traversal, tenant boundary,
deletion, and rebuild. Add cycle, fan-out, and failure-isolation tests when the
graph design can encounter those conditions.
