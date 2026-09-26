#!/usr/bin/env python3
"""style-pull.py: read the live Laurelin Visual System and write .laurelin/style.json.

    style-pull.py                 write .laurelin/style.json in the working directory
    style-pull.py --print         print the JSON instead of writing it
    style-pull.py --out FILE      write somewhere else

The source is the folder in LAURELIN_VISUAL_SYSTEM (default ~/laurelin-visual-system).
It reads lrl.css (the tokens and the type scale), README.md (the forbidden list, the
image rules, the device vocabulary) and components/**/*.html (the card names) at run
time. No style value is stored in this repo: a build always uses what is live.

Exit 0 on success. Exit 2 when the folder is absent, with one line saying so.
"""
import argparse
import json
import os
import pathlib
import re
import sys

VS = pathlib.Path(os.environ.get("LAURELIN_VISUAL_SYSTEM", os.path.expanduser("~/laurelin-visual-system")))
ROOT_PX = 16          # the CSS root size lrl.css sets on body.lrl
DECK_W, DECK_H = 1920, 1080
DESKTOP_VW = 1024     # the README's desktop breakpoint, where --margin becomes 48px
DECK_SCALE = DECK_W / DESKTOP_VW

# Rules that come from Joe, not from the visual system. Recorded here with their source so
# a reader sees a decision and not a drift. The photo rule overrides README section "Imagery".
OVERRIDES = {
    "photo_filter": "none",
    "photo_filter_source": "Joe, 2026-09-23 (docs/briefs/deck-design.md): photos in a deck are full colour. "
                           "The README's desaturation rule is overruled for decks.",
}


def read(path):
    return path.read_text(encoding="utf-8")


def css_tokens(css):
    """Every --name: value in the first :root block."""
    m = re.search(r":root\s*\{(.*?)\}", css, re.S)
    if not m:
        return {}
    body = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
    out = {}
    for name, val in re.findall(r"--([\w-]+)\s*:\s*([^;]+);", body):
        out[name] = re.sub(r"\s+", " ", val.strip())
    return out


def css_block(css, selector):
    """The declarations of the first rule whose selector list is exactly `selector`."""
    m = re.search(r"(?:^|\n)" + re.escape(selector) + r"\s*\{(.*?)\}", css, re.S)
    if not m:
        return {}
    body = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
    return {k.strip(): re.sub(r"\s+", " ", v.strip()) for k, v in re.findall(r"([\w-]+)\s*:\s*([^;]+);", body)}


def px(value):
    """A CSS length in px. rem and em count from the root size."""
    value = value.strip()
    m = re.match(r"^(-?[\d.]+)(px|rem|em|vw)$", value)
    if not m:
        return None
    n, unit = float(m.group(1)), m.group(2)
    return {"px": n, "rem": n * ROOT_PX, "em": n * ROOT_PX, "vw": None}[unit]


def clamp_parts(value):
    """clamp(a, b, c) -> (min_px, vw, max_px). A plain length -> (v, None, v)."""
    m = re.match(r"clamp\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)", value)
    if not m:
        v = px(value)
        return (v, None, v)
    lo, mid, hi = (s.strip() for s in m.groups())
    vw = float(mid[:-2]) if mid.endswith("vw") else None
    return (px(lo), vw, px(hi))


def size_at(parts, viewport):
    lo, vw, hi = parts
    if vw is None:
        return hi
    v = viewport * vw / 100
    return max(lo, min(hi, v))


def type_scale(css):
    out = {}
    for cls in ("d1", "d2", "h2", "h3", "body", "mono"):
        d = css_block(css, "." + cls)
        if not d:
            continue
        parts = clamp_parts(d.get("font-size", "0px"))
        at_desktop = size_at(parts, DESKTOP_VW) or 0.0
        out[cls] = {
            "font": "mono" if cls == "mono" else "display",
            "size_css": d.get("font-size"),
            "size_min_px": parts[0], "size_vw": parts[1], "size_max_px": parts[2],
            "size_px_at_desktop": round(at_desktop, 1),
            "weight": d.get("font-weight"),
            "line_height": d.get("line-height"),
            "tracking": d.get("letter-spacing"),
            "transform": d.get("text-transform"),
            "measure": d.get("max-width"),
            "align": d.get("text-align"),
        }
    return out


