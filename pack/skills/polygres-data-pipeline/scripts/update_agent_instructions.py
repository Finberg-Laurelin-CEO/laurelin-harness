#!/usr/bin/env python3
"""Idempotently add or remove a managed Polygres block in agent instructions."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

START = "<!-- polygres-memory:start -->"
END = "<!-- polygres-memory:end -->"
BLOCK = re.compile(rf"\n?{re.escape(START)}.*?{re.escape(END)}\n?", re.DOTALL)


def managed_block(
    capture_command: str | None,
    recall_command: str | None,
    guarantee: str,
    *,
    recall_when: str,
    capture_when: str,
) -> str:
    lines = [START, "## Polygres memory", ""]
    if recall_command:
        lines.append(
            f"- {recall_when.rstrip('.')}, run `{recall_command}` and use only relevant, "
            "authorized records."
        )
        lines.append(
            "- If recall fails, continue without memory and say retrieval is degraded when it "
            "matters."
        )
    if capture_command:
        lines.append(f"- {capture_when.rstrip('.')}, run `{capture_command}`.")
        lines.append(
            "- Never store secrets, system instructions, retrieved context, or tool/environment "
            "output."
        )
        lines.append(
            f"- Treat capture as {guarantee}; guaranteed persistence requires a tested runtime "
            "hook."
        )
    lines.append(END)
    return "\n".join(lines)


def update_text(text: str, block: str | None) -> str:
    cleaned = BLOCK.sub("\n", text).rstrip()
    if block is None:
        return cleaned + ("\n" if cleaned else "")
    return f"{cleaned}\n\n{block}\n" if cleaned else f"{block}\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--capture-command")
    parser.add_argument("--recall-command")
    parser.add_argument("--recall-when", default="Before a meaningful response")
    parser.add_argument(
        "--capture-when", default="After a conversation produces durable user information"
    )
    parser.add_argument(
        "--guarantee",
        choices=("guaranteed", "retryable", "best-effort", "manual"),
        default="best-effort",
    )
    parser.add_argument("--remove", action="store_true")
    args = parser.parse_args(argv)
    if not args.remove and not (args.capture_command or args.recall_command):
        parser.error("at least one capture or recall command is required unless --remove is used")
    try:
        original = args.path.read_text(encoding="utf-8") if args.path.exists() else ""
        block = (
            None
            if args.remove
            else managed_block(
                args.capture_command,
                args.recall_command,
                args.guarantee,
                recall_when=args.recall_when,
                capture_when=args.capture_when,
            )
        )
        updated = update_text(original, block)
        if updated != original:
            args.path.parent.mkdir(parents=True, exist_ok=True)
            args.path.write_text(updated, encoding="utf-8")
            print(f"updated {args.path}")
        else:
            print(f"unchanged {args.path}")
    except OSError as error:
        print(f"instruction update failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
