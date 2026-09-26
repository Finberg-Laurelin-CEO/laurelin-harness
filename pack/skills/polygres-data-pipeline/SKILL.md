---
name: polygres-data-pipeline
description: Set up or extend Polygres through available MCP tools and supported fallbacks for ingestion, memory, graph, embeddings, synchronization, retrieval, RAG, and agent integration. Use for personalized recommendations, complete data-pipeline setup, and verification from a short outcome or detailed specification.
---

# Polygres Data Pipeline

Turn setup intent into the smallest complete working result. Adapt to what the
user actually needs. Do not force every setup through schema creation,
embeddings, graph, backfill, continuous capture, retrieval code, or agent
instructions.

## Use guidance at the right strength

Treat this skill as a decision guide, not a mandatory architecture or ordered
checklist. Adapt, reorder, replace, or omit recommended components and numeric
defaults when inspected evidence or the user's outcome supports a better
design. Numeric defaults are starting points, including sample sizes, result
counts, token budgets, recall timing, capture timing, and model rankings.

Keep only safety and correctness boundaries firm: preserve authorization and
provenance, keep secrets out of plans and payloads, disclose and approve
material effects, use compatible embedding contracts, avoid unsupported public
interfaces and invented graph relationships, and test the important selected
path before calling it operational.

## Choose the execution surface

When Polygres MCP tools are available, read
[`references/mcp-tool-contract.md`](references/mcp-tool-contract.md), call `whoami`, and prefer discovered
compatible MCP tools for interactive inspection, setup, retrieval, and
operation tracking. Treat the connection's project boundary, feature selection,
read-only setting, and visible catalog as authoritative.

Use the existing CLI, SDK, Dashboard, or PostgreSQL workflow when MCP is absent,
incompatible, or does not expose the required operation. Keep the SDK for
persistent application code, the Dashboard for source secret entry and import
start, and the CLI for migrations, Runtime keys, and other documented operator
workflows.

## Recognize setup intent

Activate for broad prompts such as "Help me set up Polygres," contextual prompts
such as "look at my conversations and set up Polygres," and detailed technical
specifications. Treat examples as illustrations, not required wording.

For a question such as "What can I do with Polygres?", use a personalized
recommendation branch. Inspect the accessible current workspace and any
uniquely resolved Polygres project with bounded, read-only checks. Look only at
the data shape, existing retrieval configuration, and application or agent
entry points needed to identify useful opportunities. Then give a short answer
that says what was found, leads with the most useful Polygres outcome for this
project, and mentions only relevant alternatives. Do not return a generic
feature list, create a plan, scaffold files, or mutate anything. End with a
direct next step such as:

```text
To proceed, reply: Set up the recommended Polygres pipeline.
```

Treat that reply or an equivalent acceptance as setup intent. Carry the
inspected source, project, outcome, and recommendation into the setup flow
without repeating discovery unless the evidence is stale. Carry forward any
approval already given for the same source, project, processing, and costs.
Prepare a consolidated review only for material effects that remain undecided.

If the prompt identifies neither a source or inspectable context nor a desired
outcome, do not inspect, design, scaffold, or configure yet. Ask one short
direction question first:

```text
What would you like Polygres to do, and where is the relevant data? For
example: conversations or agent memory, an existing database, files or an API,
search and retrieval, or connected-data exploration.
```

Treat a response that identifies a source, an outcome, or both as enough to
begin. Infer the remaining reversible details from inspection instead of
turning the opening question into a form. Contextual prompts such as "look at
my conversations and set up Polygres" and detailed specifications skip this
question and proceed immediately.

If the user asks for a generic explanation or design comparison that does not
request personalized inspection, use `$polygres-retrieval-design`. If they want
a usable project, pipeline, memory, search, ingestion, synchronization, or
agent integration, continue here.

## Move immediately once direction is known

1. Parse the prompt and current workspace for source, target project, desired
   outcome, ownership boundary, freshness, embedding choice, and existing code.
2. Inspect one bounded source sample and the narrow project capabilities needed
   for the likely setup. Do not inventory every Polygres surface.
