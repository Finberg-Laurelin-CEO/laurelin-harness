#!/usr/bin/env python3
"""Prepare supported local data files for the Polygres CSV import command."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import tempfile
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TextIO

MAX_OUTPUT_BYTES = 1024**3
READ_CHUNK_SIZE = 64 * 1024
SQL_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SUPPORTED_DELIMITERS = {",", "\t", ";", "|"}
FORMAT_BY_SUFFIX = {
    ".csv": "csv",
    ".tsv": "tsv",
    ".json": "json",
    ".jsonl": "jsonl",
    ".ndjson": "jsonl",
}


class PreparationError(Exception):
    """A user-correctable import preparation failure."""


@dataclass
class Analysis:
    row_count: int
    raw_columns: list[str]
    nested_fields: list[str]
    null_empty_string_conflicts: list[str]


@dataclass
class PreparedRows:
    source_format: str
    analysis: Analysis
    key_mapping: dict[str, str]
    final_columns: list[str]
    row_factory: Callable[[], Iterator[Mapping[str, Any]]]


class JsonStream:
    """Incrementally decode one top-level JSON value or an array of values."""

    def __init__(self, handle: TextIO) -> None:
        self.handle = handle
        self.decoder = json.JSONDecoder()
        self.buffer = ""
        self.position = 0
        self.eof = False

    def _compact(self) -> None:
        if self.position:
            self.buffer = self.buffer[self.position :]
            self.position = 0

    def _read_more(self) -> bool:
        self._compact()
        chunk = self.handle.read(READ_CHUNK_SIZE)
        if chunk == "":
            self.eof = True
            return False
        self.buffer += chunk
        return True

    def _ensure_available(self) -> bool:
        while self.position >= len(self.buffer) and not self.eof:
            if not self._read_more():
                break
        return self.position < len(self.buffer)

    def skip_whitespace(self) -> None:
        while True:
            while self.position < len(self.buffer) and self.buffer[self.position].isspace():
                self.position += 1
            if self.position < len(self.buffer) or self.eof:
                return
            self._read_more()

    def peek(self) -> str | None:
        self.skip_whitespace()
        if not self._ensure_available():
            return None
        return self.buffer[self.position]

    def consume(self, expected: str) -> None:
        actual = self.peek()
        if actual != expected:
            found = "end of file" if actual is None else repr(actual)
            raise PreparationError(f"Malformed JSON: expected {expected!r}, found {found}.")
        self.position += 1

    def decode_value(self) -> Any:
        self.skip_whitespace()
        self._compact()
        while True:
            if not self.buffer and self.eof:
                raise PreparationError("Malformed JSON: expected a value, found end of file.")
            try:
                value, end = self.decoder.raw_decode(self.buffer)
            except json.JSONDecodeError as exc:
                if not self.eof and self._read_more():
                    continue
                raise PreparationError(
                    f"Malformed JSON near line {exc.lineno}, column {exc.colno}: {exc.msg}."
                ) from exc
            self.position = end
            return value

    def require_end(self) -> None:
        self.skip_whitespace()
        if self._ensure_available():
            raise PreparationError("Malformed JSON: unexpected content after the top-level value.")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Prepare CSV, TSV, JSON, or JSONL data for Polygres CSV import."
    )
    parser.add_argument("input_file", type=Path)
    parser.add_argument("--format", choices=["auto", "csv", "tsv", "json", "jsonl"], default="auto")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--nested", choices=["reject", "stringify", "flatten"], default="reject")
    parser.add_argument("--key-style", choices=["preserve", "sql-safe"], default="preserve")
    parser.add_argument("--allow-single-object", action="store_true")
    parser.add_argument("--no-header", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--json", action="store_true", dest="json_output")
    parser.add_argument(
        "--max-output-bytes",
        type=_positive_int,
        default=MAX_OUTPUT_BYTES,
        help=argparse.SUPPRESS,
    )
    return parser


def _positive_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("value must be an integer") from exc
    if parsed < 1:
        raise argparse.ArgumentTypeError("value must be positive")
    return parsed


def _readable_source(path: Path) -> Path:
    try:
        resolved = path.expanduser().resolve(strict=True)
    except OSError as exc:
        raise PreparationError(f"Input file does not exist or cannot be resolved: {path}") from exc
    if not resolved.is_file():
        raise PreparationError(f"Input path is not a regular file: {resolved}")
    if not os.access(resolved, os.R_OK):
        raise PreparationError(f"Input file is not readable: {resolved}")
    return resolved


def _output_path(path: Path, source: Path, overwrite: bool) -> Path:
    expanded = path.expanduser()
    if expanded.is_symlink():
        raise PreparationError(f"Output path must not be a symbolic link: {expanded}")
    resolved = expanded.resolve()
    if resolved == source:
        raise PreparationError("Output file must not overwrite the source file.")
    if not resolved.parent.is_dir():
        raise PreparationError(f"Output directory does not exist: {resolved.parent}")
    if resolved.exists() and not overwrite:
        raise PreparationError("Output file already exists. Pass --overwrite to replace it.")
    if resolved.exists() and not resolved.is_file():
        raise PreparationError(f"Output path is not a regular file: {resolved}")
    return resolved


def _first_non_whitespace(path: Path) -> str | None:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            while True:
                chunk = handle.read(READ_CHUNK_SIZE)
                if chunk == "":
                    return None
                for char in chunk:
                    if not char.isspace():
                        return char
    except UnicodeDecodeError as exc:
        raise PreparationError("Input must be UTF-8 or UTF-8 with BOM.") from exc


def _detect_format(path: Path, requested: str) -> str:
    suffix_format = FORMAT_BY_SUFFIX.get(path.suffix.lower())
    if requested != "auto":
        if suffix_format is not None and suffix_format != requested:
            raise PreparationError(
                f"Requested format {requested!r} conflicts with file extension {path.suffix!r}."
            )
        return requested
    if suffix_format is not None:
        return suffix_format
    first = _first_non_whitespace(path)
    if first == "[":
        return "json"
    if first == "{":
        return "jsonl" if _looks_like_jsonl(path) else "json"
    if first is None:
        raise PreparationError("Input file is empty.")
    return "csv"


def _looks_like_jsonl(path: Path) -> bool:
    nonempty = 0
    try:
        with path.open("r", encoding="utf-8-sig") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                nonempty += 1
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    return False
                if not isinstance(value, dict):
                    return False
                if nonempty >= 2:
                    return True
                if line_number >= 50:
                    break
    except UnicodeDecodeError as exc:
        raise PreparationError("Input must be UTF-8 or UTF-8 with BOM.") from exc
    return False


def _json_rows(path: Path, allow_single_object: bool) -> Iterator[Mapping[str, Any]]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            stream = JsonStream(handle)
            first = stream.peek()
            if first == "[":
                stream.consume("[")
                if stream.peek() == "]":
                    stream.consume("]")
                    stream.require_end()
                    return
                while True:
                    value = stream.decode_value()
                    if not isinstance(value, dict):
                        raise PreparationError("JSON arrays must contain objects only.")
                    yield value
                    separator = stream.peek()
                    if separator == ",":
                        stream.consume(",")
                        continue
                    if separator == "]":
                        stream.consume("]")
                        stream.require_end()
                        return
                    found = "end of file" if separator is None else repr(separator)
                    raise PreparationError(
                        f"Malformed JSON array: expected ',' or ']', found {found}."
                    )
            if first == "{":
                if not allow_single_object:
                    raise PreparationError(
                        "A single JSON object requires --allow-single-object after user approval."
                    )
                value = stream.decode_value()
                stream.require_end()
                if not isinstance(value, dict):
                    raise PreparationError("Top-level JSON value must be an object or array.")
                yield value
                return
            if first is None:
                raise PreparationError("Input file is empty.")
            raise PreparationError("Top-level JSON value must be an object or array of objects.")
    except UnicodeDecodeError as exc:
        raise PreparationError("Input must be UTF-8 or UTF-8 with BOM.") from exc


def _jsonl_rows(path: Path) -> Iterator[Mapping[str, Any]]:
    try:
        with path.open("r", encoding="utf-8-sig") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                try:
                    value = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise PreparationError(
                        f"Malformed JSONL on line {line_number}, column {exc.colno}: {exc.msg}."
                    ) from exc
                if not isinstance(value, dict):
                    raise PreparationError(f"JSONL line {line_number} must contain an object.")
                yield value
    except UnicodeDecodeError as exc:
        raise PreparationError("Input must be UTF-8 or UTF-8 with BOM.") from exc


def _sample_text(path: Path) -> str:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            return handle.read(READ_CHUNK_SIZE)
    except UnicodeDecodeError as exc:
        raise PreparationError("Input must be UTF-8 or UTF-8 with BOM.") from exc


def _delimiter(path: Path, source_format: str) -> str:
    if source_format == "tsv":
        return "\t"
    sample = _sample_text(path)
    if not sample:
        raise PreparationError("Input file is empty.")
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=",\t;|").delimiter
    except csv.Error:
        delimiter = "," if path.suffix.lower() == ".csv" else ""
    if delimiter not in SUPPORTED_DELIMITERS:
        raise PreparationError(
            "Could not detect a supported comma, tab, semicolon, or pipe delimiter."
        )
    return delimiter


def _delimited_rows(
    path: Path, source_format: str, no_header: bool
) -> tuple[list[str], Callable[[], Iterator[Mapping[str, Any]]]]:
    delimiter = _delimiter(path, source_format)

    def raw_rows() -> Iterator[list[str]]:
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.reader(handle, delimiter=delimiter)
                for row in reader:
                    if row:
                        yield row
        except UnicodeDecodeError as exc:
            raise PreparationError("Input must be UTF-8 or UTF-8 with BOM.") from exc
        except csv.Error as exc:
            raise PreparationError(f"Malformed delimited input: {exc}.") from exc

    first_pass = raw_rows()
    try:
        first = next(first_pass)
    except StopIteration as exc:
        raise PreparationError("Input file contains no rows.") from exc
    headers = [f"column_{index}" for index in range(1, len(first) + 1)] if no_header else first
    if not headers:
        raise PreparationError("Input file contains no columns.")
    if len(set(headers)) != len(headers):
        raise PreparationError("Input headers must be unique.")

    def factory() -> Iterator[Mapping[str, Any]]:
        rows = raw_rows()
        if not no_header:
            try:
                next(rows)
            except StopIteration:
                return
        for row_number, row in enumerate(rows, start=1 if no_header else 2):
            if len(row) != len(headers):
                raise PreparationError(
                    f"Row {row_number} has {len(row)} fields; expected {len(headers)}."
                )
            yield dict(zip(headers, row, strict=True))

    return headers, factory


def _flatten_value(
    value: Any,
    prefix: tuple[str, ...],
    output: dict[str, Any],
    nested_fields: set[str],
) -> None:
    if isinstance(value, dict):
        if prefix:
            nested_fields.add(".".join(prefix))
        for key, item in value.items():
            _flatten_value(item, (*prefix, str(key)), output, nested_fields)
        return
    if isinstance(value, list):
        path = ".".join(prefix)
        raise PreparationError(f"Cannot flatten JSON array field: {path}")
    output["_".join(prefix)] = value


def _transform_json_row(
    row: Mapping[str, Any], nested_policy: str, nested_fields: set[str]
) -> dict[str, Any]:
    if nested_policy == "flatten":
        flattened: dict[str, Any] = {}
        for key, value in row.items():
            _flatten_value(value, (str(key),), flattened, nested_fields)
        return flattened

    transformed: dict[str, Any] = {}
    for key, value in row.items():
        key = str(key)
        if isinstance(value, (dict, list)):
            nested_fields.add(key)
            if nested_policy == "stringify":
                transformed[key] = json.dumps(
                    value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
                )
            else:
                transformed[key] = value
        else:
            transformed[key] = value
    return transformed


def _analyze_rows(
    row_factory: Callable[[], Iterator[Mapping[str, Any]]], nested_policy: str, is_json: bool
) -> Analysis:
    columns: list[str] = []
    known: set[str] = set()
    nested_fields: set[str] = set()
    present: dict[str, int] = {}
    nulls: dict[str, int] = {}
    empty_strings: dict[str, int] = {}
    row_count = 0

    for row in row_factory():
        row_count += 1
        transformed = (
            _transform_json_row(row, nested_policy, nested_fields)
            if is_json
            else dict(row)
        )
        for key, value in transformed.items():
            if key not in known:
                known.add(key)
                columns.append(key)
            present[key] = present.get(key, 0) + 1
            if value is None:
                nulls[key] = nulls.get(key, 0) + 1
            elif value == "":
                empty_strings[key] = empty_strings.get(key, 0) + 1

    if row_count == 0:
        raise PreparationError("Input file contains no data rows.")
    if not columns:
        raise PreparationError("Input rows contain no columns.")
    if nested_policy == "reject" and nested_fields:
        fields = ", ".join(sorted(nested_fields))
        raise PreparationError(
            f"Nested JSON fields require an explicit --nested stringify or flatten choice: {fields}"
        )

    conflicts = []
    for column in columns:
        missing_or_null = row_count - present.get(column, 0) + nulls.get(column, 0)
        if missing_or_null and empty_strings.get(column, 0):
            conflicts.append(column)
    return Analysis(
        row_count=row_count,
        raw_columns=columns,
        nested_fields=sorted(nested_fields),
        null_empty_string_conflicts=conflicts,
    )


def _sql_safe_name(name: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_]+", "_", name)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        normalized = "column"
    if not re.match(r"^[A-Za-z_]", normalized):
        normalized = f"c_{normalized}"
    return normalized


def _key_mapping(columns: Sequence[str], style: str) -> tuple[dict[str, str], list[str]]:
    if style == "preserve":
        invalid = [column for column in columns if not SQL_IDENTIFIER_RE.fullmatch(column)]
        if invalid:
            joined = ", ".join(repr(item) for item in invalid)
            raise PreparationError(
                f"Columns are not valid SQL identifiers: {joined}. "
                "Use --key-style sql-safe to propose replacements."
            )
        mapping = {column: column for column in columns}
    else:
        mapping = {column: _sql_safe_name(column) for column in columns}
    final = list(mapping.values())
    duplicates = sorted({name for name in final if final.count(name) > 1})
    if duplicates:
        raise PreparationError(
            "Column normalization creates collisions: "
            + ", ".join(repr(item) for item in duplicates)
        )
    changed = {source: target for source, target in mapping.items() if source != target}
    return changed, final


def _format_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        raise PreparationError("Nested JSON value reached CSV output without a conversion policy.")
    return str(value)


def _encoded_csv_row(values: Sequence[str]) -> bytes:
    buffer = io.StringIO(newline="")
    csv.writer(buffer, lineterminator="\n").writerow(values)
    return buffer.getvalue().encode("utf-8")


def _write_output(
    destination: Path,
    prepared: PreparedRows,
    nested_policy: str,
    max_output_bytes: int,
) -> int:
    temporary: Path | None = None
    size = 0
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{destination.name}.",
            suffix=".tmp",
            dir=destination.parent,
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
            header = _encoded_csv_row(prepared.final_columns)
            size += len(header)
            if size > max_output_bytes:
                raise PreparationError("Generated CSV exceeds the configured output-size limit.")
            handle.write(header)
            nested_fields: set[str] = set()
            for row in prepared.row_factory():
                transformed = (
                    _transform_json_row(row, nested_policy, nested_fields)
                    if prepared.source_format in {"json", "jsonl"}
                    else dict(row)
                )
                encoded = _encoded_csv_row(
                    [
                        _format_value(transformed.get(raw_column))
                        for raw_column in prepared.analysis.raw_columns
                    ]
                )
                size += len(encoded)
                if size > max_output_bytes:
                    raise PreparationError(
                        "Generated CSV exceeds the configured output-size limit."
                    )
                handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
        temporary = None
        return size
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(READ_CHUNK_SIZE):
            digest.update(chunk)
    return digest.hexdigest()


def _prepare_rows(
    source: Path,
    source_format: str,
    nested_policy: str,
    key_style: str,
    allow_single_object: bool,
    no_header: bool,
) -> PreparedRows:
    if source_format == "json":
        def row_factory() -> Iterator[Mapping[str, Any]]:
            return _json_rows(source, allow_single_object)

        analysis = _analyze_rows(row_factory, nested_policy, is_json=True)
    elif source_format == "jsonl":
        def row_factory() -> Iterator[Mapping[str, Any]]:
            return _jsonl_rows(source)

        analysis = _analyze_rows(row_factory, nested_policy, is_json=True)
    else:
        headers, row_factory = _delimited_rows(source, source_format, no_header)
        analysis = _analyze_rows(row_factory, nested_policy, is_json=False)
        if headers != analysis.raw_columns:
            analysis.raw_columns = headers
    changed_mapping, final_columns = _key_mapping(analysis.raw_columns, key_style)
    return PreparedRows(
        source_format=source_format,
        analysis=analysis,
        key_mapping=changed_mapping,
        final_columns=final_columns,
        row_factory=row_factory,
    )


def _manifest(
    source: Path,
    destination: Path,
    prepared: PreparedRows,
    output_size: int,
    nested_policy: str,
) -> dict[str, Any]:
    warnings: list[str] = []
    if prepared.key_mapping:
        warnings.append("One or more columns were renamed; review key_mapping before import.")
    if prepared.analysis.null_empty_string_conflicts:
        warnings.append(
            "Missing/null and empty-string values cannot remain distinct "
            "in one or more CSV columns."
        )
    if prepared.analysis.nested_fields and nested_policy == "stringify":
        warnings.append("Nested JSON values were encoded as compact JSON text.")
    if prepared.analysis.nested_fields and nested_policy == "flatten":
        warnings.append("Nested JSON objects were flattened into underscore-separated columns.")
    return {
        "source_path": str(source),
        "source_format": prepared.source_format,
        "source_sha256": _sha256(source),
        "output_path": str(destination),
        "output_sha256": _sha256(destination),
        "output_size_bytes": output_size,
        "row_count": prepared.analysis.row_count,
        "columns": prepared.final_columns,
        "key_mapping": prepared.key_mapping,
        "nested_fields": prepared.analysis.nested_fields,
        "null_empty_string_conflicts": prepared.analysis.null_empty_string_conflicts,
        "warnings": warnings,
    }


def run(args: argparse.Namespace) -> dict[str, Any]:
    source = _readable_source(args.input_file)
    destination = _output_path(args.output, source, args.overwrite)
    source_format = _detect_format(source, args.format)
    prepared = _prepare_rows(
        source,
        source_format,
        args.nested,
        args.key_style,
        args.allow_single_object,
        args.no_header,
    )
    output_size = _write_output(destination, prepared, args.nested, args.max_output_bytes)
    return _manifest(source, destination, prepared, output_size, args.nested)


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        manifest = run(args)
    except PreparationError as exc:
        sys.stderr.write(f"prepare_import: {exc}\n")
        return 2
    if args.json_output:
        json.dump(manifest, sys.stdout, ensure_ascii=False, sort_keys=True)
        sys.stdout.write("\n")
    else:
        sys.stdout.write(f"Prepared {manifest['row_count']} rows: {manifest['output_path']}\n")
        for warning in manifest["warnings"]:
            sys.stderr.write(f"Warning: {warning}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
