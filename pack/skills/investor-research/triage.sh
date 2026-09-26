#!/usr/bin/env bash
# triage.sh ROOT: rank the firms under an investors root by who needs attention this week.
# Output is a table for Joe. Nothing is written or sent. See triage.md and triage.py.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/bin:$PATH"
if [ -z "${TYPESAFE_API_KEY:-}" ] && [ -f "$HOME/.config/agent-keys/env" ]; then set -a; . "$HOME/.config/agent-keys/env"; set +a; fi
exec python3 "$HERE/triage.py" "$@"
