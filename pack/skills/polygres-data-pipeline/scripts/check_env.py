#!/usr/bin/env python3
"""Check required .env variable names without exposing their values."""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import subprocess
from pathlib import Path
from typing import Any

ENV_NAME = re.compile(r"^[A-Z_][A-Z0-9_]*$")
MAX_ENV_BYTES = 1024 * 1024


class EnvCheckError(ValueError):
    pass


def parse_env_status(path: Path) -> dict[str, Any]:
    try:
        size = path.stat().st_size
    except OSError as error:
        raise EnvCheckError(f"cannot read environment file metadata: {error}") from error
    if size > MAX_ENV_BYTES:
        raise EnvCheckError("environment file exceeds the 1 MiB safety limit")

    statuses: dict[str, str] = {}
    duplicates: list[str] = []
    invalid_lines: list[int] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as error:
        raise EnvCheckError(f"cannot read environment file: {error}") from error

    for number, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").lstrip()
        name, separator, value = line.partition("=")
        name = name.strip()
        if not separator or not ENV_NAME.fullmatch(name):
            invalid_lines.append(number)
            continue
        if name in statuses:
            duplicates.append(name)
        statuses[name] = "present" if value.strip() else "empty"

    mode = stat.S_IMODE(path.stat().st_mode) if os.name == "posix" else None
    return {
        "path": str(path),
        "variables": statuses,
        "duplicates": sorted(set(duplicates)),
        "invalid_lines": invalid_lines,
        "permissions_private": mode is None or mode & 0o077 == 0,
        "mode": f"{mode:04o}" if mode is not None else None,
    }


def _git_ignored(path: Path) -> bool | None:
    try:
        result = subprocess.run(
            ["git", "check-ignore", "--quiet", str(path)],
            cwd=path.parent,
            check=False,
            capture_output=True,
            timeout=3,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode == 0:
        return True
    if result.returncode == 1:
        return False
    return None


def check_required(path: Path, required: list[str]) -> tuple[dict[str, Any], bool]:
    invalid_names = sorted({name for name in required if not ENV_NAME.fullmatch(name)})
    if invalid_names:
        raise EnvCheckError(f"invalid required variable names: {', '.join(invalid_names)}")
    report = parse_env_status(path)
    statuses = report.pop("variables")
    report["required"] = {
        name: statuses.get(name, "missing") for name in sorted(set(required))
    }
    report["git_ignored"] = _git_ignored(path)
    ready = (
        all(status == "present" for status in report["required"].values())
        and not report["duplicates"]
        and not report["invalid_lines"]
        and report["permissions_private"]
        and report["git_ignored"] is not False
    )
    report["ready"] = ready
    return report, ready


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--required", action="append", default=[])
    args = parser.parse_args(argv)
    if not args.required:
        parser.error("at least one --required NAME is required")
    try:
        report, ready = check_required(args.env_file, args.required)
    except EnvCheckError as error:
        print(json.dumps({"ready": False, "error": str(error)}, sort_keys=True))
        return 1
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
