#!/usr/bin/env bash
# link-skills.sh: make pack/skills the one source of Laurelin skills for Prime and pi.
#
# Prime Agent and pi both read ~/.agents/skills (see Prime docs/skills.md), so one
# link per skill in that folder reaches both tools. Same-named entries in each
# tool's own folder (~/.prime/agent/skills, ~/.pi/agent/skills) would load the
# skill twice, so the script treats them as duplicates and moves them aside.
#
# Default: dry run. Prints every command that would touch a folder outside this
# repo and changes nothing (AGENTS.md rule 17). Run with --apply to make them.
#
# Usage:
#   bin/link-skills.sh            # print the plan
#   bin/link-skills.sh --apply    # run the plan
#
# Exit 0 when the plan is printed or applied without error. Idempotent: a second
# run finds nothing to do. Links point at the checkout that runs the script, so
# run --apply from the main checkout (~/laurelin-harness), never from a worktree.

set -euo pipefail

apply=0
for arg in "$@"; do
  case "$arg" in
    --apply) apply=1 ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "error: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

repo="$(cd "$(dirname "$0")/.." && pwd)"
pack="$repo/pack/skills"
shared="$HOME/.agents/skills"
tool_dirs=("$HOME/.prime/agent/skills" "$HOME/.pi/agent/skills")

if [ ! -d "$pack" ]; then
  echo "error: no skills folder at $pack" >&2
  exit 1
fi

plan=()
add() { plan+=("$1"); echo "plan: $1"; }
ok()  { echo "ok:   $1"; }

# Names of every skill in the pack (a folder or link that holds a SKILL.md).
names=()
for entry in "$pack"/*/; do
  name="$(basename "$entry")"
  if [ -f "$pack/$name/SKILL.md" ]; then
    names+=("$name")
  else
    echo "error: $pack/$name has no SKILL.md" >&2
    exit 1
  fi
done

if [ "${#names[@]}" -eq 0 ]; then
  echo "error: no skills found in $pack" >&2
  exit 1
fi

# 1. One link per skill in the shared folder.
if [ ! -d "$shared" ]; then
  add "mkdir -p $(printf '%q' "$shared")"
fi
for name in "${names[@]}"; do
  want="$pack/$name"
  target="$shared/$name"
  if [ -L "$target" ] && [ "$(readlink "$target")" = "$want" ]; then
    ok "$target -> $want"
  elif [ -L "$target" ]; then
    add "rm $(printf '%q' "$target") && ln -s $(printf '%q' "$want") $(printf '%q' "$target")"
  elif [ -e "$target" ]; then
    aside="$shared-replaced-by-laurelin-pack"
    add "mkdir -p $(printf '%q' "$aside") && mv $(printf '%q' "$target") $(printf '%q' "$aside/$name") && ln -s $(printf '%q' "$want") $(printf '%q' "$target")"
  else
    add "ln -s $(printf '%q' "$want") $(printf '%q' "$target")"
  fi
done

# 2. Duplicates in each tool's own folder: links go, copies move aside.
for dir in "${tool_dirs[@]}"; do
  [ -d "$dir" ] || continue
  for name in "${names[@]}"; do
    dup="$dir/$name"
    if [ -L "$dup" ]; then
      add "rm $(printf '%q' "$dup")"
    elif [ -e "$dup" ]; then
      aside="$dir-replaced-by-laurelin-pack"
      add "mkdir -p $(printf '%q' "$aside") && mv $(printf '%q' "$dup") $(printf '%q' "$aside/$name")"
    fi
  done
done

count="${#plan[@]}"
if [ "$count" -eq 0 ]; then
  echo "nothing to do: every tool folder already points at $pack"
  exit 0
fi

if [ "$apply" -eq 0 ]; then
  echo "$count change(s) planned. Nothing was changed. Run with --apply to make them."
  exit 0
fi

for cmd in "${plan[@]}"; do
  echo "run:  $cmd"
  eval "$cmd"
done
echo "$count change(s) applied."
