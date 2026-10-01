#!/bin/bash
# echo_write: the invented-evidence guard (unit), the extension loads, and one live call when a key is set.
cd "$(dirname "$0")/.." || exit 1
NODE="$(command -v /opt/homebrew/bin/node || command -v node)"
"$NODE" --experimental-strip-types --no-warnings --test tests/echo.test.ts || exit 1
[ -f "$HOME/.config/agent-keys/env" ] && { set -a; . "$HOME/.config/agent-keys/env" >/dev/null 2>&1; set +a; }
r="$("$NODE" --input-type=module -e "
  const l = await import('file://$PWD/agent/packages/coding-agent/dist/core/extensions/loader.js');
  const res = await l.loadExtensions(['$PWD/pack/extensions/laurelin-echo.ts'], '$PWD');
  if (res.errors.length) { console.log('ERR ' + res.errors[0].error); process.exit(0); }
  const t = res.extensions[0].tools.get('echo_write');
  if (!process.env.FULCRUM_ECHO_API_KEY || process.env.LAURELIN_SKIP_LIVE) { console.log('loaded (live call skipped)'); process.exit(0); }
  const o = await t.definition.execute('t', { task: 'two sentences for an investor update', facts: ['Coils arrive in month four', 'The vendor confirmed the date in writing'], effort: 'low' }, undefined);
  console.log(o.content[0].text);
" 2>&1)"
echo "$r" | sed 's/^/      /'
echo "$r" | grep -qE "^loaded|Draft in the voice of" && echo "ok    extension loads (and drafts when a key is set)" || { echo "FAIL  extension"; exit 1; }