3. Resolve `target.project_mode` before selecting any write, import, migration,
   database, or retrieval surface. For an existing PostgreSQL source, evaluate
   managed sync with [`references/synced-projects.md`](references/synced-projects.md) before designing custom
   capture.
4. Infer reversible defaults. Ask one concise batch of questions only for
   critical facts that inspection cannot resolve safely. Do not ask about
   optional components that are unnecessary.
5. Keep a small internal setup plan when work has multiple actions, then create
   the local source-specific adapter, privacy filter, writer, retrieval entry
   point, tests, and operator files that the selected design requires.
6. Test locally with a small safe sample appropriate to the source. Present one
   consolidated review before the first upload, remote mutation, modification
   of active agent instructions, or installation of a runtime integration.
7. After approval, apply all actions covered by that exact review without
   repeated prompts, verify a bounded end-to-end slice, then continue any
   approved backfill or integration.

Do not spend setup time explaining Polygres unless the user asks. Do not read an
entire source before a privacy filter exists. Do not stop at a plan or generic
scaffold when runnable source-specific code can be produced.

## Ask only for critical unknowns

Critical means the answer changes safety or makes the implementation invalid:

- no unique target project can be resolved;
- source access or source scope is ambiguous;
- ownership/authorization cannot be inferred;
- semantic retrieval is required but inspection finds no compatible local,
  hosted, or existing-vector path that can be fully disclosed in the review;
- a destructive, externally visible, paid, or difficult-to-reverse choice has
  no safe default.

Group critical unknowns into one short request. Prefer a reversible default and
state it in the review. Use [`references/guided-interview.md`](references/guided-interview.md) for the initial
vague-prompt question or when genuinely blocked; it is not the normal flow for
contextual or detailed requests.

## Select only useful components

- Reuse a suitable table. Create or alter schema only when needed for stable
  IDs, ownership, provenance, content, timestamps, deletion state, metadata, or
  selected retrieval inputs.
- Start with relational or text retrieval when it satisfies the outcome. Add
  pgContext for meaning, similarity, natural-language recall, or agent memory.
- Follow an established embedding preference: Polygres managed generation,
  local, external provider, or existing vectors. When the user has no preference,
  inspect Polygres configurations and its available model catalog first. Choose
  the simplest compatible path and include a useful alternative in the same
  review when needed. Managed generation uses Polygres provider connections and
  allowances; local device checks apply only to a possible local path.
- Recommend pgGraph when validated relationships improve the requested
  retrieval. A single memory table does not by itself justify graph, but
  self-references or reliably derived relationships may. Omit graph when it
  adds no value.
- Add backfill, checkpointing, deletion propagation, and ongoing capture only
  when the source or freshness requirement needs them.
- Add retrieval code when the user needs application or agent recall. Choose
  timing, result bounds, token budget, and fallback for that application while
  preserving provenance and authorization.
- Update agent instructions only when an agent should capture or recall. Scope
  the managed block to the relevant repository or agent, and do not claim
  guaranteed capture without a tested runtime hook.

Read [`references/schema-and-graph.md`](references/schema-and-graph.md) for schema and graph decisions and
[`references/context-and-retrieval.md`](references/context-and-retrieval.md) for text, embedding, Context, and recall.
For semantic retrieval, follow [`references/embedding-model-selection.md`](references/embedding-model-selection.md) and
use `scripts/recommend_embedding_models.py` after bounded inspection.

## Generate a working implementation

Read only the source reference that matches the inspected input:

| Source | Reference |
| --- | --- |
| Agent memory, Codex, Claude Code, or chat export | [`references/source-chat-agents.md`](references/source-chat-agents.md) |
| Existing database, polling, outbox, or change stream | [`references/source-databases.md`](references/source-databases.md) |
| Managed Supabase, Neon, or PostgreSQL sync project | [`references/synced-projects.md`](references/synced-projects.md) |
| Files, APIs, webhooks, queues, or mixed input | [`references/source-files-and-apis.md`](references/source-files-and-apis.md) |

Read the focused MCP playbook that matches the outcome:

