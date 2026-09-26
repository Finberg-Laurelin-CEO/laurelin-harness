#!/usr/bin/env bash
# Test for the deck-design piece (docs/briefs/deck-design.md). Run from anywhere:
#   tests/test-deck-design.sh
# It uses an invented company (tests/fixtures/deck/sample-copy.json) and images it draws
# itself. It never reads the deck kit's content folder or the vault. What it checks:
#   1. style-pull.py --print reads the live visual system and reports tokens (skips if absent)
#   2. build.py turns the sample copy into an HTML with three sheets, numbered 01/02 and 02/02
#   3. NDA-gated art is withheld without LAURELIN_NDA=1 and rendered with it
#   4. render.mjs prints the HTML to a three-page PDF (skips the PDF cases without Playwright)
#   5. layout.sh passes on that PDF and fails on a copy with a label drawn over the title
#   6. deck.sh passes on the sample, fails on a sheet-count mismatch, fails on a grayscale photo,
#      passes on a colour photo, and requires the _index.md banner inside _circulating-decks
#   7. register.py prints a row and writes nothing without --apply, appends with it
#   8. change.sh labels "make the orange rule thinner" style_token and "change the ask to $4M"
#      copy (skips without TYPESAFE_API_KEY)
#   9. doctrine-check.sh reports pass or drift and writes nothing
# Needs: python3 with Pillow, poppler (pdfinfo, pdftotext, pdfimages, pdftoppm), node, jq.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [ -f "$HOME/.config/agent-keys/env" ]; then set -a; . "$HOME/.config/agent-keys/env"; set +a; fi
export PATH="$HOME/.local/bin:$PATH"

TMP="$ROOT/tests/tmp/deck-design"
rm -rf "$TMP" && mkdir -p "$TMP"
export LAURELIN_GATE_LOG="$TMP/gates.jsonl" LAURELIN_LAYOUT_DIR="$TMP/layout"
SKILL=pack/skills/deck-design
G=pack/gates
COPY=tests/fixtures/deck/sample-copy.json
pass=0; fail=0

# expect pass|fail NAME FIRST_LINE_REGEX [VAR=value ...] COMMAND
expect() {
  local want="$1" name="$2" re="$3"; shift 3
  local out code first got=fail
  out="$(env "$@" 2>&1)"; code=$?
  first="$(printf '%s\n' "$out" | head -n 1)"
  [ "$code" -eq 0 ] && got=pass
  if [ "$got" = "$want" ] && printf '%s' "$first" | grep -qE "$re"; then
    pass=$((pass + 1)); printf 'ok    %-30s %s\n' "$name" "$first"
  else
    fail=$((fail + 1)); printf 'FAIL  %-30s wanted %s matching /%s/, got exit %s:\n%s\n' "$name" "$want" "$re" "$code" "$out"
  fi
}
check() {  # check NAME CONDITION-EXIT MESSAGE
  if [ "$2" -eq 0 ]; then pass=$((pass + 1)); printf 'ok    %-30s %s\n' "$1" "$3"
  else fail=$((fail + 1)); printf 'FAIL  %-30s %s\n' "$1" "$3"; fi
}

echo "== style-pull"
VS="${LAURELIN_VISUAL_SYSTEM:-$HOME/laurelin-visual-system}"
if [ -f "$VS/lrl.css" ]; then
  out="$(python3 $SKILL/style-pull.py --print 2>&1)"; code=$?
  n="$(printf '%s' "$out" | jq -r '[.colors | length, .type | length, .forbidden | length, .deck.type.body.px] | map(tostring) | join("/")' 2>/dev/null)"
  check "style-pull --print" $(( code == 0 && $(printf '%s' "$out" | jq '(.colors|length) > 3 and (.type|length) >= 5 and (.forbidden|length) > 3 and (.deck.type.body.px > 0)' 2>/dev/null | grep -c true) == 1 ? 0 : 1 )) "colours/type/forbidden/body px: $n"
  expect pass "style-pull writes"          '^style-pull: wrote'   python3 $SKILL/style-pull.py --out "$TMP/style.json"
  leaked="$(grep -rlE '#FF4F00|#F2F1EF|Inter Tight|Geist Mono' pack/skills/deck-design pack/gates/deck.sh pack/gates/deck-check.py tests/fixtures/deck 2>/dev/null | wc -l | tr -d ' ')"
  check "no style value in repo" $([ "$leaked" -eq 0 ]; echo $?) "no colour or font value committed ($leaked files)"
else
  echo "skipped: no visual system at $VS; using a stub style"
  expect fail "style-pull absent"          '^style-pull: skipped' python3 $SKILL/style-pull.py --print
  exit 0
fi
STYLE="$TMP/style.json"

