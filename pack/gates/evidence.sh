#!/usr/bin/env bash
# evidence gate: the newest gstack-evidence ledger row supports the claim in LAURELIN_CLAIM.
# Code gathers the row and the command output; Jev answers one yes/no question.
set -uo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
CHECK=evidence
export PATH="$HOME/.local/bin:$PATH"

claim="${LAURELIN_CLAIM:-}"
[ -n "$claim" ] || gate_fail "$CHECK" "LAURELIN_CLAIM not set (the claim of done to check)"

# The ledger lives where gstack-evidence wrote it: keyed by gstack-slug and GSTACK_HOME.
eval "$(cd "$REPO_ROOT" && "$GSTACK_BIN/gstack-slug" 2>/dev/null)" || gate_fail "$CHECK" "gstack-slug failed"
ledger="${GSTACK_HOME:-$HOME/.gstack}/projects/$SLUG/$BRANCH-evidence.jsonl"
[ -f "$ledger" ] || gate_fail "$CHECK" "no evidence ledger at $ledger (run the verify command inside gstack-evidence run --label)"

label="${LAURELIN_EVIDENCE_LABEL:-}"
if [ -n "$label" ]; then
  row="$(jq -c --arg l "$label" 'select(.label == $l)' "$ledger" | tail -n 1)"
  [ -n "$row" ] || gate_fail "$CHECK" "no ledger row with label $label in $ledger"
else
  row="$(tail -n 1 "$ledger")"
fi
printf '%s' "$row" | jq -e . >/dev/null 2>&1 || gate_fail "$CHECK" "ledger row is not JSON"

# The command's output, with the tail read from the log. Withheld when it holds a credential.
log_path="$(printf '%s' "$row" | jq -r '.log_path // empty')"
output="<no log>"
if [ -n "$log_path" ] && [ -r "$log_path" ]; then
  output="$(tail -c 1500 "$log_path")"
  if [ -x "$GSTACK_BIN/gstack-redact" ]; then
    printf '%s' "$output" | "$GSTACK_BIN/gstack-redact" >/dev/null 2>&1
    [ $? -eq 3 ] && output="<output withheld: credential found in log>"
  fi
fi

request="$(jq -nc --argjson row "$row" --arg out "$output" --arg claim "$claim" '{
  state: {ledger_row: ($row | del(.log_path, .cmd_sha256, .tree, .wtree)), output_tail: $out, claim: $claim},
  questions: {supports: {type: "noul", instructions: {
    question: "The verification record in `ledger_row` (the command that ran, its exit code, when it ran) together with the command output in `output_tail` shows that the statement in `claim` is true.",
    focus: "A command that exited with a nonzero code, or whose output reports failures or errors, does not show a claim of success is true. A command unrelated to the claim does not show it is true."
  }}}}')"

p="$(gate_jev_noul "$request" supports)" || gate_fail "$CHECK" "Jev call failed: $p"
label_val="$(printf '%s' "$row" | jq -r .label)"
exit_val="$(printf '%s' "$row" | jq -r .exit)"
inputs="$(jq -nc --arg c "$claim" --arg l "$ledger" --argjson row "$row" '{claim: $c, ledger: $l, row: ($row | {ts, label, command, exit})}')"
question="the ledger row and its output show the claim is true"
if awk -v p="$p" -v t="$JEV_THRESHOLD" 'BEGIN{exit !(p >= t)}'; then
  gate_log "$CHECK" "$inputs" "$question" yes "$p" pass
  gate_pass "$CHECK" "Jev $p that row label=$label_val exit=$exit_val supports \"$claim\""
fi
gate_log "$CHECK" "$inputs" "$question" no "$p" fail
gate_fail "$CHECK" "Jev $p (under $JEV_THRESHOLD) that row label=$label_val exit=$exit_val supports \"$claim\""
