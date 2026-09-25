#!/usr/bin/env bash
# Test-set runner (PLAN.md Step 6). One job per spec in tests/testset/specs/.
#
#   tests/testset/run.sh [--only id,id] [--root <dir>] [--timeout <seconds>]
#
# For each spec: writes .laurelin/task.json in the root, runs
#   bin/laurelin --no-session --autonomous --autonomous-max-continuations 3 --mode json -p "<prompt>"
# with the root as working directory, then collects gate results, cost and tokens from the
# JSON event stream, wall time, and a Jev score against the spec's rubric. Writes
# tests/testset/results/<date>-<id>.json (gitignored) and prints one table row per job.
#
# Default root: tests/tmp/testset/<id>/root, wiped first. With --root the folder is used as is
# and only .laurelin/task.json is written into it; run artifacts still go under tests/tmp.
set -uo pipefail
ROOT_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_REPO"
if [ -f "$HOME/.config/agent-keys/env" ]; then set -a; . "$HOME/.config/agent-keys/env"; set +a; fi
export PATH="$HOME/.local/bin:$PATH"

SPECS="$ROOT_REPO/tests/testset/specs"
RESULTS="$ROOT_REPO/tests/testset/results"
WORK_BASE="$ROOT_REPO/tests/tmp/testset"
SCORER="$ROOT_REPO/tests/testset/score.py"
VAULT="$HOME/Documents/Obsidian Vault/Laurelin"
ONLY=""; GIVEN_ROOT=""; TIMEOUT="${LAURELIN_TESTSET_TIMEOUT:-900}"
DATE="$(date +%Y-%m-%d)"

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="$2"; shift 2 ;;
    --root) GIVEN_ROOT="$(cd "$2" 2>/dev/null && pwd)" || { echo "run.sh: --root $2 does not exist" >&2; exit 2; }; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "run.sh: unknown argument $1" >&2; usage; exit 2 ;;
  esac
done
for c in jq python3 timeout prime-agent jev; do
  command -v "$c" >/dev/null 2>&1 || { echo "run.sh: $c is not on PATH" >&2; exit 2; }
done

# Which specs run: all enabled ones, or exactly the ids named with --only (enabled or not).
specs=()
if [ -n "$ONLY" ]; then
  IFS=',' read -r -a ids <<< "$ONLY"
  for id in "${ids[@]}"; do
    [ -f "$SPECS/$id.json" ] || { echo "run.sh: no spec $SPECS/$id.json" >&2; exit 2; }
    specs+=("$SPECS/$id.json")
  done
else
  for f in "$SPECS"/*.json; do
    [ "$(jq -r '.enabled // true' "$f")" = "true" ] && specs+=("$f")
  done
fi
[ "${#specs[@]}" -gt 0 ] || { echo "run.sh: no spec to run" >&2; exit 2; }

# A path from a spec: ~ and / stay absolute; anything else is under BASE.
resolve() { local p="$1" base="$2"; case "$p" in "~"*) printf '%s%s\n' "$HOME" "${p#\~}" ;; /*) printf '%s\n' "$p" ;; *) printf '%s/%s\n' "$base" "$p" ;; esac; }
# Gate names for the check letters (A prose, B numbers, C layout, D location, E verbatim, F evidence).
gates_for() {
  local out="" l
  for l in $1; do
    case "$l" in A) out="$out,prose" ;; B) out="$out,numbers" ;; C) out="$out,layout" ;; D) out="$out,location" ;; E) out="$out,verbatim" ;; F) out="$out,evidence" ;; esac
  done
  out="${out#,}"; printf '%s\n' "${out:-none}"
}

mkdir -p "$RESULTS"
printf '%-12s %-7s %-6s %-9s %-8s %s\n' id gates score cost seconds status
status_all=0
for spec in "${specs[@]}"; do
  id="$(jq -r .id "$spec")"
  checks="$(jq -r '.checks // ""' "$spec")"
  work="$WORK_BASE/$id"
  rm -rf "$work"; mkdir -p "$work/decision-log" "$work/gstack"
  if [ -n "$GIVEN_ROOT" ]; then root="$GIVEN_ROOT"; else root="$work/root"; mkdir -p "$root"; fi

  target="$(resolve "$(jq -r .target "$spec")" "$root")"
  mkdir -p "$(dirname "$target")" 2>/dev/null
  original="$(jq -r '.original // ""' "$spec")";   [ -n "$original" ]  && original="$(resolve "$original" "$ROOT_REPO")"
  canonical="$(jq -r '.canonical // ""' "$spec")"; [ -n "$canonical" ] && canonical="$(resolve "$canonical" "$ROOT_REPO")"
  claim="$(jq -r '.claim // ""' "$spec")"

  # The prompt, with the placeholders filled.
  prompt="$(jq -r .prompt "$spec")"
  prompt="${prompt//\{target\}/$target}"; prompt="${prompt//\{root\}/$root}"
  prompt="${prompt//\{original\}/$original}"; prompt="${prompt//\{canonical\}/$canonical}"

  # Task state file (read by the bridge branch's gates and the router once they land).
  mkdir -p "$root/.laurelin"
  jq -n --arg t "$target" --arg c "$claim" --arg o "$original" --arg k "$canonical" --arg n "testset $id: $(jq -r .name "$spec")" \
    '{target: $t, claim: $c, classification: "green", notes: $n}
     + (if $o != "" then {original: $o} else {} end) + (if $k != "" then {canonical: $k} else {} end)' > "$root/.laurelin/task.json"

  # Gate inputs. Only the gates the spec's checks name are attached, and only their inputs are exported,
  # so a gate is never failed for an input nobody gave it.
  printf '%s\n%s\n%s\n' "$root" "$ROOT_REPO" "$VAULT" > "$work/allowed-roots.txt"
  env_args=(LAURELIN_TARGET="$target" LAURELIN_GATES="$(gates_for "$checks")"
            LAURELIN_ALLOWED_ROOTS="$work/allowed-roots.txt" LAURELIN_GATE_LOG="$work/decision-log/gates.jsonl"
            GSTACK_HOME="$work/gstack")
  case " $checks " in *" E "*) [ -n "$original" ]  && env_args+=(LAURELIN_ORIGINAL="$original") ;; esac
  case " $checks " in *" B "*) [ -n "$canonical" ] && env_args+=(LAURELIN_CANONICAL="$canonical") ;; esac
  case " $checks " in *" F "*) [ -n "$claim" ]     && env_args+=(LAURELIN_CLAIM="$claim") ;; esac

  start="$(date +%s)"
  ( cd "$root" && env "${env_args[@]}" timeout "$TIMEOUT" "$ROOT_REPO/bin/laurelin" --no-session --autonomous \
      --autonomous-max-continuations 3 --mode json -p "$prompt" ) > "$work/events.jsonl" 2> "$work/stderr.log"
  code=$?
  seconds=$(( $(date +%s) - start ))

  out="$RESULTS/$DATE-$id.json"
  row="$(python3 "$SCORER" --spec "$spec" --root "$root" --work "$work" --target "$target" --prompt "$prompt" \
          --exit "$code" --seconds "$seconds" --out "$out")" || status_all=1
  printf '%s\n' "$row"
done
exit "$status_all"
