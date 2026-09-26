#!/usr/bin/env bash
# doctrine-check.sh: the skill's first step. Refuse to build while the deck kit's doctrine copies
# differ from the vault. Runs the kit's own bin/sync-doctrine.sh --check and never writes.
#
#   doctrine-check.sh            exit 0 when the copies match the vault, 1 on drift, 2 when the
#                                kit or its script is absent
# LAURELIN_DECK_KIT overrides the kit folder (default ~/laurelin-deck-kit). LAURELIN_VAULT is
# passed through to the kit's script.
set -uo pipefail
KIT="${LAURELIN_DECK_KIT:-$HOME/laurelin-deck-kit}"
SCRIPT="$KIT/bin/sync-doctrine.sh"
[ -f "$SCRIPT" ] || { echo "doctrine: skipped, no sync script at $SCRIPT"; exit 2; }
out="$(cd "$KIT" && bash bin/sync-doctrine.sh --check 2>&1)"; code=$?
drifted="$(printf '%s\n' "$out" | grep -c -E '^(DRIFTED|MISSING IN VAULT)')"
if [ "$code" -eq 0 ]; then
  echo "doctrine: pass, the kit's doctrine copies match the vault"
  exit 0
fi
echo "doctrine: fail, $drifted note(s) differ from the vault. Joe runs: cd $KIT && bin/sync-doctrine.sh"
printf '%s\n' "$out" | grep -E '^(DRIFTED|MISSING IN VAULT)' | head -n 10 | sed 's/^/  /'
exit 1
