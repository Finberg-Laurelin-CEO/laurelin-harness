#!/bin/bash
# classifier.dev MCP in the harness: configured with the opt-out header, calls work, nothing is kept for training.
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0
ok() { pass=$((pass + 1)); echo "ok    $*"; }
bad() { fail=$((fail + 1)); echo "FAIL  $*"; }
S="${LAURELIN_CODING_AGENT_DIR:-$HOME/.laurelin/agent}/settings.json"
python3 -c "
import json,sys;c=json.load(open('$S')).get('mcpServers',{}).get('classifier',{})
sys.exit(0 if c.get('url')=='https://classifier.dev/mcp' and c.get('headers',{}).get('X-Classifier-Share-Data')=='false' else 1)" \
  && ok "harness settings: classifier MCP server with X-Classifier-Share-Data: false" || bad "settings entry missing or without the opt-out header"
[ -f pack/skills/classifier-dev/SKILL.md ] && grep -q "^name: classifier-dev" pack/skills/classifier-dev/SKILL.md && ok "classifier-dev skill present" || bad "skill missing"
[ "${LAURELIN_SKIP_LIVE:-}" = 1 ] && { echo "skipped: live calls"; echo "$pass passed, $fail failed"; [ "$fail" -eq 0 ]; exit; }
call() { curl -s --max-time 30 https://classifier.dev/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "X-Classifier-Share-Data: false" -d "$1"; }
r="$(call '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"classify_texts","arguments":{"inputs":["fix the failing test","reply to the investor"],"labels":["code change","email"]}}}')"
echo "$r" | python3 -c "import json,sys;s=json.load(sys.stdin)['result']['structuredContent'];sys.exit(0 if s.get('data_sharing')=='off' and [x['label'] for x in s['results']]==['code change','email'] else 1)" \
  && ok "a call answers correctly with data sharing off" || bad "call: $(echo "$r" | head -c 200)"
r="$(call '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"classify_texts","arguments":{"share_data":true,"inputs":["x"],"labels":["a","b"]}}}')"
echo "$r" | grep -q "bad_share_data" && ok "a call asking to share data is refused on this connection" || bad "share_data true was accepted: $(echo "$r" | head -c 200)"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
