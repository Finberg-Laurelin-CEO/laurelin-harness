#!/bin/bash
# Graph planner: drafts, core check, Jev coverage, retries with feedback, and `graph plan` from the CLI. Stand-in scripts only.
cd "$(dirname "$0")/.." || exit 1
REPO="$PWD"; NODE="$(command -v /opt/homebrew/bin/node || command -v node)"
"$NODE" --test tests/graph-planner.test.mjs || exit 1
T="$REPO/tests/tmp/graph-planner"; rm -rf "$T"; mkdir -p "$T/repo"
( cd "$T/repo" && git init -q -b main && git config user.email t@example.com && git config user.name t \
  && printf '.laurelin/\n' > .gitignore && git add . && git commit -qm init ) || { echo "FAIL  temp repo"; exit 1; }
printf '#!/bin/bash\necho %s\n' "'{\"id\":\"x\",\"steps\":[{\"id\":\"a\",\"task\":\"t\",\"expects\":\"e\"},{\"id\":\"b\",\"task\":\"t\",\"expects\":\"e\"},{\"id\":\"m\",\"kind\":\"merge\",\"inputs\":[\"a\",\"b\"],\"task\":\"t\",\"expects\":\"e\"}]}'" > "$T/drafter.sh"
printf '#!/bin/bash\ncat >/dev/null\necho %s\n' "'{\"answers\":{\"covers\":{\"type\":\"noul\",\"noul\":0.8}}}'" > "$T/jev.sh"
chmod +x "$T/drafter.sh" "$T/jev.sh"
out="$(cd "$T/repo" && LAURELIN_PLANNER_CMD="$T/drafter.sh" JEV_BIN="$T/jev.sh" "$NODE" "$REPO/pack/graph/runner.mjs" plan "Brief on X" --done "one page" --id cli 2>&1)"
rm -rf "$T"
if echo "$out" | grep -q "GRAPH cli" && echo "$out" | grep -q "Jev coverage 0.80" && echo "$out" | grep -q "graph run .*plans/cli.json"; then
  echo "ok    graph plan prints the waves, the coverage and the run command"
else echo "FAIL  cli: $out"; exit 1; fi