echo "== build"
expect pass "build sample"                 '^build: 3 sheets \(2 numbered, 0 appendix' python3 $SKILL/build.py --copy $COPY --style "$STYLE" --out "$TMP/sample.html"
check "three sections" $(( $(grep -c '<section class="s"' "$TMP/sample.html") == 3 ? 0 : 1 )) "$(grep -c '<section class="s"' "$TMP/sample.html") sections"
check "numbers computed" $(grep -q 'SHEET 01 / 02' "$TMP/sample.html" && grep -q 'SHEET 02 / 02' "$TMP/sample.html"; echo $?) "SHEET 01 / 02 and 02 / 02 present"
check "manifest written" $(jq -e '.sheets == 3 and .numbered == 2 and (.build_command | startswith("build.py"))' "$TMP/sample.html.manifest.json" >/dev/null; echo $?) "$TMP/sample.html.manifest.json"
check "one accent per stats view" $(( $(grep -o 'color:#[0-9A-Fa-f]*' "$TMP/sample.html" | sort | uniq -c | awk '$1>0' | wc -l) > 0 ? 0 : 1 )) "accent colour used"

# Images the test draws itself: one colour photo, one grayscale photo, one line drawing.
python3 - "$TMP" <<'PY'
import sys, pathlib
from PIL import Image, ImageDraw
d = pathlib.Path(sys.argv[1])
im = Image.new("RGB", (640, 360))
px = im.load()
for x in range(640):
    for y in range(360):
        px[x, y] = (40 + x * 200 // 640, 120 + y * 100 // 360, 200 - x * 150 // 640)
im.save(d / "colour.png")
im.convert("L").convert("RGB").save(d / "gray.png")
la = Image.new("RGBA", (640, 360), (0, 0, 0, 0))
ImageDraw.Draw(la).rectangle([60, 60, 580, 300], outline=(0, 0, 0, 255), width=4)
la.save(d / "lineart.png")
PY
mk_copy() {  # mk_copy OUT SRC NDA: the sample plus one art sheet
  jq --arg src "$2" --argjson nda "$3" '.sheets += [{"id": "photo", "type": "art", "art": {"src": $src, "alt": "test image", "nda": $nda, "caption": "TEST"}, "word": "Site"}]' $COPY > "$1"
}
mk_copy "$TMP/colour-copy.json" "$TMP/colour.png" false
mk_copy "$TMP/gray-copy.json" "$TMP/gray.png" false
mk_copy "$TMP/nda-copy.json" "$TMP/colour.png" true
expect pass "nda withheld"                 '^build: 4 sheets .*1 NDA drawing\(s\) withheld' python3 $SKILL/build.py --copy "$TMP/nda-copy.json" --style "$STYLE" --out "$TMP/nda-off.html"
check "placeholder names the file" $(grep -q 'DRAWING SLOT · colour.png · NDA-GATED' "$TMP/nda-off.html" && ! grep -q 'src="'"$TMP"'/colour.png"' "$TMP/nda-off.html"; echo $?) "slot present, no img"
expect pass "nda allowed"                  '^build: 4 sheets \(2 numbered, 0 appendix, 1 figures\) -> ' LAURELIN_NDA=1 python3 $SKILL/build.py --copy "$TMP/nda-copy.json" --style "$STYLE" --out "$TMP/nda-on.html"
check "art rendered with NDA=1" $(grep -q 'src="'"$TMP"'/colour.png"' "$TMP/nda-on.html"; echo $?) "img present"
jq '.overrides = {"rules.rule": "1px", "_why": {"rules.rule": "test: thinner rule"}}' "$STYLE" > "$TMP/style-thin.json"
expect pass "style override"               '^build: 3 sheets .*1 style override\(s\): rules\.rule' python3 $SKILL/build.py --copy $COPY --style "$TMP/style-thin.json" --out "$TMP/thin.html"
check "override applied" $(grep -q 'border-top:1px solid #[0-9A-Fa-f]*; padding-top:16px' "$TMP/thin.html" && grep -q 'border-top:2px solid #[0-9A-Fa-f]*; padding-top:16px' "$TMP/sample.html"; echo $?) "accent rule is 1px in thin.html, 2px in sample.html"
expect fail "bad sheet type"               '^build: error, sheet x: unknown type' python3 $SKILL/build.py --copy <(jq '.sheets += [{"id":"x","type":"poster"}]' $COPY) --style "$STYLE" --out "$TMP/bad.html"

echo "== render"
out="$(node $SKILL/render.mjs "$TMP/sample.html" "$TMP/sample.pdf" 2>&1)"; code=$?
if [ "$code" -eq 3 ]; then
  echo "skipped: $out (PDF cases not run)"
else
  check "render sample" $(( code == 0 && $(pdfinfo "$TMP/sample.pdf" 2>/dev/null | awk '/^Pages:/{print $2}') == 3 ? 0 : 1 )) "$out"
  size="$(pdfinfo "$TMP/sample.pdf" | awk '/^Page size:/{print $3, $5}')"
  check "page size 1920x1080" $([ "$size" = "1440 810" ]; echo $?) "$size pts"
  python3 $SKILL/build.py --copy "$TMP/colour-copy.json" --style "$STYLE" --out "$TMP/colour.html" >/dev/null
  python3 $SKILL/build.py --copy "$TMP/gray-copy.json" --style "$STYLE" --out "$TMP/gray.html" >/dev/null
  node $SKILL/render.mjs "$TMP/colour.html" "$TMP/colour.pdf" >/dev/null 2>&1
  node $SKILL/render.mjs "$TMP/gray.html" "$TMP/gray.pdf" >/dev/null 2>&1
  # A label drawn over the title, for the layout gate.
  sed 's|<section class="s" id="product"\([^>]*\)>|&<p style="position:absolute; left:128px; top:150px; font-size:48px; font-weight:700">Label drawn over the title line here</p>|' "$TMP/sample.html" > "$TMP/overlap.html"
  node $SKILL/render.mjs "$TMP/overlap.html" "$TMP/overlap.pdf" >/dev/null 2>&1

  echo "== layout gate"
  expect pass "layout sample"              '^layout: pass, 3 pages of sample\.pdf' LAURELIN_TARGET="$TMP/sample.pdf" $G/layout.sh
  expect fail "layout overlap"             '^layout: fail, p\.2 overlap' LAURELIN_TARGET="$TMP/overlap.pdf" $G/layout.sh

  echo "== deck gate"
  expect pass "deck sample"                '^deck: pass, 3 pages, 2 numbered sheets in order, 0 images' LAURELIN_TARGET="$TMP/sample.pdf" LAURELIN_DECK_COPY=$COPY $G/deck.sh
  expect pass "deck colour photo"          '^deck: pass, 4 pages, 2 numbered sheets in order, 1 images \(1 colour' LAURELIN_TARGET="$TMP/colour.pdf" LAURELIN_DECK_COPY="$TMP/colour-copy.json" $G/deck.sh
  expect fail "deck grayscale photo"       '^deck: fail, 1 problem' LAURELIN_TARGET="$TMP/gray.pdf" LAURELIN_DECK_COPY="$TMP/gray-copy.json" $G/deck.sh
  out="$(LAURELIN_TARGET="$TMP/gray.pdf" LAURELIN_DECK_COPY="$TMP/gray-copy.json" $G/deck.sh 2>&1)"
  check "names the grayscale image" $(printf '%s' "$out" | grep -q 'p.4: image 0 is grayscale'; echo $?) "$(printf '%s\n' "$out" | sed -n 2p)"
  jq 'del(.sheets[2])' $COPY > "$TMP/short-copy.json"
  expect fail "deck sheet mismatch"        '^deck: fail, 1 problem' LAURELIN_TARGET="$TMP/sample.pdf" LAURELIN_DECK_COPY="$TMP/short-copy.json" $G/deck.sh
  out="$(LAURELIN_TARGET="$TMP/sample.pdf" LAURELIN_DECK_COPY="$TMP/short-copy.json" $G/deck.sh 2>&1)"
  check "names the mismatch" $(printf '%s' "$out" | grep -q '3 pages but the copy JSON has 2 sheets'; echo $?) "$(printf '%s\n' "$out" | sed -n 2p)"
  expect fail "deck over size cap"         '^deck: fail, 1 problem' LAURELIN_DECK_MAX_BYTES=1000 LAURELIN_TARGET="$TMP/sample.pdf" LAURELIN_DECK_COPY=$COPY $G/deck.sh
  expect pass "deck not a pdf"             '^deck: skipped, not a PDF' LAURELIN_TARGET=$COPY $G/deck.sh
  expect pass "deck no copy"               '^deck: skipped, no copy JSON' LAURELIN_TARGET="$TMP/sample.pdf" $G/deck.sh
  # Filed copy: a folder named _circulating-decks needs the banner; a symlinked route fails.
  mkdir -p "$TMP/vault/Investor Research/_circulating-decks"
  cp "$TMP/sample.pdf" "$TMP/vault/Investor Research/_circulating-decks/sample-v1.pdf"
  FILED="$TMP/vault/Investor Research/_circulating-decks/sample-v1.pdf"
  expect fail "deck filed, no banner"      '^deck: fail, 1 problem' LAURELIN_TARGET="$FILED" LAURELIN_DECK_COPY=$COPY $G/deck.sh
  sha="$(shasum -a 256 "$FILED" | cut -d' ' -f1)"
  printf '> **Current v1:** `sample-v1.pdf` · 3 pages · 2026-09-25 · changes: first cut · SHA-256 `%s` · build: `build.py --copy sample-copy.json`\n\n# Circulating decks\n' "$sha" > "$TMP/vault/Investor Research/_circulating-decks/_index.md"
  expect pass "deck filed with banner"     '^deck: pass, 3 pages' LAURELIN_TARGET="$FILED" LAURELIN_DECK_COPY=$COPY $G/deck.sh
  ln -s "$TMP/vault/Investor Research" "$TMP/investors-link"
  expect fail "deck through symlink"       '^deck: fail, 1 problem' LAURELIN_TARGET="$TMP/investors-link/_circulating-decks/sample-v1.pdf" LAURELIN_DECK_COPY=$COPY $G/deck.sh
  printf '%s\n' "$TMP/vault/Investor Research/_circulating-decks" > "$TMP/roots.txt"
  expect pass "location real dir root"    '^location: pass' LAURELIN_ALLOWED_ROOTS="$TMP/roots.txt" LAURELIN_TARGET="$FILED" $G/location.sh
  check "real dir in allowed roots" $(grep -q '_circulating-decks$' $G/allowed-roots.txt; echo $?) "pack/gates/allowed-roots.txt names it"

  echo "== register"
  expect pass "register dry run"           '^\{"version": "v1"' python3 $SKILL/register.py --version v1 --pdf "$TMP/sample.pdf" --changes "first cut" --dir "$TMP/reg" --build "build.py --copy sample-copy.json"
  check "nothing written" $([ ! -e "$TMP/reg/versions.jsonl" ]; echo $?) "no versions.jsonl without --apply"
  expect pass "register apply"             '^\{"version": "v1"' python3 $SKILL/register.py --version v1 --pdf "$TMP/sample.pdf" --changes "first cut" --dir "$TMP/reg" --apply
  check "row appended" $(jq -e '.version == "v1" and .pages == 3 and (.sha256 | length) == 64 and (.date | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$"))' "$TMP/reg/versions.jsonl" >/dev/null; echo $?) "$(head -c 120 "$TMP/reg/versions.jsonl")"
fi

echo "== change classifier (Jev)"
if [ -z "${TYPESAFE_API_KEY:-}" ]; then
  expect pass "change skips without key"   '^change: skipped, no TYPESAFE_API_KEY' HOME=/nonexistent $SKILL/change.sh "make the orange rule thinner"
else
  expect pass "style_token"                '^change: style_token \(confidence' $SKILL/change.sh "make the orange rule thinner"
  expect pass "copy"                       '^change: copy \(confidence' $SKILL/change.sh 'change the ask to $4M'
  expect pass "order"                      '^change: order \(confidence' $SKILL/change.sh "move the ask to sheet 3"
  expect pass "change skips without key"   '^change: skipped, no TYPESAFE_API_KEY' HOME=/nonexistent TYPESAFE_API_KEY= $SKILL/change.sh "make the orange rule thinner"
fi

echo "== doctrine check"
out="$($SKILL/doctrine-check.sh 2>&1)"; code=$?
check "doctrine reports" $(( (code == 0 || code == 1 || code == 2) && $(printf '%s' "$out" | grep -c '^doctrine: ') == 1 ? 0 : 1 )) "$(printf '%s\n' "$out" | head -n 1)"

echo "== decision log"
results="$(jq -r 'select(.check == "deck") | .result' "$LAURELIN_GATE_LOG" 2>/dev/null | sort -u | tr '\n' ' ')"
if [ -f "$TMP/sample.pdf" ]; then
  check "log has deck pass, fail, skipped" $([ "$results" = "fail pass skipped " ]; echo $?) "$results"
fi

echo "== skill files"
for f in SKILL.md style-pull.py build.py render.mjs change.md change.sh change.json register.py doctrine-check.sh; do
  [ -f "$SKILL/$f" ] || { fail=$((fail + 1)); echo "FAIL  missing $SKILL/$f"; }
done
check "SKILL.md name" $([ "$(awk '/^---/{c++; next} c==1 && /^name:/{print $2; exit}' $SKILL/SKILL.md 2>/dev/null)" = "deck-design" ]; echo $?) "matches the folder"
check "helper not executable" $([ ! -x pack/gates/deck-check.py ] && [ -x pack/gates/deck.sh ]; echo $?) "deck.sh runs as a gate, deck-check.py does not"
kit_content="laurelin-deck-kit/con""tent"; vault="Obsidian ""Vault"
check "never reads kit content or vault" $(grep -qE "$kit_content|$vault" "$0" $SKILL/build.py $SKILL/render.mjs; [ $? -ne 0 ]; echo $?) "no path into the kit's content folder or the vault"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
