# MCP agent memory

Read [`mcp-tool-contract.md`](mcp-tool-contract.md) first. Define memory policy before creating storage.

Record owner, subject, tenant, source, stable identity, allowed content,
retention, deletion, freshness, and retrieval authorization. Exclude system
instructions, retrieved evidence, credentials, attachments, and tool output
unless the user explicitly includes them.

## Standard project

Use a stable event key and `validate_row_write`, then `upsert_row` for one
bounded memory record. With Polygres-managed embeddings, write filtered text
without Context options and let generation update the linked output collection.
With application-owned vectors, generate the vector first and use the
Context-backed row operation for its selected collection. Preserve the exact
payload and idempotency key when that composite result is ambiguous. Use point
lifecycle tools for existing-row repair, rather than repeating the source write.

## Synchronized project

Write the memory record to the source PostgreSQL database. Use MCP Context or
Graph tools for retrieval after synchronization makes the record ready.
Polygres can generate embeddings from that synchronized text and maintain its
managed output. Verify sync, generation, and collection readiness separately.

## Recall

Follow the grounded Context playbook: choose one retrieval mode, apply
authorization before and after retrieval, retain provenance, and fit results to
a bounded token budget. Never capture retrieved Polygres evidence as a new
source event.

## Integration

MCP is suitable for interactive capture and recall. Use the SDK with an outbox,
worker, or application hook when the user needs durable or retryable automation.
Agent instructions describe timing and content policy; runtime code provides the
delivery guarantee.
