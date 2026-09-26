#!/usr/bin/env python3
"""Helper for deck.sh (not a gate; not executable). Checks a built deck PDF against its copy
JSON and prints one JSON object: {"pages": N, "sheets": N, "problems": [...], "facts": {...}}.

  python3 deck-check.py <deck.pdf> <copy.json> [--index _index.md] [--max-bytes N] [--tmp DIR]

Checks, all file facts and pixels, no model:
  1. page count equals the number of sheets in the copy JSON
  2. `SHEET nn / NN` runs 1..NN in page order, and `An / AN` runs 1..AN
  3. no grayscale raster image: an image whose colour space is gray, or whose pixels carry no
     saturation, fails. Line art is exempt: an image that is almost all pure black, pure white or
     transparent is a drawing, not a photo.
  4. the PDF is under the size cap (default 5 MB) after compression
  5. the PDF sits at its real path: no symlink in the directory chain (the `investors` link)
  6. when an _index.md is given or sits beside a PDF in `_circulating-decks`, its banner line
     names the page count, the PDF's SHA-256 and the build command
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile

LINEART_FRACTION = 0.85
SATURATION_FLOOR = 0.03
MIN_IMAGE_PX = 64


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def page_count(pdf):
    out = run(["pdfinfo", str(pdf)]).stdout
    m = re.search(r"^Pages:\s+(\d+)", out, re.M)
    return int(m.group(1)) if m else None


def page_texts(pdf, n):
    texts = []
    for i in range(1, n + 1):
        r = run(["pdftotext", "-f", str(i), "-l", str(i), "-layout", str(pdf), "-"])
        texts.append(r.stdout)
    return texts


def check_numbers(texts):
    problems, main, appx = [], [], []
    for i, t in enumerate(texts, 1):
        for a, b in re.findall(r"SHEET\s+(\d+)\s*/\s*(\d+)", t):
            main.append((i, int(a), int(b)))
        for a, b in re.findall(r"\bA(\d+)\s*/\s*A(\d+)", t):
            appx.append((i, int(a), int(b)))
    for name, seq in (("SHEET", main), ("A", appx)):
        if not seq:
            continue
        total = seq[0][2]
        for k, (page, n, tot) in enumerate(seq, 1):
            if n != k:
                problems.append(f"p.{page}: {name} {n:02d} where {name} {k:02d} was expected")
                break
            if tot != total or tot != len(seq):
                problems.append(f"p.{page}: {name} {n:02d} / {tot:02d} but {len(seq)} numbered sheets exist")
                break
    return problems, len(main), len(appx)


def image_kind(path):
    """'lineart', 'gray', 'colour' or None (too small to judge)."""
    try:
        from PIL import Image
    except ImportError:
        return None
    im = Image.open(path)
    if im.width < MIN_IMAGE_PX or im.height < MIN_IMAGE_PX:
        return None
    im.thumbnail((256, 256))
    rgba = im.convert("RGBA")
    px = list(rgba.getdata())
    n = len(px)
    extreme = sum(1 for r, g, b, a in px if a < 16 or (r < 24 and g < 24 and b < 24) or (r > 231 and g > 231 and b > 231))
    if extreme / n >= LINEART_FRACTION:
        return "lineart"
    hsv = im.convert("RGB").convert("HSV")
    sat = [s for _, s, _ in hsv.getdata()]
    mean = sum(sat) / (255.0 * len(sat))
    return "gray" if mean < SATURATION_FLOOR else "colour"


def check_images(pdf, tmp):
    problems, facts = [], {"images": 0, "colour": 0, "lineart": 0, "gray": []}
    listing = run(["pdfimages", "-list", str(pdf)])
    if listing.returncode != 0:
        return [f"pdfimages failed: {listing.stderr.strip()[:80]}"], facts
    rows = [l.split() for l in listing.stdout.splitlines()[2:] if l.strip()]
    if not rows:
        return problems, facts
    out = pathlib.Path(tmp) / "img"
    run(["pdfimages", "-png", str(pdf), str(out)])
    files = sorted(pathlib.Path(tmp).glob("img-*.png"))
    for row, f in zip(rows, files):
        page, num, kind, color = row[0], row[1], row[2], row[5]
        if kind != "image":
            continue
        facts["images"] += 1
        verdict = image_kind(f)
        if verdict is None:
            continue
        if color == "gray" and verdict != "lineart":
            verdict = "gray"
        if verdict == "gray":
            facts["gray"].append(f"p.{page} image {num}")
            problems.append(f"p.{page}: image {num} is grayscale (photos are full colour)")
        else:
            facts[verdict] += 1
    return problems, facts


def check_path(pdf):
    logical = pathlib.Path(os.path.abspath(pdf))
    physical = pathlib.Path(os.path.realpath(pdf))
    if logical != physical:
        return [f"filed through a symlink: {logical} is really {physical}"]
    return []


def check_index(pdf, index, pages, sha, required):
    if not index or not index.is_file():
        return [f"no _index.md banner beside {pdf.name} (required in _circulating-decks)"] if required else []
    banner = next((l for l in index.read_text(encoding="utf-8").splitlines() if l.startswith("> **Current")), "")
    if not banner:
        return [f"{index.name}: no `> **Current vN:**` banner line"]
    problems = []
    if not re.search(rf"\b{pages}\s+pages?\b", banner):
        problems.append(f"{index.name}: banner does not say {pages} pages")
    if sha not in banner:
        problems.append(f"{index.name}: banner does not carry the SHA-256 of {pdf.name}")
    if "build" not in banner.lower():
        problems.append(f"{index.name}: banner has no build command")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("copy")
    ap.add_argument("--index")
    ap.add_argument("--max-bytes", type=int, default=5 * 1024 * 1024)
    ap.add_argument("--tmp")
    a = ap.parse_args()
    pdf = pathlib.Path(a.pdf)
    copy = json.loads(pathlib.Path(a.copy).read_text(encoding="utf-8"))
    sheets = copy.get("sheets", [])
    pages = page_count(pdf)
    problems = []
    if pages is None:
        print(json.dumps({"pages": None, "sheets": len(sheets), "problems": ["pdfinfo could not read the PDF"], "facts": {}}))
        return
    if pages != len(sheets):
        problems.append(f"{pages} pages but the copy JSON has {len(sheets)} sheets")
    texts = page_texts(pdf, pages)
    num_problems, n_main, n_appx = check_numbers(texts)
    problems += num_problems
    tmp = a.tmp or tempfile.mkdtemp(prefix="laurelin-deck-")
    pathlib.Path(tmp).mkdir(parents=True, exist_ok=True)
    img_problems, img_facts = check_images(pdf, tmp)
    problems += img_problems
    size = pdf.stat().st_size
    if size > a.max_bytes:
        problems.append(f"{size / 1048576:.1f} MB is over the {a.max_bytes / 1048576:.0f} MB cap (compress with gs /ebook)")
    problems += check_path(pdf)
    sha = hashlib.sha256(pdf.read_bytes()).hexdigest()
    index = pathlib.Path(a.index) if a.index else pdf.parent / "_index.md"
    required = bool(a.index) or pdf.parent.name == "_circulating-decks"
    problems += check_index(pdf, index, pages, sha, required)
    print(json.dumps({"pages": pages, "sheets": len(sheets), "numbered": n_main, "appendix": n_appx,
                      "bytes": size, "sha256": sha, "images": img_facts, "index": str(index) if index.is_file() else None,
                      "problems": problems}))


if __name__ == "__main__":
    main()
