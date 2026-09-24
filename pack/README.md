# laurelin-agent-pack

Laurelin capability package for Prime Agent (also loads in pi).

Install: `prime-agent package install ~/laurelin-agent-pack`

Tier 1 (always on) skills live in `skills/`. For now, each entry is a symlink to the
canonical copy in `~/.claude/skills`. Later, move the canonical copies here and point
Claude Code, pi, and Codex at this folder.

Planned:
- `vault-maintenance` skill
- `gbrain-retrieval` skill (after gbrain is re-synced; last import 2026-08-16)
- extension: vault context load, dated WORK-LOG, outbound-send gate
- autonomous gates: ste-lint, jev-sweep, reactor calcs
