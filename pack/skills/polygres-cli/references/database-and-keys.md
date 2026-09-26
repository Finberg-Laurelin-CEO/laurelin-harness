# Database, environment, and Runtime API keys

Read `project_mode` first. A synced project exposes neither target database
connection information nor `psql`; do not run `env`, `db info`, or `db psql`.
Its project API key is automatically restricted to supported Runtime retrieval
and retrieval-configuration scopes and cannot authenticate sync control-plane
operations. See [`synced-projects.md`](synced-projects.md).

## Safe environment output

```bash
polygres env
```

The command prints shell-ready `DATABASE_URL`, `DIRECT_URL`, and
`POLYGRES_RUNTIME_URL` values. It does not create or print a Runtime API key and
must not print a native database password.

Do not add `POLYGRES_API_KEY` to generated examples unless the user has already
created a key and explicitly asks to configure a server-side environment.

## Connection metadata and psql

```bash
polygres db info
polygres db psql
```

`db info` returns safe host, port, database, username, SSL, and readiness
metadata. `db psql` uses the direct connection and passes only non-secret
arguments. Let `psql` prompt for the password.

If `psql` is missing, the CLI exits `9` and prints a passwordless command. Ask
the user to install `psql` or run the shown command after installation. If the
agent terminal cannot keep an interactive session, hand the command to the
user's terminal.

## Runtime API keys

```bash
polygres keys list
polygres keys create <name>
polygres keys revoke <key-id> [--yes]
```

`keys list` returns metadata only. `keys create` returns the raw secret once.
Before creating one:

1. State the selected project and requested key name.
2. Warn that the value cannot be recovered.
3. Warn that agent execution can place the secret in terminal or task history.
4. Offer to let the user run the command directly.

Never repeat the key in a summary. Never write it into a client-side variable
or committed file. If the user explicitly approves writing it, use the
project's existing server-only secret or environment-file convention.

Key revocation is destructive. Confirm the exact key ID and project before
adding `--yes`.
