#!/usr/bin/env bash
# Test for the investor-research piece (docs/briefs/investor-research.md).
# Builds a throwaway investors root under tests/tmp/investor-research from the skill's
# templates, with two invented firms and invented people on example.com domains. Then:
#   1. the validator passes on the good tree (and accepts Index.md with a note);
#   2. it fails on a tree where a person note lost its backlink;
#   3. it fails on a tree with an undated fact;
#   4. it fails on a tree where a person note lost its roster link and an email lacks a status;
#   5. it skips when the target is not an investors root;
#   6. the fit question set runs through Jev on a synthetic description and returns a grade
#      with a confidence (skips cleanly without TYPESAFE_API_KEY);
#   7. triage ranks the two firms without sending anything.
# It never reads the vault or ~/Laurelin_Investors. Run from anywhere: tests/test-investor-research.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [ -f "$HOME/.config/agent-keys/env" ]; then set -a; . "$HOME/.config/agent-keys/env"; set +a; fi
export PATH="$HOME/.local/bin:$PATH"

TMP="$ROOT/tests/tmp/investor-research"
rm -rf "$TMP" && mkdir -p "$TMP"
export LAURELIN_GATE_LOG="$TMP/gates.jsonl"
G=pack/gates/investors.sh
SKILL=pack/skills/investor-research
T=$SKILL/templates
pass=0; fail=0

# expect pass|fail NAME FIRST_LINE_REGEX [VAR=value ...] COMMAND
expect() {
  local want="$1" name="$2" re="$3"; shift 3
  local out code first got=fail
  out="$(env "$@" 2>&1)"; code=$?
  first="$(printf '%s\n' "$out" | head -n 1)"
  [ "$code" -eq 0 ] && got=pass
  if [ "$got" = "$want" ] && printf '%s' "$first" | grep -qE "$re"; then
    pass=$((pass + 1)); printf 'ok    %-26s %s\n' "$name" "$first"
  else
    fail=$((fail + 1)); printf 'FAIL  %-26s wanted %s matching /%s/, got exit %s:\n%s\n' "$name" "$want" "$re" "$code" "$out"
  fi
}

# fill TEMPLATE OUT FIRM PERSON ROLE: substitute the placeholders with invented values.
fill() {
  sed -e "s|<Firm>|$3|g" -e "s|<Person>|$4|g" -e "s|<Role>|$5|g" \
      -e "s|<Source dossier note>|Example list — 2026-09-01|g" \
      -e "s|YYYY-MM-DD|2026-09-25|g" \
      -e "s|<url or not publicly verified>|https://www.example.com/$6|g" \
      -e "s|<domain or not publicly verified>|example.com|g" \
      -e "s|<url>|https://www.example.com/$6|g" \
      -e "s|<[^!>][^>]*>|placeholder|g" "$1" > "$2"
}

# One firm folder from the templates: index, one person, deck guidance, work log.
firm() {  # firm ROOT NAME PERSON SLUG
  local d="$1/$2"; mkdir -p "$d"
  fill "$T/_index.md" "$d/_index.md" "$2" "$3" "General Partner" "$4"
  fill "$T/Person.md" "$d/$3.md" "$2" "$3" "General Partner" "$4"
  fill "$T/Deck Guidance - Firm.md" "$d/Deck Guidance - $2.md" "$2" "$3" "General Partner" "$4"
  fill "$T/WORK-LOG.md" "$d/WORK-LOG 2026-09-25 — research.md" "$2" "$3" "General Partner" "$4"
}

good="$TMP/good"; mkdir -p "$good"
firm "$good" "Quillon Frontier Capital" "Marisol Venn" "quillon"
firm "$good" "Halcyon Bay Partners" "Teodor Lisk" "halcyon"
# A verified address on a person note: allowed because email_status is in the frontmatter.
sed -i '' 's|^email_status: "not verified"|email: teodor@example.com\nemail_status: "Hunter score 96, verified 2026-09-25"|' "$good/Halcyon Bay Partners/Teodor Lisk.md"
# A source dossier at the top level (a file, not a firm folder) and a category folder.
fill "$T/Source Dossier.md" "$good/Example list — 2026-09-01.md" "Quillon Frontier Capital" "Marisol Venn" "" "list"
mkdir -p "$good/Example Lists"
printf -- '---\ntags: [investor-research, source-list, category-index]\nstatus: source container — not a firm\nupdated: 2026-09-25\n---\n# Example lists\nNot a firm.\n' > "$good/Example Lists/_index.md"

