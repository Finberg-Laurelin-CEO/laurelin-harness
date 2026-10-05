#!/bin/bash
# Graph verify: sources, named gates, Jev contract check, Jev outage. Stand-in scripts only.
cd "$(dirname "$0")/.." || exit 1
NODE="$(command -v /opt/homebrew/bin/node || command -v node)"
"$NODE" --test tests/graph-verify.test.mjs
