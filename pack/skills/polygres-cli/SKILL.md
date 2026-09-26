---
name: polygres-cli
description: Use available Polygres MCP tools or the Polygres CLI to authenticate, operate standard or synchronized projects, import data, apply migrations, configure retrieval, manage Runtime keys and durable operations, and check readiness. Use the CLI for explicit command-line work and as the documented fallback for operations outside the MCP catalog.
---

# Polygres CLI

Operate a user's Polygres project through the installed `polygres` command.
Treat the CLI as the operational and security boundary. Do not call private
control-plane routes or infer undocumented request payloads.

## Prefer an available MCP connection

When Polygres MCP tools are available in the current session, read
[`references/mcp-tool-contract.md`](references/mcp-tool-contract.md) and use the discovered compatible tools for
interactive project operations. Call `whoami`, respect the fixed-project or
multi-project boundary, and treat the discovered catalog as authoritative.

Use the CLI workflow in this skill when the user explicitly asks for CLI, when
MCP is absent or incompatible, or when the operation belongs to the CLI surface,
such as migrations, Runtime keys, interactive database access, import start,
and legacy vector or text configuration. Never invent an MCP tool to mirror a
CLI command.

## Start safely

1. Run `polygres --version` and `polygres --help` before live or end-to-end
   testing, and whenever availability or command compatibility is unknown.
2. If the command is missing, tell the user how to install `polygres-cli` and
   let them approve or perform the installation. Do not install packages
   silently.
3. For live tests from a Polygres source checkout, create an isolated test
   environment, reinstall both `polygres-cli` and `polygres-sdk` from that
   checkout under its dependency-installation policy, and verify their versions
   and import origins before testing. Do not substitute PyPI packages for the
   checkout under test.
4. Outside a source checkout, compare installed CLI and SDK versions with the
   versions required by the application or current skill compatibility record.
   Do not call an installation current merely because the command exists.
   Obtain approval before changing installed packages.
5. Run `polygres whoami` before a mutation when identity or active organization
   is uncertain. Use `polygres login` when authentication is required.
6. Resolve the project with `polygres projects list`, an explicit `--project`,
   or `polygres projects use <project>`. State the resolved project before a
   destructive, secret-producing, or schema-mutating operation.
7. Resolve `project_mode`. When it is `synced`, read
   [`references/synced-projects.md`](references/synced-projects.md) before choosing any command.
8. Prefer `polygres --json ...` for output the agent must parse. Treat stdout as
   the JSON channel and stderr as diagnostics.

If bundled examples differ from the installed `--help`, follow the installed
command surface and explain the version mismatch. Never guess a replacement.

Embedding setup and query-text flags require CLI 0.5.0 and a supporting Runtime.
For text queries, check `query_embedding_generation` in
`polygres --json context capabilities`. Existing vector inputs keep their
behavior; retain that workflow for applications using CLI 0.4.x until an
upgrade is authorized.

## Route the request

Read only the references needed for the task:

| User intent | Reference |
| --- | --- |
| Login, logout, identity, organization, project selection or status | [`references/authentication-and-projects.md`](references/authentication-and-projects.md) |
| Synced-project creation, capabilities, lifecycle handoff, and permission boundaries | [`references/synced-projects.md`](references/synced-projects.md) |
| Environment, Postgres metadata, `psql`, Runtime API keys | [`references/database-and-keys.md`](references/database-and-keys.md) |
| Dataset or backfill from CSV, TSV, a JSON array, or JSONL/NDJSON | [`references/data-imports.md`](references/data-imports.md) |
| Validate, insert, upsert, or ignore one JSON object or runtime event | [`references/rows.md`](references/rows.md) |
| Migration list/apply and SQL safety | [`references/migrations.md`](references/migrations.md) |
| Graph, text, existing vector configurations, and general retrieval readiness | [`references/retrieval.md`](references/retrieval.md) |
| Generate embeddings from source text, reuse vectors, preview costs, manage processing, and configure search | [`references/embeddings.md`](references/embeddings.md) |
| Execute an approved graph plan through MCP or fall back to CLI | [`references/mcp-graph-retrieval.md`](references/mcp-graph-retrieval.md) |
| Polygres AI Context collections, filters, points, operations, and retrieval | [`references/context.md`](references/context.md) |
| JSON output, polling, exit codes, retry and recovery | [`references/automation-and-errors.md`](references/automation-and-errors.md) |

