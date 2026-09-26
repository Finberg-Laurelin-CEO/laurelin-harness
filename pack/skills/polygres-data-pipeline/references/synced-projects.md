# Managed PostgreSQL sync projects

## Choose managed sync only when it fits

Choose a synced project for an eligible Supabase, Neon, or PostgreSQL source
when the source must remain the system of record and a new Polygres project is
acceptable. Use a standard project and a custom pipeline when the workflow
requires target SQL, target row writes, imports, migrations, a non-PostgreSQL
source, or tables that fail the sync preflight.

Do not describe sync as a conversion of an existing standard project. Create a
new synced project through `polygres projects create sync` or the dashboard.

## Keep credentials out of agent-visible paths

Prefer the CLI's hidden interactive source-URL prompt, or direct the user to
**New project** in the dashboard. For non-interactive CLI creation, reference a
user-populated environment variable with `--connection-env`; never inspect its
value. Never request, record, or pass the source URL or password through chat, a
plan, generated files, logs, literal CLI arguments, the Runtime API, or the SDK.
A direct PostgreSQL endpoint is required; do not use a pooler URL, provider API
URL, `psql` command, or publishable key.

Treat the source inspection result from CLI creation or the dashboard as
authoritative. It checks supported PostgreSQL versions, network and TLS access,
authentication, logical replication, publication and replication privileges,
slot capacity, storage, and eligible sync keys. Current managed sync selects
eligible tables in the `public` schema. Polygres creates the filtered
publication and replication slot only after final admission.

## Model a synced setup

Record `target.project_mode: synced`, `source.system_of_record`, and a
`sync.mode` of `managed-postgres`. Record only non-secret provider and selected
table or column scope. Use discovered MCP sync tools after dashboard source connection entry, or a
`cli` or `dashboard` interface for initial creation. MCP can inspect and control
synchronization through its visible tools; use the dashboard for lifecycle or
selection changes beyond that catalog. CLI 0.5.0 supports initial creation.

Do not select or scaffold:

- target schema creation or alteration;
- CLI import, Runtime rows, or SDK rows;
- target database credentials, SQL, or `psql`;
- a custom CDC worker, backfill writer, or checkpoint ledger.

Use the project Runtime API key for supported retrieval, embedding generation,
and search configuration. Sync lifecycle and source credentials use the
control-plane workflow; source writes use the source database.

## Keep source writes and choose embedding generation

Write, update, and delete application data in the source database. Managed
snapshot and logical replication carry selected changes into Polygres.

For Polygres embeddings, select the synchronized text and stable key columns,
preview generation, and create a managed configuration. Both Automatic and
Manual process the initial text; Manual collects later changes until Run now.
Use the Context handoff to create an existing-source collection over the
managed output in Polygres. Its generated `id` is the collection key, and
`source_key` links results back to the original record. Polygres performs
generation and output reconciliation while the source schema stays unchanged.

For source-provided vectors, keep generation at the source and create the
collection over the existing synchronized vector column. Use the original
model contract for queries. A Context source mode of `new_table` or
`add_column` remains unavailable on the synchronized target.

Use graph relationships only when both foreign-key endpoint tables are in the
selected sync scope. Treat exact SQL and transactional joins as source-database
work. Use Polygres graph, text, vector, hybrid, Context, and readiness surfaces
for retrieval.

## Reconfigure and recover safely

Refresh source inspection before changing selected tables. Use the current
configuration generation as the compare-and-set boundary. Added or materially
changed tables enter resync; deselected tables stop syncing. Re-check retrieval
configuration when selected tables, columns, stable keys, or embeddings change.

Read lifecycle state and `valid_actions` from the control plane instead of
inferring actions locally. Initial setup moves through provisioning, syncing,
and ready; nested states include initializing, snapshotting, catching up,
streaming, resyncing, paused, and failed. Treat resnapshot as destructive to
the mirrored target and disclose it before approval.

Do not promise source credential rotation as a self-service workflow. The
dashboard currently hides it because replacing an active capture credential is
not reliably supported.
