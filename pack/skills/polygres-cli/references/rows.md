# Single-row writes

Use this surface only for a standard project. On a synced project, do not call
rows validation as a probe and do not write the target; mutate the source
database and follow [`synced-projects.md`](synced-projects.md).

Use this surface for explicit one-record validation or capture. Use bulk import
for backfills. It requires CLI `0.3.0` and deployed Runtime compatibility
metadata or OpenAPI containing the rows endpoints. Confirm the installed client
with `polygres --version` and `polygres rows --help`. When deployed compatibility
is not already proven, run read-only `rows validate` against the resolved target
as the narrow probe. If the route is declared unavailable, state the exact
upgrade requirement and do not guess a route or fall back silently.

```text
polygres rows validate --schema public --table memories --file row.json
polygres rows insert --schema public --table memories --file row.json
polygres rows upsert --schema public --table memories --file row.json \
  --conflict-column id --returning id
polygres rows ignore --schema public --table memories --file row.json \
  --conflict-column id
polygres rows upsert --schema public --table memories --file row.json \
  --conflict-column id \
  --context-collection 2e172638-bd77-4a2c-bc42-406f4f2938d7 \
  --idempotency-key memory-123-v1
```

Use `--file -` to read one JSON object from standard input exactly once. Prefer
stdin from generated capture code so a row is not persisted in an intermediate
file. Never place credentials in the row or command arguments.

- `insert` has no conflict columns and must not be retried automatically after
  an ambiguous outcome.
- `upsert` and `ignore` require repeated `--conflict-column` values matching a
  real unique or primary-key constraint.
- For `upsert`, omitting `--update-column` updates every supplied writable
  non-conflict column. Use repeated `--update-column` when the intended update
  set is narrower. Repeated `--update-column` and `--returning` values preserve
  order.
- Validation is read-only. It does not prove a later write will succeed.
- Omitting `--context-collection` and `--reconcile-context` selects a source row
  write without synchronous Context reconciliation. A configured embedding
  watcher still processes changed text according to its Automatic or Manual
  mode.
- `--context-collection <uuid>` selects one collection explicitly;
  `--reconcile-context` asks the server to resolve exactly one ready user
  collection for the table and fails when resolution is unsafe.
- A Context-backed command writes the source row and completes or starts its
  point reconciliation as one user-facing operation. It waits by default;
  `--no-wait` returns the durable operation ID.
- A row-only ambiguous write has no replay protection. Inspect the table using
  a stable business key before deciding whether another write is needed.
- A Context-backed ambiguous, pending, or partially failed write is safely
  resumed by replaying the exact request with the exact idempotency key within
  the 24-hour replay window. Persist or deterministically reconstruct the full
  request before dispatch. After `ROW_CONTEXT_IDEMPOTENCY_EXPIRED`, verify both
  the row and Context point before choosing a new key.
- Row writes return before managed embedding generation. For a watched text
  column, use `embeddings get` to follow generation and search updates. Keep
  managed output out of `--context-collection`; its records and mappings are
  maintained by Polygres. pgGraph updates follow the graph workflow separately.
- An explicit rows command needs no second command-level confirmation. It may
  inherit a still-valid consolidated pipeline approval.

The CLI obtains a short-lived delegated Runtime token with `rows:write`; do not
open a direct database connection for this command. Output never echoes the
submitted row. Human output shows returned field names only; JSON may include
explicitly requested `--returning` values after secret redaction. Retain the
request ID, idempotency key, Context status, and operation ID.

Use this surface only for an existing project-owned ordinary or partitioned
table that passes validation. Protected schemas, extension-owned relations,
forced-RLS tables, generated columns, and identity-always columns are not
writable targets. Keep each request to one row, at most 256 KiB and 128 row
columns. Writes are limited to at most 60 per minute for each applicable
credential/project window and may have lower applied limits. Use bulk import
or an approved database path for workloads that do not fit these constraints.
