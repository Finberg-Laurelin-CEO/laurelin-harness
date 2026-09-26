# Files, APIs, events, and mixed sources

## Files, documents, and code

Select exact roots and file types. Respect ignore files, repository boundaries,
and explicit exclusions. Record unreadable, unsupported, oversized, and parse
failed files in a coverage ledger.

Use source identity plus content hash to detect edits, renames, and duplicates.
Preserve path, repository revision, section, page, line, or message provenance.
Choose manual scan, scheduled scan, or file watcher. Treat watchers as hints and
run periodic reconciliation. Remove derived data when a file is deleted or
leaves scope.

Extract explicit hyperlinks, citations, file references, and symbols. Do not
invent semantic graph edges from similar content.

## APIs and SaaS products

Prefer documented APIs. Record requested scopes, pagination, rate limits,
cursor behavior, update timestamps, deletion behavior, and permission changes.
Store tokens only in `.env` for local use or a deployment secret manager.

Use backfill pagination plus a webhook or scheduled incremental read. Verify
webhook signatures, deduplicate deliveries, preserve event IDs, and bound
retries. Do not claim an unsupported connector is built in.

## Queues and event streams

Record partition key, ordering, delivery guarantee, event ID, schema version,
replay position, retention, and dead-letter behavior. Make consumers
idempotent because at-least-once delivery can repeat events. Handle source
revisions so stale events cannot overwrite newer data.

## Mixed sources

Give each source a namespace and stable key. Normalize ownership and time
semantics while preserving source-specific permissions and deletions. Merge
identities only through explicit anchors such as the same verified account ID,
email ID, foreign key, or application mapping. Similar names are not identity
proof.

## Verify

Test pagination, rate limits, duplicate webhooks, invalid signatures, expired
tokens, deleted files, file moves, ignored files, parse failures, stream replay,
permission loss, source removal, and cross-source tenant isolation. Keep
coverage and skipped-item counts visible.
