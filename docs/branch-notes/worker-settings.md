# Branch `worker-settings`: cut the system prompt of every worker call

Built 2026-09-25. Brief: `docs/briefs/worker-settings.md`. Test: `tests/test-worker-settings.sh`. All three checks pass on this Mac. `tests/run-all.sh` passes with the new test in the list.

## What was built

- `pack/worker/claude-settings.json`: a Claude Code settings file for workers. It holds the permission rules that were in `laurelin-workers.ts` (acceptEdits mode, the allow list, the deny list), turns hooks off, and sets the output style to default. No hooks, no plugins, no model.
- `pack/extensions/laurelin-workers.ts`: the Claude worker now runs `claude -p --output-format stream-json --verbose --safe-mode --settings pack/worker/claude-settings.json --permission-mode acceptEdits`. The Codex worker now runs `codex exec --ignore-user-config -c cli_auth_credentials_store=<value from the user config>`. Both workers report their token usage in the tool result (`details.usage`).
- `tests/worker-settings-test.mjs` and `tests/test-worker-settings.sh`: the test. It runs the same task through the old command line and through `delegate_worker`, prints both token counts, and fails if the new count is more than half the old one.

## Test result (2026-09-25)

| Check | Result |
|---|---|
| Settings file parses, 20 allow rules, 10 deny rules, hooks off | pass |
| `delegate_worker(claude)` creates `hello.txt` | pass |
| Input tokens on the hello task, old setup | 134,446 over 2 turns |
| Input tokens on the hello task, new setup | 34,697 over 2 turns |
| Cut | 74 percent |

Old setup means the wave-1 command line, which loads the user's global hooks, plugins, MCP servers, skills and CLAUDE.md files. The task was "create a file hello.txt containing hello in the cwd". Input tokens count everything sent to the model, cached or not. The cached share still counts against the subscription.

## What worked for Claude Code, and what did not

Claude Code 2.1.282 on this Mac. Each variant ran the one-word prompt "Reply with the single word: ready", and the first model call's input tokens were read from the stream.

| Variant | First call, input tokens | Sign-in |
|---|---|---|
| Wave-1 command line (global hooks, plugins, MCP servers) | 65,675 | works |
| `--settings` file with `disableAllHooks: true` only | 49,534 | works |
| `--setting-sources project` (user settings skipped) | 18,539 | works |
| `--safe-mode` | 18,536 | works |
| `--safe-mode --settings <worker file>` (chosen) | 18,200 | works |
| `--bare` | no call | fails: "Not logged in" |
| `CLAUDE_CONFIG_DIR=<empty folder>` | no call | fails: "Not logged in" |

Facts behind the choice:

- `--settings` alone cannot remove the user's hooks, plugins or MCP servers. Hooks merge across settings files, so an empty hooks block in the worker file changes nothing. `disableAllHooks: true` in the worker file does turn hooks off. But the 98 plugin MCP servers, 634 skills and 81 agents stay, and those hold most of the tokens.
- `--safe-mode` drops every customization (hooks, plugins, MCP servers, skills, CLAUDE.md files, output styles) and keeps the sign-in. The init event of a safe-mode run lists 25 tools, 0 MCP servers and 4 agents, against 568 tools, 98 MCP servers and 81 agents in the baseline.
- `--settings` still applies under `--safe-mode`. Proof: a deny rule for `Bash(cat:*)` in the worker file blocked a `cat` that `--allowedTools` on the command line had allowed. The file's `defaultMode` and `outputStyle` also win over the user's settings.
- Safe mode still reads the user's permission mode and output style when the worker file does not set them. In one probe without a mode, the worker ran in the user's `auto` mode. So the worker file sets `defaultMode: acceptEdits` and `outputStyle: default`, and the tool repeats `--permission-mode acceptEdits` on the command line. A settings file that fails validation is dropped without an error in `-p` mode, and the repeated flag keeps the mode in that case.
- `--bare` refuses the subscription sign-in by design. It reads only an API key.
- A separate `CLAUDE_CONFIG_DIR` loses the sign-in. On macOS the sign-in is in the Keychain, keyed to the config folder, and the new folder has none. Claude Code made a fresh `.claude.json`, `backups/`, `projects/` and `sessions/` in the folder and stopped. The folder was deleted after the probe.
- The `ECC_GATEGUARD=off` environment variable is gone from the tool. Safe mode runs no hooks, so the GateGuard hook never fires.
- The remaining 18,200 tokens are Claude Code's own system prompt and its 25 tool schemas. `--system-prompt` would replace the whole prompt, and that is out of scope.
- The model of the worker still comes from the user's settings (`claude-fable-5-1` here), because safe mode keeps model selection. The worker file sets no model.

## Codex: needed, and done

`codex exec` on this Mac loads the user config, which holds 6 MCP servers, 16 plugins, hooks from two plugins and from `~/.codex/hooks.json`, and 87 skills. One of the MCP servers is `gbrain serve`, so every wave-1 Codex worker started its own gbrain process. That is the process pile-up that PLAN.md Step 1d describes, and rule 18 forbids it. Another MCP server, jacobian, wrote a `.jacobian/` folder into the worker's cwd.

| Variant | Input tokens, "ready" prompt | Input tokens, hello task | Sign-in |
|---|---|---|---|
| Wave-1 command line | 27,590 | 83,133 | works |
| `-c 'mcp_servers={}' -c 'plugins={}' -c features.hooks=false` | 26,311 | not run | works, but the MCP servers still started |
| `--ignore-user-config` | no call | no call | fails: 401 from the API |
| `--ignore-user-config -c cli_auth_credentials_store="keyring"` (chosen) | 19,447 | 39,044 | works |

Facts:

- A `-c` override of a whole table merges with the user config and does not empty it, so `mcp_servers={}` left every server running.
- `--ignore-user-config` skips the whole user config and, by its own help text, keeps auth in `CODEX_HOME`. It still failed with 401, because the config also names the credential store (`cli_auth_credentials_store = "keyring"`) and without that line Codex looks in the wrong place. Passing that one setting back with `-c` fixes it. The tool reads that one line from `config.toml` at run time and passes it through. It reads a setting name and its value, never a key.
- Without the user config, the model was still `gpt-6-astra` (checked in the session file), so the tool passes no `-m`. The reasoning effort, service tier and personality from the user config no longer apply to the worker. Add `-c` overrides in the tool if the coordinator needs them.
- The hello task cut is 53 percent. No `.jacobian/` folder appears in the worker's cwd now, and the MCP transport errors on stderr are gone.

## Commands needed outside this repo

None. No changes to `~/.claude`, `~/.codex` or `~/.prime`. The probes wrote sessions into `~/.claude/projects/` and `~/.codex/sessions/`, as any run does.

## Left for later

- A `--system-prompt-file` for the Claude worker, if the remaining 18,000 tokens matter. It would replace Claude Code's own instructions, so it needs a design pass.
- Codex reasoning effort for writing tasks (the user config sets `ultra`, and the worker now runs Codex's default).
- The launcher could export `LAURELIN_MODEL` into the worker file's `model` field. Not done, because the brief did not ask for it.
