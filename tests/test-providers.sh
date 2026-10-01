#!/bin/bash
# providers add: lists an OpenAI-compatible service's models with the key and writes models.json
# (key by variable name only); status shows which providers are ready. Fake server, throwaway folder.
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0
ok() { pass=$((pass + 1)); echo "ok    $*"; }
bad() { fail=$((fail + 1)); echo "FAIL  $*"; }
T="$PWD/tests/tmp/providers"; rm -rf "$T"; mkdir -p "$T"
PORT=$((20000 + RANDOM % 20000))
python3 - "$PORT" > "$T/server.log" 2>&1 <<'PY' &
import http.server, json, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get("Authorization") != "Bearer test-key-123":
            self.send_response(401); self.end_headers(); return
        body = {"data": [{"id": "fast-1", "context_length": 64000, "pricing": {"input": "0.0000002", "output": "0.0000006"}},
                         {"id": "smart-2", "context_window": 200000, "capabilities": ["tools", "vision", "reasoning"]}]}
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps(body).encode())
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PY
SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT; sleep 0.6
export LAURELIN_CODING_AGENT_DIR="$T"
P="python3 bin/providers.py"
out="$(TEST_CI_KEY= $P add testci --base-url http://127.0.0.1:$PORT/v1 --key-env TEST_CI_KEY 2>&1)"
echo "$out" | grep -q "no key" && ok "without the key it says how to add it" || bad "no key: $out"
out="$(TEST_CI_KEY=wrong $P add testci --base-url http://127.0.0.1:$PORT/v1 --key-env TEST_CI_KEY 2>&1)"
echo "$out" | grep -q "HTTP 401" && ok "a wrong key reports the service's answer" || bad "wrong key: $out"
out="$(TEST_CI_KEY=test-key-123 $P add testci --base-url http://127.0.0.1:$PORT/v1 --key-env TEST_CI_KEY 2>&1)"
echo "$out" | grep -q "2 models" && ok "add writes the listed models" || bad "add: $out"
python3 - "$T/models.json" <<'PY' && ok "models.json holds the variable name, prices per million, context and vision" || bad "models.json: $(cat "$T/models.json")"
import json, sys
p = json.load(open(sys.argv[1]))["providers"]["testci"]
m = {x["id"]: x for x in p["models"]}
assert p["apiKey"] == "TEST_CI_KEY" and "test-key-123" not in open(sys.argv[1]).read()
assert m["fast-1"]["cost"]["input"] == 0.2 and m["fast-1"]["contextWindow"] == 64000
assert m["smart-2"]["input"] == ["text", "image"] and m["smart-2"]["reasoning"] is True
PY
out="$(TEST_CI_KEY=test-key-123 $P 2>&1)"
echo "$out" | grep -E "^testci +2 +yes" >/dev/null && ok "status shows the provider ready with 2 models" || bad "status: $out"
grep -q "cheaperinference" <(TEST_CI_KEY= $P 2>&1) && ok "status lists the Cheaper Inference preset" || bad "preset missing"
rm -rf "$T"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
