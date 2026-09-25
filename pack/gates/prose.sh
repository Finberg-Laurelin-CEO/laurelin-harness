#!/usr/bin/env bash
# prose gate: every .md, .txt and .tex file in the target passes jev-sweep with no hit.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CHECK=prose
export PATH="$HOME/.local/bin:$PATH"

target="$(gate_target)" || gate_skip "$CHECK" target
[ -e "$target" ] || gate_fail "$CHECK" "target does not exist: $target"

files="$(gate_prose_files "$target")"
if [ -z "$files" ]; then
  gate_log "$CHECK" "$(jq -nc --arg t "$target" '{target: $t, files: []}')" \
    "jev-sweep finds no house-rule hit in any prose file" "no prose files" 1 pass
  gate_pass "$CHECK" "no prose files under $target"
fi

total_hits=0
top_p=0
top_maybe=0
hit_lines=""
checked=0
while IFS= read -r f; do
  out="$(jev-sweep "$f" 2>&1)" || gate_fail "$CHECK" "jev-sweep error on $f: $(printf '%s' "$out" | tail -n 1)"
  checked=$((checked + 1))
  n="$(printf '%s\n' "$out" | sed -nE 's/^.*: [0-9]+ units, ([0-9]+) hits, .*/\1/p' | tail -n 1)"
  total_hits=$((total_hits + ${n:-0}))
  hits="$(printf '%s\n' "$out" | awk '/^== HITS/{h=1; next} /^== MAYBE/{h=0} h && /^  \[/ {print}')"
  maybes="$(printf '%s\n' "$out" | awk '/^== MAYBE/{h=1; next} h && /^  \[/ {print}')"
  if [ -n "$hits" ]; then
    hit_lines="${hit_lines}$(printf '%s\n' "$hits" | sed "s|^  |  $(basename "$f"): |")"$'\n'
    p="$(printf '%s\n' "$hits" | head -n 1 | sed -nE 's/^  \[[a-z_]+ ([0-9.]+)\].*/\1/p')"
    top_p="$(printf '%s %s\n' "$top_p" "${p:-0}" | awk '{print ($2 > $1) ? $2 : $1}')"
  fi
  if [ -n "$maybes" ]; then
    p="$(printf '%s\n' "$maybes" | head -n 1 | sed -nE 's/^  \[[a-z_]+ ([0-9.]+)\].*/\1/p')"
    top_maybe="$(printf '%s %s\n' "$top_maybe" "${p:-0}" | awk '{print ($2 > $1) ? $2 : $1}')"
  fi
done <<< "$files"

inputs="$(jq -nc --arg t "$target" --argjson n "$checked" --argjson h "$total_hits" '{target: $t, files_checked: $n, hits: $h}')"
question="jev-sweep finds no house-rule hit in any prose file"
if [ "$total_hits" -gt 0 ]; then
  gate_log "$CHECK" "$inputs" "$question" "$total_hits hits" "$top_p" fail
  printf '%s: fail, %s hits in %s files, first three:\n' "$CHECK" "$total_hits" "$checked"
  printf '%s' "$hit_lines" | head -n 3
  exit 1
fi
conf="$(printf '%s\n' "$top_maybe" | awk '{printf "%.2f", 1 - $1}')"
gate_log "$CHECK" "$inputs" "$question" "0 hits" "$conf" pass
gate_pass "$CHECK" "0 hits in $checked files under $target"