## Execute an operation

1. Classify the request as read-only, mutating, destructive,
   schema-mutating, or secret-producing.
2. Load the relevant reference and validate local inputs.
3. Resolve authentication and project context.
4. Resolve project mode and stop any command that is unavailable for that mode.
5. For a mutation, show the target project, affected resource, important
   options, and reversibility.
6. Obtain explicit approval when required. Accept an existing consolidated
   pipeline approval when it names this exact project, source scope, action,
   and unchanged plan digest.
7. Run the narrowest documented command.
8. Retain project, job, migration, configuration, key, and request IDs from the
   result.
9. Report only the observed terminal state. If work is still running, say so
   and provide the status command.

## Require consent

Obtain explicit user approval before:

- `replace_existing` imports;
- applying a SQL migration;
- creating or updating a text configuration, including a generated TSVector
  column or managed text index;
- reindexing a text configuration;
- revoking a Runtime API key;
- deleting existing vector or text configurations;
- creating an embedding configuration, changing its credit preference, or
  removing it, including the choice to keep or delete generated output;
- every durable pgContext mutation, including collection create, update,
  set-default, vector addition, default-vector change, reindex, or delete;
  filter registration; point
  reconciliation; and operation cancellation or retry;
- pgContext point upsert or delete when it will become a durable operation or
  when deleting mappings is destructive for the user's serving behavior;
- any command that uses `--yes`;
- any other operation that is destructive or difficult to reverse.

Add `--yes` only after approval for that exact operation and target.
Do not add a second confirmation to an explicit `rows insert`, `rows upsert`,
or `rows ignore` command that is already authorized by the user's command or a
matching consolidated pipeline approval.
Before approval for `add-column` or `new-table` collection creation, also show
the preflight DDL, affected schema objects, and ownership boundaries.

## Protect secrets

- Never request, retrieve, store, log, or pass a native database password.
- Never request, print, or place a synced source connection in an argument,
  generated file, or transcript. Prefer the CLI's hidden interactive URL prompt.
  For approved non-interactive work, reference a user-populated environment
  variable with `--connection-env`; never inspect its value.
- Let `psql` prompt the user for the database password.
- If an agent terminal cannot maintain an interactive TTY, give the user the
  passwordless command or ask them to run `polygres db psql` directly.
- Never ask a user for `POLYGRES_ACCESS_TOKEN`. It is a development and test
  override, not a public authentication workflow.
- Warn before `polygres keys create <name>` because the Runtime API-key secret
  is shown once and can enter terminal or agent history.
- Offer to let the user run key creation in their own terminal so the secret
  does not enter the agent transcript.
- Never place tokens, keys, or passwords in source files, examples, command
  arguments, logs, or final summaries.

## Prepare non-CSV data locally

For TSV, JSON arrays, and JSONL/NDJSON datasets, read
[`references/data-imports.md`](references/data-imports.md) and use `scripts/prepare_import.py`. Route one JSON
object intended as an individual write to [`references/rows.md`](references/rows.md) instead. Resolve
the script path from this skill directory instead of assuming the repository
contains `scripts/`.

The converter is local-only and produces a reviewed CSV artifact. It does not
call Polygres. Never silently flatten nested JSON, rename columns, or collapse
null and empty-string values without explaining the result and obtaining the
required approval.

Do not present SQL migrations as a generic row-import mechanism. Do not call
the backend SQL-import or `pg_dump` routes because those commands are not in
the current public CLI.

## Handle failures

Use [`references/automation-and-errors.md`](references/automation-and-errors.md) to interpret exit codes. In
particular:

- Fix validation before retrying exit `2`.
- Reauthenticate on exit `3`.
- Explain missing permission on exit `4`.
- Resolve missing resources on exit `5`.
- Resolve conflicts or ambiguous project selection on exit `6`.
- Respect rate-limit guidance on exit `7`.
- Treat exit `8` as remote failure or timeout.
- Install or hand off a missing local dependency such as `psql` on exit `9`.

After an import or provisioning timeout, check the known resource or job status
before resubmitting. A timed-out client does not prove the server operation
failed.
