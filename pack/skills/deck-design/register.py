#!/usr/bin/env python3
"""register.py: one machine-readable row per deck version, beside the human banner.

    register.py --version v9 --pdf <path.pdf> --changes "what changed" [--date YYYY-MM-DD]
                [--dir <_circulating-decks>] [--build "<build command>"] [--apply]

Prints the JSON row it would append to <dir>/versions.jsonl and the banner line for
_index.md. Writes nothing unless --apply is given. With --apply it appends the row only:
the banner goes into _index.md by the delivery step, word for word from this output.

Row keys: version, date (ISO), pages (pdfinfo), sha256, bytes, path, changes, build, registered_at.
The directory defaults to the folder that holds the PDF. Exit 1 on a missing input.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys


def pages_of(pdf):
    try:
        out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    for line in out.splitlines():
        if line.startswith("Pages:"):
            return int(line.split()[1])
    return None


def main():
    ap = argparse.ArgumentParser(description="Append a deck version row to versions.jsonl")
    ap.add_argument("--version", required=True)
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--changes", required=True)
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--dir")
    ap.add_argument("--build", default="")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    pdf = pathlib.Path(a.pdf)
    if not pdf.is_file():
        print(f"register: error, no such PDF: {pdf}")
        sys.exit(1)
    data = pdf.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    pages = pages_of(pdf)
    reg_dir = pathlib.Path(a.dir) if a.dir else pdf.parent
    row = {
        "version": a.version,
        "date": a.date,
        "pages": pages,
        "sha256": sha,
        "bytes": len(data),
        "path": str(pdf.resolve()),
        "changes": a.changes,
        "build": a.build,
        "registered_at": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(),
    }
    banner = (f"> **Current {a.version}:** `{pdf.name}` · {pages if pages is not None else '?'} pages · {a.date} · "
              f"changes: {a.changes} · SHA-256 `{sha}`" + (f" · build: `{a.build}`" if a.build else ""))
    target = reg_dir / "versions.jsonl"
    print(json.dumps(row))
    print(banner)
    if not a.apply:
        print(f"register: dry run, nothing written (would append to {target})")
        return
    reg_dir.mkdir(parents=True, exist_ok=True)
    with open(target, "a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")
    print(f"register: appended {a.version} to {target}")


if __name__ == "__main__":
    main()