echo "== validator"
expect pass "good tree"            '^investors: pass, 3 firms \(1 categories\), 2 people, [0-9]+ sourced facts, all linked both ways' LAURELIN_TARGET="$good" $G
expect pass "good firm folder"     '^investors: pass, 1 firms \(0 categories\), 1 people'  LAURELIN_TARGET="$good/Quillon Frontier Capital" $G
expect pass "good person file"     '^investors: pass, 1 firms'                            LAURELIN_TARGET="$good/Quillon Frontier Capital/Marisol Venn.md" $G

variant="$TMP/variant"; cp -R "$good" "$variant"; mv "$variant/Halcyon Bay Partners/_index.md" "$variant/Halcyon Bay Partners/Index.md"
expect pass "Index.md reported"    '^investors: pass, .*1 notes'                          LAURELIN_TARGET="$variant" $G

nobacklink="$TMP/no-backlink"; cp -R "$good" "$nobacklink"
sed -i '' 's|\[\[Quillon Frontier Capital/_index|[[Quillon Frontier Capital/People|g' "$nobacklink/Quillon Frontier Capital/Marisol Venn.md"
expect fail "missing backlink"     '^investors: fail, 1 problems'                         LAURELIN_TARGET="$nobacklink" $G
out="$(LAURELIN_TARGET="$nobacklink" $G 2>&1)"
if printf '%s' "$out" | grep -q 'Marisol Venn.md: no link back to the firm index'; then
  pass=$((pass + 1)); echo "ok    names the backlink         $(printf '%s\n' "$out" | sed -n 2p)"
else
  fail=$((fail + 1)); echo "FAIL  names the backlink: $out"
fi

undated="$TMP/undated"; cp -R "$good" "$undated"
printf -- '\n## Portfolio\n\n- Backed a battery company, see https://www.example.com/portfolio\n' >> "$undated/Halcyon Bay Partners/_index.md"
expect fail "undated fact"         '^investors: fail, 1 problems'                         LAURELIN_TARGET="$undated" $G
out="$(LAURELIN_TARGET="$undated" $G 2>&1)"
if printf '%s' "$out" | grep -q '_index.md:[0-9]*: fact with a URL and no date'; then
  pass=$((pass + 1)); echo "ok    names the undated line     $(printf '%s\n' "$out" | sed -n 2p)"
else
  fail=$((fail + 1)); echo "FAIL  names the undated line: $out"
fi

unlinked="$TMP/unlinked"; cp -R "$good" "$unlinked"
sed -i '' '/investor-people:start/,/investor-people:end/{/Marisol Venn/d;}' "$unlinked/Quillon Frontier Capital/_index.md"
sed -i '' 's|^email_status: .*$|email: marisol@example.com|' "$unlinked/Quillon Frontier Capital/Marisol Venn.md"
expect fail "roster and email"     '^investors: fail, 2 problems'                         LAURELIN_TARGET="$unlinked" $G
out="$(LAURELIN_TARGET="$unlinked" $G 2>&1)"
if printf '%s' "$out" | grep -q 'not linked from the people block' && printf '%s' "$out" | grep -q 'email without email_status'; then
  pass=$((pass + 1)); echo "ok    names both problems"
else
  fail=$((fail + 1)); echo "FAIL  names both problems: $out"
fi

missing="$TMP/missing-index"; cp -R "$good" "$missing"; rm "$missing/Quillon Frontier Capital/_index.md"
expect fail "missing index"        '^investors: fail, [0-9]+ problems'                    LAURELIN_TARGET="$missing" $G

