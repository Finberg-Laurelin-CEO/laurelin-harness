#!/usr/bin/env python3
"""build.py: build a deck HTML from a copy JSON and the live style tokens.

    build.py --copy content/vN-copy.json --style .laurelin/style.json --out _out/deck-vN.html

The method comes from the rescued v8 generator (~/laurelin-deck-kit/lrl-v8-rescued-20260925/
gen4.py and patch4.py): one 12-column grid on every sheet, one type scale, flush left, mono
chrome, reticle corners, figure numbers, one accent element per view. This file holds the
method only. Every word, number and image path comes from the copy JSON.

Sheet types (the `type` key of each entry in `sheets`):
  title     the cover: display word, sub line, label, optional full-bleed art, big lockup
  stats     title, sub, body and two to four stat cards
  columns   title, sub and three columns (head, body)
  art       full-bleed photo or drawing with the instrument layer and an optional word
  chart     title, sub and a bar chart drawn to scale from the copy's own series
  close     the last sheet: line, sub, contact lines, big lockup, optional art
  appendix  title, sub and a table, numbered A1 / AN

Rules the builder enforces:
  - `SHEET nn / NN` and `An / AN` are computed from the sheet list, never typed.
  - Photos are full colour (Joe, 2026-09-23), with the 2 px accent rule on the top edge and
    reticle corners. The visual system's desaturation filter is not applied.
  - Art marked `"nda": true` is rendered only when LAURELIN_NDA=1. Otherwise the sheet keeps
    its place and shows a drawing-slot placeholder that names the file it expects.
  - Each sheet type places exactly one accent element. The copy cannot add a second.
  - Hierarchy is opacity (the o60 / o40 / o25 steps from the style), never a grey.

Writes the HTML and `<out>.manifest.json` (sheet count, numbering, withheld art, the build
command) for the deck gate. Exit 1 with one line on a copy error.
"""
import argparse
import datetime
import html as htmllib
import json
import math
import os
import pathlib
import sys

W, H = 1920, 1080
TYPES = ("title", "stats", "columns", "art", "chart", "close", "appendix")
NUMBERED = ("stats", "columns", "chart")


def die(msg):
    print(f"build: error, {msg}")
    sys.exit(1)


def esc(t):
    return htmllib.escape(str(t), quote=False).replace("\n", "<br>")


def apply_overrides(style):
    """`overrides` in style.json: dotted keys set one value each, after the live tokens.
    `_why` holds the request behind each one and is not a token. Returns the keys applied."""
    applied = []
    for key, value in (style.get("overrides") or {}).items():
        if key == "_why":
            continue
        node = style
        parts = key.split(".")
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = value
        applied.append(key)
    return applied


class Style:
    """Tokens from style.json, resolved to the values a sheet needs."""

    def __init__(self, s):
        self.overrides = apply_overrides(s)
        c = s["colors"]
        self.bone, self.bone2, self.carbon, self.carbon2 = c["bone"], c["bone-2"], c["carbon"], c["carbon-2"]
        self.ink, self.inkinv, self.orange = c["ink"], c["ink-inv"], c["orange"]
        self.white = "#FFFFFF"
        # Font stacks go into style attributes, so their double quotes become single quotes.
        self.disp = s["fonts"]["font-display"].replace('"', "'")
        self.mono = s["fonts"]["font-mono"].replace('"', "'")
        self.fonts_css = s["source"].get("fonts_css")
        d = s["deck"]
        self.M, self.GUT, self.COLS = d["margin_px"], d["gutter_px"], d["cols"]
        self.COLW = (W - 2 * self.M - (self.COLS - 1) * self.GUT) / self.COLS
        t = d["type"]
        self.size = {k: v["px"] for k, v in t.items()}
        self.weight = {k: v.get("weight") or "400" for k, v in t.items()}
        self.lh = {k: v.get("line_height") or "1.2" for k, v in t.items()}
        tr = s["tracking"]
        self.track_tight, self.track_mono = tr.get("track-tight", "-0.03em"), tr.get("track-mono", "0.08em")
        self.hair = s["rules"]["hair"]
        self.rule = s["rules"]["rule"]
        o = s["opacity"]
        self.o60, self.o40, self.o25 = o["o60"], o["o40"], o["o25"]
        h = self.carbon.lstrip("#")
        self.carbon_rgb = ",".join(str(int(h[i:i + 2], 16)) for i in (0, 2, 4))
        self.reticle = int(str(s["images"].get("reticle_size", "16px")).rstrip("px") or 16)
        self.photo_filter = s["images"].get("photo_filter", "none")
        self.system = s["source"].get("system")

    def span(self, n):
        return round(n * self.COLW + (n - 1) * self.GUT)

    def colx(self, i):
        return round(self.M + (i - 1) * (self.COLW + self.GUT))

    def ground(self, g):
        return {"bone": (self.bone, self.ink), "carbon": (self.carbon, self.inkinv), "orange": (self.orange, self.white)}[g]

    def hairline(self, g):
        fg = self.ground(g)[1]
        return f"color-mix(in srgb, {fg} 22%, transparent)"


