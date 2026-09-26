#!/usr/bin/env python3
"""Render one concise approval review from a Polygres setup manifest."""

from __future__ import annotations

import argparse
import sys
from decimal import Decimal
from pathlib import Path

from validate_pipeline_plan import (
    PlanValidationError,
    _amount,
    _object,
    approval_boundary,
    load_and_validate,
)


def _dollars(value: object) -> str | None:
    amount = _amount(value)
    return "$" + format(amount / Decimal("100000000"), "f") if amount is not None else None


def _managed_review(embedding: dict) -> list[str]:
    settings = _object(embedding.get("settings"))
    preview = _object(embedding.get("preview"))
    model = _object(embedding.get("model"))
    usage = _object(preview.get("usage"))
    chunking = _object(settings.get("chunking"))
    lines = ["", "## Generate embeddings with Polygres", ""]
    source = [settings.get(key) for key in ("source_schema", "source_table", "source_text_column")]
    if all(isinstance(value, str) and value for value in source):
        lines.append(f"- Source: `{source[0]}.{source[1]}`, text `{source[2]}`")
    keys = settings.get("source_key_columns")
    if isinstance(keys, list) and keys and all(isinstance(key, str) for key in keys):
        lines.append(f"- Row identifiers: {', '.join(keys)}")
    if model.get("model") and model.get("revision") and settings.get("dimensions"):
        lines.append(
            f"- Model: {model.get('name', model['model'])}, version `{model['revision']}`, "
            f"{settings['dimensions']} dimensions"
        )
    if settings:
        lines.append(
            f"- Updates: {settings.get('mode', 'automatic')}; "
            "existing rows are processed at setup in either mode"
        )
        if chunking.get("enabled"):
            lines.append(
                f"- Chunking: {chunking.get('size_tokens', 512)} tokens with "
                f"{chunking.get('overlap_tokens', 64)} tokens of overlap"
            )
        else:
            lines.append("- Chunking: one embedding per non-empty row")
    if model.get("provider"):
        lines.append(
            f"- Source text and search questions are processed by {model['provider']} "
            "through Polygres."
        )
    lines.append("- Polygres supplies the provider connection and generation workers.")
    if settings.get("existing_vector_column"):
        lines.append(
            f"- Reuse vectors from `{settings['existing_vector_column']}` after confirming "
            "their original model and settings."
        )
    count_fields = ("source_rows", "copyable_sample_rows", "missing_sample_rows", "sampled_rows")
    if all(_amount(preview.get(key)) is not None for key in count_fields):
        lines.append(
            f"- Preview: {preview['source_rows']} source rows; "
            f"{preview['copyable_sample_rows']} reusable and {preview['missing_sample_rows']} "
            f"needing generation in the {preview['sampled_rows']}-row sample."
        )
    tokens = _amount(preview.get("estimated_input_tokens"))
    price = _amount(model.get("microcredits_per_token"))
    if tokens is not None and price is not None:
        lines.append(
            f"- Estimated generation value: {_dollars(tokens * price)} from {tokens} input tokens."
        )
    additional = _dollars(preview.get("estimated_microcredits"))
    if additional is not None:
        lines.append(f"- Estimated additional usage after the generation allowance: {additional}.")
    for bucket, label in (("generation", "Generation"), ("query", "Retrieval")):
        balance = _object(usage.get(bucket))
        remaining = _dollars(balance.get("remaining_microcredits"))
        if remaining is not None:
            renewal = f"; renews {usage['period_end']}" if usage.get("period_end") else ""
            lines.append(f"- {label} allowance available: {remaining}{renewal}.")
    available = _dollars(usage.get("available_credit_microcredits"))
    if available is not None:
        lines.append(f"- Organization credits available: {available} of usage.")
    if (
        isinstance(usage.get("credit_spending_enabled"), bool)
        and _amount(usage.get("cycle_credit_limit")) is not None
    ):
        lines.append(
            "- Project credit spending: "
            f"{'enabled' if usage['credit_spending_enabled'] else 'off'}; "
            f"billing-cycle limit {usage['cycle_credit_limit']} credits."
        )
    if settings:
        lines.append(
            "- Additional credits for generation: "
            f"{'on' if settings.get('use_credits') else 'off'}; "
            f"for queries: {'on' if embedding.get('query_use_credits', False) else 'off'}."
        )
    lines.append(
        "- Search setup: create a collection from the generated output and verify it is ready."
    )
    return lines