| Outcome | Reference |
| --- | --- |
| Create or recover a project, onboard sync, or change capacity | [`references/mcp-project-setup.md`](references/mcp-project-setup.md) |
| Build and verify grounded RAG | [`references/mcp-rag-pipeline.md`](references/mcp-rag-pipeline.md) |
| Prepare and monitor a dataset import | [`references/mcp-dataset-import.md`](references/mcp-dataset-import.md) |
| Create interactive or application-backed agent memory | [`references/mcp-agent-memory.md`](references/mcp-agent-memory.md) |

Follow [`references/pipeline-runtime.md`](references/pipeline-runtime.md). The generated implementation must use
stable source identities, filter before persistence or embedding, write
idempotently, checkpoint only after durable success, expose exact capture and
retrieval commands when selected, and include focused tests.

Use the public interface appropriate to each workload:

- synced project: keep the source database authoritative, use discovered MCP
  tools or the supported CLI/dashboard setup, and use the Runtime API key for
  supported retrieval, embedding generation, and search configuration;
- dataset or bounded backfill: reviewed CLI import is normally sufficient;
- one JSON object or runtime event: use the rows surface when the target and
  workload pass its read-only validation and deployed limits;
- runtime record capture: public rows API, SDK, or CLI only when installed
  client and deployed Runtime compatibility evidence confirm the surface;
- retrieval: documented SDK or Runtime API;
- deletion or unsupported/high-throughput writes: use another documented public
  operation when available, otherwise approved direct Postgres;
- direct Postgres: only when no public operation satisfies the approved need.

Never apply the standard-project mutation routes to a synced project. Do not
probe rows validation, request target database information, or infer that a
project API key can call sync control-plane operations.

The single-row contract is available in CLI/SDK `0.3.0` and includes
`insert`, `upsert`, `ignore`, and `validate`. If the installed client or project
does not contain that endpoint version, mark capture `upgrade-required`, give the exact
upgrade requirement, and continue all unaffected setup work. Never infer the
endpoint or disguise a bulk import as per-turn capture.

For application-owned vectors, reconcile imported rows into their Context
collection. For managed embeddings, write source text without Context options
and let Polygres generate embeddings and reconcile the managed output. Read the
Context handoff to configure that output collection; its row keys differ from
the original source keys. Verify both generation and search readiness. Route
deletions through the source system and verify cleanup of each selected surface.

## Keep one execution record

For multi-step work, use [`references/pipeline-plan-contract.md`](references/pipeline-plan-contract.md) and quietly lint
the internal plan with `scripts/validate_pipeline_plan.py`. Automatically fix
blockers from available evidence; resolve or accept warnings without turning
them into user questions. Never make the user read or edit the plan. Use
`scripts/scaffold_pipeline.py` only as a base for selected local files, then add
the source-specific runtime. Render the single review with
`scripts/render_pipeline_review.py`.

Follow [`references/security-and-approvals.md`](references/security-and-approvals.md). Existing authorization remains
valid for the same material effects. One approval covers the reviewed
setup while project, source scope, data egress, destructive effects, and paid
processing remain unchanged. Implementation details and harmless local files
do not invalidate it. Credentials are always local environment-variable values; inspect
presence with `scripts/check_env.py`, never their contents.

## Connect agent capture and recall when selected

Use `scripts/update_agent_instructions.py` to add an idempotent managed block to
the relevant `AGENTS.md` or equivalent file. Preserve all user-authored text.
Prepare a preview before approval. Modify the active instruction file only
after the consolidated review is approved. The block may contain capture,
recall, or both according to the selected integration. It must name each
selected command, say what is safe to store, describe the selected timing, and
state the real guarantee.

Agent instructions are guidance. For guaranteed or retryable capture, also wire
and test an application hook, wrapper, outbox, worker, or equivalent runtime.
Never store system instructions, retrieved context, credentials, attachments,
or tool/environment output unless the user explicitly selected and approved
that content.

## Verify truthfully

First prove the selected vertical slice: safe normalization, rejection before
egress, idempotent write when applicable, ownership filtering, provenance, and
one useful retrieval result. Verify graph or Context readiness only when
enabled. Then test update, deletion, retry, resume, reconciliation, and agent
integration only when those capabilities were selected.

Report `operational`, `partial`, or `blocked` from observed evidence. Name
omitted components as intentionally not selected, not missing. Do not claim
remote setup, continuous capture, or retrieval works when only local files were
generated.
