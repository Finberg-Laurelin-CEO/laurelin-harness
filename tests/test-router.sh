#!/usr/bin/env bash
# One-command test for the router piece (branch `router`, plan Step 3).
#   tests/test-router.sh
# Sources the key store (never prints it). Without TYPESAFE_API_KEY the Jev
# part is skipped and the structural checks still run.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Use the harness's own jev (TypeSafe, then classifier.dev), as the launcher does.
export JEV_BIN="${JEV_BIN:-$PWD/bin/jev}"
export PATH="$PWD/bin/path:$PATH"
if [ -z "${TYPESAFE_API_KEY:-}" ] && [ -f "$HOME/.config/agent-keys/env" ]; then
  set -a; . "$HOME/.config/agent-keys/env" >/dev/null 2>&1; set +a
fi
exec node tests/router-test.mjs "$@"
