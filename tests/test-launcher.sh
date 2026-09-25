#!/usr/bin/env bash
# Test for bin/laurelin (branch launcher, Steps 1b and 1e).
# Run: tests/test-launcher.sh
# Sources ~/.config/agent-keys/env only through the launcher. Never prints a value.

set -u
cd "$(dirname "$0")/.."

fails=0
ok()   { echo "ok    $1"; }
fail() { echo "FAIL  $1"; fails=$((fails + 1)); }

# 1. --help exits 0 and names the keys commands and the symlink line.
out="$(bin/laurelin --help 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && grep -q 'keys add' <<< "$out" && grep -q 'ln -s' <<< "$out"; then
  ok "--help exits 0 and prints usage"
else
  fail "--help (exit $rc)"; echo "$out"
fi

# 2. keys check runs and prints only names and status.
out="$(bin/laurelin keys check 2>&1)"; rc=$?
if [ "$rc" -le 1 ] && [ -n "$out" ] \
   && ! grep -v -E '^[A-Z][A-Z0-9_]* +(present|missing)( \(.*\))?$' <<< "$out" | grep -q .; then
  ok "keys check prints only names and status (exit $rc)"
else
  fail "keys check (exit $rc)"; echo "$out"
fi

# 3. keys list prints no value: no "=" and no long token.
out="$(bin/laurelin keys list 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && ! grep -q '=' <<< "$out" && ! grep -E -q '[A-Za-z0-9]{24,}' <<< "$out"; then
  ok "keys list prints names only"
else
  fail "keys list (exit $rc)"; echo "$out"
fi

# 4. The script holds no key value.
if ! grep -E -q '[A-Za-z0-9_-]{40,}|sk-[A-Za-z0-9]{8,}|=[A-Za-z0-9]{16,}' bin/laurelin \
   && ! grep -E -q '^(export )?(TYPESAFE_API_KEY|CONTEXT_DEV_API_KEY|FOLK_API_KEY|OPENAI_API_KEY|GITLAB_TOKEN|VENICE_API_KEY)=' bin/laurelin; then
  ok "no key value in bin/laurelin"
else
  fail "bin/laurelin looks like it holds a key value"
fi

# 5. keys add against a scratch store (gitignored tests/tmp). Fake values only.
mkdir -p tests/tmp
scratch="$PWD/tests/tmp/env"
rm -f "$scratch"
export LAURELIN_KEY_STORE="$scratch"
printf 'first-fake-value\n' | bin/laurelin keys add TEST_FAKE_KEY >/dev/null 2>&1
printf "it's second\n"       | bin/laurelin keys add TEST_FAKE_KEY >/dev/null 2>&1
printf 'other\n'             | bin/laurelin keys add TEST_OTHER_KEY >/dev/null 2>&1
mode="$(stat -f '%Lp' "$scratch" 2>/dev/null || stat -c '%a' "$scratch")"
count="$(grep -c '^export TEST_FAKE_KEY=' "$scratch")"
readback="$(set -a; . "$scratch"; printf '%s' "$TEST_FAKE_KEY")"
if [ "$mode" = "600" ] && [ "$count" = "1" ] && [ "$readback" = "it's second" ] \
   && grep -q "^export TEST_OTHER_KEY='other'$" "$scratch"; then
  ok "keys add writes mode 600, replaces in place, keeps quotes safe"
else
  fail "keys add (mode $mode, count $count)"
fi
out="$(bin/laurelin keys list 2>&1)"
if grep -q 'TEST_FAKE_KEY' <<< "$out" && ! grep -q 'second' <<< "$out"; then
  ok "keys list on the scratch store shows names, not values"
else
  fail "keys list on the scratch store"; echo "$out"
fi
unset LAURELIN_KEY_STORE
rm -f "$scratch"

# 6. One-shot answer, if a model is available.
out="$(timeout 180 bin/laurelin -p "reply with the single word ready" 2>&1)"; rc=$?
if grep -q -i 'no models available' <<< "$out"; then
  ok "skipped: no model"
elif grep -q -i 'ready' <<< "$out"; then
  ok "-p answered ready"
else
  fail "-p (exit $rc)"; echo "$out"
fi

echo
if [ "$fails" -eq 0 ]; then
  echo "test-launcher: all passed"
else
  echo "test-launcher: $fails failed"
  exit 1
fi
