#!/bin/bash
# Approval gate asks for real outward actions only, never for words inside prose.
cd "$(dirname "$0")/.." || exit 1
NODE="$(command -v /opt/homebrew/bin/node || command -v node)"
"$NODE" --experimental-strip-types --no-warnings --test tests/approvals-prose.test.ts
