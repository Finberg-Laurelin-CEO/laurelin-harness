# Synchronized PostgreSQL projects

## Contents

- [Resolve project mode first](#resolve-project-mode-first)
- [Supply the source connection safely](#supply-the-source-connection-safely)
- [Select source tables](#select-source-tables)
- [Confirm and resume creation](#confirm-and-resume-creation)
- [Enforce the unavailable surfaces](#enforce-the-unavailable-surfaces)
- [Use the restricted Runtime key](#use-the-restricted-runtime-key)
- [Interpret sync status](#interpret-sync-status)

## Resolve project mode first

Read `project_mode` from project list, selection, or status output before using
a database or mutation command. Treat an omitted mode from an older response as
`standard`; only the authoritative value `synced` activates this boundary.

The CLI can create, list, select, and inspect a synced project and can use
supported retrieval commands after the project is ready. Create a new synced
project with:

```bash
polygres projects create sync <name> [connection options] [selection options]
```

The command performs source inspection and initial table selection as one
workflow. There is no separate public preflight command. Existing-sync
reconfiguration has no first-class command. The CLI also does not expose pause,
resume, retry, resnapshot, or source-credential rotation. Direct those later
lifecycle actions to the dashboard and follow the server-provided
`valid_actions`.

## Supply the source connection safely

Prefer the hidden interactive prompt:

```bash
polygres projects create sync <name>
```

When the command has a TTY and no connection flags, it prompts for the complete
PostgreSQL URL without echoing it. There is no `--connection-string` flag.

For non-interactive work, let the user populate an environment variable and
pass only its name:

```bash
polygres projects create sync <name> --connection-env SOURCE_DATABASE_URL
```

`--connection-env` is optional and names an environment variable; it does not
accept the URL itself. Do not inspect, print, or copy the variable value.

Structured input is also supported:

```bash
polygres projects create sync <name> \
  --host <host> \
  --database <database> \
  --username <username> \
  --password-env SOURCE_DATABASE_PASSWORD
```

`--port` is optional and defaults to `5432`. In an interactive terminal,
`--password-env` may be omitted and the CLI prompts for the password. Outside a
TTY, structured input requires `--password-env`. Do not combine
`--connection-env` with structured connection options.

## Select source tables

Use exactly one selection mode:

```bash
# Repeat for explicit tables; schema defaults to public.
polygres projects create sync <name> --table public.customers --table public.orders

# Use reviewed JSON for explicit sync keys or included-column projections.
polygres projects create sync <name> --file sync-tables.json

# Select every fully eligible table discovered in public.
polygres projects create sync <name> --all-eligible
```

With a TTY and no selection flag, the CLI displays eligible tables and accepts
a comma-separated selection or `all`. JSON and non-interactive runs must use
`--table`, `--file`, or `--all-eligible`. A selection file contains a non-empty
array, or an object with a `tables` array, using only `schema_name`,
`table_name`, optional `sync_key_index_name`, and optional `included_columns`.

## Confirm and resume creation

Sync creation requires confirmation because Polygres manages a source
publication and replication slot. Add `--yes` only after approval for the exact
project and source scope. The command waits for project readiness by default;
use `--no-wait` to return after submission and `--timeout <seconds>` to bound
source inspection plus provisioning.

Use `--idempotency-key <key>` for automation or any workflow that may need to
resume. Retain the emitted root key, project ID, and request ID. After an
ambiguous timeout or transport failure, replay the exact command with the same
root key rather than generating another key or guessing whether creation ran.

Do not use generic `polygres api request` as a sync workflow. Do not place a
source connection URL or password in a CLI body, argument, generated file, or
terminal transcript.

## Enforce the unavailable surfaces

Do not run these commands on a synced project:

- `polygres db info` or `polygres db psql`;
- `polygres env` for target database information;
- `polygres rows validate`, `insert`, `upsert`, or `ignore`;
- `polygres import ...`;
- `polygres migrations ...`.

Do not use rows validation as a capability probe. The Runtime rejects these
surfaces with `SYNCED_PROJECT_SURFACE_UNAVAILABLE`. Write, update, and delete
source rows in the source PostgreSQL database. Configure Polygres-managed
embeddings from synchronized text with `polygres embeddings`; generation writes
to a separate destination in the Polygres project. Application-generated vectors
can also be synchronized from the source database. See [embeddings.md](embeddings.md).

The installed CLI may reject `db` and `env` locally before starting a database
client. Older CLI versions can rely on the server boundary for other
unsupported surfaces. Follow installed `--help` and the current skills release
compatibility record; do not claim a local guard exists in a version where it
has not been released.

## Use the restricted Runtime key

`polygres keys create` issues the synced-project key profile automatically for
a synced project. The secret is for trusted server-side Runtime calls only. It
does not authenticate dashboard or control-plane sync operations and cannot be
used for rows, imports, migrations, SQL, or database connection information.

Allowed Runtime surfaces are graph, text, existing vector, hybrid, Context,
managed embeddings, retrieval readiness, and the table catalog. Keep Context
creation on an existing synchronized vector column or a managed embedding
destination. Do not choose `add-column` or `new-table` on an upstream synchronized
table; use Polygres embedding generation for the watched text.

## Interpret sync status

Report the observed project and nested sync state. Do not infer a lifecycle
action from state alone; use the server-provided `valid_actions`. Creation can
move through provisioning, syncing, and ready, while nested states include
initializing, snapshotting, catching up, streaming, resyncing, paused, and
failed.

The dashboard supports selected-table reconfiguration after re-inspection.
Added or changed tables resync and deselected tables stop syncing. Do not
promise source credential rotation as a self-service operation because the
dashboard currently hides it.
