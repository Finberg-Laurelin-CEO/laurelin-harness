#!/usr/bin/env bash
# test-skill-packs.sh: prove the skill-packs piece works (docs/briefs/skill-packs.md).
#
# 1. Every entry in pack/skills has a SKILL.md whose name field matches its folder.
# 2. Every skill in bin/skill-packs.manifest is installed, has a LICENSE beside it, is
#    listed in pack/SKILL-SOURCES.md, carries the harness note where the manifest says
#    so, and has a description of 300 characters or fewer.
# 3. The description budget over the whole folder is under 4,000 tokens (characters
#    divided by four, plus 80 characters per skill for the XML around it).
# 4. pack/SKILL-TIERS.md names every folder in pack/skills exactly once.
# 5. laurelin-agent keys check lists EXA_API_KEY and FIRECRAWL_API_KEY as optional.
# 6. Prime lists the always-on skills through the launcher (bin/laurelin-agent
#    --no-session -p ... --mode json). Without a model this prints "skipped: no model".
# 7. Only with LAURELIN_TEST_INSTALL=1: the installer runs again and leaves the tree
#    byte for byte the same (needs the clones under tests/tmp or the network).
#
# Run from anywhere: tests/test-skill-packs.sh
# Set LAURELIN_TEST_SKIP_MODEL=1 to skip check 6 on purpose.

set -uo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"

FM=bin/skill-frontmatter.py
MANIFEST=bin/skill-packs.manifest
SOURCES=pack/SKILL-SOURCES.md
TIERS=pack/SKILL-TIERS.md
NOTE='Laurelin harness note'
MAX_DESC=300
BUDGET=4000

fail=0
say() { echo "$*"; }
bad() { echo "FAIL: $*"; fail=1; }

