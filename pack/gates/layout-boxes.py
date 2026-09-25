#!/usr/bin/env python3
"""Helper for layout.sh (not a gate; not executable). Finds overlapping and overflowing
text boxes and prints one JSON object: {"pages": N, "flagged": [{page, width, height, faults}]}.

  pdftotext -bbox-layout FILE.pdf - | python3 layout-boxes.py pdf
  python3 layout-boxes.py html < boxes.json     # from the browse daemon (see layout.sh)

Rules (from the brief): two word boxes from different lines that intersect by more than
30 percent of the smaller box's area are an overlap; a box past the page edge is an
overflow. Faults are grouped per pair of lines: at most 6 overlaps and 2 overflows per page.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET

RATIO = 0.30
MAX_FAULTS = 8


def parse_pdf(xhtml):
    """Yield (page_no, width, height, lines) where lines = [(line_id, first_words, [boxes])]."""
    xhtml = re.sub(r'\sxmlns="[^"]+"', "", xhtml, count=1)
    root = ET.fromstring(xhtml)
    for n, page in enumerate(root.iter("page"), 1):
        lines = []
        for line in page.iter("line"):
            words = [(float(w.get("xMin")), float(w.get("yMin")), float(w.get("xMax")), float(w.get("yMax")), w.text or "")
                     for w in line.iter("word")]
            if words:
                first = " ".join(w[4] for w in words[:4])
                lines.append((len(lines), first, words))
        yield n, float(page.get("width")), float(page.get("height")), lines


def parse_html(data):
    d = json.loads(data)
    lines = []
    for i, b in enumerate(d["boxes"]):
        if b["w"] <= 0 or b["h"] <= 0:
            continue
        first = " ".join(b["text"].split()[:4])
        lines.append((i, first, [(b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"], b["text"])]))
    yield 1, float(d["width"]), float(d["height"]), lines


def area(b):
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def intersection(a, b):
    return max(0.0, min(a[2], b[2]) - max(a[0], b[0])) * max(0.0, min(a[3], b[3]) - max(a[1], b[1]))


def faults_for(width, height, lines, vertical_edge=True):
    faults = []
    seen = set()
    for i, (la, first_a, boxes_a) in enumerate(lines):
        for box in boxes_a:
            over = []
            if box[0] < -0.5: over.append("left")
            if box[2] > width + 0.5: over.append("right")
            if vertical_edge and box[1] < -0.5: over.append("top")
            if vertical_edge and box[3] > height + 0.5: over.append("bottom")
            if over and ("overflow", la) not in seen:
                seen.add(("overflow", la))
                faults.append({"kind": "overflow", "a": first_a, "edge": over[0],
                               "box_a": [round(v, 1) for v in box[:4]], "word": box[4]})
        for lb, first_b, boxes_b in lines[i + 1:]:
            best = 0.0
            pair = None
            for ba in boxes_a:
                for bb in boxes_b:
                    small = min(area(ba), area(bb))
                    if small <= 0:
                        continue
                    r = intersection(ba, bb) / small
                    if r > best:
                        best, pair = r, (ba, bb)
            if best > RATIO:
                faults.append({"kind": "overlap", "a": first_a, "b": first_b, "ratio": round(best, 2),
                               "box_a": [round(v, 1) for v in pair[0][:4]], "box_b": [round(v, 1) for v in pair[1][:4]],
                               "word_a": pair[0][4], "word_b": pair[1][4]})
    overlaps = sorted((f for f in faults if f["kind"] == "overlap"), key=lambda f: -f["ratio"])
    overflows = [f for f in faults if f["kind"] == "overflow"]
    return overlaps[:MAX_FAULTS - 2] + overflows[:2]


def main():
    mode = sys.argv[1]
    data = sys.stdin.read()
    pages = parse_pdf(data) if mode == "pdf" else parse_html(data)
    out = {"pages": 0, "flagged": []}
    for n, w, h, lines in pages:
        out["pages"] = n
        f = faults_for(w, h, lines, vertical_edge=(mode == "pdf"))
        if f:
            out["flagged"].append({"page": n, "width": w, "height": h, "faults": f})
    print(json.dumps(out))


if __name__ == "__main__":
    main()
