# Errors, pagination, and testing

## Contents

- [Exception handling](#exception-handling)
- [Query embeddings, spending, and retries](#query-embeddings-spending-and-retries)
- [Pagination](#pagination)
- [Typed results](#typed-results)
- [Focused tests](#focused-tests)

## Exception handling

Catch the narrowest useful SDK exception:

- `PolygresValidationError`: correct malformed local input; do not retry.
- `PolygresAuthError`: replace or rotate server-side credentials; do not log
  them.
- `PolygresPermissionError`: stop and correct authorization or project scope.
- `PolygresNotFoundError`: verify the exact resource or real row ID.
- `PolygresRateLimitError`: inspect `code`. Back off for temporary rate limits;
  resolve allowance or funding requirements before resuming quota failures.
- `PolygresMaintenanceError`: stop normal retries and surface the maintenance
  state or retry guidance supplied by the service.
- `PolygresRuntimeError`: preserve the `request_id`; retry only when the
  operation is safe and within the application's bounded retry policy.
- `PolygresAPIError`: preserve status, code, details, and `request_id` for any
  public API failure not represented by a narrower subclass.

```python
from polygres import PolygresRateLimitError, PolygresRuntimeError

try:
    page = project.vector.search(embedding, limit=10)
except PolygresRateLimitError as error:
    logger.warning("Polygres rate limited request_id=%s", error.request_id)
    raise
except PolygresRuntimeError as error:
    logger.error("Polygres runtime failure request_id=%s", error.request_id)
    raise
```

Do not include request headers or environment values in logs. A timeout is not
proof that no response or server work occurred.

## Query embeddings, spending, and retries

Text queries use the project's retrieval allowance at the configured model's
price. `use_credits=False` is the default. Additional credit usage requires
`use_credits=True`, project spending permission, an available organization
balance, and room within the project cycle limit. Check usage and renewal dates
through the dashboard, CLI, or MCP; keep generation and retrieval allowances
separate, and distinguish usage value from additional credits charged.

For text queries, the SDK generates an idempotency key when one is omitted and
preserves it across automatic transport retries and automatic pagination. To
recover across separate calls or process restarts, persist a caller-owned
`idempotency_key` before making the request and reuse it for the same query.
Choose a new key for changed text, selected vector, or query plan. A static key
shared by all user searches would mix unrelated requests.

Set `timeout` for the complete query request, including embedding generation
and its bounded transport retries. A timeout can leave provider work in
progress; keep the original key when recovering. For query plans, supply these
options to `execute_query()`. Building a plan generates no embeddings, and
each text nearest branch has its own generation usage when executed.

Use the specific error code to choose a next step:

| Code | Recovery |
| --- | --- |
| `CONTEXT_CAPABILITY_UNAVAILABLE` for `query_embedding_generation` | Use a supporting Runtime for text input, or continue the application's compatible-vector workflow. |
| `EMBEDDING_SEARCH_NOT_READY` | Check generation and collection readiness, then confirm the selected vector's saved model connection. |
| `EMBEDDING_QUOTA_EXHAUSTED` | Check the remaining retrieval allowance and renewal date; enable authorized credit usage when available. Resume after funding or renewal. |
| `EMBEDDING_MODEL_UNAVAILABLE` | Review the configured model with the project administrator; retain the model compatibility of existing data. |
| `EMBEDDING_PROVIDER_RATE_LIMITED`, `EMBEDDING_PROVIDER_UNAVAILABLE` | Follow the service's delay guidance within the application's retry budget and keep the query key. |
| `EMBEDDING_PROVIDER_OUTCOME_UNKNOWN` | Preserve the request ID and query key; reconcile the provider outcome through the supported administrative workflow before another attempt. |
| `EMBEDDING_USAGE_CONFLICT` | Compare the recorded request with the intended query and resolve the conflict before retrying. |

Avoid an outer retry loop based on HTTP 429 or 503 alone. For example, an
exhausted allowance and a provider rate limit can both return 429, but only the
temporary rate limit calls for ordinary backoff. Use the public error code,
details, and recovery guidance together.

## Pagination

Process one page when latency and a fixed result cap matter:

```python
page = project.text.tsvector(query, config="documents_body_tsv", limit=25)
for result in page.results:
    consume(result)
next_cursor = page.next_cursor
```

Use `.auto_paging_iter()` only when the application genuinely needs all pages:

```python
page = project.vector.search(embedding, config="documents_embedding", limit=100)
for result in page.auto_paging_iter():
    consume(result)
```

Set an application maximum for rows, pages, elapsed time, and context tokens.
Preserve the last cursor and request ID when stopping early or after a partial
failure.

For a text query, retain the same text, configuration, filters, limit, spending
preference, and query key when continuing manually with `cursor`. The SDK's
automatic iterator preserves that identity. Context ranked responses are typed
envelopes rather than cursor pages; pagination applies to legacy retrieval and
the documented administrative listings.

## Typed results

Prefer the exported typed models (`GraphResult`, `VectorResult`, `TextResult`,
`HybridResult`, `ContextOperation`, `ContextJointResponse`,
`GraphPathResponse`, `GraphConnectionResponse`, and `Page`) over guessing
dictionary shapes. Use `to_dict()` only at serialization boundaries.
`Project` and the graph, vector, text, hybrid, and Context namespace classes are
not exported from `polygres`; do not import them for application annotations.
Use type inference or an application-owned `Protocol` for dependency injection.

## Focused tests

Mock the Runtime API transport and assert the request path, payload, headers
without secret values, typed response, cursor propagation, and exception type.

```python
def test_empty_vector_results_are_handled(mock_runtime, client):
    mock_runtime.respond(json={"results": [], "has_more": False})

    page = client.project().vector.search([0.1, 0.2], limit=5)

    assert page.results == []
    assert page.has_more is False
```

```python
def test_malformed_runtime_payload_is_not_treated_as_success(mock_runtime, client):
    mock_runtime.respond(json={"results": [{"distance": "not-a-number"}]})

    with pytest.raises((KeyError, TypeError, ValueError)):
        client.project().vector.search([0.1, 0.2])
```

Cover empty pages, malformed JSON payloads, missing fields, invalid dimensions,
NaN and infinity, whitespace-only and fuzzy text, bad directions, depth and
limit boundaries, 401, 403, 404, 429, 5xx, network errors, timeout after
retries, multi-page cursors, and partial iteration failure.

For query generation, also verify exactly one semantic input, unchanged vector
payloads for older Runtimes, text capability checks, `query()` fallback,
Joint's separate semantic and lexical inputs, plan construction without HTTP,
and one idempotency key across retries and pages. Test quota errors separately
from temporary rate limits. A mocked provider verifies SDK request behavior;
use an authorized integration test to verify model selection and accounting.
