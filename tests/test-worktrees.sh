#!/bin/bash
# Worktree tracker: worktrunk does the git work, pack/worktrees/tracker.mjs tracks task, worker, status,
# comment and gates. Runs in a throwaway repo; starts no model worker (worker "none").
cd "$(dirname "$0")/.." || exit 1
REPO="$PWD"
pass=0; fail=0
ok() { pass=$((pass + 1)); echo "ok    $*"; }
bad() { fail=$((fail + 1)); echo "FAIL  $*"; }
NODE="$(command -v /opt/homebrew/bin/node || command -v node)"
TR="$REPO/pack/worktrees/tracker.mjs"

if ! (command -v wt >/dev/null || [ -x /opt/homebrew/bin/wt ]); then echo "skipped: worktrunk (wt) not installed"; exit 0; fi

T="$REPO/tests/tmp/worktrees"; rm -rf "$T" "$T.feat-one"; mkdir -p "$T"
( cd "$T" && git init -q -b main && git config user.email t@example.com && git config user.name t \
  && printf '.laurelin/\n' > .gitignore && echo hi > a.txt && git add . && git commit -qm init ) || { bad "temp repo"; exit 1; }

out="$(cd "$T" && "$NODE" "$TR" start feat-one --worker none 2>&1)"
echo "$out" | grep -q '"branch": "feat-one"' && ok "start creates the worktree with worktrunk" || bad "start: $out"
P="$(cd "$T" && "$NODE" "$TR" list --json | python3 -c "import sys,json; print([r['path'] for r in json.load(sys.stdin) if r['branch']=='feat-one'][0])")"
[ -d "$P" ] && ok "worktree folder exists: $(basename "$P")" || bad "no worktree folder"
echo more >> "$P/a.txt"; git -C "$P" commit -qam "add line"
(cd "$T" && "$NODE" "$TR" comment feat-one "ready for a look" >/dev/null && "$NODE" "$TR" status feat-one review >/dev/null)
tbl="$(cd "$T" && "$NODE" "$TR" list)"
echo "$tbl" | grep -E '^feat-one +review +none +1 ahead +ready for a look' >/dev/null && ok "list shows status, commits ahead and comment" || bad "list: $tbl"
(cd "$T" && "$NODE" "$TR" status feat-one nonsense >/dev/null 2>&1) && bad "bad status accepted" || ok "a bad status is refused"
w="$(cd "$T" && timeout 3 "$NODE" "$TR" watch 1000 2>&1 | sed 's/\x1b\[[0-9;?]*[A-Za-z]//g')"
echo "$w" | grep -q 'W O R K T R E E S' && echo "$w" | grep -q 'feat-one' && echo "$w" | grep -q 'REVIEW' && ok "watch draws the dashboard with the worktree and its status" || bad "watch: $(echo "$w" | head -5)"
(cd "$T" && "$NODE" "$TR" merge feat-one >/dev/null 2>&1)
git -C "$T" log --oneline -1 | grep -q 'add line' && ok "merge lands the branch on main" || bad "merge: $(git -C "$T" log --oneline -1)"
(cd "$T" && "$NODE" "$TR" remove feat-one >/dev/null 2>&1)
(cd "$T" && "$NODE" "$TR" list) | grep -q feat-one && bad "remove left the worktree" || ok "remove deletes the worktree and its record"
bin/laurelin-agent worktrees list >/dev/null 2>&1 && ok "laurelin-agent worktrees runs in this repo" || bad "laurelin-agent worktrees"

# The extension loads through Prime's loader and registers its tools and command.
PRIME_ROOT=""
for cand in "$REPO/agent/packages/coding-agent" "${PRIME_AGENT_PKG:-}" "$HOME/.local/lib/node_modules/prime-agent"; do
  if [ -n "$cand" ] && [ -f "$cand/dist/index.js" ]; then PRIME_ROOT="$cand"; break; fi
done
if [ -n "$PRIME_ROOT" ]; then
  r="$("$NODE" --input-type=module -e "
    const l = await import('file://$PRIME_ROOT/dist/core/extensions/loader.js');
    const res = await l.loadExtensions(['$REPO/pack/extensions/laurelin-worktrees.ts'], '$REPO');
    const e = res.extensions[0];
    console.log(res.errors.length ? 'ERR ' + res.errors[0].error : [...e.tools.keys()].sort().join(',') + ' / ' + [...e.commands.keys()].join(','));
  " 2>&1)"
  echo "$r" | grep -q 'worktree_start' && echo "$r" | grep -q 'worktree_merge' && echo "$r" | grep -q '/ worktrees' \
    && ok "extension registers the worktree tools and /worktrees" || bad "extension: $r"
else
  echo "skipped: no Prime package to load the extension"
fi

rm -rf "$T"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
