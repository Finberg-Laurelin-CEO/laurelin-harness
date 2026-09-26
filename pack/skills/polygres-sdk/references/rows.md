# Single-row writes

Use this namespace only for a standard project. Synced projects reject rows
validation and mutation; write to the source database and follow
[`synced-projects.md`](synced-projects.md).

Use `project.rows` for backend-owned per-record capture with SDK `0.3.0` and
deployed Runtime compatibility metadata or OpenAPI containing the rows
endpoints. Confirm the installed package and, when target compatibility is not
already proven, call `project.rows.validate(...)` against the actual table as a
read-only probe. If the route is declared unavailable, report the exact upgrade
requirement and keep capture blocked; do not infer an endpoint.

```python
result = project.rows.upsert(
    schema="public",
    table="memories",
    row={"id": "memory_123", "content": "The user prefers concise answers."},
    conflict_columns=["id"],
    returning=["id"],
    context_collection_id="2e172638-bd77-4a2c-bc42-406f4f2938d7",
    idempotency_key="memory-123-v1",
    wait_for_context=True,
)
```

Available methods are `validate`, `insert`, `upsert`, and `ignore`; public
models are `RowWriteValidation`, `RowWriteResult`, and
`RowContextReconciliationResult`.

- Pass one non-empty JSON-serializable object without coercing it into a fixed
  memory schema.
- Use a real primary-key or unique constraint for upsert/ignore conflict
  columns. Preserve omitted columns so database defaults apply.
- Omitting `update_columns` from an upsert updates every supplied writable
  non-conflict column. Pass an explicit list to prevent unintended overwrites.
- Surface `PolygresAmbiguousWriteError` when commit acknowledgement is
  uncertain. Never automatically retry a row-only write; inspect it through a
  stable business key before deciding whether a new write is needed.
- Do not log the row, credentials, headers, or unbounded server error text.
- Generate caller-owned embeddings before the row write when the schema stores
  them. Context behavior is explicit: pass a collection ID, or
  `reconcile_context=True` for exact-one safe resolution. Omitting both options
  guarantees a row-only write.
- A Context-backed call writes the source row and completes or starts exactly
  one point reconciliation through pgContext. Replay an ambiguous, pending, or
  partial result only with the exact payload and idempotency key, within the
  24-hour replay window. After `ROW_CONTEXT_IDEMPOTENCY_EXPIRED`, verify the row
  and Context point before choosing a new key. Do not issue a separate point
  command.
- Generic row writes do not configure or reconcile pgGraph. Use the graph
  configuration workflow separately when graph behavior is required.
- Before dispatching a Context-backed write, durably store or deterministically
  reconstruct its schema, table, mode, row, conflict/update/returning columns,
  Context selection, and idempotency key. Add the operation ID when available.
  Advance a source cursor only after all required surfaces succeed, or after
  this recovery record is durable.

Use the rows namespace only for an existing eligible project-owned table and a
one-record request that fits the deployed limits. The standard maximums include
256 KiB per request, 128 row columns, and 60 writes per minute for each
applicable credential/project window; applied limits may be lower. Validation
checks target ownership, writable columns, supported values, constraints, and
Context source-key compatibility. Use bulk import or an approved database path
when the workload does not fit.

Inspect `RowWriteResult.operation`, `returned`, `status`, `row_committed`,
`context`, `idempotency_key`, and `request_id`. An upsert can report `ignored`
when it has no effective update. `partial_failed` still has
`row_committed=True`; retain the request ID, exact key, and operation ID for
recovery and diagnostics. `wait_for_context=True` may replay the exact
ledger-backed request after polling, but it does not execute the row mutation
again.
