#!/usr/bin/env bash
# Shared helpers for the Laurelin gates. Source this file from a gate; do not run it.
#
# A gate is one executable that Prime runs as `--autonomous-gate <path>`.
# It exits 0 on pass and 1 on fail, prints one line saying which check and why,
# and appends one JSON line to decision-log/gates.jsonl (gitignored).
#
# Environment a gate reads:
#   LAURELIN_TARGET       file or folder to check. Unset: newest changed file in the git worktree.
#   LAURELIN_GATE_LOG     where the JSON lines go. Default: <repo>/decision-log/gates.jsonl
#   GSTACK_HOME           where gstack keeps its state. Default: ~/.gstack

GATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$GATE_DIR/../.." && pwd)"
GATE_LOG="${LAURELIN_GATE_LOG:-$REPO_ROOT/decision-log/gates.jsonl}"
GSTACK_BIN="$HOME/.claude/skills/gstack/bin"
JEV_THRESHOLD="${LAURELIN_JEV_THRESHOLD:-0.6}"

# gate_target: print the path to check, or return 1 when there is none.
gate_target() {
  if [ -n "${LAURELIN_TARGET:-}" ]; then
    printf '%s\n' "$LAURELIN_TARGET"
    return 0
  fi
  local newest
  newest="$(cd "$REPO_ROOT" && {
      git ls-files -m -o --exclude-standard -z 2>/dev/null
      git diff --cached --name-only -z 2>/dev/null
    } | tr '\0' '\n' | sort -u | while IFS= read -r p; do
      [ -f "$p" ] && printf '%s\t%s\n' "$(stat -f %m "$p")" "$p"
    done | sort -rn | head -n 1 | cut -f2-)"
  [ -n "$newest" ] || return 1
  printf '%s/%s\n' "$REPO_ROOT" "$newest"
}

# gate_prose_files TARGET: list the .md, .txt and .tex files under TARGET (or TARGET itself).
gate_prose_files() {
  if [ -d "$1" ]; then
    find "$1" -type f \( -name '*.md' -o -name '*.txt' -o -name '*.tex' \) | sort
  elif [ -f "$1" ]; then
    case "$1" in *.md|*.txt|*.tex) printf '%s\n' "$1" ;; esac
  fi
}

# gate_log CHECK INPUTS_JSON QUESTION ANSWER CONFIDENCE RESULT
gate_log() {
  mkdir -p "$(dirname "$GATE_LOG")"
  jq -nc --arg check "$1" --argjson inputs "$2" --arg question "$3" \
         --arg answer "$4" --arg confidence "$5" --arg result "$6" \
    '{ts: (now | todate), check: $check, inputs: $inputs, question: $question,
      answer: $answer, confidence: ($confidence | tonumber), result: $result}' >> "$GATE_LOG"
}

# gate_pass CHECK WHY  /  gate_fail CHECK WHY: print the one line and exit.
gate_pass() { printf '%s: pass, %s\n' "$1" "$2"; exit 0; }
gate_fail() { printf '%s: fail, %s\n' "$1" "$2"; exit 1; }

# gate_jev_noul REQUEST_JSON QUESTION_ID: print P(yes) for one noul question, or return 1.
gate_jev_noul() {
  local raw
  raw="$(printf '%s' "$1" | jev --raw 2>&1)" || { printf '%s\n' "$raw" | head -n 1; return 1; }
  printf '%s' "$raw" | jq -er --arg q "$2" '.answers[$q].noul' 2>/dev/null
}
