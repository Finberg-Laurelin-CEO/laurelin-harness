# Synchronized PostgreSQL projects

## Initialize the mode-aware client

Use SDK 0.4.0 or newer when local mode-aware protection is required:

```python
import os

from polygres import Polygres

client = Polygres(
    api_key=os.environ["POLYGRES_API_KEY"],
    runtime_url=os.environ["POLYGRES_RUNTIME_URL"],
)
project = client.project(project_mode="synced")
```

Keep `POLYGRES_API_KEY` and `POLYGRES_RUNTIME_URL` in trusted server-side
configuration. A synced-project key authenticates only the project Runtime API.
It cannot authenticate project creation, source preflight, table selection,
reconfiguration, pause, resume, retry, resnapshot, or credential work.

Do not build control-plane requests with the SDK. Direct initial sync setup to
`polygres projects create sync` or the dashboard, and direct later lifecycle
work to the dashboard. Never receive or pass the source database URL or
password through application code generated for the Runtime SDK.

## Use only supported Runtime surfaces

Use graph, text, existing vector, hybrid, Context, retrieval readiness, and the
table catalog where a public SDK method exists. Do not call:

- `project.rows.validate()`, `insert()`, `upsert()`, or `ignore()`;
- `project.connection_info()`;
- imports, migrations, SQL, or target database connection paths.

The Runtime returns `PolygresPermissionError` with
`SYNCED_PROJECT_SURFACE_UNAVAILABLE` for a prohibited surface. Treat it as an
intentional project-mode boundary. Do not retry or probe nearby endpoints.
Without the local `project_mode` hint, the server remains authoritative.

## Source writes and embedding generation

Write, update, and delete application data in the source PostgreSQL database.
Managed snapshot and logical replication carry eligible changes into Polygres.
Choose the embedding path that fits the application:

- For Polygres generation, configure the synchronized text through the
  dashboard, CLI, or MCP. Polygres writes generated records into a separate
  project-local `polygres_embeddings` table and maintains its Context points.
  Use the resulting collection from the SDK.
- For application-generated vectors, write the vectors at the source and use
  an `existing` collection over the synchronized table and vector column.
  Collection modes `new_table` and `add_column` are not used to alter a
  synchronized source table.

SDK 0.5.0 can query either path with text when the selected vector has a saved
model connection and the Runtime advertises `query_embedding_generation`.
For existing source vectors, confirm the original model during setup. Existing
vector calls remain available. Text query generation uses the same retrieval
allowance and credit controls as other projects.

Keep application writes in the source even when managed generation is enabled.
Use the selected collection's returned source keys and chunk metadata as
provenance, and let Polygres reconcile managed output records.

Use graph relationships only when both foreign-key endpoint tables are in the
sync selection. Preserve synchronized source row IDs as retrieval provenance.

## Report completion accurately

State that the project mode is synced, name the Runtime retrieval surfaces
used, and identify source-database changes separately. Do not claim that SDK
code created, configured, paused, resumed, repaired, or rotated the sync.
