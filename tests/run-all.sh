#!/bin/bash
# Run every piece's test in step order. Stops at the first failure.
cd "$(dirname "$0")/.." || exit 1
for t in pack launcher interface workers gates safety testset; do
  echo "=========== $t"
  bash "tests/test-$t.sh" || { echo "FAILED: $t"; exit 1; }
done
echo "=========== all tests passed"
