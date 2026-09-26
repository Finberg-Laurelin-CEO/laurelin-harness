# Chat agents and conversation sources

## Contents

- Establish available access
- Normalize messages
- Capture new turns
- Retrieve before a turn
- Label the guarantee honestly

## Establish available access

State which conversations the current agent can actually read. A request to
"look at my conversations" identifies the source but does not expand access
beyond the current task or named project. Ask permission before accessing
history outside that scope. Prefer an official export, documented host hook,
or user-owned application transcript over undocumented local-file scraping.

Do not enumerate or read every history before building the pipeline. Start
from app-provided task metadata, titles, summaries, or a few small filtered
conversations. Use a sample appropriate to the source to create and test the
schema, streaming privacy filter, and adapter. Run the approved full-history
backfill only after the vertical slice works.

Default to the smallest scope implied by the prompt, such as the current
project rather than every permitted account history. Always exclude system
instructions, retrieved context, tool output, environment output, and secrets.

## Normalize messages

Preserve stable conversation, turn, and message IDs when provided. Otherwise
derive a deterministic ID from source namespace, conversation identity, role,
timestamp, and content hash, then record the collision and edit limitation.

Recommended message fields:

```text
id, owner_id, source_type, source_record_id, conversation_id, parent_id,
role, content, created_at, updated_at, deleted_at, content_hash, metadata
```

Never ingest retrieved Polygres context as a new message. Exclude credentials,
environment output, and unapproved tool payloads before writing a snapshot,
embedding, logging, or checkpointing.

Process one record at a time through the privacy filter. When a record is
rejected, retain only its stable ID and a non-sensitive reason, increment the
excluded count, and continue. Do not write raw segments first, delete them
after secret discovery, or downgrade the whole source to metadata because one
conversation contains a credential.

## Capture new turns

Choose capture independently from recall. The setup may use automatic capture,
selected-turn capture, session export, a schedule, an application hook, or no
ongoing capture. When post-turn capture is selected, this sequence is a useful
starting pattern:

1. Capture only the new source messages.
2. Normalize, filter, and enqueue the event.
3. Return the chat response without waiting for indexing unless the selected
   user experience requires synchronous capture.
4. For Polygres embeddings, write filtered text without Context options and let
   Polygres generate and reconcile its output. Track source persistence and
   search readiness separately. For local or external vectors, generate the
   vector first and use one Context-backed row operation for the selected
   source collection. Mark the checkpoint durable only after the required
   write succeeds or its recovery state has been saved.
5. Expose pending count and last error. Do not automatically retry an ambiguous
   row-only write. Resume an ambiguous, pending, or partial Context result only
   by replaying the exact payload and idempotency key through the composite
   contract within its 24-hour replay window.

Session-end flush is another option when the host provides a reliable lifecycle
event. Manual or scheduled capture can be the better design when automatic
hooks are unavailable or unwanted.

Use the CLI for initial schema, bulk import, and Context configuration. For a
per-turn bridge, prefer SDK `0.3.0` `project.rows` or the documented rows
Runtime API; use CLI `rows ... --file -` for a simple agent command when process
startup is acceptable. Confirm capability first. If unavailable, name the
exact upgrade requirement or use approved direct Postgres compatibility access.
For capture into an application-owned vector collection, pass the selected
collection and a stable idempotency key to the row operation. Persist or
deterministically reconstruct the complete request before dispatch. For
Polygres-managed output, keep source writes free of those Context options; the
generation worker handles output reconciliation.

## Retrieve before a turn

Retrieval may run before selected prompts, when the agent or a router requests
it, after an explicit command, or inside application code. Use this as a guide
for each retrieval event:

1. Resolve user, tenant, workspace, and allowed sources.
2. Decide whether the prompt needs recall under the selected policy.
3. With Polygres embeddings and SDK 0.5.0, pass `text` to the existing retrieval
   method and select the collection vector. Polygres uses its saved model
   contract and retrieval allowance. Otherwise, generate a query vector with
   the original provider, model, revision, dimensions, and input settings.
   Query processing and any additional credits follow the existing approval.
4. Run the selected bounded Context, text, relational, or hybrid retrieval.
5. Expand graph relationships only when the selected design enables them.
6. Recheck authorization on resolved source rows.
7. Deduplicate, rank, fit the chosen token budget, and inject labeled evidence
   with source IDs.

Use the public SDK or documented Runtime API for this application path. Keep
the CLI for operator checks and manual recall, not a latency-sensitive
per-prompt retrieval loop.

## Label the guarantee honestly

- **Guaranteed:** tested host hook, wrapper, or application path handles every
  eligible turn.
- **Retryable:** a durable queue handles every event and exposes backlog.
- **Best effort:** the agent is instructed to call a tool but the host cannot
  guarantee every call.
- **Manual:** the user runs an explicit import, recall, or flush action.

If the host lacks hooks, offer a wrapper, application bridge, session export,
or manual flow. Do not call instructions alone automatic.

Prepare an `AGENTS.md` or equivalent managed-block preview when instructions
are selected. Include capture, recall, or both according to the integration.
Apply it to the active instruction file only after the consolidated setup
review is approved.
