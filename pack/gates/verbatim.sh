#!/usr/bin/env bash
# verbatim gate: every sentence of LAURELIN_ORIGINAL (Joe's text) appears unchanged in the target.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CHECK=verbatim

original="${LAURELIN_ORIGINAL:-}"
[ -n "$original" ] || gate_fail "$CHECK" "LAURELIN_ORIGINAL not set (a file of Joe's text)"
[ -f "$original" ] || gate_fail "$CHECK" "original file does not exist: $original"
target="$(gate_target)" || gate_fail "$CHECK" "no target: set LAURELIN_TARGET or change a file in the worktree"
[ -e "$target" ] || gate_fail "$CHECK" "target does not exist: $target"

if [ -d "$target" ]; then
  files="$(gate_prose_files "$target")"
  [ -n "$files" ] || gate_fail "$CHECK" "no prose files under $target"
else
  files="$target"
fi

# Code does the whole check: split the original into sentences, collapse whitespace on both
# sides, and look for each sentence in the target text. No model is asked.
report="$(FILES="$files" python3 - "$original" <<'PY'
import json, os, re, sys
orig = open(sys.argv[1], encoding="utf-8").read()
body = " ".join(open(p, encoding="utf-8").read() for p in os.environ["FILES"].split("\n") if p)
squash = lambda s: re.sub(r"\s+", " ", s).strip()
sentences = []
for para in re.split(r"\n\s*\n", orig):
    for s in re.split(r"(?<=[.!?])\s+(?=[A-Z\"'(])", squash(para)):
        if len(s) > 3:
            sentences.append(s)
haystack = squash(body)
missing = [s for s in sentences if s not in haystack]
print(json.dumps({"sentences": len(sentences), "missing": len(missing),
                  "first_missing": missing[0] if missing else None}))
PY
)" || gate_fail "$CHECK" "could not read the files"

total="$(printf '%s' "$report" | jq -r .sentences)"
missing="$(printf '%s' "$report" | jq -r .missing)"
first="$(printf '%s' "$report" | jq -r '.first_missing // empty')"
inputs="$(jq -nc --arg o "$original" --arg t "$target" --argjson r "$report" '{original: $o, target: $t} + $r')"
question="every sentence of the original appears unchanged in the target"
if [ "$missing" -gt 0 ]; then
  gate_log "$CHECK" "$inputs" "$question" "$missing of $total sentences missing" 1 fail
  gate_fail "$CHECK" "$missing of $total sentences changed or missing, first: \"$first\""
fi
gate_log "$CHECK" "$inputs" "$question" "all $total sentences present" 1 pass
gate_pass "$CHECK" "all $total sentences of $(basename "$original") appear unchanged in $target"
