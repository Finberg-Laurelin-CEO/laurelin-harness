# Pipeline runtime

## Contents

- Build replaceable stages
- Preserve delivery correctness
- Use the deterministic tools
- Route operations through public interfaces
- Make operations visible
- Recover safely
- Report completion

## Build replaceable stages

Choose from source adapter, normalizer, privacy filter, chunker, embedding
adapter, closed-schema extractor, idempotent writer, checkpoint ledger, Context
reconciler, graph synchronization, retrieval entry point, and verifier.
Generate only stages required by the selected outcome.

Create and smoke-test selected stages before a full source export or backfill.
A plan or setup pack alone is not a working vertical slice. A retrieval-only
setup over existing rows does not need a new source adapter or writer; an
ingestion-only setup does not need retrieval code.

## Preserve delivery correctness

Resolve the target project mode first. For a synced project, omit the writer,
custom CDC worker, target backfill, and checkpoint ledger. Write at the source, then verify synchronization. Polygres can generate
embeddings from the synchronized text and keep its managed output searchable. The standard-project
rules below do not authorize target mutation on synced projects.

- Emit source namespace, stable ID, revision, timestamp, ownership, and content
  hash.
- Filter before embedding or extraction.
- Prefer SDK `project.rows` for runtime writes after confirming SDK `0.3.0` and
  deployed Runtime compatibility metadata or OpenAPI with the rows endpoint.
  Prove the actual target with read-only `project.rows.validate(...)` when its
  compatibility is not already known. Use CLI import for bulk backfill.
- Upsert by a verified stable unique key. Omitting update columns changes every
  submitted writable non-conflict column, so pass an explicit update set when
  the intended mutation is narrower.
- For an application-owned vector collection, use one Context-backed rows call with an explicit
  collection or exact-one safe resolution. The call writes the row and
  completes or starts point reconciliation. Do not schedule a separate manual
  point command.
- Before dispatching a Context-backed write, persist or deterministically
  reconstruct the exact schema, table, mode, row, conflict/update/returning
  columns, Context selection, and idempotency key. Add its operation ID when
  available. Advance the source cursor only after all required surfaces succeed
  or this recovery state is durable.
- Keep per-record failure state. Bound retries for source reads and operation
  polling. Never automatically retry an ambiguous row-only write. Replay an
  ambiguous, pending, or partial Context-backed write only with the exact
  payload and idempotency key, within its 24-hour ledger window, so the row
  mutation is not executed again.
- Propagate source deletion through every derived resource.
- Reconcile periodically to repair missed events.

For managed generation, write source text without Context reconciliation
options. Polygres handles embedding generation, updates, deletion cleanup, and
reconciliation of its output. Keep source-write durability separate from the
configuration and collection readiness checks. Initial generation starts in
both modes; Manual collects subsequent changes until Run now.

Use the bundled local embedding adapter only for a selected local path. Keep
SQLite checkpointing for source capture when that selected workload needs it. Tailor the source adapter and writer to the inspected system;
do not generate undocumented API calls.

## Use the deterministic tools

1. For multi-action work, create the selected setup pack after bounded source inspection:

   `python3 scripts/scaffold_pipeline.py plan.json output-directory`

2. Generate the selected source-specific stages and smoke test in that directory.
3. Validate the execution contract:

   `python3 scripts/validate_pipeline_plan.py plan.json`

4. Test one to ten safe source records locally. Do not wait for a full snapshot.
5. After the consolidated review is approved, configure Polygres through
   `$polygres-cli` and application retrieval through
   `$polygres-sdk`.
6. Run a resumable full backfill only when the selected setup includes one.

## Route operations through public interfaces

- For a synced project, use `polygres projects create sync` or the dashboard for
  initial creation and table selection. Use the dashboard for later
  reconfiguration and lifecycle actions. Use the project Runtime API key only
  for supported graph, text, vector, hybrid, Context, embedding generation,
  catalog, and readiness work. Use discovered MCP tools for sync lifecycle
  operations where available. Do not use CLI import, migrations, rows, SDK rows, `connection_info()`,
  or direct target Postgres.

- Use CLI import for reviewed one-time or bounded CSV backfills. For an
  application-owned vector collection, follow a successful import with approved existing-row point reconciliation
  and verify it before declaring search ready. For managed generation, verify
  that Polygres has processed the imported text and indexed its generated output.
- Use CLI migrations and configuration for interactive setup.
- Use SDK `project.rows` or the documented rows Runtime API for supported
  per-record writes into an existing eligible project-owned table. Use
  validation when target ownership, types, constraints, or Context compatibility
  are not already proven. Omit Context options for a generic table. For a
  application-owned vector collection, use the same row operation to reconcile
  the point. For managed output, omit Context options and let the configured
  Polygres worker process source changes. Graph configuration and generation
  remain separate setup actions.
- Use SDK methods or documented Runtime API endpoints for application retrieval
  and Context point lifecycle.
- Use direct Runtime API calls when the application language cannot use the
  Python SDK and the route is present in the public API reference. From trusted
  server-side code, call `POST /tables/{schema}/{table}/rows/validate` or
  `POST /tables/{schema}/{table}/rows` with a project Runtime API key or a
  delegated `rows:write` token. Never expose either credential in browser or
  mobile code, use a dashboard gateway token, or infer the payload.
- Keep one-record rows requests within deployed limits. Standard maximums
  include 256 KiB, 128 row columns, and 60 writes per minute for each applicable
  credential/project window; applied limits may be lower. Choose bulk import,
  a durable batching design, or approved direct Postgres for workloads that do
  not fit.
- Route source-row deletion separately because the rows surface has no delete
  mode. Use an approved database deletion path and delete or invalidate the
  corresponding application-owned Context points, text resources, and graph
  evidence. For managed embeddings, verify worker cleanup after source deletion.
- For a standard project, use direct Postgres for target-row writes only when no public ingestion
  operation meets the requirement and the user approves that credential path.
- Record the public interface inside each selected capture or retrieval runtime.
- Never call a private control-plane route or infer a request body.

## Make operations visible

Expose only operational state relevant to selected long-running stages, such as
checkpoint, last success, last error, backlog, exclusions, failures, freshness,
and retrieval readiness. Add pause, resume, flush, and reconciliation only for
a persistent or resumable runtime.

## Recover safely

- Interrupted backfill: resume from the last durable checkpoint.
- Duplicate event: return the prior idempotent result.
- Partial batch: retry failed records only.
- Local or external embedding outage: retain pending source work and retry the
  provider only when its outcome is known.
- Managed embedding outage: preserve source data and inspect configuration
  status. Use eligible retry or reconcile actions. Quota exhaustion needs an
  allowance renewal or authorized funding; uncertain provider outcomes need
  the indicated administrator reconciliation before another provider attempt.
- Polygres outage: queue only with a durable store and report pending status.
- Context failure after row commit: retain the exact composite idempotency key
  and complete request, add the operation ID when available, mark the Context
  surface pending or partially failed, and replay the exact row operation within
  24 hours to resume reconciliation without executing the row mutation again.
  After `ROW_CONTEXT_IDEMPOTENCY_EXPIRED`, inspect the row and Context point
  before choosing a new key.
- Graph failure: keep healthy relational, text, and Context retrieval available.
- Schema or model change: stop affected records, show a diff, obtain approval,
  and reconcile after change.

## Report completion

Use operational only when the important selected path has passing evidence.
Choose readiness, representative-query, authorization, deletion, recovery, and
sync checks according to the components actually selected. Use partial for a
named degraded surface. Use blocked with exact evidence when setup cannot
proceed.
