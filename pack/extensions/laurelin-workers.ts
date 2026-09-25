/**
 * Laurelin workers (PLAN.md Step 2).
 *
 * Two tools for the coordinator model:
 *
 * - delegate_worker: hand one task to a foreign worker, Claude Code
 *   (`claude -p`, Claude subscription) or Codex (`codex exec`, ChatGPT
 *   subscription). Both stream one JSON event per line, so every tool call
 *   reaches Prime's progress display through onUpdate. The worker is
 *   sandboxed to its working folder: it may read, edit and run tests; it
 *   may not fetch the web, push, or call outward commands.
 *
 * - call_model: one question to any model Prime has configured, answered as
 *   text, without changing the coordinator's own model. Same pattern as
 *   Prime's qna and summarize examples.
 *
 * Prime-model fan-out is not here: Prime's own `rlm.spawn` does that.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { complete, StringEnum, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ---------- sandbox presets ----------

// Claude Code: tool names and Bash patterns. Anything not listed is denied
// without a prompt in -p mode.
const CLAUDE_ALLOWED = [
	"Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS",
	"Bash(ls:*)", "Bash(cat:*)", "Bash(npm test:*)", "Bash(npm run test:*)",
	"Bash(npx vitest:*)", "Bash(npx jest:*)", "Bash(node --test:*)", "Bash(bun test:*)",
	"Bash(pytest:*)", "Bash(python -m pytest:*)", "Bash(cargo test:*)", "Bash(go test:*)",
];
const CLAUDE_DISALLOWED = [
	"WebFetch", "WebSearch", "Bash(git push:*)", "Bash(curl:*)", "Bash(wget:*)",
	"Bash(gh:*)", "Bash(ssh:*)", "Bash(scp:*)", "Bash(npm publish:*)", "Bash(vercel:*)",
];
const CLAUDE_FILE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

const DEFAULT_TIMEOUT_SECONDS = 1200;
const SNAPSHOT_SKIP = new Set([".git", "node_modules", ".venv", "__pycache__", ".jacobian"]);
const SNAPSHOT_MAX_ENTRIES = 20000;

// ---------- helpers ----------

type Snapshot = Map<string, string>;

/** Path -> "mtime:size" for every file under root, so we can report what a worker changed. */
function snapshotDir(root: string): Snapshot {
	const out: Snapshot = new Map();
	const walk = (dir: string) => {
		if (out.size >= SNAPSHOT_MAX_ENTRIES) return;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of entries) {
			if (SNAPSHOT_SKIP.has(name)) continue;
			const full = join(dir, name);
			let st;
			try {
				st = statSync(full);
			} catch {
				continue;
			}
			if (st.isDirectory()) walk(full);
			else out.set(relative(root, full), `${st.mtimeMs}:${st.size}`);
		}
	};
	walk(root);
	return out;
}

function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
	const changed: string[] = [];
	for (const [p, sig] of after) if (before.get(p) !== sig) changed.push(p);
	for (const p of before.keys()) if (!after.has(p)) changed.push(`${p} (deleted)`);
	return changed.sort();
}

function shortArgs(input: unknown): string {
	if (!input || typeof input !== "object") return "";
	const o = input as Record<string, unknown>;
	const key = o.file_path ?? o.notebook_path ?? o.command ?? o.pattern ?? o.path;
	const s = typeof key === "string" ? key : JSON.stringify(o);
	return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

interface WorkerRun {
	text: string;
	filesFromEvents: string[];
	isError: boolean;
	errorText: string;
}

/**
 * Spawn a worker command, feed it the prompt on stdin, and parse one JSON
 * event per stdout line. `onEvent` turns each event into a progress line
 * and may record text and files. Resolves when the process exits.
 */
async function runJsonLines(
	cmd: string,
	args: string[],
	cwd: string,
	prompt: string,
	env: NodeJS.ProcessEnv,
	timeoutMs: number,
	signal: AbortSignal | undefined,
	onEvent: (ev: Record<string, unknown>, run: WorkerRun) => string | undefined,
	progress: (line: string) => void,
): Promise<WorkerRun> {
	const run: WorkerRun = { text: "", filesFromEvents: [], isError: false, errorText: "" };
	const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
	let timedOut = false;
	let aborted = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill("SIGTERM");
	}, timeoutMs);
	const onAbort = () => {
		aborted = true;
		child.kill("SIGTERM");
	};
	signal?.addEventListener("abort", onAbort, { once: true });

	let stderr = "";
	child.stderr.on("data", (d) => {
		stderr += String(d);
		if (stderr.length > 20000) stderr = stderr.slice(-20000);
	});
	child.stdin.on("error", () => {});
	child.stdin.end(prompt);

	const rl = createInterface({ input: child.stdout });
	rl.on("line", (line) => {
		if (!line.trim()) return;
		let ev: Record<string, unknown>;
		try {
			ev = JSON.parse(line);
		} catch {
			return;
		}
		const p = onEvent(ev, run);
		if (p) progress(p);
	});

	const code: number | null = await new Promise((res) => {
		child.on("error", (e) => {
			run.errorText = e.message;
			res(-1);
		});
		child.on("close", (c) => res(c));
	});
	clearTimeout(timer);
	signal?.removeEventListener("abort", onAbort);
	rl.close();

	if (aborted) throw new Error(`${cmd} worker cancelled`);
	if (timedOut) throw new Error(`${cmd} worker timed out after ${Math.round(timeoutMs / 1000)}s`);
	if (run.isError) throw new Error(`${cmd} worker reported an error: ${run.errorText || run.text}`);
	if (code !== 0 && !run.text) {
		throw new Error(`${cmd} exited with code ${code}${run.errorText ? `: ${run.errorText}` : ""}\n${stderr.trim().slice(-2000)}`);
	}
	return run;
}

