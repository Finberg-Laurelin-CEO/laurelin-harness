# MCP graph retrieval operations

Read [`mcp-tool-contract.md`](mcp-tool-contract.md) first. Use this playbook after a reviewed graph
design. MCP is the preferred interactive execution surface when its Graph tools
are discovered.

1. Call `discover_graph_schema` and inspect verified tables and relationships.
2. Compare the discovery result with application knowledge. Do not infer an
   edge from names alone.
3. Review node IDs, relationship direction, filters, system limits, build cost,
   and rollback.
4. After approval, call `configure_graph` with the server-issued confirmation.
5. Call `build_graph` with its separate resource-intensive confirmation.
6. Follow `get_graph_status` or `wait_for_operation` to an observed state.
7. Verify one known `expand_graph` or `find_related_records` result and a path or
   connection query when the application needs one.
8. Run `run_graph_maintenance` only when status evidence or the user's request
   supports it.

Use the CLI graph commands when the MCP Graph tools are absent or the requested
operation belongs to the CLI surface. Keep the same reviewed schema facts and
bounds across either interface.
