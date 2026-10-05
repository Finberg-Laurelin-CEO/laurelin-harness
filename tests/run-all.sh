#!/bin/bash
# Run every piece's test in step order. Stops at the first failure.
cd "$(dirname "$0")/.." || exit 1
for t in vault-io pack launcher interface workers worker-settings gates gates2 bridge router safety testset investor-research metrics deck-design learning-loop skill-packs memory worktrees connectors approvals providers jev-fallback watchdog echo classifier-mcp graph; do
  [ -f "tests/test-$t.sh" ] || { echo "=========== $t (no test file, skipped)"; continue; }
  echo "=========== $t"
  bash "tests/test-$t.sh" || { echo "FAILED: $t"; exit 1; }
done
echo "=========== all tests passed"
