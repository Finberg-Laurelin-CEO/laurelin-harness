#!/bin/bash
# Watchdog: the activity line and the stall rules (unit), and the extension loads through the fork's loader.
cd "$(dirname "$0")/.." || exit 1
NODE="$(command -v /opt/homebrew/bin/node || command -v node)"
"$NODE" --experimental-strip-types --no-warnings --test tests/watchdog.test.ts || exit 1
r="$("$NODE" --input-type=module -e "
  const l = await import('file://$PWD/agent/packages/coding-agent/dist/core/extensions/loader.js');
  const res = await l.loadExtensions(['$PWD/pack/extensions/laurelin-watchdog.ts'], '$PWD');
  console.log(res.errors.length ? 'ERR ' + res.errors[0].error : 'loaded');
" 2>&1)"
[ "$r" = "loaded" ] && echo "ok    extension loads" || { echo "FAIL  extension: $r"; exit 1; }
