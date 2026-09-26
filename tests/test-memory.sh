#!/usr/bin/env bash
# One-command test for the memory piece (branch `memory`, docs/briefs/memory.md).
#   tests/test-memory.sh
# Uses the five invented notes in tests/fixtures/vault-sample; never reads the vault or
# the safe copy. Writes only under tests/tmp/memory. Sources the key store (never prints
# it). Without TYPESAFE_API_KEY the Jev parts are skipped; without a POLYGRES key the
# Polygres check prints "skipped: no POLYGRES key".
#
#   1. sync.py --dry-run --limit 20 over the sample prints 20 section lines and the edges
#   2. the chunker keeps sections inside the word bounds on a long synthetic note
#   3. sync.py --csv writes the three CSV files and a state file; a second run finds nothing changed
#   4. query.py --local ranks the note that mentions the query term first, JSON has the shape
#   5. the extension, through Prime's loader, injects a laurelin-memory message (memory-test.mjs)
#   6. Polygres: query.py --check, only when the key is present
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [ -f "$HOME/.config/agent-keys/env" ]; then set -a; . "$HOME/.config/agent-keys/env" >/dev/null 2>&1; set +a; fi
export PATH="$HOME/.local/bin:$PATH"

TMP="$PWD/tests/tmp/memory"
rm -rf "$TMP" && mkdir -p "$TMP"
FIX="$PWD/tests/fixtures/vault-sample"
export LAURELIN_SAFE_VAULT="$FIX"
export LAURELIN_MEMORY_HOME="$TMP/home"
export LAURELIN_MEMORY_STATE="$TMP/sync-state.json"
export LAURELIN_DECISION_LOG="$TMP/decision-log"
export LAURELIN_MEMORY_MODE=local
export LAURELIN_MEMORY_MIN_WORDS=40   # the sample notes are short; the default is 300
export LAURELIN_MEMORY_TMP="$TMP"
M=pack/memory
# The Polygres SDK lives in the repo venv when set up; fall back to plain python3.
PY="${LAURELIN_PYTHON:-$( [ -x "$(dirname "$0")/../.laurelin/venv/bin/python" ] && echo "$(dirname "$0")/../.laurelin/venv/bin/python" || echo python3 )}"
# The rerank check expects the 0.6 bar; the extension default is 0.5 (PLAN Step 6 calibrates it).
export LAURELIN_MEMORY_THRESHOLD="${LAURELIN_MEMORY_THRESHOLD:-0.6}"
pass=0; fail=0
ok()  { pass=$((pass + 1)); printf 'ok    %-34s %s\n' "$1" "${2:-}"; }
bad() { fail=$((fail + 1)); printf 'FAIL  %-34s %s\n' "$1" "${2:-}"; }

echo "== 1. sync dry run"
out="$($PY $M/sync.py --dry-run --limit 20 2>&1)"; rc=$?
sections=$(printf '%s\n' "$out" | grep -c '^section ')
edges=$(printf '%s\n' "$out" | grep -c '^edge ')
summary=$(printf '%s\n' "$out" | grep '^dry-run:')
if [ $rc -eq 0 ] && [ "$sections" -eq 20 ] && [ "$edges" -ge 1 ]; then ok "dry run, 20 sections and edges" "$sections sections, $edges edges shown; $summary"; else bad "dry run" "exit $rc, $sections sections, $edges edges: $out"; fi
if printf '%s\n' "$out" | grep -q 'Glossary -> Reference/Glossary.md' && printf '%s\n' "$out" | grep -q 'Missing Note -> (unresolved)'; then ok "wikilinks resolve by name; dangling ones marked"; else bad "wikilinks" "$(printf '%s\n' "$out" | grep -m3 'links:')"; fi
if [ "$($PY $M/sync.py --dry-run --limit 3 2>/dev/null | grep -c '^section ')" -eq 3 ]; then ok "--limit caps the listing"; else bad "--limit" ""; fi

echo "== 2. chunker bounds"
out="$(python3 - <<'EOF'
import sys, random
sys.path.insert(0, 'pack/memory'); import vaultlib
random.seed(1)
words = lambda n: ' '.join(random.choice(['alpha','beta','gamma','delta','field','probe','stand','plan']) for _ in range(n))
doc = "---\ntags: [x]\n---\n# Title\n\n" + words(40) + "\n\n## Short one\n\n" + words(50) + "\n\n## Short two\n\n" + words(60) + "\n\n## Long\n\n" + "\n\n".join(words(200) + '.' for _ in range(12)) + "\n\n## Table\n\n" + "\n".join('| a | b | ' + words(30) + ' |' for _ in range(60)) + "\n\n## Code\n\n```\n# not a heading\n" + words(20) + "\n```\n\n## Tail\n\n" + words(20)
secs = vaultlib.split_sections(doc, 'Title')
bad = [s for s in secs if s['words'] > 800]
short = [s for s in secs[:-1] if s['words'] < 300]
heads = [s['heading'] for s in secs]
print(len(secs), 'sections; over 800:', len(bad), '; short before the last:', len(short), '; headings:', heads[:3], '...', heads[-1])
print('fence heading leaked' if any('not a heading' == h for h in heads) else 'fence respected')
print('merged' if 'Short one' in secs[0]['text'] and 'Short two' in secs[0]['text'] else 'not merged')
EOF
)"
if printf '%s' "$out" | grep -q 'over 800: 0 ; short before the last: 0' && printf '%s' "$out" | grep -q 'fence respected' && printf '%s' "$out" | grep -q '^merged'; then ok "sections merged up to 300, split at 800, code fences ignored" "$(printf '%s\n' "$out" | head -1)"; else bad "chunker bounds" "$out"; fi

