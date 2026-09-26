# Database sources

## Inspect before design

Inspect schema, primary keys, foreign keys, ownership fields, row counts,
timestamps, deletion markers, existing vectors, indexes, and current change
tracking without mutation. Ask which schemas, tables, columns, tenants, and
history are in scope.

Require a stable primary key. If none exists, propose a reviewed schema change
or deterministic source key and explain update and collision limitations.

## Choose managed sync or one custom incremental method

For an eligible Supabase, Neon, or PostgreSQL source, first evaluate a managed
synced project with [`synced-projects.md`](synced-projects.md). Choose it when a new project is
acceptable and the source will remain the system of record. Otherwise choose
one custom method for a standard project:

- **Application outbox:** recommended when the application can be changed. Put
  source mutation and outbox event in one transaction.
- **Existing CDC stream:** consume it when the user already operates one and a
  managed synced project does not fit.
- **Checkpointed polling:** use primary key plus `updated_at` and a deterministic
  tie-breaker. Do not use time alone.
- **Dual write:** use only when the application owns retry and reconciliation.
- **Full reconciliation:** use for small sources or periodic correctness checks.

Avoid database triggers unless the user understands write-path impact and
approves the exact trigger.

## Preserve event correctness

- Deduplicate by source namespace, record ID, and source revision.
- Checkpoint source capture after the target write is durable. For an
  application-owned vector collection, include its point reconciliation in
  that recovery state. For managed embeddings, track generation and search
  readiness separately; Polygres processes the persisted source text.
- Handle out-of-order events using source revision or authoritative timestamps.
- Keep per-record partial-batch results.
- Retry transient source reads and durable-operation polling only. Never
  automatically retry an ambiguous row-only write. Resume ambiguous, pending,
  or partial Context work only by replaying its exact payload and idempotency
  key within the composite ledger window.
- Route poison events to a reviewable failure ledger.
- Reconcile periodically even when a stream appears healthy.

## Propagate deletion

Choose an explicit tombstone, outbox delete event, CDC delete, or periodic
source comparison. Delete or invalidate source chunks, Context mappings, text
resources, and graph evidence according to the approved retention policy.
Retain a deletion checkpoint until propagation is verified.

The rows API has no delete mode. Route target-row deletion through an approved
database path, then use the documented Context point lifecycle and configured
text or graph maintenance paths for application-owned derived evidence. With
managed embeddings, verify worker cleanup after source deletion. Do not encode deletion as
`ignore` or assume an upsert removes missing records.

## Separate source and target credentials

Use separate environment-variable names such as `SOURCE_DATABASE_URL` and
`POLYGRES_DATABASE_URL` only for a custom standard-project pipeline when direct
database access is approved. A synced project never exposes a target
`POLYGRES_DATABASE_URL`; enter its source connection through the dashboard or
the CLI's hidden prompt. For non-interactive creation, let the user populate a
source environment variable and reference only its name with
`--connection-env`; do not place its value in a generated pack. Prefer a
public Polygres application credential when available. Put values in the
ignored `.env`; never place them in the plan, arguments, logs, or chat.

## Verify

Test bounded backfill, repeat backfill, insert, update, delete, equal timestamp,
duplicate event, out-of-order event, interrupted resume, source schema change,
and target outage. Compare source and target counts within the approved scope.