mkdir -p "$TMP/not-a-root/notes"; printf 'hello\n' > "$TMP/not-a-root/notes/a.md"
expect pass "not an investors root" '^investors: skipped, not an investors root'          LAURELIN_TARGET="$TMP/not-a-root" $G

echo "== fit (Jev)"
printf '%s\n' "A seed fund that writes first checks of about half a million into hardware companies. Its site names fusion and advanced nuclear as themes. A shared contact knows one partner. Stage: pre-seed and seed. No fee is mentioned." > "$TMP/fit-good.txt"
printf '%s\n' "An advisory group that connects founders with investors for a monthly retainer and a success fee on any money raised. It does not invest its own capital." > "$TMP/fit-landmine.txt"
if [ -z "${TYPESAFE_API_KEY:-}" ]; then
  expect pass "fit skips without key" '^fit: skipped, no TYPESAFE_API_KEY' HOME=/nonexistent $SKILL/fit.sh "$TMP/fit-good.txt"
else
  expect pass "fit grade"            '^laurelin_fit: [ABCD] \(confidence 0\.[0-9]+\), landmine: no'  $SKILL/fit.sh "$TMP/fit-good.txt"
  expect pass "fit landmine"         '^laurelin_fit: .*landmine: yes'                              $SKILL/fit.sh "$TMP/fit-landmine.txt"
  expect pass "fit json"             '^\{'                                                          $SKILL/fit.sh "$TMP/fit-good.txt" --json
  expect pass "fit skips without key" '^fit: skipped, no TYPESAFE_API_KEY' HOME=/nonexistent TYPESAFE_API_KEY= $SKILL/fit.sh "$TMP/fit-good.txt"
fi

echo "== triage"
sed -i '' 's|^status: new|status: waiting-on-them|; s|^updated: 2026-09-25|updated: 2026-08-01|' "$good/Halcyon Bay Partners/_index.md"
expect pass "triage table"         '^triage: 2 firms'                                     $SKILL/triage.sh "$good"
out="$($SKILL/triage.sh "$good" 2>&1)"
if printf '%s' "$out" | grep -q 'Halcyon Bay Partners' && printf '%s' "$out" | grep -q 'Quillon Frontier Capital' \
   && ! printf '%s' "$out" | grep -qi 'sent\b.*to\|sending'; then
  pass=$((pass + 1)); echo "ok    lists both firms, sends nothing"
else
  fail=$((fail + 1)); echo "FAIL  triage output: $out"
fi

echo "== decision log"
n="$(jq -r 'select(.check == "investors") | .result' "$LAURELIN_GATE_LOG" 2>/dev/null | sort | uniq -c | tr -s ' ' | tr '\n' ';')"
if jq -e 'select(.check == "investors" and .result == "pass")' "$LAURELIN_GATE_LOG" >/dev/null 2>&1 \
   && jq -e 'select(.check == "investors" and .result == "fail")' "$LAURELIN_GATE_LOG" >/dev/null 2>&1 \
   && jq -e 'select(.check == "investors" and .result == "skipped")' "$LAURELIN_GATE_LOG" >/dev/null 2>&1; then
  pass=$((pass + 1)); echo "ok    log has pass, fail and skipped rows: $n"
else
  fail=$((fail + 1)); echo "FAIL  log rows: $n"
fi

echo "== skill files"
for f in SKILL.md fit.md fit.json fit.sh status.md triage.md triage.sh templates/_index.md templates/Person.md \
         "templates/Deck Guidance - Firm.md" templates/WORK-LOG.md "templates/Source Dossier.md"; do
  [ -f "$SKILL/$f" ] || { fail=$((fail + 1)); echo "FAIL  missing $SKILL/$f"; }
done
if [ "$(awk '/^---/{c++; next} c==1 && /^name:/{print $2; exit}' $SKILL/SKILL.md)" = "investor-research" ]; then
  pass=$((pass + 1)); echo "ok    SKILL.md name matches the folder"
else
  fail=$((fail + 1)); echo "FAIL  SKILL.md name"
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
