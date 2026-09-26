#!/usr/bin/env python3
"""Quietly lint an internal Polygres setup plan for material safety issues."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

REMOTE_ACTION_TYPES = {
    "schema-create",
    "schema-alter",
    "bulk-import",
    "row-write",
    "context-configure",
    "text-configure",
    "graph-configure",
    "deploy",
    "backfill",
    "sync-project-create",
    "sync-table-reconfigure",
    "sync-resnapshot",
    "sync-credential-rotate",
    "embedding-create",
    "embedding-update",
    "embedding-process",
    "embedding-remove",
}
DESTRUCTIVE_ACTION_TYPES = {
    "delete",
    "replace",
    "drop",
    "revoke",
    "truncate",
    "resnapshot",
}
SECRET_KEYS = {
    "password",
    "api_key",
    "access_token",
    "secret",
    "token",
    "database_url",
    "connection_url",
    "connection_string",
}
SYNCED_FORBIDDEN_ACTION_TYPES = {
    "schema-create",
    "schema-alter",
    "bulk-import",
    "row-write",
    "backfill",
}
SYNCED_FORBIDDEN_ENV_NAMES = {
    "POLYGRES_DATABASE_URL",
    "POLYGRES_DB_PASSWORD",
    "POLYGRES_DATABASE_PASSWORD",
}
SYNCED_FORBIDDEN_OPERATION_PARTS = (
    "project.rows",
    "rows.",
    "rows ",
    "/rows",
    "import",
    "migration",
    "connection_info",
    "db info",
    "db psql",
)
SYNCED_TARGET_DATABASE_SURFACES = {"postgres", "postgresql", "direct-postgres", "sql"}
ENV_NAME = re.compile(r"^[A-Z_][A-Z0-9_]*$")
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"[a-z][a-z0-9+.-]*://[^\s/:]+:[^\s@]+@", re.IGNORECASE),
    re.compile(r"\b(?:sk|pgs|token)[_-][A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
)


@dataclass(frozen=True)
class LintResult:
    blockers: tuple[dict[str, str], ...]
    warnings: tuple[dict[str, str], ...]

    @property
    def ok(self) -> bool:
        return not self.blockers

    def as_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "blockers": list(self.blockers), "warnings": list(self.warnings)}


class PlanValidationError(ValueError):
    def __init__(self, blockers: tuple[dict[str, str], ...]) -> None:
        self.blockers = blockers
        super().__init__("; ".join(f"{item['path']}: {item['message']}" for item in blockers))


def _issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def _is_cli_sync_creation(surface: str, operation: str) -> bool:
    if surface != "cli":
        return False
    normalized = " ".join(operation.split())
    return normalized in {
        "create synchronized project",
        "create synced project",
    } or normalized.startswith("polygres projects create sync")


def _is_mcp_sync_operation(surface: str, operation: str) -> bool:
    return surface == "mcp" and operation in {
        "get_synchronized_project_preflight",
        "list_synchronized_source_tables",
        "select_synchronized_tables",
        "create_synchronized_project",
        "get_synchronization_status",
        "pause_synchronization",
        "resume_synchronization",
        "retry_synchronization",
        "resnapshot_synchronization",
    }


def _actions(plan: dict[str, Any]) -> list[dict[str, Any]]:
    value = plan.get("actions", [])
    return (
        [
            item
            for item in value
            if isinstance(item, dict) and item.get("enabled", True) is not False
        ]
        if isinstance(value, list)
        else []
    )


def _is_remote(action: dict[str, Any]) -> bool:
    return bool(
        action.get("remote_mutation") is True
        or action.get("scope") == "remote"
        or action.get("type") in REMOTE_ACTION_TYPES
    )


def _is_destructive(action: dict[str, Any]) -> bool:
    text = " ".join(str(action.get(key, "")) for key in ("type", "effect")).casefold()
    return bool(
        action.get("destructive") is True or any(word in text for word in DESTRUCTIVE_ACTION_TYPES)
    )


def approval_boundary(plan: dict[str, Any]) -> dict[str, Any]:
    actions = _actions(plan)
    project_id = (
        plan.get("target", {}).get("project_id") if isinstance(plan.get("target"), dict) else None
    )
    source_scope = (
        plan.get("source", {}).get("scope") if isinstance(plan.get("source"), dict) else None
    )
    project_mode = (
        plan.get("target", {}).get("project_mode") if isinstance(plan.get("target"), dict) else None
    )
    source_authority = (
        plan.get("source", {}).get("system_of_record")
        if isinstance(plan.get("source"), dict)
        else None
    )
    sync = plan.get("sync")
    selected_tables = sync.get("selected_tables", []) if isinstance(sync, dict) else []
    sync_selection = sorted(_sync_selection_label(item) for item in selected_tables)
    egress = sorted(
        {
            str(action["data_egress"])
            for action in actions
            if action.get("data_egress") not in (None, "", "none")
        }
    )
    destructive = sorted(
        str(action.get("id") or action.get("effect") or action.get("type"))
        for action in actions
        if _is_destructive(action)
    )
    paid = sorted(
        str(action.get("id") or action.get("effect") or action.get("type"))
        for action in actions
        if action.get("paid_processing") is True
    )
    embedding_options = plan.get("embedding_options")
    embedding = plan.get("embedding")
    embedding_enabled = (
        not isinstance(embedding, dict) or embedding.get("enabled", True) is not False
    )
    reviewed_options = (
        [option for option in embedding_options if isinstance(option, dict)]
        if embedding_enabled and isinstance(embedding_options, list)
        else []
    )
    if reviewed_options:
        for option in reviewed_options:
            data_egress = option.get("data_egress")
            if data_egress not in (None, "", "none"):
                egress.append(str(data_egress))
            if option.get("paid_processing") is True:
                paid.append(f"embedding:{option.get('provider', option.get('id', 'hosted'))}")
    else:
        if (
            isinstance(embedding, dict)
            and embedding.get("enabled")
            and embedding.get("location") in {"hosted", "managed"}
        ):
            cost = str(embedding.get("cost", "")).strip().casefold()
            settings = _object(embedding.get("settings"))
            if embedding.get("location") == "managed":
                if settings.get("use_credits", False):
                    paid.append("embedding:managed-generation-credits")
                if embedding.get("query_use_credits", False):
                    paid.append("embedding:managed-query-credits")
            elif cost not in {"", "none", "free"}:
                paid.append(f"embedding:{embedding.get('provider', 'hosted')}")
            data_egress = embedding.get("data_egress")
            if data_egress not in (None, "", "none"):
                egress.append(str(data_egress))
    managed_effects = []
    managed_options = list(reviewed_options)
    if isinstance(embedding, dict):
        managed_options.append(embedding)
    for option in managed_options:
        if not embedding_enabled or option.get("location", option.get("category")) != "managed":
            continue
        settings = _object(option.get("settings"))
        model = option.get("model", {})
        effect = {
            "source_schema": settings.get("source_schema"),
            "source_table": settings.get("source_table"),
            "source_key_columns": settings.get("source_key_columns"),
            "source_text_column": settings.get("source_text_column"),
            "model_id": settings.get("model_id", option.get("id")),
            "revision": model.get("revision")
            if isinstance(model, dict)
            else option.get("revision"),
            "price_version": model.get("price_version")
            if isinstance(model, dict)
            else option.get("price_version"),
            "dimensions": settings.get("dimensions"),
            "mode": settings.get("mode", "automatic"),
            "chunking": settings.get("chunking", {"enabled": False}),
            "existing_vector_column": settings.get("existing_vector_column"),
            "use_credits": settings.get("use_credits", False),
            "query_use_credits": option.get("query_use_credits", False),
        }
        if effect not in managed_effects:
            managed_effects.append(effect)
    boundary = {
        "project_id": project_id,
        "project_mode": project_mode,
        "source_scope": source_scope,
        "source_authority": source_authority,
        "sync_selection": sync_selection,
        "data_egress": sorted(set(egress)),
        "destructive_actions": sorted(set(destructive)),
        "paid_processing": sorted(set(paid)),
    }
    if managed_effects:
        boundary["managed_embeddings"] = managed_effects
    return boundary


def approval_digest(plan: dict[str, Any]) -> str:
    payload = json.dumps(approval_boundary(plan), sort_keys=True, separators=(",", ":")).encode()
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def plan_digest(plan: dict[str, Any]) -> str:
    """Compatibility alias: approval intentionally covers only material boundaries."""
    return approval_digest(plan)


def _scan_secrets(value: Any, path: str, blockers: list[dict[str, str]]) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            key_is_secret = str(key).casefold() in SECRET_KEYS
            env_reference = isinstance(child, str) and ENV_NAME.fullmatch(child) is not None
            if key_is_secret and child not in (None, "") and not env_reference:
                blockers.append(
                    _issue(
                        "secret-value",
                        child_path,
                        "store an environment-variable name, not a secret value",
                    )
                )
            _scan_secrets(child, child_path, blockers)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _scan_secrets(child, f"{path}[{index}]", blockers)
    elif isinstance(value, str) and any(pattern.search(value) for pattern in SECRET_PATTERNS):
        blockers.append(
            _issue("secret-value", path, "appears to contain a credential or private key")
        )


def _capability_available(plan: dict[str, Any], interface: dict[str, Any]) -> bool | None:
    if isinstance(interface.get("available"), bool):
        return interface["available"]
    capability = interface.get("capability")
    capabilities = plan.get("capabilities")
    if isinstance(capability, str) and isinstance(capabilities, dict):
        value = capabilities.get(capability)
        if isinstance(value, bool):
            return value
        if isinstance(value, dict) and isinstance(value.get("available"), bool):
            return value["available"]
    return None


def _interfaces(value: Any, path: str = "plan") -> list[tuple[str, dict[str, Any]]]:
    found: list[tuple[str, dict[str, Any]]] = []
    if isinstance(value, dict):
        if "surface" in value and "operation" in value:
            found.append((path, value))
        for key, child in value.items():
            found.extend(_interfaces(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(_interfaces(child, f"{path}[{index}]"))
    return found


def _important_path_tested(plan: dict[str, Any]) -> bool:
    verification = plan.get("verification")
    if not isinstance(verification, dict):
        return False
    important = verification.get("important_path")
    if isinstance(important, dict):
        return important.get("status") in {"passed", "tested"} and bool(important.get("evidence"))
    claims = verification.get("claims")
    if isinstance(claims, list):
        return any(
            isinstance(claim, dict)
            and claim.get("capability") in {"important-path", "vertical-slice", "end-to-end"}
            and claim.get("status") in {"passed", "tested"}
            and bool(claim.get("evidence"))
            for claim in claims
        )
    return False


def _sync_selection_label(item: Any) -> str:
    if not isinstance(item, dict):
        return str(item)
    schema = item.get("schema_name") or item.get("schema")
    table = item.get("table_name") or item.get("table") or item.get("name")
    identity = ".".join(str(part) for part in (schema, table) if part)
    columns = item.get("included_columns")
    if isinstance(columns, list) and columns:
        identity += f" [{', '.join(sorted(str(column) for column in columns))}]"
    return identity or "unresolved-table"


def _sync_selection_schema(item: Any) -> str | None:
    if isinstance(item, dict):
        value = item.get("schema_name") or item.get("schema")
        return str(value) if value else None
    if isinstance(item, str) and "." in item:
        return item.split(".", 1)[0]
    return None


def _synced_project_blockers(
    plan: dict[str, Any], actions: list[dict[str, Any]]
) -> list[dict[str, str]]:
    target = plan.get("target")
    if not isinstance(target, dict) or target.get("project_mode") != "synced":
        return []

    blockers: list[dict[str, str]] = []
    schema = plan.get("schema")
    if (
        isinstance(schema, dict)
        and schema.get("enabled", True) is not False
        and schema.get("mode") != "reuse"
        and schema.get("authority") != "source"
    ):
        blockers.append(
            _issue(
                "synced-target-schema-unavailable",
                "schema",
                "a synced project cannot create or alter target schema; change the source schema",
            )
        )

    capture = plan.get("capture_runtime")
    if isinstance(capture, dict) and capture.get("enabled", True) is not False:
        blockers.append(
            _issue(
                "synced-custom-capture-unavailable",
                "capture_runtime",
                "managed PostgreSQL sync replaces target row capture and checkpoint workers",
            )
        )

    context = plan.get("context")
    if (
        isinstance(context, dict)
        and context.get("enabled", True) is not False
        and context.get("source_mode") != "existing"
    ):
        blockers.append(
            _issue(
                "synced-context-source-mode-unavailable",
                "context.source_mode",
                "a synced project must use an existing synchronized source table and column",
            )
        )

    sync = plan.get("sync")
    selected_tables = sync.get("selected_tables", []) if isinstance(sync, dict) else []
    for index, table in enumerate(selected_tables if isinstance(selected_tables, list) else []):
        if _sync_selection_schema(table) != "public":
            blockers.append(
                _issue(
                    "synced-source-schema-unavailable",
                    f"sync.selected_tables[{index}]",
                    "managed sync currently selects eligible tables in the public schema",
                )
            )

    sync_actions = {
        action.get("type") for action in actions if str(action.get("type", "")).startswith("sync-")
    }
    sync_interface = sync.get("interface") if isinstance(sync, dict) else None
    sync_surface = (
        str(sync_interface.get("surface", "")).casefold()
        if isinstance(sync_interface, dict)
        else ""
    )
    cli_creation_only = sync_actions == {"sync-project-create"} and sync_surface == "cli"
    mcp_sync = isinstance(sync_interface, dict) and _is_mcp_sync_operation(
        sync_surface, str(sync_interface.get("operation", ""))
    )
    if sync_actions and sync_surface != "dashboard" and not cli_creation_only and not mcp_sync:
        blockers.append(
            _issue(
                "synced-control-plane-handoff-required",
                "sync.interface",
                "use discovered MCP tools, CLI initial creation, or the dashboard for sync setup",
            )
        )
    if "sync-credential-rotate" in sync_actions:
        blockers.append(
            _issue(
                "synced-credential-rotation-unavailable",
                "actions",
                "do not promise self-service source credential rotation",
            )
        )

    credentials = plan.get("credentials")
    required = credentials.get("required", []) if isinstance(credentials, dict) else []
    for index, name in enumerate(required if isinstance(required, list) else []):
        if name in SYNCED_FORBIDDEN_ENV_NAMES:
            blockers.append(
                _issue(
                    "synced-target-database-secret-unavailable",
                    f"credentials.required[{index}]",
                    "a synced project does not expose target database credentials",
                )
            )

    for index, action in enumerate(actions):
        if (
            action.get("type") in SYNCED_FORBIDDEN_ACTION_TYPES
            and action.get("authority") != "source"
        ):
            blockers.append(
                _issue(
                    "synced-target-mutation-unavailable",
                    f"actions[{index}]",
                    f"{action.get('type')} is unavailable on a synced target; mutate the source",
                )
            )

    for path, interface in _interfaces(plan):
        if interface.get("authority") == "source":
            continue
        surface = str(interface.get("surface", "")).casefold()
        operation = str(interface.get("operation", "")).casefold()
        if surface in SYNCED_TARGET_DATABASE_SURFACES:
            blockers.append(
                _issue(
                    "synced-target-database-unavailable",
                    path,
                    f"{interface.get('surface')} target access is unavailable on a synced project",
                )
            )
        if any(part in operation for part in SYNCED_FORBIDDEN_OPERATION_PARTS):
            blockers.append(
                _issue(
                    "synced-runtime-surface-unavailable",
                    path,
                    f"{interface.get('operation')} is unavailable on a synced project",
                )
            )
        if (
            "sync" in operation
            and surface != "dashboard"
            and not _is_cli_sync_creation(surface, operation)
            and not _is_mcp_sync_operation(surface, operation)
        ):
            blockers.append(
                _issue(
                    "synced-control-plane-handoff-required",
                    path,
                    "use discovered MCP sync tools or the dashboard; CLI supports initial creation",
                )
            )
    return blockers


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _amount(value: Any) -> Decimal | None:
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return parsed if parsed.is_finite() and parsed >= 0 else None


def _managed_embedding_issues(
    plan: dict[str, Any], blockers: list[dict[str, str]], warnings: list[dict[str, str]]
) -> None:
    embedding = _object(plan.get("embedding"))
    if embedding.get("enabled", True) is False or embedding.get("location") != "managed":
        return
    ready = plan.get("state") in {"ready_for_review", "operational"}
    destination = blockers if ready else warnings
    settings = _object(embedding.get("settings"))
    if not settings:
        destination.append(
            _issue(
                "managed-settings-missing",
                "embedding.settings",
                "record the configuration request after source discovery",
            )
        )
        return
    required = (
        "name",
        "source_schema",
        "source_table",
        "source_key_columns",
        "source_text_column",
        "model_id",
        "dimensions",
    )
    for key in required:
        if not settings.get(key):
            destination.append(
                _issue(
                    "managed-setting-missing",
                    f"embedding.settings.{key}",
                    "use the discovered source and model contract",
                )
            )
    keys = settings.get("source_key_columns")
    if not isinstance(keys, list) or not keys or any(not isinstance(key, str) for key in keys):
        blockers.append(
            _issue(
                "managed-key-invalid",
                "embedding.settings.source_key_columns",
                "use discovered non-null unique source key columns",
            )
        )
    elif len(keys) != len(set(keys)):
        blockers.append(
            _issue(
                "managed-key-invalid",
                "embedding.settings.source_key_columns",
                "source key columns must be distinct",
            )
        )
    if settings.get("existing_vector_column") and not settings.get("confirm_original_model"):
        blockers.append(
            _issue(
                "managed-original-model-unconfirmed",
                "embedding.settings.confirm_original_model",
                "confirm the original model and input settings before copying source vectors",
            )
        )
    chunking = _object(settings.get("chunking"))
    if settings.get("chunking") is not None and not isinstance(settings["chunking"], dict):
        blockers.append(
            _issue(
                "managed-chunking-invalid",
                "embedding.settings.chunking",
                "chunking must be an object",
            )
        )
    elif chunking.get("enabled"):
        size, overlap = chunking.get("size_tokens", 512), chunking.get("overlap_tokens", 64)
        if (
            not isinstance(size, int)
            or not isinstance(overlap, int)
            or not 32 <= size <= 8192
            or not 0 <= overlap < size
            or overlap > 2048
        ):
            blockers.append(
                _issue(
                    "managed-chunking-invalid",
                    "embedding.settings.chunking",
                    "choose a supported chunk size and smaller overlap",
                )
            )
        if settings.get("existing_vector_column"):
            blockers.append(
                _issue(
                    "managed-copy-chunk-conflict",
                    "embedding.settings",
                    "generate fresh chunk embeddings instead of copying whole-row vectors",
                )
            )
    model = _object(embedding.get("model"))
    dimensions = model.get("dimensions")
    if not model:
        destination.append(
            _issue(
                "managed-model-missing",
                "embedding.model",
                "retain the selected model returned by Polygres",
            )
        )
    elif (
        str(model.get("id")) != str(settings.get("model_id"))
        or not isinstance(dimensions, list)
        or settings.get("dimensions") not in dimensions
    ):
        blockers.append(
            _issue(
                "managed-model-mismatch",
                "embedding.model",
                "model ID and dimensions must match the selected Polygres catalog entry",
            )
        )
    if not model.get("revision") or not model.get("price_version"):
        destination.append(
            _issue(
                "managed-model-version-missing",
                "embedding.model",
                "retain the pinned model revision and price version",
            )
        )
    if _amount(model.get("microcredits_per_token")) is None:
        destination.append(
            _issue(
                "managed-model-price-missing",
                "embedding.model.microcredits_per_token",
                "retain the current per-token price returned by Polygres",
            )
        )
    preview = _object(embedding.get("preview"))
    if not preview:
        destination.append(
            _issue(
                "managed-preview-missing",
                "embedding.preview",
                "preview this configuration before starting generation",
            )
        )
    else:
        if _object(embedding.get("preview_settings")) != settings:
            destination.append(
                _issue(
                    "managed-preview-settings-mismatch",
                    "embedding.preview_settings",
                    "refresh preview after changing the source or configuration request",
                )
            )
        preview_model = _object(preview.get("model"))
        if any(
            preview_model.get(key) != model.get(key)
            for key in ("id", "revision", "price_version", "microcredits_per_token")
        ):
            blockers.append(
                _issue(
                    "managed-preview-model-mismatch",
                    "embedding.preview.model",
                    "refresh preview for the selected model and price version",
                )
            )
        for field in (
            "source_rows",
            "sampled_rows",
            "copyable_sample_rows",
            "missing_sample_rows",
            "estimated_input_tokens",
            "estimated_storage_bytes",
            "estimated_microcredits",
        ):
            if _amount(preview.get(field)) is None:
                destination.append(
                    _issue(
                        "managed-preview-value-missing",
                        f"embedding.preview.{field}",
                        "retain the estimate returned by preview",
                    )
                )
        usage = _object(preview.get("usage"))
        if not usage or usage.get("project_id") != _object(plan.get("target")).get("project_id"):
            blockers.append(
                _issue(
                    "managed-usage-project-mismatch",
                    "embedding.preview.usage",
                    "use the usage response from the selected project",
                )
            )
        else:
            for bucket in ("generation", "query"):
                value = _object(usage.get(bucket))
                for field in (
                    "included_microcredits",
                    "used_microcredits",
                    "reserved_microcredits",
                    "remaining_microcredits",
                ):
                    if _amount(value.get(field)) is None:
                        destination.append(
                            _issue(
                                "managed-usage-missing",
                                f"embedding.preview.usage.{bucket}.{field}",
                                "retain current monetary allowance amounts from the usage response",
                            )
                        )
            if not usage.get("period_end"):
                destination.append(
                    _issue(
                        "managed-renewal-missing",
                        "embedding.preview.usage.period_end",
                        "record the returned allowance renewal date",
                    )
                )
            for field in ("charged_microcredits", "reserved_microcredits", "cycle_credit_limit"):
                if _amount(usage.get(field)) is None:
                    destination.append(
                        _issue(
                            "managed-credit-evidence-missing",
                            f"embedding.preview.usage.{field}",
                            "retain credit spending and cycle limit evidence from usage",
                        )
                    )
            if not isinstance(usage.get("credit_spending_enabled"), bool):
                destination.append(
                    _issue(
                        "managed-credit-evidence-missing",
                        "embedding.preview.usage.credit_spending_enabled",
                        "retain the returned project credit spending permission",
                    )
                )
            additional = _amount(preview.get("estimated_microcredits"))
            opted_in = settings.get("use_credits", False)
            if (opted_in or embedding.get("query_use_credits", False)) and not usage.get(
                "credit_spending_enabled"
            ):
                warnings.append(
                    _issue(
                        "managed-credit-permission-required",
                        "embedding.preview.usage",
                        "additional usage needs an owner or administrator "
                        "to enable project credit spending",
                    )
                )
            if additional is not None and additional > 0:
                if not opted_in:
                    warnings.append(
                        _issue(
                            "managed-generation-funding-needed",
                            "embedding.settings.use_credits",
                            "the preview exceeds the remaining generation allowance; include the "
                            "expected pause or authorized additional credits in the review",
                        )
                    )
                else:
                    available = _amount(usage.get("available_credit_microcredits"))
                    limit = _amount(usage.get("cycle_credit_limit"))
                    charged = _amount(usage.get("charged_microcredits"))
                    reserved = _amount(usage.get("reserved_microcredits"))
                    if available is None:
                        warnings.append(
                            _issue(
                                "managed-credit-balance-unavailable",
                                "embedding.preview.usage.available_credit_microcredits",
                                "check organization credit availability before relying "
                                "on additional generation",
                            )
                        )
                    elif additional > available:
                        warnings.append(
                            _issue(
                                "managed-credit-balance-insufficient",
                                "embedding.preview.usage.available_credit_microcredits",
                                "the preview needs more additional credits "
                                "than currently available",
                            )
                        )
                    if (
                        limit is not None
                        and charged is not None
                        and reserved is not None
                        and additional > limit * 1000000 - charged - reserved
                    ):
                        warnings.append(
                            _issue(
                                "managed-cycle-limit-insufficient",
                                "embedding.preview.usage.cycle_credit_limit",
                                "the preview exceeds the remaining project credit spending limit",
                            )
                        )
    if embedding.get("credential_names"):
        blockers.append(
            _issue(
                "managed-provider-credentials-unneeded",
                "embedding.credential_names",
                "Polygres supplies the provider connection; application code "
                "only needs Polygres credentials",
            )
        )
    context = _object(plan.get("context"))
    if context and context.get("enabled", True):
        if context.get("source_kind") != "managed-output":
            blockers.append(
                _issue(
                    "managed-context-source-mismatch",
                    "context.source_kind",
                    "configure the collection from the managed Context handoff",
                )
            )
        if context.get("source_schema") not in (None, "polygres_embeddings"):
            blockers.append(
                _issue(
                    "managed-context-source-mismatch",
                    "context.source_schema",
                    "use the generated output schema returned by the Context handoff",
                )
            )
    capture = _object(plan.get("capture_runtime"))
    if capture.get("enabled", True):
        if (
            capture.get("reconcile_context")
            or capture.get("context_collection")
            or capture.get("context_collection_id")
        ):
            blockers.append(
                _issue(
                    "managed-source-context-reconciliation",
                    "capture_runtime",
                    "write source text without Context options; "
                    "Polygres reconciles generated output",
                )
            )
    for index, action in enumerate(_actions(plan)):
        if action.get("type") in {"embedding-update", "embedding-remove"}:
            version = action.get("expected_version")
            if not isinstance(version, int) or version < 1:
                destination.append(
                    _issue(
                        "managed-configuration-version-missing",
                        f"actions[{index}].expected_version",
                        "read the current configuration version before updating or removing it",
                    )
                )
    for path, interface in _interfaces(plan):
        if "project.embeddings" in str(interface.get("operation", "")):
            blockers.append(
                _issue(
                    "managed-sdk-configuration-unavailable",
                    path,
                    "configure embeddings through MCP, CLI, or the dashboard; "
                    "use existing SDK retrieval methods for text queries",
                )
            )


def lint_plan(plan: Any) -> LintResult:
    blockers: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    if not isinstance(plan, dict):
        return LintResult((_issue("invalid-plan", "plan", "must be a JSON object"),), ())

    actions = _actions(plan)
    blockers.extend(_synced_project_blockers(plan, actions))
    _managed_embedding_issues(plan, blockers, warnings)
    remote_actions = [action for action in actions if _is_remote(action)]
    target = plan.get("target")
    project_id = target.get("project_id") if isinstance(target, dict) else None
    if remote_actions and not project_id:
        blockers.append(
            _issue(
                "unresolved-project",
                "target.project_id",
                "resolve a Polygres project before any remote mutation",
            )
        )

    _scan_secrets(plan, "plan", blockers)

    approval = plan.get("approval")
    if isinstance(approval, dict) and approval.get("status") == "approved":
        recorded = approval.get("boundary_digest") or approval.get("plan_digest")
        if recorded != approval_digest(plan):
            blockers.append(
                _issue(
                    "stale-approval",
                    "approval",
                    "approval no longer matches a material review boundary",
                )
            )
    elif remote_actions:
        warnings.append(
            _issue(
                "approval-pending",
                "approval",
                "show one concise mutation review before applying remote actions",
            )
        )

    for path, interface in _interfaces(plan):
        available = _capability_available(plan, interface)
        if available is False:
            blockers.append(
                _issue(
                    "interface-unavailable",
                    path,
                    f"{interface.get('operation')} is unavailable according to capability evidence",
                )
            )
        elif available is None:
            warnings.append(
                _issue(
                    "capability-unverified", path, "verify this public interface before using it"
                )
            )

    if plan.get("state") == "operational" and not _important_path_tested(plan):
        blockers.append(
            _issue(
                "unverified-operational-claim",
                "state",
                "important path needs passing evidence before claiming operational",
            )
        )

    if not isinstance(plan.get("source"), dict) or not plan.get("source", {}).get("scope"):
        warnings.append(
            _issue("source-scope-missing", "source.scope", "infer a bounded scope before review")
        )
    if not actions:
        warnings.append(_issue("no-actions", "actions", "no setup actions are recorded"))
    return LintResult(tuple(blockers), tuple(warnings))


def validate_plan(plan: Any) -> dict[str, Any]:
    result = lint_plan(plan)
    if result.blockers:
        raise PlanValidationError(result.blockers)
    return plan


def load_and_lint(path: Path) -> tuple[dict[str, Any], LintResult]:
    plan = json.loads(path.read_text(encoding="utf-8"))
    return plan, lint_plan(plan)


def load_and_validate(path: Path) -> dict[str, Any]:
    plan, result = load_and_lint(path)
    if result.blockers:
        raise PlanValidationError(result.blockers)
    return plan


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("--print-digest", action="store_true")
    args = parser.parse_args(argv)
    try:
        plan, result = load_and_lint(args.plan)
    except (OSError, json.JSONDecodeError) as error:
        result = LintResult((_issue("invalid-plan", "plan", str(error)),), ())
        plan = {}
    if args.print_digest and result.ok:
        print(approval_digest(plan))
    else:
        print(json.dumps(result.as_dict(), indent=2, sort_keys=True))
    return 1 if result.blockers else 0


if __name__ == "__main__":
    raise SystemExit(main())
