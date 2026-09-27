#!/bin/bash
# claude.ai connectors through Claude Code: the extension loads, outward tools are told apart from reads,
# and one live read-only call (Superhuman list_accounts) comes back. The live call is skipped without `claude`.
cd "$(dirname "$0")/.." || exit 1
REPO="$PWD"
pass=0; fail=0
ok() { pass=$((pass + 1)); echo "ok    $*"; }
bad() { fail=$((fail + 1)); echo "FAIL  $*"; }
NODE="$(command -v /opt/homebrew/bin/node || command -v node)"
PRIME_ROOT="$REPO/agent/packages/coding-agent"
[ -f "$PRIME_ROOT/dist/index.js" ] || { echo "skipped: fork not built"; exit 0; }

r="$("$NODE" --input-type=module -e "
  const l = await import('file://$PRIME_ROOT/dist/core/extensions/loader.js');
  const res = await l.loadExtensions(['$REPO/pack/extensions/laurelin-connectors.ts'], '$REPO');
  const e = res.extensions[0];
  console.log(res.errors.length ? 'ERR ' + res.errors[0].error : [...e.tools.keys()].sort().join(',') + ' / ' + [...e.commands.keys()].join(','));
" 2>&1)"
[ "$r" = "connector_call,connector_list / connectors" ] && ok "extension registers connector_list, connector_call and /connectors" || bad "extension: $r"

FAKE="$REPO/tests/tmp/fake-claude"; mkdir -p "$REPO/tests/tmp"
printf '#!/bin/sh\ncat >/dev/null; echo "{\\"type\\":\\"result\\",\\"result\\":\\"FAKE\\"}"\n' > "$FAKE"; chmod +x "$FAKE"
c="$(LAURELIN_CLAUDE_BIN="$FAKE" "$NODE" --input-type=module -e "
  const l = await import('file://$PRIME_ROOT/dist/core/extensions/loader.js');
  const res = await l.loadExtensions(['$REPO/pack/extensions/laurelin-connectors.ts'], '$REPO');
  const t = res.extensions[0].tools.get('connector_call').definition;
  const run = (tool) => t.execute('t', {connector:'X', tool, arguments:{}}, undefined, undefined, {hasUI:false}).then(o => o.content[0].text);
  const outward = ['send_draft','send_message','reply','forward','create_event','create_deployment','buy_domain','trash_thread','delete_event'];
  const reads = ['get_draft_send_status','list_accounts','search_threads','get_thread','list_events','query_email_and_calendar','list_deployments'];
  const missed = []; for (const x of outward) if (!(await run(x)).startsWith('Not done')) missed.push(x);
  const flagged = []; for (const x of reads) if ((await run(x)) !== 'FAKE') flagged.push(x);
  console.log(missed.length || flagged.length ? 'missed outward ' + missed + ' / flagged reads ' + flagged : 'ok');
" 2>&1)"
[ "$c" = "ok" ] && ok "outward tools ask first, read-only tools do not" || bad "classifier: $c"

INIT="$REPO/tests/tmp/fake-claude-init"
printf '#!/bin/sh\ncat >/dev/null; echo "{\\"type\\":\\"system\\",\\"subtype\\":\\"init\\",\\"tools\\":[\\"Bash\\",\\"mcp__claude_ai_Google_Calendar__list_events\\",\\"mcp__claude_ai_Google_Calendar__create_event\\",\\"mcp__claude_ai_Gmail__search_threads\\"]}"; sleep 30\n' > "$INIT"; chmod +x "$INIT"
cat_out="$(LAURELIN_CLAUDE_BIN="$INIT" LAURELIN_CODING_AGENT_DIR="$REPO/tests/tmp/connectors-agent" timeout 20 "$NODE" --input-type=module -e "
  const l = await import('file://$PRIME_ROOT/dist/core/extensions/loader.js');
  const res = await l.loadExtensions(['$REPO/pack/extensions/laurelin-connectors.ts'], '$REPO');
  const o = await res.extensions[0].tools.get('connector_list').definition.execute('t', {refresh:true});
  console.log(o.content[0].text); process.exit(0);
" 2>&1)"
echo "$cat_out" | grep -q 'Google_Calendar (2): list_events, create_event' && echo "$cat_out" | grep -q 'Gmail (1): search_threads' \
  && ok "catalogue comes from Claude Code's startup list, without waiting for a model turn" || bad "catalogue: $cat_out"

if command -v claude >/dev/null && [ "${LAURELIN_SKIP_LIVE:-}" != 1 ]; then
  live="$("$NODE" --input-type=module -e "
    const l = await import('file://$PRIME_ROOT/dist/core/extensions/loader.js');
    const res = await l.loadExtensions(['$REPO/pack/extensions/laurelin-connectors.ts'], '$REPO');
    const t = res.extensions[0].tools.get('connector_call');
    const out = await t.definition.execute('t', {connector:'Superhuman_Mail', tool:'list_accounts', arguments:{}}, undefined, undefined, {hasUI:false});
    console.log(out.content[0].text);
  " 2>&1)"
  echo "$live" | grep -q '@' && ok "live read through Claude Code returns the Superhuman account" || bad "live: $(echo "$live" | head -3)"
else
  echo "skipped: live connector call"
fi
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
