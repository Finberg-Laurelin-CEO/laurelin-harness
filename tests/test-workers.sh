#!/usr/bin/env bash
# One-command test for the workers piece. Sources the key store (never prints it).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f "$HOME/.config/agent-keys/env" ]; then
  set -a; . "$HOME/.config/agent-keys/env"; set +a
fi
exec node tests/workers-test.mjs "$@"
