#!/bin/bash
# Build the forked agent (agent/, a Prime Agent fork named laurelin) inside this repo.
# Installs dependencies into agent/node_modules only. Nothing outside the repo changes.
set -euo pipefail
cd "$(dirname "$0")/../agent"
echo "installing dependencies (repo-local)"
HUSKY=0 npm install --no-audit --no-fund
echo "building"
npm run build
echo "built: $(node packages/coding-agent/dist/bundle/cli.js --version)"
