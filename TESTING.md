# Testing the harness yourself

Status 2026-09-25: the first six pieces are merged and their tests pass. This guide is for the `testing` worktree. Open it in an Orca terminal and run the commands from its root.

## 0. Build the forked agent (once per worktree)

The harness is now a fork of Prime Agent, named `laurelin`, whose source lives under `agent/`. Build it once:

```
bin/build-agent.sh
```

It installs dependencies inside `agent/` and builds in about ten seconds. After that `bin/laurelin-agent` uses the fork.

The fork never touches your installed Prime Agent. It keeps its own settings folder, `~/.laurelin/agent`, created on first run, with only your sign-in file linked from `~/.prime/agent` so the subscriptions work. Its sessions, settings, theme and Python kernel live there. It also runs its own background service, keyed to the build, so `bin/laurelin-agent status` lists it beside Prime's. Old fork services show as stale after a rebuild; `bin/laurelin-agent shutdown` is Prime's command and stops Prime's too, so leave them, they cost nothing.

If a `laurelin` session was open before a rebuild, type `/quit` (or press Ctrl+C twice) and start it again to get the new code.

## 1. Run the automatic tests

```
tests/run-all.sh
```

This runs all six tests in step order. It makes real model calls on your subscriptions and one or two Jev calls. It stops at the first failure and prints why.

## 2. Start the harness

```
bin/laurelin-agent
```

This starts Prime Agent with the Laurelin pack, the theme and the gates. Nothing is installed. Plain `prime-agent` is unchanged. The `--help` text:

```
laurelin: Prime Agent with the Laurelin package.

Usage:
  laurelin                      Open an interactive session.
  laurelin "task"               Open a session and start with this task.
  laurelin -p "question"        Print one answer and exit. Good for scripts.
  laurelin --autonomous "task"  Run until every gate in pack/gates passes,
                                or Prime's limits stop it.
  laurelin agents               See running and saved sessions, and reattach.
  laurelin list                 List agents.
  laurelin attach <agent>       Attach the screen to a running agent.
  laurelin send <agent> "msg"   Send a message to a running agent.
  laurelin stop <agent>         Stop an agent.
  laurelin schedule ...         Prompts that run later or on a schedule.
  laurelin keys add NAME        Store a key. You type the value; it is not shown.
  laurelin keys list            Show key names and which tool uses each.
  laurelin keys check           Show which expected keys are present or missing.
  laurelin --help               This text.

Any other flag goes straight to prime-agent (for example --model, --thinking,
--continue). Run "prime-agent --help" for the full list.

Keys are read from /Users/Joe/.config/agent-keys/env at launch. Values are never printed.

To run "laurelin" from anywhere, make one symlink:
  ln -s "$PWD/bin/laurelin-agent" ~/.local/bin/laurelin-agent
```

## 3. Look at the interface

Follow "Manual test: interface" in `tests/README.md`. In short: title screen, then `/checks demo`, `/approvals demo` and `/approvals`, `/classify red`. Try both a dark and a light Ghostty background with the matching theme. Say whether the title screen drew the mark as an image or as glyphs.

## 4. Try one real job, the whole loop

The task file tells the gates what to check. Give it on the command line:

```
bin/laurelin-agent --target tests/tmp/fog.md --claim "tests/tmp/fog.md has three plain sentences about fog" --autonomous "Create tests/tmp/fog.md with three short plain sentences about morning fog in Simplified Technical English, record evidence for the claim, then say done."
```

Watch the checks panel below the editor: the lights change as each gate runs. `/task` shows the task file. `/route` shows the last routing decision (worker, skill, class, outward, intent, with confidence). If the run needs an outward action, a confirm dialog appears and `/approvals` lists what waited.

## 4a. Memory over the vault, hosted

Once per worktree: `bin/setup-memory.sh` builds the repo-local Python environment with the Polygres SDK (the launcher finds it on its own).

Polygres holds a derived index of the safe vault copy: sections, links and a graph, with full-text search live and meaning search once the embedding job finishes. Try it from the repo's venv:

```
set -a; . ~/.config/agent-keys/env; set +a
.laurelin/venv/bin/python pack/memory/query.py --polygres --k 5 "investor playbook"
```

Inside `laurelin-agent`, every new task first injects the top five matching sections with their vault paths; `/memory` shows what was injected. The vault stays the source; nothing in Polygres is authoritative.

## 4b. The test set

```
tests/testset/run.sh --only synthetic-1
```

One synthetic job through Prime with gates, a Jev rubric score and the cost, in about a minute. `tests/testset/baseline.md` has the committed baseline for the three synthetic jobs.

## 4c. Old way: one worker, one gate

In the running session, ask for something small that touches a worker, for example:

```
use delegate_worker with worker claude to write a short plain-text summary of docs/briefs/gates.md into tests/tmp/summary.txt
```

Then run a gate on the result:

```
LAURELIN_TARGET=tests/tmp/summary.txt pack/gates/prose.sh
```

## 5. Things only you can do (rule 17)

The child branches did not touch anything outside the repo. These are the commands they left for you, each optional:

- Put `laurelin-agent` on your PATH: `ln -s "$PWD/bin/laurelin-agent" ~/.local/bin/laurelin-agent`
- Link the skills into every tool: `bin/link-skills.sh --apply` (dry run first without the flag)
- Move keys from `~/.zshrc` into the store: `bin/laurelin-agent keys add CONTEXT_DEV_API_KEY` and the same for GITLAB_TOKEN, then delete the lines in `~/.zshrc`

## 6. What to tell me

Anything that did not match this guide, and whether the image drew. I will fix it on `ideation` and fast-forward `testing`.

## One-time sign-ins inside laurelin-agent

Two servers sign in through the browser the first time, inside an interactive session:

```
laurelin-agent
/mcp login adam
/mcp login polygres
```

Each opens a browser page; approve it, and the session reports the server as connected. Fusion and Jacobian need no sign-in.

Servers brought over from Codex and Claude Code:

```
/mcp login higgsfield                         # browser sign-in, once
aws sso login --profile josephfinberg         # in a shell, when the AWS session has expired
```

Paper connects only while the Paper app is open.

## claude.ai connectors (Gmail, Calendar, Drive, Superhuman, Figma, DocuSign, Claude Docs)

The harness reaches these through Claude Code, which is already signed in to them. No sign-in in the harness.

```
/connectors                 # list them with their tool counts
/connectors refresh         # after adding a connector on claude.ai
```

Then ask in plain words, for example "what's on my calendar tomorrow" or "find the last thread from DocuSign". Sending, replying, sharing, deploying, buying and deleting ask you first. Each call takes a few seconds, because Claude Code starts once per call.

## Worktrees (instead of Orca)

worktrunk (`wt`) makes the worktrees; the harness tracks them.

```
laurelin-agent worktrees start fix-footer --worker claude "Tighten the footer spacing"
laurelin-agent worktrees                      # status, worker, changes, gates, comment
laurelin-agent worktrees watch                # live dashboard, refreshes every 2 seconds, q quits
laurelin-agent worktrees log fix-footer
laurelin-agent worktrees merge fix-footer
```

Inside `laurelin-agent`: `/worktrees` opens a picker (a worktree, then Log, Comment, Status, Stop, Merge or Remove), and the agent can call `worktree_start`, `worktree_list`, `worktree_log`, `worktree_merge` and the rest. Merges and removals ask you first. A TREES line under the gates shows how many are running and how many wait for review.