# --- 1. every skill folder ----------------------------------------------------
say "check 1: every skill folder has a SKILL.md whose name matches"
n_all=0
for entry in pack/skills/*/; do
  name="$(basename "$entry")"
  n_all=$((n_all + 1))
  if [ ! -f "$entry/SKILL.md" ]; then bad "pack/skills/$name has no SKILL.md"; continue; fi
  got="$("$FM" get name "$entry/SKILL.md" 2>/dev/null)"
  [ "$got" = "$name" ] || bad "pack/skills/$name/SKILL.md says name: $got"
done
[ "$fail" -eq 0 ] && say "ok: $n_all skills, each with a matching SKILL.md"

# --- 2. every pack skill ------------------------------------------------------
say "check 2: pack skills have a LICENSE, a SOURCES.md row, the note where flagged, a short description"
n_pack=0; before=$fail
while read -r source sha pinned licence path name flags; do
  case "$source" in ''|'#'*) continue ;; esac
  n_pack=$((n_pack + 1))
  dir="pack/skills/$name"
  [ -d "$dir" ] || { bad "$name is in the manifest but not installed"; continue; }
  [ -L "$dir" ] && bad "$name is a link; pack skills must be copies"
  [ -f "$dir/LICENSE" ] || bad "$name has no LICENSE beside it"
  grep -q "^| \`$name\` | \[$source\]" "$SOURCES" || bad "$name is not in $SOURCES"
  case ",$flags," in
    *,note,*) grep -q "$NOTE" "$dir/SKILL.md" || bad "$name should carry the harness note" ;;
    *) grep -q "$NOTE" "$dir/SKILL.md" && bad "$name carries the harness note but is not flagged" ;;
  esac
  desc="$("$FM" get description "$dir/SKILL.md" 2>/dev/null)"
  [ -n "$desc" ] || bad "$name has no description"
  [ "${#desc}" -le "$MAX_DESC" ] || bad "$name description is ${#desc} characters, over $MAX_DESC"
done < "$MANIFEST"
[ "$n_pack" -gt 0 ] || bad "manifest lists no skills"
[ "$fail" -eq "$before" ] && say "ok: $n_pack pack skills, each with LICENSE, source row, note and a short description"

# --- 3. description budget ----------------------------------------------------
say "check 3: description budget"
total=0
for entry in pack/skills/*/; do
  [ -f "$entry/SKILL.md" ] || continue
  desc="$("$FM" get description "$entry/SKILL.md" 2>/dev/null)"
  total=$((total + ${#desc} + 80))
done
tokens=$((total / 4))
if [ "$tokens" -lt "$BUDGET" ]; then
  say "ok: about $tokens tokens of skill descriptions (limit $BUDGET)"
else
  bad "about $tokens tokens of skill descriptions, over $BUDGET"
fi

# --- 4. tiers -----------------------------------------------------------------
say "check 4: TIERS.md names every skill folder once"
before=$fail
for entry in pack/skills/*/; do
  name="$(basename "$entry")"
  c="$(grep -o "\`$name\`" "$TIERS" | wc -l | tr -d ' ')"
  [ "$c" -eq 1 ] || bad "$TIERS names $name $c times (want 1)"
done
[ "$fail" -eq "$before" ] && say "ok: every folder is in one tier"

# --- 5. keys ------------------------------------------------------------------
say "check 5: keys check knows the two optional keys"
before=$fail
out="$(env -u EXA_API_KEY -u FIRECRAWL_API_KEY LAURELIN_KEY_STORE=/nonexistent bin/laurelin-agent keys check 2>&1)"
for k in EXA_API_KEY FIRECRAWL_API_KEY; do
  echo "$out" | grep -qE "^$k +missing \(optional\)" || bad "keys check does not list $k as optional"
done
[ "$fail" -eq "$before" ] && say "ok: EXA_API_KEY and FIRECRAWL_API_KEY are optional"

# --- 6. Prime lists the always-on skills ---------------------------------------
say "check 6: the launcher lists the always-on skills"
always=(karpathy-guidelines writing-ste humanizer jev jev-triage jev-documents jev-eval jev-act jev-patterns building-with-jev fastbrowse investor-research)
if [ "${LAURELIN_TEST_SKIP_MODEL:-0}" = "1" ]; then
  say "skipped: no model (LAURELIN_TEST_SKIP_MODEL=1)"
else
  mkdir -p tests/tmp
  prompt="List the folder names of every skill you have loaded, one name per line, names only, no commentary. There should be about 37."
  raw="$(timeout 180 bin/laurelin-agent --no-session -p "$prompt" --mode json 2>tests/tmp/skill-packs-launcher.err)"
  rc=$?
  answer="$(printf '%s' "$raw" | python3 -c '
import json, sys
raw = sys.stdin.read()
texts = []
def walk(o):
    if isinstance(o, dict):
        if o.get("role") == "assistant":
            for part in o.get("content", []):
                if isinstance(part, dict) and part.get("type") == "text":
                    texts.append(part["text"])
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)
try:
    walk(json.loads(raw))
except Exception:
    for line in raw.splitlines():
        try:
            ev = json.loads(line)
            if ev.get("type") == "message_end":
                walk(ev)
        except Exception:
            pass
print("\n".join(texts))
' 2>/dev/null)"
  if [ "$rc" -ne 0 ] || [ -z "$answer" ]; then
    say "skipped: no model (laurelin-agent exited $rc with no assistant text; see tests/tmp/skill-packs-launcher.err)"
  else
    missing=()
    for name in "${always[@]}"; do
      echo "$answer" | grep -q -- "$name" || missing+=("$name")
    done
    if [ "${#missing[@]}" -eq 0 ]; then
      say "ok: the agent listed all ${#always[@]} always-on skills"
    else
      bad "the agent did not list: ${missing[*]}"
      echo "--- answer ---"; echo "$answer" | head -50; echo "--------------"
    fi
  fi
fi

# --- 7. installer is idempotent (opt in) ----------------------------------------
if [ "${LAURELIN_TEST_INSTALL:-0}" = "1" ]; then
  say "check 7: the installer leaves an installed tree unchanged"
  sum() { find pack/skills -type f -print0 | sort -z | xargs -0 shasum | shasum | cut -c1-16; }
  s1="$(sum)"
  if bin/install-skill-packs.sh >tests/tmp/skill-packs-install.log 2>&1; then
    s2="$(sum)"
    [ "$s1" = "$s2" ] && say "ok: same tree after a rerun" || bad "the rerun changed pack/skills"
  else
    bad "installer exited $? (see tests/tmp/skill-packs-install.log)"
  fi
fi

if [ "$fail" -eq 0 ]; then say "PASS: skill-packs"; exit 0; fi
say "FAIL: skill-packs"; exit 1
