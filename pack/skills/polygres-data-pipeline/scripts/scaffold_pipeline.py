#!/usr/bin/env python3
"""Create only the local files selected by an adaptive Polygres setup manifest."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

from render_pipeline_review import render_review
from validate_pipeline_plan import PlanValidationError, _object, load_and_validate

SCRIPT_ROOT = Path(__file__).resolve().parent
ASSET_ROOT = SCRIPT_ROOT.parent / "assets" / "python-pipeline"
EMBEDDING_CATALOG = SCRIPT_ROOT.parent / "assets" / "embedding-models.json"


def _json(value: Any) -> str:
    return json.dumps(value, indent=2, sort_keys=True) + "\n"


def _identifier(value: str) -> str:
    return f'"{value.replace(chr(34), chr(34) * 2)}"'


def _enabled(plan: dict[str, Any], component: str) -> bool:
    value = plan.get(component)
    return isinstance(value, dict) and value.get("enabled", True) is not False


def _is_synced(plan: dict[str, Any]) -> bool:
    target = plan.get("target")
    return isinstance(target, dict) and target.get("project_mode") == "synced"


def _sdk_runtime(plan: dict[str, Any], component: str, operation: str) -> bool:
    if not _enabled(plan, component):
        return False
    interface = _object(plan[component].get("interface"))
    return interface.get("surface") == "sdk" and interface.get("operation") == operation


def _managed_io(plan: dict[str, Any]) -> str:
    settings = _object(plan["embedding"].get("settings"))
    source_ready = all(
        settings.get(key) for key in ("source_schema", "source_table", "source_key_columns")
    )
    lines = [
        '"""Use after source filtering and request authorization have completed."""',
        "",
        "from typing import Any",
        "",
    ]
    writes = (
        source_ready
        and _sdk_runtime(plan, "capture_runtime", "project.rows.upsert")
        and not _is_synced(plan)
    )
    context = _object(plan.get("context"))
    searches = _sdk_runtime(plan, "retrieval_runtime", "project.context.search") and bool(
        context.get("collection")
    )
    if not writes and not searches:
        return ""
    if writes:
        lines.extend(
            [
                "",
                "def store_filtered_record(",
                "    project: Any, row: dict[str, Any], *, update_columns: list[str]",
                ") -> Any:",
                "    return project.rows.upsert(",
                f"        schema={settings['source_schema']!r},",
                f"        table={settings['source_table']!r},",
                "        row=row,",
                f"        conflict_columns={settings['source_key_columns']!r},",
                "        update_columns=update_columns,",
                "    )",
            ]
        )
    if searches:
        lines.extend(
            [
                "",
                "",
                "def search_authorized_text(",
                "    project: Any, text: str, *, query_filter: dict[str, Any],",
                "    idempotency_key: str",
                ") -> Any:",
                "    return project.context.search(",
                f"        {context['collection']!r},",
                "        text=text,",
                f"        vector_name={context.get('vector_name')!r},",
                "        filter=query_filter,",
                f"        use_credits={plan['embedding'].get('query_use_credits', False)!r},",
                "        idempotency_key=idempotency_key,",
                f"        timeout={plan['retrieval_runtime'].get('timeout_seconds', 130)!r},",
                "    )",
            ]
        )
    return "\n".join(lines) + "\n"


def _schema_sql(plan: dict[str, Any]) -> str:
    schema = plan["schema"]
    embedding = plan.get("embedding", {"enabled": False})
    columns = []
    for column in schema["columns"]:
        column_type = column["type"]
        if column_type == "vector":
            column_type = f"vector({embedding['dimensions']})"
        clauses = [_identifier(column["name"]), column_type]
        if not column["nullable"]:
            clauses.append("NOT NULL")
        if column["primary_key"]:
            clauses.append("PRIMARY KEY")
        columns.append("    " + " ".join(clauses))
    return (
        "-- Apply only after the matching plan review is approved.\n"
        f"CREATE SCHEMA IF NOT EXISTS {_identifier(schema['schema'])};\n\n"
        "CREATE TABLE IF NOT EXISTS "
        f"{_identifier(schema['schema'])}.{_identifier(schema['table'])} (\n"
        + ",\n".join(columns)
        + "\n);\n"
    )


def _readme(plan: dict[str, Any]) -> str:
    target = plan.get("target") if isinstance(plan.get("target"), dict) else {}
    source = plan.get("source") if isinstance(plan.get("source"), dict) else {}
    selected = [
        name
        for name in (
            "schema",
            "embedding",
            "context",
            "text",
            "graph",
            "sync",
            "capture_runtime",
            "retrieval_runtime",
            "agent_integration",
        )
        if isinstance(plan.get(name), dict) and plan[name].get("enabled", True)
    ]
    omitted = [
        name
        for name in (
            "schema",
            "embedding",
            "context",
            "text",
            "graph",
            "sync",
            "capture_runtime",
            "retrieval_runtime",
            "agent_integration",
        )
        if name not in selected
    ]
    synced = _is_synced(plan)
    mode_guidance = (
        "This is a managed PostgreSQL sync plan. Enter the source connection only in the "
        "Polygres dashboard. The source remains the system of record, and this pack does not "
        "contain a custom capture worker, target schema migration, checkpoint ledger, or source "
        "credential.\n"
        if synced
        else ""
    )
    write_guidance = (
        "For synchronized data, write, update, and delete in the source database. "
        "Polygres can generate embeddings from synchronized text and configure search over "
        "that managed output."
        if synced
        else "For per-record capture, use the public rows surface only after capability or\n"
        "installed-version evidence confirms it. If unavailable, keep capture blocked\n"
        "with the exact CLI/SDK upgrade requirement; do not invent an endpoint."
    )
    managed = _enabled(plan, "embedding") and plan["embedding"].get("location") == "managed"
    io_guidance = (
        "Use the existing SDK methods in `pipeline_io.py`. "
        if managed and _managed_io(plan)
        else "Use the selected retrieval interface. "
    )
    managed_guidance = (
        "Polygres handles source embedding generation and reconciles the generated output. "
        "Write filtered source text without Context reconciliation options. "
        + io_guidance
        + "For text queries, reuse the same query key on retry. "
        "The selected model and allowances are recorded in `embedding.json`. "
        "Configure generation through MCP, CLI, or the dashboard. Both Automatic and Manual "
        "start with the existing rows; Manual collects later changes until Run now.\n"
        if _enabled(plan, "embedding") and plan["embedding"].get("location") == "managed"
        else ""
    )
    return f"""# {plan.get("name", "Polygres setup")}

