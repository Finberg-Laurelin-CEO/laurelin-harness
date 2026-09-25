#!/usr/bin/env bash
# numbers gate: every number in the draft is supported by the canonical document.
# Code pulls each number with its phrase from both files (numbers-extract.py). A draft
# number whose value never appears in the canonical file is "unverified" and fails unless
# LAURELIN_NUMBERS_ALLOW_NEW=1. The rest go to Jev in one batched call, one yes/no
# question per number: does the canonical text support this number in this phrase?
# Any answer under the threshold (LAURELIN_JEV_THRESHOLD, default 0.6) fails.
#
# Environment:
#   LAURELIN_TARGET             draft file or folder (.md .txt .tex .pdf). See lib.sh.
#   LAURELIN_CANONICAL          the canonical file. Unset: key "canonical" in .laurelin/task.json.
#                               Neither: the gate prints "skipped" and exits 0.
#   LAURELIN_NUMBERS_ALLOW_NEW  1 lets unverified numbers pass (they are still listed).
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CHECK=numbers
export PATH="$HOME/.local/bin:$PATH"
EXTRACT="$GATE_DIR/numbers-extract.py"

canonical="${LAURELIN_CANONICAL:-}"
if [ -z "$canonical" ] && [ -f .laurelin/task.json ]; then
  canonical="$(jq -r '.canonical // empty' .laurelin/task.json 2>/dev/null)"
fi
if [ -z "$canonical" ]; then
  gate_log "$CHECK" '{}' "every number in the draft is supported by the canonical document" "no canonical file" 1 skipped
  printf '%s: skipped, no canonical file (set LAURELIN_CANONICAL)\n' "$CHECK"; exit 0
fi
[ -f "$canonical" ] || gate_fail "$CHECK" "canonical file does not exist: $canonical"

target="$(gate_target)" || gate_fail "$CHECK" "no target: set LAURELIN_TARGET or change a file in the worktree"
[ -e "$target" ] || gate_fail "$CHECK" "target does not exist: $target"

# Files to read: prose files plus PDFs (pdftotext turns those into text).
if [ -d "$target" ]; then
  files="$(find "$target" -type f \( -name '*.md' -o -name '*.txt' -o -name '*.tex' -o -name '*.pdf' \) | sort)"
else
  case "$target" in *.md|*.txt|*.tex|*.pdf) files="$target" ;; *) files="" ;; esac
fi
case "$files" in *.pdf*) command -v pdftotext >/dev/null || gate_fail "$CHECK" "pdftotext not found (needed for a PDF target)" ;; esac
question="every number in the draft is supported by the canonical document"
if [ -z "$files" ]; then
  gate_log "$CHECK" "$(jq -nc --arg t "$target" '{target: $t, files: []}')" "$question" "no prose or PDF files" 1 pass
  gate_pass "$CHECK" "no prose or PDF files under $target"
fi

# Rung 1, code: numbers from the canonical file and from every draft file.
canon="$(python3 "$EXTRACT" "$canonical")" || gate_fail "$CHECK" "could not read canonical file $canonical"
draft=""
while IFS= read -r f; do
  rows="$(python3 "$EXTRACT" "$f")" || gate_fail "$CHECK" "could not read $f"
  [ -n "$rows" ] && draft="${draft}$(printf '%s\n' "$rows" | jq -c --arg f "$(basename "$f")" '. + {file: $f}')"$'\n'
done <<< "$files"
draft="$(printf '%s' "$draft" | jq -sc 'unique_by([.norm, .phrase]) | to_entries | map(.value + {id: "n\(.key + 1)"})')"
total="$(printf '%s' "$draft" | jq 'length')"
if [ "$total" -eq 0 ]; then
  gate_log "$CHECK" "$(jq -nc --arg t "$target" --arg c "$canonical" '{target: $t, canonical: $c, numbers: 0}')" "$question" "no numbers" 1 pass
  gate_pass "$CHECK" "no numbers in $target"
fi

# Split the draft numbers: those with a counterpart value in the canonical file go to Jev;
# the others are unverified by code alone.
canon_json="$(printf '%s' "$canon" | jq -sc '.')"
split="$(jq -nc --argjson d "$draft" --argjson c "$canon_json" '
  ($c | map(.norm) | unique) as $have
  | {ask: [$d[] | select(.norm as $n | $have | index($n))],
     unverified: [$d[] | select(.norm as $n | ($have | index($n)) | not)]}')"