class Builder:
    def __init__(self, copy, style, nda):
        self.c, self.s, self.nda = copy, Style(style), nda
        self.fig = 0
        self.withheld = []
        self.sheets = copy["sheets"]
        self.n_main = sum(1 for x in self.sheets if x["type"] in NUMBERED)
        self.n_appx = sum(1 for x in self.sheets if x["type"] == "appendix")
        self.brand = copy["deck"].get("brand", {})

    # ---------------------------------------------------------------- type
    def p(self, role, t, color=None, op=None, x="", tag="p"):
        s = self.s
        font = s.mono if role == "small" else s.disp
        extra = ""
        if role == "small":
            extra = f"; letter-spacing:{s.track_mono}; text-transform:uppercase; font-variant-numeric:tabular-nums slashed-zero"
        elif role in ("display", "anchor"):
            extra = f"; letter-spacing:{s.track_tight}; text-transform:uppercase"
        c = f"; color:{color}" if color else ""
        o = f"; opacity:{op}" if op else ""
        return (f'<{tag} style="font-family:{font}; font-size:{s.size[role]}px; font-weight:{s.weight[role]}; '
                f'line-height:{s.lh[role]}{extra}{c}{o}{x}">{esc(t)}</{tag}>')

    def mono(self, t, **k):
        return self.p("small", t, **k)

    def body(self, t, **k):
        return self.p("body", t, **k)

    def sub(self, t, **k):
        return self.p("sub", t, tag="h3", **k)

    def title(self, t, **k):
        return self.p("title", t, tag="h2", **k)

    def display(self, t, **k):
        return self.p("display", t, tag="h1", **k)

    def stat(self, t, color=None, x=""):
        s = self.s
        c = f"; color:{color}" if color else ""
        return (f'<p style="font-family:{s.disp}; font-size:{s.size["title"]}px; font-weight:700; line-height:1; '
                f'letter-spacing:-0.02em{c}{x}">{esc(t)}</p>')

    # ---------------------------------------------------------------- layout
    def col(self, inner, n=None, gap=24, x=""):
        wd = f"width:{self.s.span(n)}px; flex:none" if n else "flex:1"
        return f'<div style="{wd}; display:flex; flex-direction:column; gap:{gap}px{x}">{inner}</div>'

    def row(self, inner, gap=None, x=""):
        return f'<div style="display:flex; flex-direction:row; gap:{self.s.GUT if gap is None else gap}px{x}">{inner}</div>'

    def spacer(self):
        return '<div style="flex:1"></div>'

    def rule(self, g, accent=False, hard=False):
        s = self.s
        c = s.orange if accent else (s.ground(g)[1] if hard else s.hairline(g))
        return f"border-top:{s.rule if accent else s.hair} solid {c}; padding-top:16px"

    # ---------------------------------------------------------------- devices
    def corners(self, x, y, w, h, color, inset=28, size=None, wt=2):
        size = size or self.s.reticle
        out = []
        for cx, cy, sides in [(x + inset, y + inset, "top left"), (x + w - inset - size, y + inset, "top right"),
                              (x + inset, y + h - inset - size, "bottom left"),
                              (x + w - inset - size, y + h - inset - size, "bottom right")]:
            b = "; ".join(f"border-{sd}:{wt}px solid {color}" for sd in sides.split())
            out.append(f'<div style="position:absolute; left:{cx}px; top:{cy}px; width:{size}px; height:{size}px; {b}"></div>')
        return "".join(out)

    def hairgrid(self, x, y, w, h, color="rgba(255,255,255,0.12)"):
        step = round(self.s.COLW + self.s.GUT)
        return (f'<div style="position:absolute; left:{x}px; top:{y}px; width:{w}px; height:{h}px; '
                f'background:repeating-linear-gradient(90deg, {color} 0px, {color} 1px, transparent 1px, transparent {step}px), '
                f'repeating-linear-gradient(180deg, {color} 0px, {color} 1px, transparent 1px, transparent {step}px)"></div>')

    def next_fig(self):
        self.fig += 1
        return f"FIG {self.fig:02d}"

    def ring(self, color, px):
        """A ring mark: one circle carrying eight small rings. Drawn, never an image file."""
        sw = 4.2
        small = "".join(
            f'<circle cx="{50 + 36 * math.sin(math.radians(a)):.2f}" cy="{50 - 36 * math.cos(math.radians(a)):.2f}" r="8.2" '
            f'fill="none" stroke="{color}" stroke-width="{sw}"/>' for a in range(0, 360, 45))
        return (f'<svg viewBox="0 0 100 100" width="{px}" height="{px}" aria-label="mark" style="width:{px}px; height:{px}px; flex:none">'
                f'<circle cx="50" cy="50" r="36" fill="none" stroke="{color}" stroke-width="{sw}"/>{small}</svg>')

    def lockup(self, color, big=False, pinned=None):
        """[ mark WORD ] in corner brackets: the .brackets device of the visual system."""
        s = self.s
        word = self.brand.get("word", "")
        mark = self.brand.get("mark", "none")
        if big:
            w, h, rp, fs, cs, pad, gap, wt = 1290, 250, 170, s.size["display"], 36, 40, 40, 3
            ls = "-0.03em"
        else:
            w, h, rp, fs, cs, pad, gap, wt = 206, 48, 28, 26, 10, 12, 12, 2
            ls = "0.04em"
        word_html = (f'<p style="font-family:{s.disp}; font-size:{fs}px; font-weight:700; line-height:1; '
                     f'letter-spacing:{ls}; color:{color}; text-transform:uppercase">{esc(word)}</p>')
        mark_html = self.ring(color, rp) if mark == "ring" else ""
        pos = f"position:absolute; left:{pinned[0]}px; top:{pinned[1]}px; " if pinned else "position:relative; flex:none; "
        return (f'<div style="{pos}width:{w}px; height:{h}px; display:flex; flex-direction:row; align-items:center; '
                f'gap:{gap}px; padding:0px {pad}px">'
                + self.corners(0, 0, w, h, color=color, inset=0, size=cs, wt=wt) + mark_html + word_html + "</div>")

    # ---------------------------------------------------------------- art
    def art_src(self, art):
        """The image path, or None when the art is NDA-gated and the run is not."""
        if art.get("nda") and not self.nda:
            self.withheld.append(art.get("src", "?"))
            return None
        return art["src"]

    def slot(self, art, x, y, w, h, color):
        """The .drawing-slot placeholder: hatched, naming the file it expects."""
        name = os.path.basename(art.get("src", "?"))
        return (f'<div style="position:absolute; left:{x}px; top:{y}px; width:{w}px; height:{h}px; display:flex; '
                f'align-items:center; justify-content:center; text-align:center; '
                f'box-shadow:inset 0 0 0 1px color-mix(in srgb, {color} 30%, transparent); '
                f'background-image:repeating-linear-gradient(45deg, color-mix(in srgb, {color} 6%, transparent) 0 8px, transparent 8px 16px)">'
                + self.mono(f"DRAWING SLOT · {name} · NDA-GATED", color=color, op=self.s.o60) + "</div>")

    def bleed_art(self, art, ground):
        """Full-bleed art with the instrument layer: scrim, hairline grid, accent rule, reticle, figure label."""
        s = self.s
        fg = s.ground(ground)[1]
        src = self.art_src(art)
        fig = self.next_fig()
        cap = art.get("caption", "")
        if src is None:
            img = self.slot(art, 0, 0, W, H, fg)
        else:
            img = (f'<img src="{esc(src)}" alt="{esc(art.get("alt", ""))}" style="position:absolute; left:0px; top:0px; '
                   f'width:{W}px; height:{H}px; object-fit:cover; filter:{s.photo_filter}">'
                   f'<div style="position:absolute; left:0px; top:0px; width:{W}px; height:{H}px; '
                   f'background:linear-gradient(180deg, rgba({s.carbon_rgb},0.35) 0%, rgba({s.carbon_rgb},0) 22%, rgba({s.carbon_rgb},0.1) 50%, rgba({s.carbon_rgb},0.88) 100%)"></div>')
        return (img + self.hairgrid(0, 0, W, H)
                + f'<div style="position:absolute; left:0px; top:0px; width:{W}px; height:{s.rule}; background:{s.orange}"></div>'
                + self.corners(s.M - 32, 64, W - 2 * s.M + 64, H - 128, color=fg, inset=0, size=32)
                + f'<p style="position:absolute; left:{s.colx(1)}px; top:96px; width:{s.span(4)}px; font-family:{s.mono}; '
                  f'font-size:{s.size["small"]}px; letter-spacing:{s.track_mono}; text-transform:uppercase; color:{fg}">'
                  f'{fig}{(" &nbsp;&middot;&nbsp; " + esc(cap)) if cap else ""}</p>')

    def panel(self, art, w, h, ground):
        """Art on the one allowed inset, with reticle corners and a figure label, the 2 px rule on top."""
        s = self.s
        bg = s.bone2 if ground == "bone" else s.carbon2
        fg = s.ground(ground)[1]
        src = self.art_src(art)
        fig = self.next_fig()
        cap = art.get("caption", "")
        inner = (self.slot(art, 0, 0, w, h, fg) if src is None else
                 f'<img src="{esc(src)}" alt="{esc(art.get("alt", ""))}" style="position:absolute; left:0px; top:0px; '
                 f'width:{w}px; height:{h}px; object-fit:cover; filter:{s.photo_filter}">')
        return (f'<div style="position:relative; width:{w}px; height:{h}px; flex:none; background:{bg}; '
                f'border-top:{s.rule} solid {s.orange}; overflow:hidden">' + inner
                + self.corners(0, 0, w, h, color=fg, inset=14, size=22)
                + f'<p style="position:absolute; left:40px; bottom:14px; width:{w - 80}px; font-family:{s.mono}; '
                  f'font-size:{s.size["small"]}px; letter-spacing:{s.track_mono}; text-transform:uppercase; color:{fg}">'
                  f'{fig}{(" &nbsp;&middot;&nbsp; " + esc(cap)) if cap else ""}</p></div>')

    # ---------------------------------------------------------------- chrome
    def chrome(self, ground, number, tab, foot=""):
        s = self.s
        fg = s.ground(ground)[1]
        base = (f"font-family:{s.mono}; font-size:{s.size['small']}px; letter-spacing:{s.track_mono}; "
                f"text-transform:uppercase; color:{fg}")
        d = self.c["deck"]
        return (self.lockup(fg, pinned=(s.M, 40))
                + f'<p style="position:absolute; left:{s.colx(4)}px; top:52px; width:{s.span(4)}px; {base}; opacity:{s.o60}">{esc(d.get("tagline", ""))}</p>'
                + f'<p style="position:absolute; left:{s.colx(8)}px; top:52px; width:{s.span(3)}px; {base}">{esc(number)}</p>'
                + f'<p style="position:absolute; left:{s.colx(11)}px; top:52px; width:{s.span(2)}px; {base}; opacity:{s.o60}">{esc(d.get("edition", ""))}</p>'
                + f'<hr style="position:absolute; left:{s.M}px; top:100px; width:{W - 2 * s.M}px; border:0; border-top:{s.hair} solid {s.hairline(ground)}">'
                + f'<p style="position:absolute; left:{s.colx(1)}px; bottom:52px; width:{s.span(10)}px; {base}; opacity:{s.o60}">{esc(foot)}</p>'
                + f'<p style="position:absolute; left:{s.colx(9)}px; bottom:52px; width:{s.span(4)}px; text-align:right; {base}">{esc(tab)} &#8599;</p>')

    def section(self, sheet, ground, pre, inner, number="", layout="row", justify="", pad=None):
        s = self.s
        bg, fg = s.ground(ground)
        pad = pad or f"136px {s.M}px 124px"
        lay = f"flex-direction:row; gap:{s.GUT}px" if layout == "row" else "flex-direction:column; gap:28px"
        j = f"; justify-content:{justify}" if justify else ""
        num = f' data-sheet="{esc(number)}"' if number else ""
        return (f'<section class="s" id="{esc(sheet["id"])}" data-type="{sheet["type"]}"{num} '
                f'style="background:{bg}; color:{fg}; font-family:{s.disp}; padding:{pad}; display:flex; {lay}{j}">\n'
                f'{pre}\n{inner}\n</section>\n')

    # ---------------------------------------------------------------- sheets
    def sheet_title(self, x, g):
        s = self.s
        g = g or "carbon"
        fg = s.ground(g)[1]
        pre = self.bleed_art(x["art"], g) if x.get("art") else self.hairgrid(0, 0, W, H, "rgba(128,128,128,0.10)")
        inner = (self.lockup(fg, big=True)
                 + self.sub(x.get("sub", ""), x="; letter-spacing:0.1em; text-transform:uppercase")
                 + f'<div style="{self.rule(g, accent=True)}; width:{s.span(5)}px">{self.mono(x.get("label", ""))}</div>')
        return self.section(x, g, pre, inner, layout="col", justify="end", pad=f"128px {s.M}px 112px")

    def sheet_stats(self, x, g, number):
        s = self.s
        g = g or "bone"
        stats = x.get("stats", [])
        if not 2 <= len(stats) <= 4:
            die(f"sheet {x['id']}: stats needs two to four entries")
        cells = []
        for i, st in enumerate(stats):
            value, label = st[0], st[1]
            note = st[2] if len(st) > 2 else ""
            # The one accent on this view: the first stat value.
            cells.append(self.col(self.stat(value, color=s.orange if i == 0 else None) + self.mono(label, op=s.o60)
                                  + (self.body(note, op=s.o60) if note else ""), gap=6,
                                  x=f"; {self.rule(g, hard=True)}"))
        grid = f'<div style="display:grid; grid-template-columns:repeat({min(len(stats), 2)}, 1fr); gap:24px {s.GUT}px">{"".join(cells)}</div>'
        left = self.col(self.title(x.get("title", "")) + self.body(x.get("sub", ""), op="0.8") + self.spacer()
                        + (self.body(x.get("body", "")) if x.get("body") else ""), n=5, gap=24)
        right = self.col(self.mono(x.get("stats_label", ""), op=s.o60) + grid + self.spacer(), n=7, gap=16)
        return self.section(x, g, self.chrome(g, number, x.get("tab", ""), x.get("foot", "")), left + right, number)

    def sheet_columns(self, x, g, number):
        s = self.s
        g = g or "bone"
        cols = x.get("columns", [])
        if len(cols) != 3:
            die(f"sheet {x['id']}: columns needs exactly three entries")
        # The one accent on this view: the 2 px rule over the column row.
        items = "".join(self.col(self.mono(c.get("label", f"{i + 1:02d}"), op=s.o60) + self.sub(c.get("head", ""))
                                 + self.body(c.get("body", ""), op="0.85"), gap=10)
                        for i, c in enumerate(cols))
        top = self.row(f'<div style="width:{s.span(8)}px; flex:none">{self.title(x.get("title", ""))}</div>'
                       + self.body(x.get("sub", ""), op="0.8", x=f"; width:{s.span(4)}px"), x="; align-items:end")
        inner = top + self.spacer() + f'<div style="{self.rule(g, accent=True)}">{self.row(items)}</div>'
        return self.section(x, g, self.chrome(g, number, x.get("tab", ""), x.get("foot", "")), inner, number, layout="col")

    def sheet_art(self, x, g):
        s = self.s
        g = g or "carbon"
        pre = self.bleed_art(x["art"], g)
        inner = self.display(x["word"]) if x.get("word") else ""
        return self.section(x, g, pre, inner, layout="col", justify="end", pad=f"128px {s.M}px 112px")

    def sheet_chart(self, x, g, number):
        s = self.s
        g = g or "carbon"
        ch = x.get("chart", {})
        series = ch.get("series", [])
        if len(series) < 2:
            die(f"sheet {x['id']}: chart needs at least two series values")
        vals = [float(v) for _, v in series]
        top = max(vals) or 1.0
        Wc, Hc = s.span(7), 360
        hi = ch.get("highlight", len(series) - 1)
        slot = (Wc - (len(series) - 1) * s.GUT) / len(series)
        fg = s.ground(g)[1]
        L = []
        for k, ((label, _), v) in enumerate(zip(series, vals)):
            xk = round(k * (slot + s.GUT))
            hgt = round(v / top * Hc)
            # The one accent on this view: the highlighted bar.
            color = s.orange if k == hi else fg
            op = 1 if k == hi else 0.35 + 0.5 * (k + 1) / len(series)
            shown = int(v) if v == int(v) else v
            L.append(f'<div style="position:absolute; left:{xk}px; top:{40 + Hc - hgt}px; width:{round(slot)}px; height:{hgt}px; '
                     f'background:{color}; opacity:{op:.2f}"></div>')
            L.append(f'<p style="position:absolute; left:{xk}px; top:{40 + Hc - hgt - 32}px; width:{round(slot)}px; font-family:{s.mono}; '
                     f'font-size:{s.size["small"]}px; letter-spacing:0.04em">{esc(ch.get("prefix", ""))}{esc(shown)}{esc(ch.get("unit", ""))}</p>')
            L.append(f'<p style="position:absolute; left:{xk}px; top:{40 + Hc + 12}px; width:{round(slot)}px; font-family:{s.mono}; '
                     f'font-size:{s.size["small"]}px; letter-spacing:{s.track_mono}; text-transform:uppercase; opacity:{s.o60}">{esc(label)}</p>')
        bars = (f'<div style="position:relative; width:{Wc}px; height:{40 + Hc + 50}px; flex:none; '
                f'border-bottom:{s.hair} solid {s.hairline(g)}">{"".join(L)}</div>')
        left = self.col(self.title(x.get("title", "")) + self.body(x.get("sub", ""), op="0.8") + self.spacer()
                        + (self.body(x.get("body", ""), op="0.85") if x.get("body") else ""), n=5, gap=24)
        right = self.col(self.mono(ch.get("label", ""), op=s.o60) + bars + self.spacer()
                         + self.mono(ch.get("source", ""), op=s.o60), n=7, gap=16)
        return self.section(x, g, self.chrome(g, number, x.get("tab", ""), x.get("foot", "")), left + right, number)

    def sheet_close(self, x, g):
        s = self.s
        g = g or "carbon"
        fg = s.ground(g)[1]
        pre = self.bleed_art(x["art"], g) if x.get("art") else self.hairgrid(0, 0, W, H, "rgba(128,128,128,0.10)")
        contacts = "".join(self.mono(t, op=(None if i == 0 else "0.7")) for i, t in enumerate(x.get("contacts", [])))
        inner = (self.lockup(fg, big=True)
                 + self.row(self.sub(x.get("line", ""), x=f"; width:{s.span(6)}px")
                            + self.body(x.get("sub", ""), op="0.85", x=f"; width:{s.span(5)}px"),
                            x=f"; {self.rule(g, accent=True)}; align-items:start")
                 + self.row(contacts, gap=48))
        return self.section(x, g, pre, inner, layout="col", justify="end", pad=f"128px {s.M}px 112px")

    def sheet_appendix(self, x, g, number):
        s = self.s
        g = g or "bone"
        fg = s.ground(g)[1]
        tb = x.get("table", {})
        cols, rows = tb.get("cols", []), tb.get("rows", [])
        if not cols or not rows:
            die(f"sheet {x['id']}: appendix needs a table with cols and rows")
        cell = f"padding:10px 24px 10px 0px; border-bottom:{s.hair} solid {s.hairline(g)}; text-align:left; vertical-align:top"
        th = "".join(f'<th style="{cell}; font-weight:600">{esc(h)}</th>' for h in cols)
        trs = "".join("<tr>" + "".join(f'<td style="{cell}">{esc(v)}</td>' for v in r) + "</tr>" for r in rows)
        # The one accent on this view: the 2 px rule over the table.
        table = (f'<table style="width:100%; border-collapse:collapse; font-family:{s.disp}; font-size:{s.size["body"]}px; '
                 f'color:{fg}; border-top:{s.rule} solid {s.orange}"><tr>{th}</tr>{trs}</table>')
        top = self.row(f'<div style="width:{s.span(8)}px; flex:none">{self.title(x.get("title", ""))}</div>'
                       + self.body(x.get("sub", ""), op="0.75", x=f"; width:{s.span(4)}px"), x="; align-items:end")
        return self.section(x, g, self.chrome(g, number, x.get("tab", ""), x.get("foot", "")), top + table, number, layout="col")

    # ---------------------------------------------------------------- deck
    def build(self):
        out, n_main, n_appx = [], 0, 0
        for x in self.sheets:
            t = x.get("type")
            if t not in TYPES:
                die(f"sheet {x.get('id', '?')}: unknown type {t!r} (one of {', '.join(TYPES)})")
            g = x.get("ground")
            if g and g not in ("bone", "carbon"):
                die(f"sheet {x['id']}: ground must be bone or carbon")
            if t == "title":
                out.append(self.sheet_title(x, g))
            elif t == "art":
                out.append(self.sheet_art(x, g))
            elif t == "close":
                out.append(self.sheet_close(x, g))
            elif t == "appendix":
                n_appx += 1
                out.append(self.sheet_appendix(x, g, f"A{n_appx} / A{self.n_appx}"))
            else:
                n_main += 1
                number = f"SHEET {n_main:02d} / {self.n_main:02d}"
                fn = {"stats": self.sheet_stats, "columns": self.sheet_columns, "chart": self.sheet_chart}[t]
                out.append(fn(x, g, number))
        return "".join(out)

    def page(self, body):
        s = self.s
        fonts = f'<link rel="stylesheet" href="file://{s.fonts_css}">' if s.fonts_css and os.path.isfile(s.fonts_css) else ""
        css = (f"*{{margin:0;padding:0;box-sizing:border-box}} body{{background:#555}}\n"
               f"section.s{{position:relative;width:{W}px;height:{H}px;overflow:hidden;margin:0;break-after:page}}\n"
               f"@page{{size:{W}px {H}px;margin:0}} @media print{{body{{background:none}}}}\n"
               f"img,svg{{display:block}} h1,h2,h3,p{{margin:0}}\n"
               f"section.s>*:not([style*=\"position:absolute\"]){{position:relative}}")
        d = self.c["deck"]
        return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{esc(d.get("name", "deck"))}</title>'
                f'{fonts}<style>{css}</style></head><body>{body}</body></html>\n')


