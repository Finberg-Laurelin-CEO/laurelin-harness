# Branch `launcher`: Steps 1b and 1e, the `laurelin` command and keys

Plan: section 10, Steps 1b and 1e, and the Prime facts in both; section 19 rows 1b and 1e.

## Make
1. `bin/laurelin`: a shell script (bash, no dependencies) that:
   - sources `~/.config/agent-keys/env` if present, without printing anything;
   - runs `prime-agent -e <repo>/pack` with the Laurelin theme (`--theme` if `pack/themes/laurelin.json` exists, else skip) and forwards all other arguments;
   - subcommands: none or a message (interactive); `-p "..."` (print and exit, pass through); `--autonomous "..."` (pass through Prime's autonomous flags; add every `pack/gates/*.sh` that exists as `--autonomous-gate`); `agents`, `schedule`, `attach`, `send`, `list`, `stop` forward to `prime-agent <same>`; `keys` handled locally (below); `--help` prints usage in plain words.
   - Do not install to `~/.local/bin`; print the one symlink command in `--help` and in the branch note.
2. `laurelin keys add NAME` (prompts with no echo, appends or replaces in the env file, mode 600), `laurelin keys list` (names only, plus which tool uses each from a small table in the script), `laurelin keys check` (each expected name: present or missing; expected names: `TYPESAFE_API_KEY`, `CONTEXT_DEV_API_KEY`, `FOLK_API_KEY`, `OPENAI_API_KEY`, `GITLAB_TOKEN`, `VENICE_API_KEY` optional). Never print values. Rule 16 applies.
3. Check whether `PRIME_AGENT_CODING_AGENT_DIR` moves Prime's settings folder (Prime code has `ENV_AGENT_DIR`; pi documents `PI_CODING_AGENT_DIR`). Test it with a throwaway folder in the repo (`.tmp-agent-dir`, gitignored). If it works, the launcher may offer `--own-dir` later; for now only record the result in the note. Do not change `~/.prime`.

## Test
`tests/test-launcher.sh`: `bin/laurelin --help` exits 0; `bin/laurelin keys check` runs and prints only names and status; `bin/laurelin keys list` prints no value; a grep of the script finds no key value; `bin/laurelin -p "reply with the single word ready"` returns "ready" if a model is available, else prints "skipped: no model" and passes.

## Out of scope
The theme file and interface extension (branch `interface`), gates (branch `gates`).
