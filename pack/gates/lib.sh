#!/usr/bin/env bash
# Shared helpers for the Laurelin gates. Source this file from a gate; do not run it.
#
# A gate is one executable that Prime runs as `--autonomous-gate <path>`.
# It exits 0 on pass and 1 on fail, prints one line saying which check and why,
# and appends one JSON line to decision-log/gates.jsonl (gitignored).
#
# Environment a gate reads:
#   LAURELIN_TARGET       file or folder to check. Unset: the task file, then the newest changed
#                         file in the git worktree.
#   LAURELIN_CLAIM        the claim of done (evidence gate). Unset: the task file.
#   LAURELIN_ORIGINAL     a file of Joe's text (verbatim gate). Unset: the task file.
#   .laurelin/task.json   the task file, in the working directory, written by the set_task tool
#                         or by `laurelin --target --claim`. Keys: target, claim, original.
#   A gate whose input is still missing prints `<check>: skipped, no <input>` and exits 0.
#   LAURELIN_GATE_LOG     where the JSON lines go. Default: <repo>/decision-log/gates.jsonl
#   GSTACK_HOME           where gstack keeps its state. Default: ~/.gstack

GATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$GATE_DIR/../.." && pwd)"
GATE_LOG="${LAURELIN_GATE_LOG:-$REPO_ROOT/decision-log/gates.jsonl}"
GSTACK_BIN="$HOME/.claude/skills/gstack/bin"
JEV_THRESHOLD="${LAURELIN_JEV_THRESHOLD:-0.6}"

TASK_FILE="$PWD/.laurelin/task.json"

# gate_task_env: fill LAURELIN_TARGET, LAURELIN_CLAIM and LAURELIN_ORIGINAL from the task file
# when the variable is unset. Relative paths in the file count from the working directory.
gate_task_env() {
  [ -f "$TASK_FILE" ] || return 0
  local v
  if [ -z "${LAURELIN_TARGET:-}" ]; then
    v="$(jq -r '.target // empty' "$TASK_FILE" 2>/dev/null)"
    [ -n "$v" ] && export LAURELIN_TARGET="$(gate_task_path "$v")"
  fi
  if [ -z "${LAURELIN_ORIGINAL:-}" ]; then
    v="$(jq -r '.original // empty' "$TASK_FILE" 2>/dev/null)"
    [ -n "$v" ] && export LAURELIN_ORIGINAL="$(gate_task_path "$v")"
  fi
  if [ -z "${LAURELIN_CLAIM:-}" ]; then
    v="$(jq -r '.claim // empty' "$TASK_FILE" 2>/dev/null)"
    [ -n "$v" ] && export LAURELIN_CLAIM="$v"
  fi
  return 0
}

gate_task_path() { case "$1" in /*) printf '%s\n' "$1" ;; *) printf '%s/%s\n' "$PWD" "$1" ;; esac; }

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

# gate_skip CHECK INPUT: nobody gave this input, so the check cannot run. Log it, exit 0.
# A run must not fail for an input nobody gave it.
gate_skip() {
  gate_log "$1" '{}' "" "no $2" 0 skipped
  printf '%s: skipped, no %s\n' "$1" "$2"
  exit 0
}

# gate_jev_noul REQUEST_JSON QUESTION_ID: print P(yes) for one noul question, or return 1.
gate_jev_noul() {
  local raw
  raw="$(printf '%s' "$1" | jev --raw 2>&1)" || { printf '%s\n' "$raw" | head -n 1; return 1; }
  printf '%s' "$raw" | jq -er --arg q "$2" '.answers[$q].noul' 2>/dev/null
}

gate_task_env