def main():
    ap = argparse.ArgumentParser(description="Build a deck HTML from a copy JSON and the live style tokens")
    ap.add_argument("--copy", required=True)
    ap.add_argument("--style", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    try:
        copy = json.loads(pathlib.Path(a.copy).read_text(encoding="utf-8"))
        style = json.loads(pathlib.Path(a.style).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        die(f"could not read the inputs: {e}")
    if "deck" not in copy or not isinstance(copy.get("sheets"), list) or not copy["sheets"]:
        die("the copy JSON needs a `deck` block and a non-empty `sheets` list")
    nda = os.environ.get("LAURELIN_NDA") == "1"
    b = Builder(copy, style, nda)
    body = b.build()
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(b.page(body), encoding="utf-8")
    manifest = {
        "built": datetime.date.today().isoformat(),
        "copy": str(pathlib.Path(a.copy).resolve()),
        "style": str(pathlib.Path(a.style).resolve()),
        "style_system": b.s.system,
        "html": str(out.resolve()),
        "sheets": len(b.sheets),
        "numbered": b.n_main,
        "appendix": b.n_appx,
        "ids": [x["id"] for x in b.sheets],
        "types": [x["type"] for x in b.sheets],
        "figures": b.fig,
        "nda_run": nda,
        "nda_withheld": b.withheld,
        "style_overrides": b.s.overrides,
        "build_command": f"build.py --copy {a.copy} --style {a.style} --out {a.out}",
    }
    pathlib.Path(str(out) + ".manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    note = f", {len(b.withheld)} NDA drawing(s) withheld (set LAURELIN_NDA=1)" if b.withheld else ""
    if b.s.overrides:
        note += f", {len(b.s.overrides)} style override(s): {', '.join(b.s.overrides)}"
    print(f"build: {len(b.sheets)} sheets ({b.n_main} numbered, {b.n_appx} appendix, {b.fig} figures) -> {out}{note}")


if __name__ == "__main__":
    main()
