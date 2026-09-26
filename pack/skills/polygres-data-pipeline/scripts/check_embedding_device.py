#!/usr/bin/env python3
"""Inspect local embedding feasibility without installing or starting software."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import platform
import shutil
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

MIN_MEMORY_GIB = 2.0
MIN_DISK_GIB = 1.0
EMBEDDING_MODEL_MARKERS = (
    "embed",
    "all-minilm",
    "bge-",
    "bge_",
    "e5-",
    "e5_",
    "gte-",
    "gte_",
)


@dataclass(frozen=True)
class DeviceFacts:
    system: str
    architecture: str
    python_version: str
    memory_gib: float | None
    memory_available_gib: float | None
    disk_free_gib: float
    accelerators: tuple[str, ...]
    commands: dict[str, str | None]
    python_modules: dict[str, bool]
    ollama_models: tuple[str, ...]
    ollama_model_sizes: dict[str, int]
    ollama_version: str | None
    llama_model: str | None
    onnx_model: str | None


def _gib(value: int | None) -> float | None:
    if value is None:
        return None
    return round(value / (1024**3), 2)


def _total_memory_bytes() -> int | None:
    if os.name == "posix":
        try:
            pages = os.sysconf("SC_PHYS_PAGES")
            page_size = os.sysconf("SC_PAGE_SIZE")
            if isinstance(pages, int) and isinstance(page_size, int):
                return pages * page_size
        except (OSError, ValueError):
            pass
    if platform.system() == "Darwin":
        try:
            result = subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                check=True,
                capture_output=True,
                text=True,
                timeout=3,
            )
            return int(result.stdout.strip())
        except (OSError, ValueError, subprocess.SubprocessError):
            pass
    if os.name == "nt":
        try:
            import ctypes

            class MemoryStatus(ctypes.Structure):
                _fields_ = [
                    ("length", ctypes.c_ulong),
                    ("memory_load", ctypes.c_ulong),
                    ("total_physical", ctypes.c_ulonglong),
                    ("available_physical", ctypes.c_ulonglong),
                    ("total_page_file", ctypes.c_ulonglong),
                    ("available_page_file", ctypes.c_ulonglong),
                    ("total_virtual", ctypes.c_ulonglong),
                    ("available_virtual", ctypes.c_ulonglong),
                    ("available_extended_virtual", ctypes.c_ulonglong),
                ]

            status = MemoryStatus()
            status.length = ctypes.sizeof(MemoryStatus)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                return int(status.total_physical)
        except (AttributeError, OSError):
            pass
    return None


def _available_memory_bytes() -> int | None:
    if platform.system() == "Linux":
        try:
            for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) * 1024
        except (OSError, ValueError, IndexError):
            pass
    if platform.system() == "Darwin":
        try:
            result = subprocess.run(
                ["vm_stat"], check=True, capture_output=True, text=True, timeout=3
            )
            page_size = 4096
            pages = 0
            for line in result.stdout.splitlines():
                if "page size of" in line:
                    page_size = int(line.split("page size of", 1)[1].split()[0])
                elif line.startswith(("Pages free:", "Pages inactive:", "Pages speculative:")):
                    pages += int(line.rsplit(maxsplit=1)[1].rstrip("."))
            return pages * page_size
        except (OSError, ValueError, IndexError, subprocess.SubprocessError):
            pass
    return None


def _accelerators() -> tuple[str, ...]:
    values: list[str] = []
    if platform.system() == "Darwin" and platform.machine().lower() in {"arm64", "aarch64"}:
        values.append("apple-silicon")
    nvidia_smi = shutil.which("nvidia-smi")
    if nvidia_smi:
        try:
            result = subprocess.run(
                [
                    nvidia_smi,
                    "--query-gpu=name,memory.total",
                    "--format=csv,noheader,nounits",
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=4,
            )
            for line in result.stdout.splitlines():
                name, _, memory = line.partition(",")
                label = name.strip()
                if memory.strip().isdigit():
                    label = f"{label} ({memory.strip()} MiB)"
                if label:
                    values.append(label)
        except (OSError, subprocess.SubprocessError):
            values.append("nvidia-present-unqueried")
    return tuple(values)


def _loopback_url(value: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(value)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and parsed.hostname in {
        "localhost",
        "127.0.0.1",
        "::1",
    }


def _ollama_inventory(base_url: str) -> tuple[tuple[str, ...], dict[str, int]]:
    if not _loopback_url(base_url):
        raise ValueError("Ollama URL must use a loopback host")
    request = urllib.request.Request(f"{base_url.rstrip('/')}/api/tags", method="GET")
    try:
        with urllib.request.urlopen(request, timeout=1.5) as response:
            payload = json.load(response)
    except (OSError, urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return (), {}
    models = payload.get("models") if isinstance(payload, dict) else None
    if not isinstance(models, list):
        return (), {}
    sizes = {
        str(model.get("name")): int(model.get("size", 0))
        for model in models
        if isinstance(model, dict) and model.get("name") and isinstance(model.get("size", 0), int)
    }
    return tuple(sorted(sizes)), dict(sorted(sizes.items()))


def _command_version(command: str | None) -> str | None:
    if not command:
        return None
    try:
        result = subprocess.run(
            [command, "--version"], check=True, capture_output=True, text=True, timeout=3
        )
    except (OSError, subprocess.SubprocessError):
        return None
    value = (result.stdout or result.stderr).strip()
    return value or None


def _is_embedding_model(name: str) -> bool:
    lowered = name.casefold()
    return any(marker in lowered for marker in EMBEDDING_MODEL_MARKERS)


def _resource_feasible(facts: DeviceFacts) -> bool:
    memory_ok = facts.memory_gib is None or facts.memory_gib >= MIN_MEMORY_GIB
    return memory_ok and facts.disk_free_gib >= MIN_DISK_GIB


def classify_options(facts: DeviceFacts) -> list[dict[str, Any]]:
    feasible = _resource_feasible(facts)
    embedding_models = [name for name in facts.ollama_models if _is_embedding_model(name)]
    ollama_installed = facts.commands["ollama"] is not None
    if ollama_installed and embedding_models:
        ollama_status = "ready"
        ollama_reason = "Ollama and a recognized local embedding model are available."
    elif feasible:
        ollama_status = "available-after-setup"
        ollama_reason = (
            "Install Ollama or download a compatible embedding model before use."
            if not ollama_installed
            else "Download a compatible embedding model before use."
        )
    else:
        ollama_status = "not-recommended"
        ollama_reason = "Available memory or disk is below the conservative local minimum."

    sentence_ready = facts.python_modules["sentence_transformers"]
    sentence_status = (
        "ready" if sentence_ready else ("available-after-setup" if feasible else "not-recommended")
    )
    sentence_reason = (
        "Sentence Transformers is installed."
        if sentence_ready
        else (
            "Install Sentence Transformers and a local model before use."
            if feasible
            else "Available memory or disk is below the conservative local minimum."
        )
    )

    llama_ready = facts.commands["llama_server"] is not None and facts.llama_model is not None
    llama_status = (
        "ready" if llama_ready else ("available-after-setup" if feasible else "not-recommended")
    )
    llama_reason = (
        "llama-server and the selected local model file are available."
        if llama_ready
        else (
            "Install llama.cpp and select a compatible GGUF embedding model."
            if feasible
            else "Available memory or disk is below the conservative local minimum."
        )
    )

    onnx_ready = facts.python_modules["onnxruntime"] and facts.onnx_model is not None
    onnx_status = (
        "ready" if onnx_ready else ("available-after-setup" if feasible else "not-recommended")
    )
    onnx_reason = (
        "ONNX Runtime and the selected local model are available."
        if onnx_ready
        else (
            "Install ONNX Runtime and provide a compatible model and tokenizer adapter."
            if feasible
            else "Available memory or disk is below the conservative local minimum."
        )
    )

    return [
        {
            "provider": "ollama",
            "status": ollama_status,
            "reason": ollama_reason,
            "recognized_models": embedding_models,
        },
        {
            "provider": "sentence-transformers",
            "status": sentence_status,
            "reason": sentence_reason,
        },
        {"provider": "llama.cpp", "status": llama_status, "reason": llama_reason},
        {"provider": "onnx", "status": onnx_status, "reason": onnx_reason},
        {
            "provider": "none",
            "status": "ready",
            "reason": "Use relational, text, or graph retrieval without semantic embeddings.",
        },
    ]


def inspect_device(
    *,
    ollama_url: str,
    llama_model: Path | None,
    onnx_model: Path | None,
) -> dict[str, Any]:
    disk_free = shutil.disk_usage(Path.cwd()).free
    ollama_command = shutil.which("ollama")
    llama_command = shutil.which("llama-server") or shutil.which("llama-server.exe")
    commands = {
        "ollama": Path(ollama_command).name if ollama_command else None,
        "llama_server": Path(llama_command).name if llama_command else None,
    }
    modules = {
        "sentence_transformers": importlib.util.find_spec("sentence_transformers") is not None,
        "onnxruntime": importlib.util.find_spec("onnxruntime") is not None,
    }
    models, model_sizes = _ollama_inventory(ollama_url) if commands["ollama"] else ((), {})
    facts = DeviceFacts(
        system=platform.system(),
        architecture=platform.machine(),
        python_version=platform.python_version(),
        memory_gib=_gib(_total_memory_bytes()),
        memory_available_gib=_gib(_available_memory_bytes()),
        disk_free_gib=_gib(disk_free) or 0.0,
        accelerators=_accelerators(),
        commands=commands,
        python_modules=modules,
        ollama_models=models,
        ollama_model_sizes=model_sizes,
        ollama_version=_command_version(ollama_command),
        llama_model=llama_model.name if llama_model and llama_model.is_file() else None,
        onnx_model=onnx_model.name if onnx_model and onnx_model.is_file() else None,
    )
    values = asdict(facts)
    values["options"] = classify_options(facts)
    return values


def _print_text(report: dict[str, Any]) -> None:
    print(
        f"Device: {report['system']} {report['architecture']}, "
        f"RAM: {report['memory_gib']} GiB total / {report['memory_available_gib']} GiB "
        f"available, free disk: {report['disk_free_gib']} GiB"
    )
    for option in report["options"]:
        print(f"{option['provider']}: {option['status']} - {option['reason']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON")
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    parser.add_argument("--llama-model", type=Path)
    parser.add_argument("--onnx-model", type=Path)
    args = parser.parse_args(argv)
    if not _loopback_url(args.ollama_url):
        parser.error("--ollama-url must use localhost, 127.0.0.1, or ::1")
    report = inspect_device(
        ollama_url=args.ollama_url,
        llama_model=args.llama_model,
        onnx_model=args.onnx_model,
    )
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        _print_text(report)
    memory = report["memory_gib"]
    if memory is not None and not math.isfinite(memory):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
