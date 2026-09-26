# How a change request becomes a diff

Joe describes a change in words. The skill turns it into an edit in one place, builds a new version, and runs the gates. Nothing is edited in place and nothing is edited by hand in the HTML.

## 1. Classify

Run `change.sh "<request>"`. Jev answers one Choice question (`change.json`) with one of six kinds and a confidence. Under 0.6, the line says `unverified` and the skill asks Joe which kind he means. The decision and its confidence go into the work log.

| Kind | Example request | What it changes |
|---|---|---|
| `style_token` | "make the orange rule thinner", "tighter top margin", "lighter body text" | one value in `.laurelin/style.json` `overrides` |
| `layout` | "put the chart on the left", "make the product sheet a three-column sheet", "bigger photo on sheet 5" | one sheet's `type` or its layout keys in the copy JSON |
| `copy` | "change the ask to $4M", "shorten the customer line", "call it a demonstration machine" | the words: Joe's edit, through the verbatim and numbers gates |
| `order` | "move the ask to sheet 3", "cut the team sheet", "add an appendix on the test program" | the order of the `sheets` list |
| `art` | "swap the cover photo", "use the end-view drawing here", "plot years two to five" | one sheet's `art` block or a chart's `series` |
| `delivery` | "compress it under 4 MB", "file it as v9", "name it for the firm" | the render, compress, file and register steps |

## 2. Edit one place

**`style_token`.** Add or change one key under `overrides` in `.laurelin/style.json`. The builder applies overrides after the live tokens, so the live system stays the base and the override is visible as a diff. Every override carries the request that caused it:

```json
"overrides": {"rules.rule": "1px", "_why": {"rules.rule": "Joe, 2026-09-26: make the orange rule thinner"}}
```

A style change never touches the copy JSON. When the request would need a second accent colour, a grey, a third typeface, a radius or a shadow, the answer is that the system forbids it (the list is in `style.json` `forbidden`). Say so and stop.

**`layout`.** Change the sheet's `type` (title, stats, columns, art, chart, close, appendix) or its layout keys (`ground`, `stats_label`, `chart.highlight`, the column split where a type has one). Words and numbers stay as they are. When no type fits the request, say which types exist and stop. A new sheet type is a change to `build.py`, and that is a branch, not a deck edit.

**`copy`.** Joe supplies the words. The skill puts them in the copy JSON, exactly. `LAURELIN_ORIGINAL` points at a file holding Joe's lines so the verbatim gate proves they survived. A number in the new words goes through the numbers gate against the canonical source. When the new number disagrees with the canonical source, that is a conflict: record both and stop.

**`order`.** Reorder, add or remove entries in `sheets`. Sheet numbers are computed at build time, so nothing else changes. Removing a sheet that carries a figure removes the figure from the deck; say so in the work log.

**`art`.** Change one `art` block: `src`, `alt`, `caption`, `nda`. A drawing that is not in `CLEARANCE.md`'s cleared list gets `"nda": true`. A chart's `series` values come from the canonical source and go through the numbers gate.

**`delivery`.** No edit to the copy. Run the delivery step with the parameter changed.

## 3. New version, never in place

Every change lands as `content/v(N+1)-copy.json` beside the current one, built to `deck-v(N+1)`. The old version stays until it is filed to `_superseded/`. Two changes in one session are still one new version.

## 4. Check and show

Build, render, compress, run the gates, look at every page image, then show Joe the before and after page images of the sheets that changed, with the gate lines. He decides whether it ships.
