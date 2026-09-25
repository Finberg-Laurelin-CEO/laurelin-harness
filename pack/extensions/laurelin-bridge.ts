/**
 * laurelin-bridge: real check lights (PLAN.md section 20, wave 2, bridge).
 *
 * Every gate appends one JSON line to decision-log/gates.jsonl. This
 * extension tails that file and turns each new line into a `laurelin:check`
 * event on the shared bus, `{ name, state: pass | fail | skipped, detail }`,
 * which laurelin-ui draws as a light. On session_start it replays the last
 * result per check, so a resumed session shows the state the gates left.
 *
 * The file is polled with ctx.setInterval (Prime's own timer, cancelled on
 * unload) rather than fs.watch, because the log and its folder may not exist
 * yet when the session starts, and a gate may write from another process.
 */

import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const HERE = dirname(fileURLToPath(import.meta.url)); // <repo>/pack/extensions
const REPO = resolve(HERE, "..", "..");
const POLL_MS = 500;

/** Same default as pack/gates/lib.sh. */
export function gateLogPath(): string {
	return process.env.LAURELIN_GATE_LOG || join(REPO, "decision-log", "gates.jsonl");
}

/** Gate names as the log spells them, mapped to the names on the checks panel. */
const PANEL_NAMES: Record<string, string> = { verbatim: "word for word" };

export interface CheckEvent {
	name: string;
	state: "pass" | "fail" | "skipped";
	detail?: string;
}

/** One gate log line to one check event, or undefined when the line is not one. */
export function toCheckEvent(line: string): CheckEvent | undefined {
	let row: { check?: unknown; result?: unknown; answer?: unknown; confidence?: unknown };
	try {
		row = JSON.parse(line);
	} catch {
		return undefined;
	}
	if (typeof row.check !== "string") return undefined;
	const state = row.result === "pass" || row.result === "fail" || row.result === "skipped" ? row.result : undefined;
	if (!state) return undefined;
	const answer = typeof row.answer === "string" ? row.answer : "";
	const confidence = typeof row.confidence === "number" ? row.confidence : 1;
	let detail: string | undefined;
	if (state === "pass") detail = confidence < 1 ? `jev ${confidence.toFixed(2)}` : undefined;
	else detail = answer || undefined;
	return { name: PANEL_NAMES[row.check] ?? row.check, state, detail };
}

/** Reads the lines appended to a file since the last call. Starts over if the file shrinks. */
export class LogTail {
	private offset = 0;
	constructor(private path: string) {}
	readNew(): string[] {
		if (!existsSync(this.path)) {
			this.offset = 0;
			return [];
		}
		const size = statSync(this.path).size;
		if (size < this.offset) this.offset = 0;
		if (size === this.offset) return [];
		const buf = Buffer.alloc(size - this.offset);
		const fd = openSync(this.path, "r");
		try {
			readSync(fd, buf, 0, buf.length, this.offset);
		} finally {
			closeSync(fd);
		}
		const text = buf.toString("utf8");
		const end = text.lastIndexOf("\n");
		if (end < 0) return []; // a line still being written; read it next time
		this.offset += Buffer.byteLength(text.slice(0, end + 1), "utf8");
		return text.slice(0, end).split("\n").filter((l) => l.trim());
	}
}

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let owner: ExtensionContext | undefined;

	pi.on("session_start", async (_event, ctx) => {
		if (timer) owner?.clearInterval(timer);
		const tail = new LogTail(gateLogPath());
		// Replay: the last result per check from everything already in the log.
		const last = new Map<string, CheckEvent>();
		for (const line of tail.readNew()) {
			const ev = toCheckEvent(line);
			if (ev) last.set(ev.name, ev);
		}
		for (const ev of last.values()) pi.events.emit("laurelin:check", ev);
		owner = ctx;
		timer = ctx.setInterval(() => {
			for (const line of tail.readNew()) {
				const ev = toCheckEvent(line);
				if (ev) pi.events.emit("laurelin:check", ev);
			}
		}, POLL_MS);
	});

	pi.on("session_shutdown", async () => {
		if (timer) owner?.clearInterval(timer);
		timer = undefined;
		owner = undefined;
	});
}