def deck_type(scale):
    """The print sizes a 1920 by 1080 sheet uses, derived from the CSS scale by one rule:
    the desktop size times 1920/1024, rounded to 4 px. Display faces stop at their CSS max."""
    def r4(v):
        return int(round(v / 4.0) * 4)
    roles = {"display": "d1", "anchor": "d2", "title": "h2", "sub": "h3", "body": "body", "small": "mono"}
    out = {}
    for role, cls in roles.items():
        t = scale.get(cls)
        if not t:
            continue
        v = t["size_px_at_desktop"] * DECK_SCALE
        if cls in ("d1", "d2") and t["size_max_px"]:
            v = min(v, t["size_max_px"])
        out[role] = {"px": r4(v), "from": cls, "weight": t["weight"], "line_height": t["line_height"],
                     "tracking": t["tracking"], "transform": t["transform"]}
    return out


def readme_sections(md):
    """{heading: text} for every ## heading."""
    parts = re.split(r"^## +(.+?)\s*$", md, flags=re.M)
    return {parts[i].strip(): parts[i + 1] for i in range(1, len(parts) - 1, 2)}


def bullet_list(text):
    return [re.sub(r"\s+", " ", b.strip()) for b in re.findall(r"^- +(.+?)(?=\n- |\n\n|\Z)", text, flags=re.M | re.S)]


def table_rows(text):
    rows = []
    for line in text.splitlines():
        if line.startswith("|") and not re.match(r"^\|\s*-", line):
            cells = [c.strip() for c in line.strip("|").split("|")]
            rows.append(cells)
    return rows[1:] if rows else []


def devices(sections):
    out = []
    for heading in sections:
        if heading.lower().startswith("the component vocabulary"):
            for cells in table_rows(sections[heading]):
                if len(cells) >= 2:
                    out.append({"device": cells[0], "class": cells[1].strip("`")})
    return out


def furniture(sections):
    out = []
    for heading, text in sections.items():
        if heading.lower().startswith("drawings"):
            for cells in table_rows(text):
                if len(cells) >= 2 and cells[0].startswith("`"):
                    out.append({"class": cells[0].strip("`"), "draws": cells[1]})
    return out


def cards(vs):
    out = []
    comp = vs / "components"
    if not comp.is_dir():
        return out
    for p in sorted(comp.rglob("*.html")):
        first = read(p).splitlines()[0] if p.stat().st_size else ""
        m = re.search(r'@dsCard\s+group="([^"]+)"', first)
        out.append({"card": p.stem, "group": m.group(1) if m else p.parent.parent.name,
                    "path": str(p.relative_to(vs))})
    return out


def image_rules(css, sections):
    plate = css_block(css, ".plate img")
    ruled = css_block(css, ".plate--ruled")
    reticle = css_block(css, ".reticle::before, .reticle::after,\n.reticle > .r-b::before, .reticle > .r-b::after")
    imagery = next((t for h, t in sections.items() if h.lower().startswith("imagery")), "")
    return {
        "wrapper": ".plate",
        "readme_filter": plate.get("filter"),
        "hero_rule": ruled.get("border-top"),
        "reticle_size": reticle.get("width"),
        "reticle_border": reticle.get("border"),
        "readme_text": re.sub(r"\s+", " ", imagery.strip())[:600],
        "photo_filter": OVERRIDES["photo_filter"],
        "photo_filter_source": OVERRIDES["photo_filter_source"],
        "thermal_exception": ".plate--thermal keeps its own colour map (README)",
    }


