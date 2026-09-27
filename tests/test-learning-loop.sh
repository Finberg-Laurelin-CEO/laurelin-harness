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
# The learn extension stores rules only under the launcher's settings folder. Name a throwaway one:
# the store request goes to the test's stand-in, nothing is written there.
export LAURELIN_CODING_AGENT_DIR="${LAURELIN_CODING_AGENT_DIR:-$PWD/tests/tmp/learning-loop-agent}"
exec node tests/learning-loop-test.mjs "$@"