// ---------- per-worker event parsers ----------

function claudeEvent(ev: Record<string, unknown>, run: WorkerRun, names: Map<string, string>): string | undefined {
	const type = ev.type;
	if (type === "assistant" || type === "user") {
		const msg = ev.message as { content?: unknown } | undefined;
		const blocks = Array.isArray(msg?.content) ? (msg!.content as Record<string, unknown>[]) : [];
		const lines: string[] = [];
		for (const b of blocks) {
			if (b.type === "tool_use") {
				const name = String(b.name ?? "tool");
				names.set(String(b.id), name);
				if (CLAUDE_FILE_TOOLS.has(name)) {
					const inp = b.input as Record<string, unknown> | undefined;
					const fp = inp?.file_path ?? inp?.notebook_path;
					if (typeof fp === "string") run.filesFromEvents.push(fp);
				}
				lines.push(`→ ${name} ${shortArgs(b.input)}`);
			} else if (b.type === "tool_result") {
				const name = names.get(String(b.tool_use_id)) ?? "tool";
				lines.push(`← ${name}${b.is_error ? " (error)" : ""}`);
			}
		}
		return lines.length ? lines.join("\n") : undefined;
	}
	if (type === "result") {
		run.text = typeof ev.result === "string" ? ev.result : "";
		run.isError = ev.is_error === true;
		if (run.isError) run.errorText = `${ev.subtype ?? ""} ${run.text}`.trim();
		return undefined;
	}
	return undefined;
}

function codexEvent(ev: Record<string, unknown>, run: WorkerRun): string | undefined {
	const type = ev.type;
	const item = ev.item as Record<string, unknown> | undefined;
	if ((type === "item.started" || type === "item.completed") && item) {
		const kind = item.type;
		if (kind === "command_execution") {
			return type === "item.started"
				? `→ shell ${shortArgs({ command: item.command })}`
				: `← shell exit ${item.exit_code ?? "?"}`;
		}
		if (kind === "file_change" && type === "item.completed") {
			const changes = Array.isArray(item.changes) ? (item.changes as Record<string, unknown>[]) : [];
			const paths = changes.map((c) => String(c.path ?? "")).filter(Boolean);
			run.filesFromEvents.push(...paths);
			return `→ edit ${paths.join(", ")}`;
		}
		if (kind === "agent_message" && type === "item.completed") {
			run.text = String(item.text ?? "");
			return undefined;
		}
		if (kind === "error") return `! ${String(item.message ?? "")}`;
	}
	if (type === "turn.failed" || type === "error") {
		run.isError = true;
		run.errorText = String((ev.error as { message?: string } | undefined)?.message ?? ev.message ?? "turn failed");
	}
	return undefined;
}

