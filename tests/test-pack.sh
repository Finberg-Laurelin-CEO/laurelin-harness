#!/usr/bin/env bash
# test-pack.sh: prove the pack piece works (docs/briefs/pack.md).
#
# 1. Every entry in pack/skills has a SKILL.md whose name matches the folder,
#    and all twelve expected skills are present.
# 2. bin/link-skills.sh in dry-run mode exits 0, prints a plan, and prints no
#    error line.
# 3. prime-agent -e ./pack -p "..." --mode json lists the twelve skills. If Prime
#    cannot make a model call, this check prints "skipped: no model" and the test
#    passes on the first two.
#
# Run from anywhere: tests/test-pack.sh
# Set LAURELIN_TEST_SKIP_MODEL=1 to skip check 3 on purpose.

set -uo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"

expected=(
  writing-ste humanizer laurelin-reactor-calcs fastbrowse sync-gbrain
  jev jev-triage jev-documents jev-eval jev-act jev-patterns building-with-jev
)

fail=0
say() { echo "$*"; }
bad() { echo "FAIL: $*"; fail=1; }

# --- 1. skill folders -------------------------------------------------------
say "check 1: skill folders"
for name in "${expected[@]}"; do
  dir="pack/skills/$name"
  if [ ! -e "$dir/SKILL.md" ]; then
    bad "$dir has no SKILL.md"
    continue
  fi
  fm="$(awk '/^---/{c++; next} c==1 && /^name:/{print $2; exit}' "$dir/SKILL.md")"
  if [ "$fm" != "$name" ]; then
    bad "$dir/SKILL.md says name: $fm"
  fi
done
for entry in pack/skills/*/; do
  name="$(basename "$entry")"
  [ -e "$entry/SKILL.md" ] || bad "pack/skills/$name has no SKILL.md"
done
[ "$fail" -eq 0 ] && say "ok: ${#expected[@]} skills, each with a SKILL.md that matches its folder"

# --- 2. link script dry run -------------------------------------------------
say "check 2: link script dry run"
out="$(bin/link-skills.sh 2>&1)"
rc=$?
if [ "$rc" -ne 0 ]; then
  bad "bin/link-skills.sh exited $rc"
  echo "$out" | tail -5
elif echo "$out" | grep -q '^error'; then
  bad "bin/link-skills.sh printed an error line"
  echo "$out" | grep '^error'
elif ! echo "$out" | grep -qE '^(plan|ok):'; then
  bad "bin/link-skills.sh printed no plan"
else
  say "ok: $(echo "$out" | tail -1)"
fi

# --- 3. Prime lists the skills ----------------------------------------------
say "check 3: prime-agent lists the skills"
if [ "${LAURELIN_TEST_SKIP_MODEL:-0}" = "1" ]; then
  say "skipped: no model (LAURELIN_TEST_SKIP_MODEL=1)"
elif ! command -v prime-agent >/dev/null 2>&1; then
  say "skipped: no model (prime-agent is not on PATH)"
else
  [ -f "$HOME/.config/agent-keys/env" ] && . "$HOME/.config/agent-keys/env"
  prompt="List the Laurelin skills you have. Print each skill name exactly as given, one per line, nothing else."
  raw="$(timeout 180 prime-agent -e ./pack -p "$prompt" --mode json 2>/dev/null)"
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
            walk(json.loads(line))
        except Exception:
            pass
print("\n".join(texts))
' 2>/dev/null)"
  if [ "$rc" -ne 0 ] || [ -z "$answer" ]; then
    say "skipped: no model (prime-agent exited $rc with no assistant text)"
  else
    missing=()
    for name in "${expected[@]}"; do
      echo "$answer" | grep -q -- "$name" || missing+=("$name")
    done
    if [ "${#missing[@]}" -eq 0 ]; then
      say "ok: Prime listed all ${#expected[@]} skills"
    else
      bad "Prime did not list: ${missing[*]}"
      echo "--- answer ---"; echo "$answer" | head -40; echo "--------------"
    fi
  fi
fi

if [ "$fail" -eq 0 ]; then
  say "PASS: pack"
  exit 0
fi
say "FAIL: pack"
exit 1
