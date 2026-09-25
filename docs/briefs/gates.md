# Branch `gates`: Step 4, the first checks as Prime gates

Plan: section 5; section 10, Step 4 including the check ladder and the Prime facts; section 17 (gstack pieces); section 19 row 4.

## Make
Each gate is one executable in `pack/gates/`, run as `--autonomous-gate`, exits 0 on pass and 1 on fail, prints one line saying which check and why, and appends a JSON line to `decision-log/gates.jsonl` (gitignored) with check, inputs, question, answer, confidence, result. Gates read their target from the environment variable `LAURELIN_TARGET` (a file or folder) or from the newest file changed in the git worktree if unset.

1. `prose.sh`: runs `jev-sweep` (in `~/.local/bin`; read `~/.claude/skills/jev/SKILL.md` for usage) on every `.md`, `.txt` and `.tex` file in the target. Fails on any hit, printing the first three.
2. `location.sh`: the target exists, is under an allowed root (a list in `pack/gates/allowed-roots.txt`, default the repo and `/Users/Joe/Documents/Obsidian Vault/Laurelin`), and the gate prints its absolute path.
3. `verbatim.sh`: takes `LAURELIN_ORIGINAL` (a file of Joe's text) and checks every sentence of it appears unchanged in the target. Fails listing the first missing sentence.
4. `evidence.sh`: reads the newest `gstack-evidence` ledger row (binary under `~/.claude/skills/gstack/bin/gstack-evidence`; read its help) and the claim in `LAURELIN_CLAIM`, and asks Jev one Noul question: does this ledger row support this claim? Fails under 0.6.
5. `numbers.sh` and `layout.sh`: stubs that print "not built" and exit 0, with a note in the branch note on what each needs (numbers: extraction plus `jev-documents` against a canonical file; layout: `pdftoppm` render plus overlap detection plus Jev).
6. `tests/fixtures/`: small sample files that make each gate pass and fail.

## Test
`tests/test-gates.sh`: each built gate passes on its good fixture and fails on its bad fixture, and `prime-agent -e ./pack --autonomous --autonomous-gate pack/gates/location.sh -p "say done"` finishes (or prints "skipped: no model" and passes).

## Out of scope
Reviewer subagents, the interface, real Laurelin documents.
