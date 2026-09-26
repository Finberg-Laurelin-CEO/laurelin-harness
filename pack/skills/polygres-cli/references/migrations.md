# Migrations

Use migrations only for a standard project. A synced target rejects migrations;
apply an approved schema change to the source and re-check sync eligibility.

Use migrations for intended schema changes, not generic data loading.

```bash
polygres migrations list
polygres migrations apply --file <file.sql> [--name <name>]
```

Before applying:

1. Read the SQL file.
2. Explain affected schemas, tables, columns, indexes, constraints, and data
   rewrites.
3. Identify destructive or irreversible statements.
4. State the selected project.
5. Obtain explicit approval.

The backend remains authoritative for SQL safety, checksum, idempotency, and
conflict behavior. Do not bypass a server safety rejection with `psql` or raw
HTTP.

If `--name` is omitted, the CLI derives a valid migration name from the file
stem. A completed duplicate can return no-op success or conflict exit `6`.

Retain the migration ID, status, and request ID. If migration creation succeeds
but apply fails, report the created migration instead of pretending no resource
exists.

Generated TSVector-column setup uses this migration flow before text
configuration creation. A migration can succeed while the later configuration
step fails, so report both states separately.