def logo_rules(css, sections):
    brackets = css_block(css, ".brackets")
    voc = next((t for h, t in sections.items() if h.lower().startswith("the component vocabulary")), "")
    marks = re.search(r"Two marks sit beside them:(.*?)\n\n", voc, re.S)
    return {
        "lockup_class": ".brackets",
        "lockup_padding": brackets.get("padding"),
        "corner_size": css_block(css, ".brackets::before, .brackets::after").get("width"),
        "marks": re.sub(r"\s+", " ", marks.group(1).strip()) if marks else None,
        "serial_class": ".part",
    }


def pull():
    if not (VS / "lrl.css").is_file():
        print(f"style-pull: skipped, no visual system at {VS} (set LAURELIN_VISUAL_SYSTEM)")
        return None
    css = read(VS / "lrl.css")
    md = read(VS / "README.md") if (VS / "README.md").is_file() else ""
    sections = readme_sections(md)
    tokens = css_tokens(css)
    version = None
    if md:
        paras = md.split("\n\n")
        if len(paras) > 1:
            version = re.match(r"^(LRL-DS-\S+?)\.\s*(.+?)\.?$", paras[1].strip())
    scale = type_scale(css)
    u = px(tokens.get("u", "8px")) or 8
    colors = {k: v for k, v in tokens.items() if re.match(r"^#[0-9A-Fa-f]{3,8}$", v)}
    fonts = {k: v for k, v in tokens.items() if k.startswith("font-")}
    grid = {k: tokens[k] for k in ("u", "gutter", "margin", "cols") if k in tokens}
    m1024 = re.search(r"@media \(min-width: 1024px\)\s*\{\s*:root\s*\{\s*--margin:\s*([^;]+);", css)
    if m1024:
        grid["margin_desktop"] = m1024.group(1).strip()
    rules = {k: tokens[k] for k in ("hair", "rule") if k in tokens}
    tracking = {k: tokens[k] for k in tokens if k.startswith("track-")}
    forbidden_text = next((t for h, t in sections.items() if h.lower().startswith("forbidden")), "")
    opacity = {c: css_block(css, "." + c).get("opacity") for c in ("o60", "o40", "o25")}
    return {
        "source": {"folder": str(VS), "css": str(VS / "lrl.css"), "readme": str(VS / "README.md"),
                   "fonts_css": str(VS / "fonts" / "fonts.css"),
                   "system": version.group(1) if version else None,
                   "state": version.group(2) if version else None,
                   "css_mtime": int((VS / "lrl.css").stat().st_mtime)},
        "colors": colors,
        "fonts": fonts,
        "grid": grid,
        "unit_px": u,
        "rules": rules,
        "tracking": tracking,
        "opacity": opacity,
        "type": scale,
        "deck": {"width": DECK_W, "height": DECK_H, "scale": DECK_SCALE,
                 "margin_px": int(16 * u), "gutter_px": int(4 * u), "cols": int(tokens.get("cols", "12")),
                 "type": deck_type(scale),
                 "derivation": "desktop size (clamp at 1024 px) times 1920/1024, rounded to 4 px; d1 and d2 stop at their CSS max; "
                               "margin 16 units, gutter 4 units"},
        "images": image_rules(css, sections),
        "logo": logo_rules(css, sections),
        "devices": devices(sections),
        "drawing_furniture": furniture(sections),
        "cards": cards(VS),
        "forbidden": bullet_list(forbidden_text),
        "accent_rule": "one accent element per view (README: One accent per project)",
    }


def main():
    ap = argparse.ArgumentParser(description="Read the live visual system and write .laurelin/style.json")
    ap.add_argument("--print", action="store_true")
    ap.add_argument("--out", default=".laurelin/style.json")
    a = ap.parse_args()
    style = pull()
    if style is None:
        sys.exit(2)
    text = json.dumps(style, indent=1)
    if a.print:
        print(text)
        return
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text + "\n", encoding="utf-8")
    print(f"style-pull: wrote {out} from {VS} ({len(style['colors'])} colours, {len(style['type'])} type classes, "
          f"{len(style['cards'])} cards, {len(style['forbidden'])} forbidden)")


if __name__ == "__main__":
    main()
