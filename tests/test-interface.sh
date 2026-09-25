#!/usr/bin/env bash
# Test for the interface piece (theme + laurelin-ui extension).
# Run: tests/test-interface.sh
# Exit 0 when every required check passes, 1 otherwise.
set -u
cd "$(dirname "$0")/.."
[ -f ~/.config/agent-keys/env ] && . ~/.config/agent-keys/env

status=0

# Where the Prime Agent npm package lives (dist/, docs/, node_modules/). The
# prime-agent on PATH may be the standalone binary, which has no dist/ folder.
command -v prime-agent >/dev/null || { echo "FAIL prime-agent not on PATH"; exit 1; }
PRIME_ROOT=""
for cand in "${PRIME_AGENT_PKG:-}" "$(npm root -g 2>/dev/null)/prime-agent" "$HOME/.local/lib/node_modules/prime-agent"; do
  if [ -n "$cand" ] && [ -f "$cand/dist/index.js" ]; then PRIME_ROOT="$cand"; break; fi
done
[ -z "$PRIME_ROOT" ] && { echo "FAIL prime-agent npm package not found (set PRIME_AGENT_PKG)"; exit 1; }
echo "prime-agent $(prime-agent --version 2>/dev/null) at $PRIME_ROOT"

# 1 + 2. Theme tokens and extension load, through Prime's own loader.
node tests/interface-check.mjs "$PRIME_ROOT" || status=1

# 3. Type-check against Prime's types, when a TypeScript compiler is around.
TSC="$(command -v tsc || true)"
[ -z "$TSC" ] && [ -x /opt/homebrew/lib/node_modules/vercel/node_modules/typescript/bin/tsc ] && TSC=/opt/homebrew/lib/node_modules/vercel/node_modules/typescript/bin/tsc
if [ -n "$TSC" ]; then
  mkdir -p tests/tmp
  cat > tests/tmp/tsconfig.interface.json <<JSON
{
  "compilerOptions": {
    "noEmit": true, "strict": true, "skipLibCheck": true,
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "types": ["node"], "typeRoots": ["$PRIME_ROOT/node_modules/@types"],
    "baseUrl": ".",
    "paths": {
      "@earendil-works/pi-coding-agent": ["$PRIME_ROOT/dist/index.d.ts"],
      "@earendil-works/pi-tui": ["$PRIME_ROOT/node_modules/@earendil-works/pi-tui/dist/index.d.ts"],
      "@earendil-works/pi-ai": ["$PRIME_ROOT/node_modules/@earendil-works/pi-ai/dist/index.d.ts"],
      "@earendil-works/pi-agent-core": ["$PRIME_ROOT/node_modules/@earendil-works/pi-agent-core/dist/index.d.ts"]
    }
  },
  "files": ["../../pack/extensions/laurelin-ui.ts"]
}
JSON
  if "$TSC" -p tests/tmp/tsconfig.interface.json; then echo "ok   tsc --noEmit: laurelin-ui.ts type-checks"; else echo "FAIL tsc --noEmit"; status=1; fi
else
  echo "skip tsc not found (Prime's loader check above still ran)"
fi

# 4. Smoke run with the pack loaded, no screen. Informational: passes without a model.
out="$(timeout 120 prime-agent -e ./pack --no-session --mode json -p "reply with the single word ready" </dev/null 2>/dev/null || true)"
if printf '%s' "$out" | grep -q '"type":"session"'; then
  if printf '%s' "$out" | grep -qi 'ready'; then echo "ok   prime-agent -e ./pack -p answered"; else echo "skip prime-agent -e ./pack ran; no model answer"; fi
else
  echo "skip prime-agent -e ./pack did not start (no model or no sign-in)"
fi

[ $status -eq 0 ] && echo "PASS interface" || echo "FAIL interface"
exit $status
