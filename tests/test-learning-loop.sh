#!/usr/bin/env bash
# One-command test for the learning loop (branch `learning-loop`, plan Step 10).
#   tests/test-learning-loop.sh
# Sources the key store (never prints it). Without TYPESAFE_API_KEY the Jev
# parts print "skipped" and the rest still runs.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [ -z "${TYPESAFE_API_KEY:-}" ] && [ -f "$HOME/.config/agent-keys/env" ]; then
  set -a; . "$HOME/.config/agent-keys/env" >/dev/null 2>&1; set +a
fi
exec node tests/learning-loop-test.mjs "$@"
