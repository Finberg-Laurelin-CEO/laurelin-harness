#!/usr/bin/env bash
# install-skill-packs.sh: copy the adopted outside skills into pack/skills.
#
# Reads bin/skill-packs.manifest (one line per skill: source repo, pinned commit, pin date,
# licence file, path in the repo, folder name here, flags). For each repo it fetches the
# pinned commit into tests/tmp/skill-packs/src/<owner>__<repo> (gitignored), then copies
# the skill folder to pack/skills/<name>, puts the upstream LICENSE beside it, replaces a
# description over 300 characters with the one in bin/skill-pack-descriptions.tsv, adds
# the harness note at the top of SKILL.md where the manifest says "note", and rewrites the
# generated table in pack/skills/SOURCES.md.
#
# Idempotent: a second run makes the same tree byte for byte. Nothing outside the repo is
# written (AGENTS.md rule 17). The Karpathy skill is read from the installed Claude Code
# plugin when it is there, and fetched from GitHub when it is not.
#
# The `skills` CLI (npx skills add) cannot target a folder; it installs into agent folders
# and sends telemetry, so this script uses git directly (docs/briefs/skill-packs.md).
#
# Usage: bin/install-skill-packs.sh [--offline]
#   --offline   use the clones already under tests/tmp; fail if one is missing or at the wrong commit
# Env:   LAURELIN_SKILL_SRC     where clones go (default tests/tmp/skill-packs/src)
#        KARPATHY_PLUGIN_DIR    the installed plugin checkout (default ~/.claude/plugins/marketplaces/karpathy-skills)

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$REPO/bin/skill-packs.manifest"
DESCS="$REPO/bin/skill-pack-descriptions.tsv"
FM="$REPO/bin/skill-frontmatter.py"
DEST="$REPO/pack/skills"
SOURCES="$DEST/SOURCES.md"
SRC="${LAURELIN_SKILL_SRC:-$REPO/tests/tmp/skill-packs/src}"
KARPATHY_PLUGIN="${KARPATHY_PLUGIN_DIR:-$HOME/.claude/plugins/marketplaces/karpathy-skills}"
MAX_DESC=300
BUDGET_TOKENS=4000
NOTE='> Laurelin harness note: this skill comes from an outside pack. Browsing runs headless, and any send, post, publish or submit step waits at the approval gate. See pack/rules/laurelin.md.'

offline=0
for arg in "$@"; do
  case "$arg" in
    --offline) offline=1 ;;
    -h|--help) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "error: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

die() { echo "install-skill-packs: $*" >&2; exit 1; }
[ -f "$MANIFEST" ] || die "no manifest at $MANIFEST"
[ -f "$DESCS" ] || die "no descriptions table at $DESCS"
[ -x "$FM" ] || die "$FM is missing or not executable"
command -v git >/dev/null || die "git is needed"
command -v python3 >/dev/null || die "python3 is needed"
mkdir -p "$SRC" "$DEST"

# clone_dir SOURCE: the folder a repo is fetched into.
clone_dir() { printf '%s/%s\n' "$SRC" "${1//\//__}"; }

