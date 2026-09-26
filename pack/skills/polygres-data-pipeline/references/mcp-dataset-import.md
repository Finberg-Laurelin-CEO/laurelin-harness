# MCP dataset import

Read [`mcp-tool-contract.md`](mcp-tool-contract.md) first. This playbook combines local preparation, a
Dashboard import, and MCP observation.

## Prepare locally

Inspect a bounded sample before upload. Resolve encoding, delimiter, headers,
null representation, stable keys, target schema, table, and import mode. Use
the existing local converter for TSV, JSON arrays, and JSONL when needed.
Explain every material conversion.

Resolve the project mode. A standard project can receive a Dashboard CSV import.
For a synchronized project, write the data to the source PostgreSQL database and
let synchronization carry it into Polygres.

## Start in the Dashboard

Direct the user to the selected standard project's Import page. The user chooses
the file, reviews the server preview and configuration, selects the import mode,
and starts the job there. MCP never receives the local path, file contents,
upload session, or signed URL.

## Observe with MCP

Use `list_imports` to resolve the job and `get_import` for progress. Preserve
the job and request IDs. Report partial, failed, completed, or nonterminal state
exactly as returned.

After completion, verify the table and a bounded row sample with `list_tables`
and `read_table_rows`. For an application-owned vector collection, reconcile
its source points. For a managed embedding configuration, inspect generation
progress and the linked output collection; Polygres reconciles that output.

Use `cancel_import` only for an eligible job after the user approves the exact
destructive action. Use the CLI import workflow when MCP import tools are absent.
