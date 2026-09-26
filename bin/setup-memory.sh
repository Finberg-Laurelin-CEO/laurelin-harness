#!/bin/bash
# Create the repo-local Python environment the memory piece uses (Polygres SDK and CLI).
# Everything lands under .laurelin/venv inside this repo. Nothing outside the repo changes.
set -euo pipefail
cd "$(dirname "$0")/.."
V=".laurelin/venv"
[ -x "$V/bin/python" ] || python3 -m venv "$V"
"$V/bin/pip" install -q --disable-pip-version-check polygres-sdk polygres-cli mcp
"$V/bin/python" -c "import polygres; print('venv ready: $V (polygres sdk, mcp for the fusion server)')"
echo "Sign in once for the CLI, in a real terminal:  $V/bin/polygres login"