# fetch SOURCE COMMIT: make sure clone_dir holds exactly that commit. Prints the folder.
fetch() {
  local source="$1" sha="$2" dir
  dir="$(clone_dir "$source")"
  if [ -d "$dir/.git" ] && [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" = "$sha" ]; then
    printf '%s\n' "$dir"; return
  fi
  [ "$offline" -eq 0 ] || die "--offline: $dir is missing or not at $sha"
  rm -rf "$dir"; mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" remote add origin "https://github.com/$source.git"
  # GitHub serves a fetch by full commit hash, so one shallow fetch pins the copy.
  git -C "$dir" fetch -q --depth 1 origin "$sha" || die "cannot fetch $source at $sha"
  git -C "$dir" checkout -q FETCH_HEAD
  printf '%s\n' "$dir"
}

# description_for NAME: the trimmed description from the table, or nothing.
description_for() {
  awk -F'\t' -v n="$1" '!/^#/ && $1 == n { print $2; exit }' "$DESCS"
}

# add_note FILE: put the harness note right after the frontmatter, once.
add_note() {
  grep -qF "$NOTE" "$1" && return 0
  python3 - "$1" "$NOTE" <<'PY'
import sys
path, note = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8").read()
lines = text.split("\n")
if lines[0].strip() != "---":
    sys.exit("no frontmatter in " + path)
close = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
lines = lines[:close + 1] + ["", note] + lines[close + 1:]
open(path, "w", encoding="utf-8").write("\n".join(lines))
PY
}

rows=()
count=0
while read -r source sha pinned licence path name flags; do
  case "$source" in ''|'#'*) continue ;; esac
  [ -n "$flags" ] || die "manifest line for $name is short"
  case "$name" in
    *[!a-z0-9-]*|-*|*-|*--*) die "$name is not a valid skill name" ;;
  esac

  # 1. Where the copy comes from.
  srcdir=""
  case ",$flags," in *,local,*)
    if [ -d "$KARPATHY_PLUGIN/.git" ]; then
      srcdir="$KARPATHY_PLUGIN"
      have="$(git -C "$srcdir" rev-parse HEAD)"
      if [ "$have" != "$sha" ]; then
        echo "note: $KARPATHY_PLUGIN is at ${have:0:7}, manifest pins ${sha:0:7}; recording the installed one" >&2
        sha="$have"
      fi
    fi ;;
  esac
  [ -n "$srcdir" ] || srcdir="$(fetch "$source" "$sha")"
  from="$srcdir/$path"
  [ -f "$from/SKILL.md" ] || die "$source: no SKILL.md at $path"

  # 2. Copy the folder, fresh each time so removed upstream files do not linger.
  target="$DEST/$name"
  rm -rf "$target"
  cp -R "$from" "$target"
  find "$target" \( -name .git -o -name __pycache__ -o -name .DS_Store -o -name '*.pyc' \) -prune -exec rm -rf {} + 2>/dev/null || true

  # 3. The licence beside the skill.
  case "$licence" in
    declared:*)
      printf '%s license, declared by the upstream project in its README or SKILL.md frontmatter.\nThe repo ships no license file at this commit.\nSource: https://github.com/%s at %s\n' \
        "${licence#declared:}" "$source" "$sha" > "$target/LICENSE"
      lic_name="${licence#declared:} (declared)" ;;
    *)
      [ -f "$srcdir/$licence" ] || die "$source: no licence file at $licence"
      cp "$srcdir/$licence" "$target/LICENSE"
      lic_name="$(head -1 "$srcdir/$licence" | sed -E 's/ [Ll]icen[cs]e.*//; s/^The //')" ;;
  esac

  # 4. Name must match the folder; description must fit the budget.
  got="$("$FM" get name "$target/SKILL.md")"
  [ "$got" = "$name" ] || die "$name: SKILL.md says name: $got"
  trimmed="$(description_for "$name")"
  if [ -n "$trimmed" ]; then
    [ "${#trimmed}" -le "$MAX_DESC" ] || die "$name: trimmed description is ${#trimmed} characters, over $MAX_DESC"
    "$FM" set description "$trimmed" "$target/SKILL.md"
  else
    desc="$("$FM" get description "$target/SKILL.md")"
    [ "${#desc}" -le "$MAX_DESC" ] || die "$name: description is ${#desc} characters; add a trimmed one to $DESCS"
  fi

  # 5. The harness note where the skill browses or sends.
  case ",$flags," in *,note,*) add_note "$target/SKILL.md" ;; esac

  date="$(git -C "$srcdir" log -1 --format=%cs)"
  rows+=("| \`$name\` | [$source](https://github.com/$source) | \`$path\` | \`${sha:0:7}\` | $date | $lic_name | $pinned |")
  count=$((count + 1))
  echo "ok: $name from $source@${sha:0:7}"
done < "$MANIFEST"
[ "$count" -gt 0 ] || die "manifest lists no skills"

# 6. SOURCES.md: rewrite the generated table, keep the prose around it.
if [ ! -f "$SOURCES" ]; then
  printf '# Skill sources\n\n<!-- generated:start -->\n<!-- generated:end -->\n' > "$SOURCES"
fi
{
  echo "| Skill | Source repo | Path in repo | Commit | Commit date | License | Adopted |"
  echo "|---|---|---|---|---|---|---|"
  printf '%s\n' "${rows[@]}"
} > "$SOURCES.table"
python3 - "$SOURCES" "$SOURCES.table" <<'PY'
import sys
path, table = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8").read()
start, end = "<!-- generated:start -->", "<!-- generated:end -->"
a, b = text.find(start), text.find(end)
if a < 0 or b < 0 or b < a:
    sys.exit("SOURCES.md has no generated:start / generated:end markers")
body = open(table, encoding="utf-8").read().rstrip("\n")
text = text[:a + len(start)] + "\n" + body + "\n" + text[b:]
open(path, "w", encoding="utf-8").write(text)
PY
rm -f "$SOURCES.table"

# 7. Budget: every description sits in the system prompt on every turn.
total=0; n=0
for d in "$DEST"/*/; do
  [ -f "$d/SKILL.md" ] || continue
  desc="$("$FM" get description "$d/SKILL.md")"
  total=$((total + ${#desc} + 80)); n=$((n + 1))
done
tokens=$((total / 4))
echo "installed $count pack skills; $n skills in pack/skills; description budget about $tokens tokens (limit $BUDGET_TOKENS)"
[ "$tokens" -le "$BUDGET_TOKENS" ] || die "description budget over the limit; trim in $DESCS"