echo "== 3. sync csv and state"
out="$($PY $M/sync.py --csv "$TMP/csv" 2>&1)"; rc=$?
rows=$(tail -n +2 "$TMP/csv/sections.csv" 2>/dev/null | python3 -c 'import csv,sys; print(sum(1 for _ in csv.reader(sys.stdin)))')
if [ $rc -eq 0 ] && [ -f "$TMP/csv/notes.csv" ] && [ -f "$TMP/csv/links.csv" ] && [ "$rows" -ge 20 ] && [ -f "$LAURELIN_MEMORY_STATE" ] && printf '%s' "$out" | grep -q 'polygres --json import csv'; then ok "csv bulk path" "$rows section rows, import commands printed, state saved"; else bad "csv bulk path" "exit $rc rows=$rows: $out"; fi
if head -1 "$TMP/csv/sections.csv" | grep -q '^id,path,section,heading,text,words,updated,links,deleted_at$'; then ok "sections.csv columns match schema.sql"; else bad "csv columns" "$(head -1 "$TMP/csv/sections.csv")"; fi
out="$($PY $M/sync.py --dry-run 2>&1 | grep '^dry-run:')"
if printf '%s' "$out" | grep -q ' 0 changed, 5 unchanged'; then ok "second run: nothing changed" "$out"; else bad "incremental" "$out"; fi
cp -R "$FIX" "$TMP/vault2"; printf '\n\n## Added\n\nOne more paragraph about the stepper stage.\n' >> "$TMP/vault2/Test Stand Plan.md"; rm "$TMP/vault2/Reference/Glossary.md"
out="$($PY $M/sync.py --dry-run --source "$TMP/vault2" 2>&1)"
if printf '%s' "$out" | grep -q '^deleted  Reference/Glossary.md' && printf '%s' "$out" | grep -q 'dry-run: 4 notes scanned, 1 changed'; then ok "edit and delete detected" "$(printf '%s\n' "$out" | grep '^dry-run:')"; else bad "edit and delete" "$out"; fi
grep -rq 'poly_live_' "$TMP" 2>/dev/null && bad "key leak" "a key-shaped string landed under tests/tmp" || ok "no key-shaped string written"

echo "== 4. local query"
out="$($PY $M/query.py --local "cryostat vendor" 2>&1)"
first="$(printf '%s\n' "$out" | sed -n 2p)"
if printf '%s' "$first" | grep -q 'Cryostat Vendor Shortlist.md'; then ok "vendor note ranks first" "$first"; else bad "ranking" "$out"; fi
out="$($PY $M/query.py --local "slide typography rules" 2>&1)"
if printf '%s\n' "$out" | sed -n 2p | grep -q 'Deck Style Notes.md' && printf '%s' "$out" | grep -q 'via link'; then ok "style note first, one-hop links added" "$(printf '%s' "$out" | grep -m1 'via link' | sed 's/^ *//')"; else bad "one hop" "$out"; fi
out="$(echo 'what does separatrix mean' | $PY $M/query.py --local --stdin --json --k 3)"
shape="$(printf '%s' "$out" | python3 -c '
import json,sys; d=json.load(sys.stdin); r=d["results"][0]
need={"id","path","section","heading","score","words","via","text"}
print("ok" if d["mode"]=="local" and need<=set(r) and len(d["results"])==3 and "Glossary" in r["path"] else "bad "+json.dumps(d)[:300])')"
if [ "$shape" = "ok" ]; then ok "json shape and --stdin" "3 results, glossary first"; else bad "json shape" "$shape"; fi
if $PY $M/query.py --local "separatrix" 2>&1 | head -1 | grep -q '(cached)'; then ok "index cache reused"; else bad "index cache" ""; fi
out="$($PY $M/query.py --local --source "$TMP/does-not-exist" x 2>&1)"; rc=$?
if [ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'no safe vault copy'; then ok "missing copy is an error, not a crash" "$out"; else bad "missing copy" "exit $rc: $out"; fi

echo "== 5. extension"
if node tests/memory-test.mjs; then ok "memory-test.mjs"; else bad "memory-test.mjs" "see above"; fi
PRIME_ROOT="${PRIME_AGENT_PKG:-/Users/Joe/.local/lib/node_modules/prime-agent}"
TSC="$(command -v tsc || true)"
[ -z "$TSC" ] && [ -x /opt/homebrew/lib/node_modules/vercel/node_modules/typescript/bin/tsc ] && TSC=/opt/homebrew/lib/node_modules/vercel/node_modules/typescript/bin/tsc
if [ -n "$TSC" ]; then
  cat > "$TMP/tsconfig.memory.json" <<JSON
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
  "files": ["$PWD/pack/extensions/laurelin-memory.ts"]
}
JSON
  if out="$("$TSC" -p "$TMP/tsconfig.memory.json" 2>&1)"; then ok "tsc --noEmit on laurelin-memory.ts"; else bad "tsc --noEmit" "$out"; fi
else
  echo "skip: no TypeScript compiler found (the loader check above still ran)"
fi

echo "== 6. polygres"
if [ -z "${POLYGRES_API_KEY:-}" ]; then echo "skipped: no POLYGRES key (POLYGRES_API_KEY and POLYGRES_RUNTIME_URL in the key store)"; else
  out="$($PY $M/query.py --check 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then ok "polygres reachable" "$out"; else bad "polygres check" "$out"; fi
fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
