# Internal setup plan and safety lint

## Contents

- Quiet lint
- Managed embedding evidence
- Actions and capabilities
- One approval boundary
- Verification

The plan is private working state for the agent, not a user deliverable or a
fixed schema. Use the smallest JSON object that helps resume multi-step work.
A simple setup can record only source, target, actions, approval, and
verification. Skip the plan entirely for a harmless one-step check.

Resolve `target.project_mode` as `standard` or `synced` before choosing a
mutation surface. For managed PostgreSQL sync, record
`source.system_of_record`, `sync.mode: managed-postgres`, the provider, and the
selected table or column scope without a connection value. Use discovered MCP
setup tools after dashboard source entry, or `surface: cli` / `surface: dashboard`
for initial sync creation. Use discovered MCP tools or the dashboard for later lifecycle actions, and
the dashboard for source credential entry.

Add schema, embeddings, graph, backfill, incremental capture, retrieval,
deployment, or agent integration only when selected. Missing optional details
must not create user questions.

Record defaults as inferred choices, not universal requirements. The agent may
change their order, values, or implementation as evidence improves without
invalidating approval unless project, source scope, data egress, destructive
effects, or paid processing changes. A component marked `enabled: false` is
intentionally omitted and must not produce scaffold files or review noise.

## Quiet lint

Run this internally:

```text
python3 scripts/validate_pipeline_plan.py plan.json
```

It returns JSON with `blockers` and `warnings`. Automatically correct blockers
from inspected evidence when possible. Resolve or accept warnings silently.
Never show raw lint output or ask the user to edit `plan.json`.

Only these conditions block:

1. a remote mutation has no resolved Polygres project;
2. the plan contains a credential or secret value instead of an environment
   variable name;
3. an existing approval no longer matches project, source scope, data egress,
   destructive actions, paid processing, or the reviewed managed model and input scope;
4. capability evidence says a selected public interface is unavailable;
5. the plan claims `operational` without passing evidence for the important
   path;
6. a synced-project plan selects a target schema mutation, target rows,
   import, backfill, direct target database credential, custom capture worker,
   or an unsupported sync control interface. CLI is valid only for initial
   synchronized-project creation, while discovered MCP tools cover their named
   setup and lifecycle operations;
7. a managed embedding plan combines incompatible copy/chunk/model settings,
   routes source writes through the managed output collection, requires caller
   provider credentials, or uses the removed SDK configuration namespace;
8. a plan marked ready for review or operational lacks the selected managed
   configuration, current preview, or monetary usage evidence.

Incomplete setup evidence is a warning while the plan is still being prepared.

## Managed embedding evidence

Use `embedding.location: managed`. Record `embedding.settings` as the exact
public creation request, without idempotency or MCP confirmation fields. Keep
`embedding.model` as the selected returned `ModelPublic` object, including its
ID, revision, supported dimensions, source/query settings, and price version.
Record `embedding.preview_settings` as the request used for the current preview
so later source or chunk changes trigger a fresh preview.

Keep `embedding.preview` as a summary of the actual response: source/sample
counts, copied/generated sample counts, estimated tokens/storage/additional
usage, sampled-estimate flag, model, and usage. Omit raw `sample_chunks` from
persisted review files. Usage includes both monetary buckets, renewal date,
organization credit availability, project spending permission and cycle limit.
Record query credit preference separately as `embedding.query_use_credits`.

For the output collection, use `context.source_kind: managed-output` and
`context.source_mode: existing`. Fill source schema/table/key/vector fields
from the returned Context handoff. Source record capture omits
`reconcile_context` and `context_collection_id`; the worker updates the managed
collection. Keep SDK setup free of provider credentials, model downloads, and
custom embedding workers. The generated `pipeline_io.py` calls the existing SDK
row and text-query methods; wire it into the selected privacy and authorization
flow before claiming the pipeline works.

## Actions and capabilities

For an intended remote mutation, set `remote_mutation: true` or use a known
remote action type. Managed actions use `embedding-create`, `embedding-update`, `embedding-process`,
or `embedding-remove`. Useful action fields are `id`, `type`, `effect`, `target`,
`data_egress`, `destructive`, and `paid_processing`. Rollback and dependency
details are useful for risky work but unnecessary for harmless local actions.

A selected interface can record `surface`, `operation`, `capability`, and
`available`. Capability discovery may instead populate a top-level
`capabilities` map. `available: false` blocks use; unknown availability warns
the agent to check without questioning the user.

## One approval boundary

Render one concise review internally with:

```text
python3 scripts/render_pipeline_review.py plan.json
```

Preserve approval already given for the same effects. When approval is first
recorded, store `approval.status: approved` and the output of
`validate_pipeline_plan.py plan.json --print-digest` as
`approval.boundary_digest`. Keep the digest out of the user-facing review. This digest intentionally covers only:

- project;
- project mode;
- source scope;
- source system of record and selected sync tables;
- data egress;
- destructive effects;
- paid processing;
- managed source columns, keys, model/version/price, dimensions, chunking, and
  separate generation/query additional-credit opt-ins.

Implementation details may evolve without another approval. Ask again only
when an authorized material boundary changes. A changing usage balance,
renewal date, configuration status, or local implementation detail is ordinary
progress and does not require renewed approval.

When embedding paths are offered, record the fully reviewed managed, local,
or external choices in `embedding_options` and the preferred model ID in
`recommended_embedding_id`. The approval boundary includes the egress and paid
processing of both. Keep these reviewed options after selection so choosing the
other disclosed path does not manufacture a stale approval.

## Verification

Before setting `state: operational`, record either
`verification.important_path` or a claim named `important-path`,
`vertical-slice`, or `end-to-end`, with passing status and concrete evidence.
Do not require representative questions or tests for components that were not
selected.
