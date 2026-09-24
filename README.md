# laurelin-harness

Laurelin's agent harness: a `laurelin` terminal command built on Prime Agent. It routes each task with Jev to a worker (Claude Code and Codex over ACP, Venice, local models) and checks the result before it counts as done.

Status: planning. Read `PLAN.md` first.

## Layout

- `PLAN.md`: the plan of record. The vault note `Laurelin/LaurelinOS/Laurelin Harness Plan.md` is a symlink to this file.
- `pack/`: the Prime Agent package (skills, extensions, prompts). Prime loads it from here (`prime-agent package list`).
- `AGENTS.md`: rules for any agent working in this repo.

## Working in Orca

Each piece of work gets its own Orca worktree off `main`. Merge back when its test passes.
