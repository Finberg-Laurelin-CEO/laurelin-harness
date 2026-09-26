# Fallback setup questions

Use this reference when the opening request gives no source or outcome, or when
the build-first path later reaches a genuine blocker. Ask only for information
that the prompt, inspection, and a reversible default cannot establish.

## Vague opening request

For a prompt such as "Help me set up Polygres," ask one direction question
before inspecting or building:

```text
What would you like Polygres to do, and where is the relevant data? For
example: conversations or agent memory, an existing database, files or an API,
search and retrieval, or connected-data exploration.
```

Begin when the answer identifies a source, an outcome, or both. Do not ask for
the project, schema, graph, embedding provider, sync timing, and retrieval
details in separate opening questions. Inspect and infer those next.

## Later blocker

Prefer one concise batch. If unresolved questions would turn into an interview,
offer a smaller reversible vertical slice instead.

## Question menu

Use only the applicable questions and reorder them around the actual blocker.

1. **Source:** What should Polygres read: chats, a database, files, an API,
   existing Polygres data, or a mix?
2. **Outcome:** Ask only when the prompt does not already imply memory, semantic
   search, exact search, relationships, or application retrieval.
3. **Examples:** Defer representative questions until after the first retrieval
   smoke test unless ranking cannot be chosen safely without one.
4. **Write timing:** Should new data sync per event, at session end, on a
   schedule, from an existing stream, or manually?
5. **Read timing:** Should recall run before meaningful prompts, every prompt,
   only when the agent decides, explicitly, or through application code?
6. **Scope:** Which history is included and what must be excluded?
7. **Ownership:** Is each record personal, team, customer, or public data?
8. **Retention:** How do updates, source deletion, and retention propagate?
9. **Runtime and interfaces:** Where should the adapter and worker run? Use the
   answer to recommend CLI, SDK, documented Runtime API, or approved direct
   Postgres separately for storage and retrieval. Ask the user to choose only
   when two feasible options have a meaningful tradeoff.
10. **Approval:** Ask once after displaying the exact source scope, target,
    egress, and remote mutations. An approval of that review remains valid for
    every action within it.

## Recommended defaults

These are starting points, not required pipeline features or fixed values.

- Start with one source and a bounded backfill.
- Create the runnable vertical slice before reading or exporting the full
  source.
- Use a stable source-provided ID; otherwise propose a deterministic ID and
  record the limitation.
- Use relational and text retrieval first; add pgContext for semantic needs.
- Recall before meaningful prompts, not small talk.
- Retrieve 3 to 8 results within a named token budget.
- Capture chat writes asynchronously after a completed turn.
- Continue without memory during a read outage and queue writes during a write
  outage when a durable local queue exists.
- Preserve source IDs and timestamps in every result.
- Use explicit structural graph edges only.

## Keep the conversation easy

- Explain choices in plain English before naming the technology.
- Say which option is recommended and why.
- Let the user answer "recommended."
- Combine related details into one question.
- Do not ask the user to design tables, edges, polling cursors, or retries.
- If blocking questions start to accumulate, show the unresolved decision and
  implement a smaller reversible phase instead of continuing the interview.

## Review format

Before the first data upload or remote mutation, summarize the source, target
project, new resources, data leaving the device, and any exceptional risk in
one compact review. Ask once, then continue through all approved actions
without repeated confirmations.
