#!/usr/bin/env python3
"""Helper for numbers.sh (not a gate; not executable). Prints every number in a text file
with the phrase around it, as JSON lines: {"value", "norm", "phrase", "line"}.

  python3 numbers-extract.py FILE          # .md .txt .tex, or .pdf through pdftotext
  python3 numbers-extract.py - < text

value: the number as written, with its currency sign and k/M/B or percent suffix.
norm:  the same number as a plain decimal string, so "$2.85M" and "2,850,000" both give
       "2850000" and can be matched by value. Percent signs and units stay in the phrase.
Skipped: list markers and heading numbers at the start of a line, numbers inside URLs and
inline code, and digits glued to letters (identifiers like A1.4 or v7).
"""
import json
import re
import subprocess
import sys

NUM = re.compile(
    r"(?<![A-Za-z0-9_.])"
    r"(?P<cur>[$€£])?"
    r"(?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
    r"(?P<suf>(?:[kKmMbB](?![A-Za-z])|%|\s*(?:thousand|million|billion)\b))?"
)
LIST_MARK = re.compile(r"^\s*(?:[-*+]\s+)?\d+[.)]\s")
HEADING = re.compile(r"^#+\s*\d+(?:\.\d+)*\.?\s")
STRIP = [re.compile(r"`[^`]*`"), re.compile(r"https?://\S+"), re.compile(r"\[\[[^\]]*\]\]")]
MULT = {"k": 1e3, "m": 1e6, "b": 1e9, "thousand": 1e3, "million": 1e6, "billion": 1e9}


def read(path):
    if path == "-":
        return sys.stdin.read()
    if path.lower().endswith(".pdf"):
        return subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True, check=True).stdout
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def norm(num, suf):
    v = float(num.replace(",", ""))
    s = (suf or "").strip().lower()
    if s in MULT:
        v *= MULT[s]
    return ("%f" % v).rstrip("0").rstrip(".") if v != int(v) else str(int(v))


def phrase_around(text, start, end):
    # The sentence holding the number, cut to a window when the sentence is long.
    lo = max(text.rfind(". ", 0, start), text.rfind("\n\n", 0, start), text.rfind("\n", 0, start)) + 1
    hi_candidates = [i for i in (text.find(". ", end), text.find("\n", end)) if i != -1]
    hi = min(hi_candidates) + 1 if hi_candidates else len(text)
    if hi - lo > 220:
        lo, hi = max(lo, start - 100), min(hi, end + 100)
    return re.sub(r"\s+", " ", text[lo:hi]).strip()


def main():
    path = sys.argv[1]
    text = read(path)
    lines = text.split("\n")
    offset = 0
    for ln, line in enumerate(lines, 1):
        scan = line
        if LIST_MARK.match(scan):
            scan = LIST_MARK.sub(lambda m: " " * len(m.group(0)), scan, count=1)
        if HEADING.match(scan):
            scan = HEADING.sub(lambda m: " " * len(m.group(0)), scan, count=1)
        for pat in STRIP:
            scan = pat.sub(lambda m: " " * len(m.group(0)), scan)
        for m in NUM.finditer(scan):
            suf = (m.group("suf") or "").strip()
            value = (m.group("cur") or "") + m.group("num") + (" " + suf if len(suf) > 1 else suf)
            rec = {
                "value": value,
                "norm": norm(m.group("num"), m.group("suf")),
                "phrase": phrase_around(text, offset + m.start(), offset + m.end()),
                "line": ln,
            }
            print(json.dumps(rec, ensure_ascii=False))
        offset += len(line) + 1


if __name__ == "__main__":
    main()
