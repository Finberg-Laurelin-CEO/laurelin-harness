# MCP project setup

Read [`mcp-tool-contract.md`](mcp-tool-contract.md) first. Use this playbook when the outcome requires a
new standard or synchronized project, provisioning recovery, or a capacity
change.

## Resolve the setup path

Call `whoami`. Project creation requires multi-project mode. A fixed-project
connection can inspect its bound project; ask the user to create a new
organization-wide connection before creating another project.

Use `get_project_creation_options` before proposing a project. Choose standard
when Polygres owns application writes. Choose synchronized when an existing
PostgreSQL source remains authoritative.

## Standard project

1. Review creation options and current commercial terms.
2. Prepare `create_standard_project` with one stable idempotency key.
3. Present the target organization, name, region, capacity, cost, and
   reversibility in the consolidated review.
4. Complete the server-issued write confirmation after user approval.
5. Preserve the project ID and poll `get_project_status`.
6. Use `get_retrieval_readiness` before configuring retrieval.

If provisioning reaches an eligible failed state, inspect the failure first.
Use `retry_project_provisioning` only after the correction and approval.

## Synchronized project

Keep the source connection in the Dashboard. Use the returned preflight attempt
ID with `get_synchronized_project_preflight` and
`list_synchronized_source_tables`. Review eligible tables and select an exact
set with `select_synchronized_tables`, then call
`create_synchronized_project`. Preserve both attempt and project IDs.

Use `get_synchronization_status` and `get_project_status` until the selected
serving path is ready. Keep source writes and schema changes in the source
database.

## Capacity

Use `preview_capacity_upgrade` for the current estimate. After approval, create
a persisted quote with `create_capacity_upgrade_quote`. Apply
`upgrade_project_capacity` with that quote, a maximum charge guard, and the same
idempotency key after an ambiguous response. The external-financial
confirmation must show the quote and maximum charge.

## Fallback

Use the CLI project workflow when compatible MCP project tools are absent. Use
the Dashboard for source credential entry and project lifecycle actions outside
the MCP catalog.