// ---------- extension ----------

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "delegate_worker",
		label: "Delegate to worker",
		description:
			"Hand one self-contained task to a foreign coding worker: 'claude' (Claude Code on the Claude subscription) " +
			"or 'codex' (Codex on the ChatGPT subscription). The worker may read and edit files under cwd and run tests. " +
			"It cannot reach the network, push, or run outward commands. Returns the worker's final text and the files it changed. " +
			"Output is truncated at 50KB.",
		promptGuidelines: [
			"Use delegate_worker for a task that needs many file edits or a long piece of writing; give it the full task in one message, since the worker cannot ask questions.",
			"delegate_worker cannot send email, deploy, push or pay; those wait for Joe.",
		],
		parameters: Type.Object({
			worker: StringEnum(["claude", "codex"] as const, { description: "Which worker runs the task" }),
			task: Type.String({ description: "The full task, written for someone with no context" }),
			cwd: Type.Optional(Type.String({ description: "Working folder for the worker (default: current cwd)" })),
			files: Type.Optional(Type.Array(Type.String(), { description: "Paths the worker should look at first" })),
			timeout_seconds: Type.Optional(Type.Number({ description: `Kill the worker after this long (default ${DEFAULT_TIMEOUT_SECONDS})` })),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			const cwd = resolve(ctx.cwd, params.cwd ?? ".");
			if (!existsSync(cwd)) throw new Error(`cwd does not exist: ${cwd}`);
			const prompt = params.files?.length
				? `${params.task}\n\nFiles to look at first:\n${params.files.map((f) => `- ${f}`).join("\n")}`
				: params.task;
			const timeoutMs = (params.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

			const progressLines: string[] = [];
			const progress = (line: string) => {
				progressLines.push(line);
				onUpdate?.({
					content: [{ type: "text", text: progressLines.slice(-25).join("\n") }],
					details: { worker: params.worker, events: progressLines.length },
				});
			};

			const before = snapshotDir(cwd);
			let run: WorkerRun;
			if (params.worker === "claude") {
				const names = new Map<string, string>();
				run = await runJsonLines(
					"claude",
					[
						"-p", "--output-format", "stream-json", "--verbose",
						"--permission-mode", "acceptEdits",
						"--allowedTools", CLAUDE_ALLOWED.join(","),
						"--disallowedTools", CLAUDE_DISALLOWED.join(","),
					],
					cwd,
					prompt,
					// ECC's GateGuard hook blocks the first shell command of any Claude Code session.
					// The worker has no one to answer it, so it is switched off for the child only.
					{ ...process.env, ECC_GATEGUARD: "off" },
					timeoutMs,
					signal,
					(ev, r) => claudeEvent(ev, r, names),
					progress,
				);
			} else {
				const lastFile = join(mkdtempSync(join(tmpdir(), "laurelin-codex-")), "last.txt");
				run = await runJsonLines(
					"codex",
					[
						"exec", "--json", "--sandbox", "workspace-write", "--skip-git-repo-check",
						"-C", cwd, "-o", lastFile, "-",
					],
					cwd,
					prompt,
					process.env,
					timeoutMs,
					signal,
					codexEvent,
					progress,
				);
				if (existsSync(lastFile)) {
					const last = readFileSync(lastFile, "utf8").trim();
					if (last) run.text = last;
				}
			}
			const after = snapshotDir(cwd);
			const changed = new Set(diffSnapshots(before, after));
			for (const f of run.filesFromEvents) changed.add(relative(cwd, resolve(cwd, f)));
			const files = [...changed].sort();

			let text = `${run.text.trim() || "(worker returned no text)"}\n\nFiles changed (${files.length}):\n${
				files.length ? files.map((f) => `- ${f}`).join("\n") : "- none detected"
			}`;
			const t = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
			if (t.truncated) text = `${t.content}\n\n[Output truncated to ${DEFAULT_MAX_LINES} lines / 50KB]`;
			return {
				content: [{ type: "text", text }],
				details: { worker: params.worker, cwd, files, events: progressLines.length },
			};
		},
	});

	pi.registerTool({
		name: "call_model",
		label: "Call model",
		description:
			"Ask one question of another configured model and get its answer as text. The coordinator's own model " +
			"stays the same. model is 'provider/id' (for example openai-codex/gpt-5.6-sol) or a bare id.",
		promptGuidelines: [
			"Use call_model for a second opinion or a one-off rewrite by a stronger model; use /model to change the main model for the rest of the session.",
		],
		parameters: Type.Object({
			model: Type.String({ description: "provider/id or bare model id" }),
			prompt: Type.String({ description: "The question or instruction" }),
			files: Type.Optional(Type.Array(Type.String(), { description: "Files whose contents are appended to the prompt" })),
		}),
		async execute(_id, params, signal, _onUpdate, ctx) {
			const [provider, id] = params.model.includes("/") ? params.model.split("/", 2) : [undefined, params.model];
			const model = provider
				? ctx.modelRegistry.find(provider, id)
				: ctx.modelRegistry.getAvailable().find((m) => m.id === id);
			if (!model) throw new Error(`Model not found: ${params.model}`);
			const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok || !auth.apiKey) throw new Error(auth.ok ? `No API key for ${model.provider}` : auth.error);

			let text = params.prompt;
			for (const f of params.files ?? []) {
				const full = resolve(ctx.cwd, f);
				text += `\n\n--- file: ${f} ---\n${readFileSync(full, "utf8").slice(0, 200_000)}`;
			}
			const userMessage: UserMessage = { role: "user", content: [{ type: "text", text }], timestamp: Date.now() };
			const response = await complete(model, { messages: [userMessage] }, { apiKey: auth.apiKey, headers: auth.headers, signal });
			if (response.stopReason === "aborted") throw new Error("call_model cancelled");
			const answer = response.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("\n");
			return { content: [{ type: "text", text: answer }], details: { model: `${model.provider}/${model.id}` } };
		},
	});
}
