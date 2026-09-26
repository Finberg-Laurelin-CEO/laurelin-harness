#!/bin/bash
# vault-io: direct read works on a repo file; the bridge path is exercised only when the bridge is up.
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0
ok(){ pass=$((pass+1)); echo "ok    $*"; }; bad(){ fail=$((fail+1)); echo "FAIL  $*"; }
[ "$(bin/vault-io read AGENTS.md | head -1)" = "# Rules for agents in this repo" ] && ok "direct read" || bad "direct read"
bin/vault-io ls tests | grep -q 'README.md' && ok "direct ls" || bad "direct ls"
bin/vault-io exists AGENTS.md && ok "exists" || bad "exists"
if curl -s -m 2 http://127.0.0.1:27300/health | grep -q '"ok": true'; then
  V="/Users/Joe/Documents/Obsidian Vault/Laurelin/Style Guide"
  n="$(bin/vault-io ls "$V" 2>/dev/null | wc -l | tr -d ' ')"; [ "$n" -gt 0 ] && ok "vault ls through direct-or-bridge ($n entries)" || bad "vault ls"
else
  echo "skipped: bridge not running (vault path not tested)"
fi
echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]
