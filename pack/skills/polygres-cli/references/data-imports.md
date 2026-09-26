# Data imports

Use imports only for a standard project. Synced projects reject imports; change
the source PostgreSQL database and let managed sync carry eligible changes.

## Contents

- [Capability boundary](#capability-boundary)
- [Plan an import](#plan-an-import)
- [CSV and delimited files](#csv-and-delimited-files)
- [JSON and JSONL](#json-and-jsonl)
- [Type-sensitive imports](#type-sensitive-imports)
- [Execute and recover](#execute-and-recover)
- [Unsupported formats](#unsupported-formats)

## Capability boundary

The public CLI imports CSV through a preview followed by an import:

```bash
polygres import csv <file> --table <table> [options]
polygres import status [job-id]
```

The skill supports TSV, JSON arrays, and JSONL/NDJSON by converting them
locally to CSV with `scripts/prepare_import.py`. The converter does not make
network requests. Upload only the reviewed CSV, never the original JSON or
JSONL source.

Choose by workload, not file extension. Route one JSON object or one runtime
event intended for an existing eligible table to `rows validate`, `insert`,
`upsert`, or `ignore`. Use import for a dataset, a bounded backfill, or an
explicit create-table import. Do not convert a routine one-record write to CSV.

Do not call backend import endpoints directly. Do not use migrations for
generic row ingestion.

## Plan an import

Establish and show:

- source path and detected format;
- selected project and active organization;
- target schema and table;
- mode: `create_table`, `append_existing`, or `replace_existing`;
- headers or JSON key mapping;
- nested JSON policy;
- type requirements;
- whether to wait for terminal status.

Require explicit approval for `replace_existing`, renamed columns, flattened
JSON, or any preceding schema migration.

Do not print row samples by default. Column names, row counts, shape warnings,
and hashes are sufficient and reduce exposure of personal or secret data.

## CSV and delimited files

Native CSV example:

```bash
polygres --json import csv ./documents.csv \
  --table documents \
  --schema public \
  --mode create_table \
  --wait
```

The CLI accepts UTF-8 and UTF-8 with BOM. Supported delimiters are comma, tab,
semicolon, and pipe. It accepts `--no-header`, `--quote-char`, `--escape-char`,
`--timeout`, and `--wait`.

Use the converter to normalize TSV or an uncertain delimited file when shell
quoting or dialect detection is risky:

```bash
python3 <absolute-skill-path>/scripts/prepare_import.py ./documents.tsv \
  --format tsv \
  --output /tmp/polygres-documents.csv \
  --json
```

Inspect the manifest before importing the output.

## JSON and JSONL

Supported shapes:

- JSON array containing objects only;
- JSONL/NDJSON with one object per non-empty line;
- one top-level JSON object only for an explicitly selected import, such as a
  create-table import, when `--allow-single-object` is supplied. Otherwise use
  the rows surface for an individual record.

Example preparation:

```bash
python3 <absolute-skill-path>/scripts/prepare_import.py ./documents.json \
  --format json \
  --output /tmp/polygres-documents.csv \
  --nested reject \
  --key-style preserve \
  --json
```

Nested policies:

| Policy | Behavior |
| --- | --- |
| `reject` | Default. Stop and report nested paths. |
| `stringify` | Store nested objects and arrays as compact JSON text. |
| `flatten` | Flatten nested objects with `_`; reject arrays. |

Do not select `stringify` or `flatten` silently. Explain that a newly created
table can infer the resulting values as text.

JSON missing keys and JSON `null` become empty CSV fields. If empty strings
also occur in a column, the manifest reports that the original distinction
cannot be preserved. Obtain approval before continuing.

With `--key-style preserve`, invalid SQL identifiers cause conversion to stop.
With `--key-style sql-safe`, the converter proposes deterministic replacements.
Show `key_mapping` and obtain approval before importing renamed columns.

## Type-sensitive imports

CSV preparation does not guarantee original JSON types. When types matter:

1. Propose a typed target table.
2. Review and approve a migration defining it.
3. Apply the migration.
4. Prepare CSV headers that exactly match the target columns.
5. Import with `--mode append_existing`.
6. Let backend validation confirm whether values fit.

Do not promise nested JSON will load into `jsonb` unless the deployed CLI and
backend have a verified contract for that target-table cast.

## Execute and recover

The format converter defaults to a 1 GiB output ceiling, configurable with
`--max-output-bytes`. That is not the native CSV upload limit. CSV uploads are
validated against the project tier and API contract, currently up to 5 GiB.
Use `--wait` when the user wants terminal status.

After submission, retain the job ID and request ID. On timeout, run:

```bash
polygres --json import status <job-id>
```

Do not blindly resubmit. A timed-out client does not prove the import stopped.
For failures, report the backend error code, message, request ID, and available
row-level error coordinates without dumping unrelated row contents.

Delete a temporary converted CSV after verified success. On failure, tell the
user its path and offer deletion. Never delete the original source.

## Unsupported formats

For Excel, ask the user to export the intended worksheet to CSV. For Parquet,
Avro, ORC, XML, or YAML, ask for CSV or JSONL export. Do not install conversion
libraries silently.

SQL import and plain/custom `pg_dump` restore are not in the current public CLI
surface. Explain the limitation and do not invent a command or call a private
route.
