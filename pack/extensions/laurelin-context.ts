/**
 * Laurelin context pruning (PLAN.md Step 2, section 18 group 2).
 *
 * Prime fires `context` before every model call with a copy of the message
 * list. When the list is long, this handler asks Jev, in one call, how likely
 * each old tool result is still needed for the current task, and drops the
 * ones Jev scores as stale with confidence. It never touches the last
 * KEEP_LAST messages, and it changes only what is sent to the model, not the
 * saved session, so it runs every turn.
 *
 * Dropping a tool result alone would leave its tool call orphaned; Prime's
 * provider layer would then insert a synthetic "No result provided" error,
 * and the model might rerun the tool. So the matching tool call block is
 * rewritten into a one-line text note at the same time.
 *
 * Every pass is logged to decision-log/context.jsonl under the session cwd
 * (gitignored).
 *
 * Settings: LAURELIN_CONTEXT_THRESHOLD (messages; default 60).
 */

import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_THRESHOLD = 60;
const KEEP_LAST = 10;
const SNIPPET_CHARS = 300;
const STATE_CHARS = 2000;
// Jev's score levels; the answer is a position on this scale (0 to 2).
const CRITERIA = [
	"stale, not needed for the current task",
	"possibly useful later",
	"needed for the current task",
];
const DROP_BELOW_SCORE = 0.5;
const MIN_CONFIDENCE = 0.6; // below this, Jev abstains and the result stays (PLAN.md section 8)

type Msg = Record<string, any>;

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((c) => c && typeof c === "object" && c.type === "text" && typeof c.text === "string")
		.map((c) => c.text)
		.join("\n");
}

interface JevScore {
	score: number;
	confidence: number;
}

/** One batched call to the jev CLI. Returns null when jev is missing or fails. */
function askJev(state: string, questions: Record<string, unknown>): Promise<Record<string, JevScore> | null> {
	return new Promise((res) => {
		const child = spawn("jev", ["--raw"], { stdio: ["pipe", "pipe", "pipe"] });
		let out = "";
		let err = "";
		child.stdout.on("data", (d) => (out += String(d)));
		child.stderr.on("data", (d) => (err += String(d)));
		child.on("error", () => res(null));
		child.on("close", (code) => {
			if (code !== 0) return res(null);
			try {
				const answers = JSON.parse(out).answers as Record<string, JevScore>;
				res(answers);
			} catch {
				res(null);
			}
		});
		child.stdin.on("error", () => {});
		child.stdin.end(JSON.stringify({ state, questions }));
		void err;
	});
}

function logLine(cwd: string, record: Record<string, unknown>) {
	try {
		const dir = join(cwd, "decision-log");
		mkdirSync(dir, { recursive: true });
		appendFileSync(join(dir, "context.jsonl"), `${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`);
	} catch {
		// logging must never break a model call
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("context", async (event, ctx) => {
		const threshold = Number(process.env.LAURELIN_CONTEXT_THRESHOLD) || DEFAULT_THRESHOLD;
		const messages = event.messages as Msg[];
		if (messages.length <= threshold) return;
		const cwd = ctx.cwd ?? process.cwd();

		// Candidates: tool results outside the protected tail.
		const cutoff = messages.length - KEEP_LAST;
		const candidates: { index: number; id: string; tool: string; snippet: string }[] = [];
		for (let i = 0; i < cutoff; i++) {
			const m = messages[i];
			if (m.role !== "toolResult") continue;
			candidates.push({
				index: i,
				id: String(m.toolCallId),
				tool: String(m.toolName),
				snippet: textOf(m.content).slice(0, SNIPPET_CHARS),
			});
		}
		if (candidates.length === 0) return;

		let lastUser = "";
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === "user") {
				lastUser = textOf(messages[i].content);
				break;
			}
		}
		const state = `Current task (last user message):\n${lastUser.slice(0, STATE_CHARS)}`;

		// One score question per result. The snippet goes in the question text,
		// since Jev answers every question over the same state.
		const questions: Record<string, unknown> = {};
		candidates.forEach((c, n) => {
			questions[`r${n}`] = {
				type: "score",
				instructions:
					`An earlier tool result from "${c.tool}" (id ${c.id}), first ${SNIPPET_CHARS} characters:\n"""${c.snippet}"""\n` +
					"How likely is this result still needed for the current task?",
				criteria: CRITERIA,
			};
		});

		const answers = await askJev(state, questions);
		if (!answers) {
			logLine(cwd, { messages: messages.length, candidates: candidates.length, dropped: [], error: "jev unavailable" });
			return;
		}

		const dropIds = new Set<string>();
		const dropped: Record<string, unknown>[] = [];
		const kept: Record<string, unknown>[] = [];
		candidates.forEach((c, n) => {
			const a = answers[`r${n}`];
			if (!a) return;
			const rec = { id: c.id, tool: c.tool, score: a.score, confidence: a.confidence, snippet: c.snippet.slice(0, 80) };
			if (a.score < DROP_BELOW_SCORE && a.confidence >= MIN_CONFIDENCE) {
				dropIds.add(c.id);
				dropped.push(rec);
			} else kept.push(rec);
		});
		if (dropIds.size === 0) {
			logLine(cwd, { messages: messages.length, candidates: candidates.length, dropped: [], kept: kept.length });
			return;
		}

		// Drop the results and rewrite their tool calls. event.messages is a
		// deep copy, so mutating the assistant blocks is safe.
		const filtered: Msg[] = [];
		for (let i = 0; i < messages.length; i++) {
			const m = messages[i];
			if (i < cutoff && m.role === "toolResult" && dropIds.has(String(m.toolCallId))) continue;
			if (i < cutoff && m.role === "assistant" && Array.isArray(m.content)) {
				m.content = m.content.map((b: Msg) =>
					b?.type === "toolCall" && dropIds.has(String(b.id))
						? { type: "text", text: `[Earlier ${b.name} call pruned as stale by laurelin-context]` }
						: b,
				);
			}
			filtered.push(m);
		}
		logLine(cwd, { messages: messages.length, after: filtered.length, candidates: candidates.length, dropped, kept: kept.length });
		return { messages: filtered };
	});
}
