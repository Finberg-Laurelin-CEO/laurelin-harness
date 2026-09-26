# Retrieval configuration

## Contents

- [Graph](#graph)
- [Managed embeddings](#managed-embeddings)
- [Existing vector configurations](#existing-vector-configurations)
- [Text](#text)
- [General readiness](#general-readiness)

## Graph

```bash
polygres graph discover
polygres graph config export
polygres graph config apply --file graph.json
polygres graph build
polygres graph status
```

`graph discover` is read-only. `graph config apply` accepts a raw configuration
or an export wrapper with a non-null `configuration`. Review the full document
before applying. `graph build` invokes the backend build and can mutate index
state.

For a temporary table created solely to validate pgGraph, do not enable Row
Level Security or `FORCE ROW LEVEL SECURITY` unless the test explicitly targets
RLS behavior. Before reporting a pgGraph build failure, verify every registered
test table has both `relrowsecurity = false` and
`relforcerowsecurity = false`. If either flag caused the failure, classify it as
an incompatible test fixture, not a pgGraph product failure. Never disable RLS
on a pre-existing user table without explicit approval.

## Managed embeddings

To make source text searchable by meaning, use `polygres embeddings` to select
a source and model, preview generation, and start processing. Then use the
returned managed table to create a Context collection. Read
[embeddings.md](embeddings.md) for setup, costs, processing, and removal, and
[context.md](context.md#choose-retrieval) for text queries.

## Existing vector configurations

```bash
polygres vector configs list
polygres vector configs delete <config-id> [--yes]
polygres vector reindex <config-id>
```

Use these commands to inspect or maintain previously registered configurations.
For new semantic retrieval, start with `polygres context capabilities`, then use
`polygres context collections create` with a native `pgcontext.vector` column
or a compatible `public.vector` column that will be converted in place. The
older `polygres vector configs create` path is retired and returns
`VECTOR_CREATION_RETIRED`. Existing configurations remain listable, reindexable,
and removable. Legacy retrieval additionally requires a persisted enabled
registration that is effectively Ready. HNSW configurations require their exact
physical index to be Ready; an existing `index_kind: none` configuration can be
Ready for exact scan without HNSW. Never synthesize a configuration from an
unregistered physical index or claim the retired API can register or re-enable
it. Delete accepts a configuration ID and requires approval.

When migrating a registered pgvector column, preflight the intended Context
request, show the in-place type conversion and dependent-index impact, delete
the exact legacy registration with approval, then create and verify the native
collection. Do not use `context init` for this outcome; that command is the
guided onboarding front end for choosing one eligible persisted Legacy source
and submitting the same ordinary native collection-create request. Candidate
discovery requires the certified compatibility extension and a Ready physical
index; it cannot adopt a physical-only pgvector index. It does not activate an
internal same-column binding or preserve the old pgvector index.

## Text

```bash
polygres text configs list
polygres text configs get <config-id-or-name>
polygres text configs create-fuzzy <name> \
  --table <table> \
  --text-column <column>
polygres text configs create-tsvector <name> \
  --table <table> \
  --tsvector-column <column>
polygres text configs create-tsvector <name> \
  --table <table> \
  --text-column <column> \
  --generated-column <column> \
  --yes
polygres text configs update <config-id-or-name> [options]
polygres text configs diagnostics <config-id-or-name>
polygres text configs reindex <config-id-or-name>
polygres text configs delete <config-id-or-name> [--yes]
```

Existing-column TSVector mode registers a compatible `tsvector` column without
creating another column. Generated-column mode sends one request to the
existing text configuration endpoint, which creates the stored generated
column, creates and verifies its GIN index, and saves the configuration. It does
not create or apply a migration. PostgreSQL keeps the generated value current
when its source text changes.

Generated-column mode requires explicit approval before `--yes`. If it fails,
Polygres tries to remove the new column, index, and configuration. Stop and
inspect the table and saved configurations when cleanup is reported as
incomplete. Do not blindly retry with another generated-column name.

Fuzzy mode uses an existing text-like column and creates its managed trigram
index. Repeat `--row-id-column` for a compound primary or unique non-null key.
Use `--default-limit` and `--max-limit` to bound results, repeat
`--metadata-column` for returned properties, and repeat `--filter-column` for
allowed exact-match filters. Ensure the default limit does not exceed the
maximum.

Use `get` for one saved definition and `diagnostics` to compare saved state with
the physical index. A configuration is usable only when `index_status` is
`ready`. After correcting a failed or stale target, obtain approval before
`reindex`, then confirm diagnostics are healthy. Deleting a configuration
removes its managed index, but does not drop a generated source-table column.

## General readiness

```bash
polygres ready
```

This reports graph, vector, and hybrid readiness. It does not report text
readiness in the current launch surface. Check text separately.

Polygres AI Context has its own capability, collection, point, operation, and
retrieval lifecycle. Use it for new semantic retrieval setup. Read [`context.md`](context.md)
from this skill when the request mentions Context, pgContext, AI Search,
collections, Joint retrieval, or point reconciliation. An existing pgvector
configuration is never itself a pgContext collection, even when its physical
column is eligible for in-place migration.
