#!/bin/bash
# Task graph core (pure): checks, readiness, skipping, waves, prompts; and the graph check command.
cd "$(dirname "$0")/.." || exit 1
NODE="$(command -v /opt/homebrew/bin/node || command -v node)"
"$NODE" --test tests/graph.test.mjs || exit 1
out="$("$NODE" pack/graph/graph.mjs check pack/graph/examples/dcvc-brief.json)" && echo "$out" | grep -q "wave 1 (2 in parallel)" && echo "ok    graph check prints the plan" || { echo "FAIL  graph check: $out"; exit 1; }
