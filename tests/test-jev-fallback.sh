#!/bin/bash
# bin/jev: TypeSafe first; on no credits (402) the same questions go to classifier.dev and come back in
# Jev's answer shape. Fake servers only; nothing leaves the machine.
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0
ok() { pass=$((pass + 1)); echo "ok    $*"; }
bad() { fail=$((fail + 1)); echo "FAIL  $*"; }
T="$PWD/tests/tmp/jev-fallback"; rm -rf "$T"; mkdir -p "$T"
PORT=$((20000 + RANDOM % 20000))
python3 - "$PORT" "$T/calls.log" > "$T/server.log" 2>&1 <<'PY' &
import http.server, json, sys
log = open(sys.argv[2], "a")
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/v1/systemone":
            self.send_response(402); self.end_headers()
            self.wfile.write(b'{"detail":{"error_type":"billing_error"}}'); return
        if any("FREE_LIMIT" in t for t in body["inputs"]) and not self.headers.get("Authorization"):
            self.send_response(429); self.send_header("Retry-After", "1"); self.end_headers(); return
        labels = body["labels"]
        log.write(json.dumps({"n_inputs": len(body["inputs"]), "n_labels": len(labels)}) + "\n"); log.flush()
        res = []
        for t in body["inputs"]:
            want = "yes" if "YES" in t else ("investor update" if "investor update" in labels else labels[-1])
            if "skill-150" in labels: want = "skill-150"
            elif any(l.startswith("skill-") for l in labels): want = labels[0]
            sc = {l: (0.9 if l == want else 0.1 / max(1, len(labels) - 1)) for l in labels}
            res.append({"label": want, "confidence": 0.9, "scores": sc})
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps({"results": res, "usage": {"input_tokens": 10, "output_tokens": 2}}).encode())
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PY
SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT; sleep 0.6
export TYPESAFE_BASE_URL="http://127.0.0.1:$PORT" CLASSIFIER_BASE_URL="http://127.0.0.1:$PORT" TYPESAFE_API_KEY=test CLASSIFIER_API_KEY=
REQ='{"state":"s","questions":{"a":{"type":"noul","instructions":"YES please"},"b":{"type":"noul","instructions":"no"},"k":{"type":"choice","instructions":"kind","options":["investor update","code"]},"c":{"type":"score","instructions":"how clear","criteria":["vague","ok","clear"]}}}'
out="$(printf '%s' "$REQ" | bin/jev --raw 2>"$T/err")"
grep -q "402" "$T/err" && grep -q "classifier.dev" "$T/err" && ok "no credits at TypeSafe falls back to classifier.dev" || bad "fallback: $(cat "$T/err")"
printf '%s' "$out" | python3 -c '
import json,sys
d=json.load(sys.stdin); a=d["answers"]
assert d["backend"]=="classifier.dev"
assert a["a"]["type"]=="noul" and a["a"]["noul"]>0.8 and a["b"]["noul"]<0.2
assert a["k"]["choice"]=="investor update" and abs(sum(a["k"]["probabilities"].values())-1)<1e-6
assert a["c"]["type"]=="score" and 1.5<a["c"]["score"]<=2 and a["c"]["legend"]["2"]=="clear"
' && ok "noul, choice and score come back in Jev's shape" || bad "shape: $out"
grep -c . "$T/calls.log" | grep -qx 3 && ok "questions with the same labels share one request (3 requests for 4 questions)" || bad "batching: $(cat "$T/calls.log")"
: > "$T/calls.log"
BIG=$(python3 -c 'import json;print(json.dumps({"state":"s","questions":{"r":{"type":"choice","instructions":"pick","options":[f"skill-{i}" for i in range(230)]}}}))')
r="$(printf '%s' "$BIG" | bin/jev --raw 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)["answers"]["r"]["choice"])')"
[ "$r" = "skill-150" ] && python3 -c "
import json;c=[json.loads(l)['n_labels'] for l in open('$T/calls.log')];assert max(c)<=100,c" && ok "over 100 options: groups of 100, then a final pick" || bad "tournament: $r $(cat "$T/calls.log")"
LAURELIN_JEV_BACKEND=typesafe bin/jev --raw <<<"$REQ" >/dev/null 2>&1 && bad "forced typesafe should fail on 402" || ok "LAURELIN_JEV_BACKEND=typesafe does not fall back"
R2='{"state":"FREE_LIMIT","questions":{"q":{"type":"noul","instructions":"YES"}}}'
CLASSIFIER_API_KEY=paid-key bin/jev --raw <<<"$R2" 2>/dev/null | grep -q '"noul"' && ok "free tier refused: the paid key answers" || bad "paid fallback"
HOME="$T" CLASSIFIER_API_KEY= bin/jev --raw <<<"$R2" >/dev/null 2>&1 && bad "no key should fail when the free tier refuses" || ok "free tier refused and no key: a clear failure"
rm -rf "$T"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