def render_review(plan: dict) -> str:
    actions = [
        action
        for action in plan.get("actions", [])
        if isinstance(action, dict) and action.get("enabled", True) is not False
    ]
    boundary = approval_boundary(plan)
    lines = [
        "# Polygres setup review",
        "",
        f"- Project: `{boundary['project_id'] or 'unresolved'}`",
        f"- Project mode: `{boundary['project_mode'] or 'standard'}`",
        f"- Source scope: {boundary['source_scope'] or 'not recorded'}",
        f"- Source system of record: {boundary['source_authority'] or 'not recorded'}",
        f"- Data egress: {', '.join(boundary['data_egress']) or 'none'}",
        f"- Destructive effects: {', '.join(boundary['destructive_actions']) or 'none'}",
        f"- Paid processing: {', '.join(boundary['paid_processing']) or 'none'}",
        "",
        "## Planned actions",
        "",
    ]
    if boundary["project_mode"] == "synced":
        sync = plan.get("sync") if isinstance(plan.get("sync"), dict) else {}
        lines[6:6] = [
            f"- Selected sync tables: {', '.join(boundary['sync_selection']) or 'not recorded'}",
            f"- Source provider: {sync.get('provider', 'PostgreSQL')}",
            "- Managed replication resources: Polygres owns the filtered publication and slot",
            "- Write path: change application data in the source database; "
            "Polygres handles synchronization and any selected embedding generation",
            (
                "- Reconfiguration: re-inspect the source; added or changed tables resync, "
                "and deselected tables stop syncing"
            ),
        ]
    if not actions:
        lines.append("None. The current plan contains only local or read-only work.")
    for action in actions:
        effect = action.get("effect", action.get("type", "remote mutation"))
        lines.extend(
            [
                f"- **{action.get('id', 'action')}**: {effect}",
                f"  - Target: {action.get('target', boundary['project_id'])}",
                f"  - Data egress: {action.get('data_egress', 'none')}",
            ]
        )
    embedding_options = plan.get("embedding_options")
    embedding = plan.get("embedding")
    embedding_enabled = (
        not isinstance(embedding, dict) or embedding.get("enabled", True) is not False
    )
    if embedding_enabled and isinstance(embedding, dict) and embedding.get("location") == "managed":
        lines.extend(_managed_review(embedding))
    if embedding_enabled and isinstance(embedding_options, list) and embedding_options:
        recommended_id = plan.get("recommended_embedding_id")
        lines.extend(["", "## Embedding choice", ""])
        for option in embedding_options[:2]:
            if not isinstance(option, dict):
                continue
            label = " (recommended)" if option.get("id") == recommended_id else ""
            dimensions = option.get("dimensions", {})
            default_dimensions = (
                dimensions.get("default") if isinstance(dimensions, dict) else dimensions
            )
            lines.extend(
                [
                    f"- **{option.get('model', option.get('id', 'embedding'))}**{label}",
                    f"  - Location/provider: {option.get('category', 'unknown')} / "
                    f"{option.get('provider', 'unknown')}",
                    f"  - Dimensions: {default_dimensions or 'provider default'}",
                    f"  - Setup: {option.get('setup_action', 'use the recorded model contract')}",
                    f"  - Data egress: {option.get('data_egress', 'none')}",
                    f"  - Paid processing: {'yes' if option.get('paid_processing') else 'no'}",
                ]
            )
    approved = _object(plan.get("approval")).get("status") == "approved"
    no_approval = _object(plan.get("approval")).get("status") == "not-required"
    lines.extend(
        [
            "",
            (
                "These actions are covered by your existing approval."
                if approved
                else "This setup contains only the selected local or read-only work."
                if no_approval
                else "Reply `approve recommended` or select the other reviewed option. "
                "Either response "
                "selects the model and approves this setup."
                if embedding_enabled
                and isinstance(embedding_options, list)
                and len(embedding_options) > 1
                else "Approve once. Re-review only if a material boundary above changes."
            ),
        ]
    )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        review = render_review(load_and_validate(args.plan))
        if args.output:
            args.output.write_text(review, encoding="utf-8")
        else:
            print(review, end="")
    except (OSError, PlanValidationError) as error:
        print(f"review failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
