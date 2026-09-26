# MCP graph retrieval design

Read [`mcp-tool-contract.md`](mcp-tool-contract.md) first. This skill stays read-only. Use discovered MCP
Graph tools to gather evidence, then return a reviewable configuration and
verification plan.

Use `discover_graph_schema`, `get_graph_configuration`, `get_graph_status`, and
`get_graph_system`. Verify table identity, stable ID columns, relationship
endpoints, labels, direction, cardinality, filters, tenant boundaries, and
source freshness.

The plan must state:

- registered nodes and selected columns
- each relationship and the evidence supporting it
- direction and bidirectional behavior
- filter columns and authorization handling
- traversal depth, fan-out, result limits, and cycle behavior
- graph system limits and expected build impact
- known expansion, related-record, path, or connection queries for verification
- rebuild and maintenance triggers
- rollback or relational fallback

Return the exact public-surface handoff. Route approved interactive execution to
the CLI skill or the MCP execution playbook. Do not call `configure_graph`,
`build_graph`, `update_graph_system`, or `run_graph_maintenance` from this
design-only skill.
