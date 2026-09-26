# Strategy selection

Choose the smallest strategy that answers the representative questions.

Resolve `project_mode` first. On a synced project, relational SQL and
transactions run against the source database, while Polygres supplies supported
graph, text, existing vector, hybrid, Context, managed embeddings, catalog, and
readiness surfaces.
Do not include target rows, migrations, imports, or database access in the
retrieval plan.

| Need | Prefer | Review constraints |
| --- | --- | --- |
| Exact filters, joins, aggregates, ordering, or transactions | relational | indexes, query plan, cardinality, authorization |
| Traversal through explicit relationships | graph | stable row ID, direction, bounded depth, fan-out, cycles |
| Semantic similarity for new setup | pgContext dense retrieval | source and query generation, model binding, dimensions, budget, source mode, filters, reconciliation |
| Semantic similarity through an existing registered configuration | legacy vector | configuration identity, embedding model, dimensions, metric, filters, compatibility plan |
| Lexical relevance | TSVector | language configuration, ranking, indexed source columns |
| Typo-tolerant names or short labels | fuzzy | threshold, normalization, candidate cap, false positives |
| Multiple evidence modes | hybrid | stage order, provenance, deduplication, token budget |
| Managed AI Search collection with point lifecycle, registered filters, recall checks, or Context plus graph/text composition | pgContext | native Context vectors or an approved pgvector conversion, source mode, reconciliation, capability status, preview contract |

## Decision procedure

1. Write representative queries and the required answer shape.
2. Identify exact constraints that belong in relational predicates regardless
   of the retrieval strategy.
3. Select graph only when explicit relationships and bounded traversal add
   information. For new semantic similarity work, select pgContext dense
   retrieval. Retain the vector surface only when an established configuration
   must remain compatible.
   Compare managed generation, local or external generation, and existing
   vectors using [`embedding-design.md`](embedding-design.md). Choose the model and generation owner
   separately from the retrieval strategy. An existing collection with vectors
   can keep receiving query vectors as before.
4. Select TSVector for linguistic ranking and fuzzy retrieval only for
   deliberate typo tolerance. Do not use fuzzy-match schema discovery.
5. Select hybrid only when a single mode demonstrably misses required
   evidence. Define which stage supplies candidates and which stage reranks or
   expands them.
6. Select pgContext when collection identity, native Context vectors, durable
   point reconciliation, registered filters, recall validation, or Context
   graph/text composition are requirements. These are the default Polygres
   semantics for new vector-backed retrieval. Preserve the existing vector
   surface only for an already registered configuration that does not yet need
   migration.

A legacy pgvector configuration ID cannot be used as a pgContext collection.
Record a migration or coexistence plan when both surfaces are present. An
explicit `existing` collection create can convert the physical pgvector column
in place after legacy-registration cleanup; it does not convert the legacy
configuration ID and is not an automatic fallback.

If the request requires an unsupported strategy, mark it as unsupported and
offer the nearest public alternative. If there is an empty sample, missing
columns, unknown authorization model, or no representative queries, preserve
that uncertainty instead of pretending the plan is production-ready.
