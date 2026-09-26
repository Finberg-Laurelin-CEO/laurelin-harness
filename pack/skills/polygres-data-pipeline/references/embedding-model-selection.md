# Choose an embedding path

## Contents

- Polygres managed generation
- Local, external, and existing vectors

Choose embeddings when semantic search helps the user's outcome. Reuse the
user's established model or deployment preference: Polygres managed generation,
local, an external provider, or existing vectors.

## Polygres managed generation

Inspect `list_embedding_configurations`, `discover_embedding_sources`,
`list_embedding_models`, and `get_embedding_usage` through the available MCP
catalog. The CLI equivalents are `embeddings list`, `sources`, `models`, and
`usage`. Use the selected project's returned catalog as the authority for model
IDs, availability, revision, dimensions, input limits, input settings, and
price version. The bundled local/hosted catalog does not describe Polygres
availability.

Save the returned `models` object in a local discovery file, optionally adding
`observed_at`, then rank it without a device report:

```sh
python3 scripts/recommend_embedding_models.py \
  --requirements embedding-requirements.json \
  --managed-catalog polygres-models.json
```

Set `deployment_preference` to `managed` in the requirements. Supply any known
`preferred_provider`, `preferred_model_id`, `existing_dimensions`, and
`max_chunk_tokens`. The helper filters enabled models and ranks compatible
choices by their returned price. Confirm language, code, and licensing needs
from the selected model's own documentation and a representative query. These
properties are not all included in the Polygres catalog.

For an unspecified preference, consider managed generation first when provider
processing fits the user's requirements. Include a local alternative only when
it helps that choice. Managed generation needs Polygres credentials for the
application; Polygres supplies the model connection and processing workers.
Keep local device checks, model downloads, provider API keys, and custom
embedding workers specific to a selected local or external path.

### Preview and configure

1. Use discovered source text columns and a non-null unique key, including
   composite keys when needed. Keep ownership and citation fields available.
2. Build `EmbeddingConfigurationCreate`: `name`, `source_schema`,
   `source_table`, `source_key_columns`, `source_text_column`, `model_id`,
   `dimensions`, optional `mode`, `use_credits`, and `chunking`.
3. To copy existing vectors, set `existing_vector_column` and confirm their
   original provider, model, revision, dimensions, and input settings before
   setting `confirm_original_model: true`. Matching dimensions alone do not
   establish compatibility. Chunking generates fresh vectors and is used
   without `existing_vector_column`.
4. Call `preview_embeddings` or `embeddings preview --file configuration.json`.
   Preview validates the source and estimates generation without calling the
   provider. Include the actual sampled row counts, input tokens, storage, model
   price, separate generation/retrieval allowances, and renewal date in the
   setup review. Retain summary evidence rather than raw sample text.
5. Continue under the user's approval for the same source, provider, model,
   chunking, and spending scope. Call `create_embedding_configuration` with a
   stable idempotency key or `embeddings create --file configuration.json
   --idempotency-key setup-key`. Reuse that key and payload after an ambiguous
   response, then inspect configuration progress.
6. Read `get_embedding_context_handoff` or `embeddings context CONFIGURATION_ID`.
   Create the collection from its managed output through the normal Context
   preflight and creation tools, or choose **Configure** in the dashboard's **Search collection** section.
   Verify generation progress and collection/index readiness separately.

Both Automatic and Manual process existing rows when the configuration is
created. Automatic processes subsequent text changes; Manual collects them
until **Run now**. Polygres chooses processing batch sizes. Updates accept
`name`, `mode`, and `use_credits` with `expected_version`. Read the latest
configuration before editing after a version conflict. Source, model,
and dimensions belong to a new configuration. Definite oversized failures can
enable automatic chunking through selective recovery without replacing successful rows.

### Allowances and recovery

Generation and retrieval use separate monetary allowances. Read
`included_microcredits`, `used_microcredits`, `reserved_microcredits`, and
`remaining_microcredits` for each bucket, plus `period_end`. Display monetary
value separately from token counts. One US dollar equals 100,000,000
microcredits; the returned model price determines the value of its input tokens.
`preview.estimated_microcredits` is estimated additional generation usage after
the remaining allowance, not the total generation value.

Keep `use_credits: false` unless additional credit use is authorized. Additional
usage also needs project credit spending enabled by an owner or administrator,
a positive cycle limit with remaining headroom, and available organization
credits. Configuration credit preference covers source generation; a query's
`use_credits` option covers retrieval. Use returned balances and dates instead
of fixed token quotas or assumed renewal dates. The dashboard's **Billing/Usage**
page shows these settings and amounts.

Use configuration status and `process_embeddings` actions (`pause`, `resume`,
`run`, `retry`, `reconcile`) for recovery. Retry handles eligible failed work;
reconcile recovers saved outcomes. If a provider outcome is uncertain, preserve
the attempt and seek the indicated administrator reconciliation. Repeated
fresh requests may duplicate provider work. Removing a configuration requires
`expected_version` and an explicit keep/delete output choice; remove linked
Context collections before deleting their managed output.

## Local, external, and existing vectors

For a possible local path, run `check_embedding_device.py --json` and pass its
output with `--device` to `recommend_embedding_models.py`. The bundled
`assets/embedding-models.json` is a starting catalog for local and external
providers. Refresh mutable availability, license, dimensions, context length,
package size, and pricing from model-owner documentation before using it.

Prefer a compatible installed model for a selected local path. Otherwise check
language, code, dimensions, chunk length, memory, disk, and runtime before
popularity. Pin the runtime alias and revision. Use named environment variables
for a selected external provider's credentials. Never read credential values.

Select one recommendation and a relevant alternative in the existing setup
review when a choice remains. Include provider, model, revision, dimensions,
document/query input settings, normalization, downloads or persistent service,
filtered data egress, and costs for each option. Do not ask for a second approval
after the user chooses a fully reviewed option. Honor any existing approval
that already covers those effects.

For local or external generation, embed a small representative set of filtered
records and queries before a full backfill. Five to 20 records is a useful
starting range, not a requirement. Check finite vectors, exact dimensions,
input formatting, relevant results, latency, and retry behavior. Keep the same
model contract for indexed and query vectors. Reuse existing vectors only when
that original contract is known; a new model needs a separate vector or a
reviewed reindex.

### Automatic chunking and batched generation

CLI 0.6.0 defaults new generation to automatic oversized-only chunking. Read the
selected catalog model's input limit rather than hardcoding it. Off and custom
chunking remain explicit choices; vector copying keeps its unchunked default.
Text and CDC updates use the saved policy. Batches never mix configurations and
execute at most four provider calls concurrently within shared admission limits.
Generation completion does not establish that search publication has finished.
Use `embeddings get CONFIGURATION --watch --timeout 600` for bounded observation.
For definite oversized failures, preview `embeddings recover-oversized CONFIGURATION
--preview`, then confirm recovery within the user's authorized scope. Versions
are handled internally. Successful rows and unknown outcomes are preserved, and
paused configurations stay paused. See the CLI embedding reference for scripts,
conflicts, legacy compatibility and ambiguous-response handling.