unverified_n="$(printf '%s' "$split" | jq '.unverified | length')"
ask_n="$(printf '%s' "$split" | jq '.ask | length')"

# Rung 2, Jev: one noul question per number, batched, each with its phrase and the canonical
# passages that hold the same value. Batches of 40 keep one request small.
canon_text="$(head -c 40000 "$canonical")"
answers='{}'
if [ "$ask_n" -gt 0 ]; then
  for ((start = 0; start < ask_n; start += 40)); do
    request="$(jq -nc --argjson split "$split" --argjson c "$canon_json" --arg text "$canon_text" --argjson s "$start" '
      ($split.ask[$s:$s+40]) as $batch
      | {state: {canonical_text: $text,
                 task: "For each question, decide whether the canonical text supports the draft number as used in the draft phrase: the same figure, for the same thing, in the same sense. A value that appears in the canonical text for a different quantity does not support the draft phrase."},
         questions: ($batch | map({key: .id, value: {type: "noul", instructions:
           ("The canonical text supports the number \"" + .value + "\" in this draft phrase: \"" + .phrase + "\". "
            + "Canonical passages with the same value: "
            + (.norm as $n | [$c[] | select(.norm == $n) | .phrase] | unique | .[0:3] | map("\"" + . + "\"") | join(" | ")))
         }}) | from_entries)}')"
    raw="$(printf '%s' "$request" | jev --raw 2>&1)" || gate_fail "$CHECK" "Jev call failed: $(printf '%s\n' "$raw" | head -n 1)"
    part="$(printf '%s' "$raw" | jq -c '.answers | with_entries(.value = .value.noul)')" || gate_fail "$CHECK" "Jev returned no answers"
    answers="$(jq -nc --argjson a "$answers" --argjson b "$part" '$a + $b')"
  done
fi

result="$(jq -nc --argjson split "$split" --argjson a "$answers" --arg t "$JEV_THRESHOLD" '
  ($t | tonumber) as $thr
  | ($split.ask | map(. + {p: ($a[.id] // 0)})) as $asked
  | {asked: $asked,
     low: [$asked[] | select(.p < $thr)] | sort_by(.p),
     unverified: $split.unverified,
     lowest: ([$asked[].p] | min)}')"
low_n="$(printf '%s' "$result" | jq '.low | length')"
lowest="$(printf '%s' "$result" | jq -r '.lowest // 1')"
allow_new="${LAURELIN_NUMBERS_ALLOW_NEW:-0}"

inputs="$(jq -nc --arg t "$target" --arg c "$canonical" --argjson r "$result" --argjson n "$total" --arg allow "$allow_new" '
  {target: $t, canonical: $c, numbers: $n, asked: ($r.asked | map({value, file, line, p})),
   unverified: ($r.unverified | map({value, file, line})), allow_new: ($allow == "1")}')"

if [ "$low_n" -gt 0 ] || { [ "$unverified_n" -gt 0 ] && [ "$allow_new" != "1" ]; }; then
  gate_log "$CHECK" "$inputs" "$question" "$low_n under $JEV_THRESHOLD, $unverified_n unverified" "$lowest" fail
  printf '%s: fail, %s under %s, %s unverified, of %s numbers in %s, first three:\n' \
    "$CHECK" "$low_n" "$JEV_THRESHOLD" "$unverified_n" "$total" "$(basename "$target")"
  {
    printf '%s' "$result" | jq -r '.low[] | "  \(.value) (Jev \(.p)): \"\(.phrase)\" [\(.file):\(.line)]"'
    printf '%s' "$result" | jq -r '.unverified[] | "  \(.value) (not in canonical): \"\(.phrase)\" [\(.file):\(.line)]"'
  } | head -n 3
  exit 1
fi
gate_log "$CHECK" "$inputs" "$question" "all supported, $unverified_n unverified allowed" "$lowest" pass
note=""
[ "$unverified_n" -gt 0 ] && note=", $unverified_n unverified allowed"
gate_pass "$CHECK" "$total numbers in $(basename "$target") checked against $(basename "$canonical"), lowest Jev $lowest$note"