This pack records the inspected design and local support files. It does not
claim that remote resources or application hooks have been applied.

{mode_guidance}

- Project: `{target.get("project_id", "not needed for local work")}`
- Project mode: `{target.get("project_mode", "standard")}`
- Source: {source.get("kind", "not recorded")} ({source.get("scope", "not recorded")})
- Selected components: {", ".join(selected) or "none"}
- Omitted components: {", ".join(omitted) or "none"}
- Current state: `{plan.get("state", "designing")}`

## Continue

1. The agent keeps `plan.json` internal and shows only the concise mutation review when needed.
2. Add credentials locally using `.env.example` when that file exists. Never paste values into chat.
3. Implement or retain only the source-specific commands named in the selected runtime sections.
4. Apply approved actions. Ask again only if project, source scope, data egress,
   destructive effects, or paid processing changes.
5. Use `operational` only after the important path has passing evidence.

{write_guidance}

{managed_guidance}
"""


def scaffold(plan_path: Path, destination: Path) -> list[Path]:
    plan = load_and_validate(plan_path)
    destination = destination.resolve()
    if destination.exists():
        raise ValueError("destination already exists; choose a new directory")
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{destination.name}.staging-", dir=destination.parent))
    try:
        (staging / "scripts").mkdir()
        files: dict[Path, str] = {
            staging / "plan.json": _json(plan),
            staging / "REVIEW.md": render_review(plan),
            staging / "README.md": _readme(plan),
            staging / ".gitignore": ".env\nstate/\n__pycache__/\n*.pyc\n",
        }
        schema = plan.get("schema")
        if (
            isinstance(schema, dict)
            and schema.get("enabled")
            and schema.get("mode") != "reuse"
            and not _is_synced(plan)
            and isinstance(schema.get("columns"), list)
            and schema.get("schema")
            and schema.get("table")
        ):
            files[staging / "schema.sql"] = _schema_sql(plan)
        for component in (
            "embedding",
            "context",
            "text",
            "graph",
            "sync",
            "capture_runtime",
            "retrieval_runtime",
            "agent_integration",
        ):
            if _enabled(plan, component):
                files[staging / f"{component.replace('_', '-')}.json"] = _json(plan[component])
        if _enabled(plan, "embedding") and plan["embedding"].get("location") == "managed":
            settings = _object(plan["embedding"].get("settings"))
            if all(
                settings.get(key)
                for key in (
                    "name",
                    "source_schema",
                    "source_table",
                    "source_key_columns",
                    "source_text_column",
                    "model_id",
                    "dimensions",
                )
            ):
                files[staging / "embedding-configuration.json"] = _json(settings)
            runtime_code = _managed_io(plan)
            if runtime_code:
                files[staging / "pipeline_io.py"] = runtime_code
        credentials = plan.get("credentials")
        if isinstance(credentials, dict) and credentials.get("required"):
            files[staging / ".env.example"] = "".join(
                f"{name}=\n" for name in credentials["required"]
            )
        for path, content in files.items():
            path.write_text(content, encoding="utf-8")

        copies = ["render_pipeline_review.py", "validate_pipeline_plan.py"]
        if isinstance(credentials, dict) and credentials.get("required"):
            copies.append("check_env.py")
        if _enabled(plan, "embedding") and plan["embedding"].get("location") == "local":
            copies.append("check_embedding_device.py")
        if _enabled(plan, "agent_integration"):
            copies.append("update_agent_instructions.py")
        for name in copies:
            shutil.copyfile(SCRIPT_ROOT / name, staging / "scripts" / name)
        if _enabled(plan, "embedding"):
            shutil.copyfile(
                SCRIPT_ROOT / "recommend_embedding_models.py",
                staging / "scripts" / "recommend_embedding_models.py",
            )
            if plan["embedding"].get("location") in {"local", "hosted"}:
                shutil.copyfile(EMBEDDING_CATALOG, staging / "embedding-models.json")
        if not _is_synced(plan) and (_enabled(plan, "sync") or _enabled(plan, "capture_runtime")):
            (staging / "lib").mkdir(exist_ok=True)
            shutil.copyfile(
                ASSET_ROOT / "checkpoint_ledger.py", staging / "lib" / "checkpoint_ledger.py"
            )
        if _enabled(plan, "embedding") and plan["embedding"].get("location") == "local":
            (staging / "lib").mkdir(exist_ok=True)
            shutil.copyfile(
                ASSET_ROOT / "local_embeddings.py", staging / "lib" / "local_embeddings.py"
            )
        staging.rename(destination)
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging)
        raise
    return [path for path in destination.rglob("*") if path.is_file()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args(argv)
    try:
        created = scaffold(args.plan, args.destination)
    except (OSError, ValueError, PlanValidationError) as error:
        print(f"scaffold failed: {error}", file=sys.stderr)
        return 1
    print(f"Created {len(created)} selected files in {args.destination.resolve()}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
