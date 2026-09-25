# Branch `launcher`: Steps 1b and 1e

Built 2026-09-25. Brief: `docs/briefs/launcher.md`.

## What is here

- `bin/laurelin`: one bash script, about 200 lines, with no dependencies beyond bash 3.2 (the macOS default) and `prime-agent`.
- `tests/test-launcher.sh`: the test from the brief plus a check of `keys add` against a scratch store.

To run `laurelin` from anywhere, make one symlink:

```
ln -s "$HOME/orca/workspaces/laurelin-harness/launcher/bin/laurelin" ~/.local/bin/laurelin
```

After the merge, point the symlink at the `main` checkout. The script finds the repo through the symlink, so the link is the only install step.

## What the script does

1. Reads `~/.config/agent-keys/env` into the environment with `set -a` and `source`. The script discards the output, so it prints nothing. Both line forms in the file work: `export NAME=value` and `NAME=value`.
2. Runs `prime-agent -e <repo>/pack` and forwards every other argument unchanged. If `pack/themes/laurelin.json` exists, it adds `--theme <that file>`. Today the file does not exist, so the script adds nothing.
3. On `--autonomous`, it adds one `--autonomous-gate <path>` per `pack/gates/*.sh` before the forwarded arguments. The script passes the gate path as the command, so each gate file must be executable. Today `pack/gates/` does not exist, so the script adds no gate.
4. Forwards `agents`, `list`, `attach`, `send`, `stop` and `schedule` to `prime-agent <same>`, after it reads the key store.
5. Handles `keys add`, `keys list` and `keys check` itself. Prime has no key command.

A dry run with a fake `prime-agent` on the PATH showed these exact argument lists:

| Call | Prime receives |
|---|---|
| `laurelin "build the deck"` | `-e <repo>/pack "build the deck"` |
| `laurelin -p "hi" --model x` | `-e <repo>/pack -p hi --model x` |
| `laurelin --autonomous "do it"` (one fake gate) | `-e <repo>/pack --autonomous-gate <repo>/pack/gates/zz-fake.sh --autonomous "do it"` |
| `laurelin schedule list` | `schedule list` |

## Keys

- `keys add NAME`: reads the value with `read -s` (no echo), then rewrites the store through a temporary file in the same folder. The value stays inside the bash process. It never appears in a command argument, so `ps` cannot show it. The script replaces an existing line for the same name in place. It appends a new name as `export NAME='value'`, with single quotes so any character survives `source`. The folder gets mode 700 and the file mode 600.
- `keys list`: prints each name in the store and the tool that uses it, from a small table in the script. It marks a name that the table does not list.
- `keys check`: prints one line per expected name. Status is `present`, `present (shell only, not in the store)`, `missing`, or `missing (optional)`. Exit 1 if a required key is missing anywhere, else 0.

State on 2026-09-25: `TYPESAFE_API_KEY`, `OPENAI_API_KEY` and `FOLK_API_KEY` are in the store. `CONTEXT_DEV_API_KEY` and `GITLAB_TOKEN` come from `~/.zshrc` only. `VENICE_API_KEY` is absent. Step 1e wants every key in the store and no value in `~/.zshrc`. That move edits a file that is not in the repo, so it is Joe's step:

```
laurelin keys add CONTEXT_DEV_API_KEY
laurelin keys add GITLAB_TOKEN
```

Then delete the two `export` lines from `~/.zshrc` and add one line, `source ~/.config/agent-keys/env`, in their place.

## The settings folder variable (brief item 3)

`PRIME_AGENT_CODING_AGENT_DIR` works. Prime's `docs/usage.md` (environment variable table) and `docs/development.md` list it. Test on 2026-09-25 with Prime 0.9.5:

```
PRIME_AGENT_CODING_AGENT_DIR="$PWD/.tmp-agent-dir" prime-agent --offline model list
```

Prime made `.tmp-agent-dir/` with a fresh two-byte `auth.json`, an empty `sessions/` folder and a `session-artifacts/` folder. It answered "No models available", because the new folder holds no sign-ins. Prime did not touch `~/.prime`. So a `--own-dir` option can come in a following step.

That option requires a symlink from `~/.prime/agent/auth.json` into the new folder to keep the sign-ins. If Joe wants the Venice and OpenRouter entries, `models.json` gets the same symlink. Not built. I deleted the throwaway folder after the test. It is in `.gitignore`.

## Decisions

- `LAURELIN_KEY_STORE` overrides the store path. The test uses it to run `keys add` on a scratch file in `tests/tmp/` (gitignored) with fake values, so no test writes the real store. It has no other use.
- `keys check` counts a key set only in the shell as present, with a note. Prime and the workers get it in both cases, and the note shows what Step 1e has to move.
- `-e <repo>/pack` loads the pack folder as a package. Prime accepted the current `pack/package.json`, whose `extensions`, `skills` and `prompts` folders do not exist today, and answered a prompt.
- The script passes `-p` through unchanged, so Prime saves a session as in any run. Thus the test leaves one small session in `~/.prime/agent/sessions/` each time it runs. Add `--no-session` to the call if that matters.
- The script targets bash 3.2. A first version used bash 4 pattern substitution for the quote escape and failed. The fix pipes the value through `sed` on standard input.

## Test

```
tests/test-launcher.sh
```

Result on 2026-09-25: seven checks, all passed. The `-p` check got the answer "ready" from the default model (`anthropic/claude-fable-5-1` in Prime's settings). If no model has a sign-in, that check prints "skipped: no model" and passes.

## Out of scope, left for other branches

The theme file (branch `interface`) and the gates (branch `gates`). The launcher already looks for both at the paths in the brief.
