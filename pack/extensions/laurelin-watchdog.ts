/**
 * Laurelin watchdog: one line above the input that always says what the agent is doing, and how long.
 *
 *   ● THINKING   0:42            the model is reasoning (silent thinking is normal; max effort can take a minute)
 *   ● WRITING    0:05            the reply is streaming
 *   ● BASH       1:10  sleep 150 && echo …   a tool is running
 *   ● WAITING    0:30  approval  an approval needs Joe
 *   ■ STALLED?   BASH quiet 10:00 · type to steer, Esc to stop      (orange)
 *
 * A stall is no event for LAURELIN_STALL_TOOL_S (default 600) while a tool runs, or LAURELIN_STALL_MODEL_S
 * (default 300) while the model works. A stall is shown, told once, and logged to decision-log/stalls.jsonl
 * with its cause. The watchdog never stops or restarts anything by itself.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOG = join(process.env.LAURELIN_DECISION_LOG || join(REPO, "decision-log"), "stalls.jsonl");
const STALL_TOOL_S = Number(process.env.LAURELIN_STALL_TOOL_S) || 600;
const STALL_MODEL_S = Number(process.env.LAURELIN_STALL_MODEL_S) || 300;

type Phase = "idle" | "thinking" | "writing" | "tool" | "waiting";

export interface WatchState {
	phase: Phase;
	since: number; // when this phase began
	last: number; // last sign of life
	tool: string; // tool name, when phase is tool
	detail: string; // tool argument, or what is awaited
	stallReported: boolean;
}

export function fresh(now = Date.now()): WatchState {
	return { phase: "idle", since: now, last: now, tool: "", detail: "", stallReported: false };
}

export function clock(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const m = Math.floor(s / 60);
	if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
	return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Is the agent stalled now? Thinking and writing share the model limit; a running tool has its own. */
export function stalled(st: WatchState, now = Date.now(), toolS = STALL_TOOL_S, modelS = STALL_MODEL_S): boolean {
	if (st.phase === "idle" || st.phase === "waiting") return false;
	const quiet = (now - st.last) / 1000;
	return st.phase === "tool" ? quiet >= toolS : quiet >= modelS;
}

/** A short, single-line view of a tool's arguments. */
export function argPreview(args: any): string {
	const a = args ?? {};
	const raw =
		typeof a.command === "string" ? a.command
		: typeof a.code === "string" ? a.code
		: typeof a.path === "string" ? a.path
		: typeof a.file_path === "string" ? a.file_path
		: "";
	const one = String(raw).replace(/\s+/g, " ").trim();
	return one.length > 56 ? `${one.slice(0, 55)}…` : one;
}

type Theme = { fg: (c: string, s: string) => string; bold: (s: string) => string };

export function line(st: WatchState, t: Theme, now = Date.now(), toolS = STALL_TOOL_S, modelS = STALL_MODEL_S): string | undefined {
	if (st.phase === "idle") return undefined;
	const name = st.phase === "tool" ? (st.tool || "tool").toUpperCase() : st.phase.toUpperCase();
	if (stalled(st, now, toolS, modelS)) {
		return ` ${t.fg("accent", "■")} ${t.bold(t.fg("accent", "STALLED?"))}  ${t.fg("text", `${name} quiet ${clock(now - st.last)}`)}  ${t.fg("dim", "· type to steer, Esc to stop")}`;
	}
	const elapsed = clock(now - st.since);
	return ` ${t.fg("dim", "●")} ${t.fg("text", name.padEnd(10))}${t.fg("dim", elapsed.padStart(6))}${st.detail ? `  ${t.fg("dim", st.detail)}` : ""}`;
}

export default function (pi: ExtensionAPI) {
	let ui: any;
	let st = fresh();
	let timer: any;
	let session = "unknown";

	const draw = () => {
		if (!ui?.hasUI) return;
		try {
			const text = line(st, ui.ui.theme);
			ui.ui.setWidget("watchdog", text ? [text] : undefined, { placement: "aboveEditor" });
		} catch {
			/* stale ctx after /reload */
		}
	};
	const set = (phase: Phase, tool = "", detail = "") => {
		const now = Date.now();
		if (phase !== st.phase || tool !== st.tool) st = { phase, since: now, last: now, tool, detail, stallReported: false };
		else Object.assign(st, { last: now, detail, stallReported: false });
		draw();
	};
	const alive = () => {
		st.last = Date.now();
		st.stallReported = false;
	};

	const check = () => {
		if (!stalled(st) || st.stallReported) return draw();
		st.stallReported = true;
		const quiet = Math.round((Date.now() - st.last) / 1000);
		const what = st.phase === "tool" ? `${st.tool} ${st.detail}`.trim() : st.phase;
		try {
			mkdirSync(dirname(LOG), { recursive: true });
			appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), session, phase: st.phase, detail: what, quiet_s: quiet }) + "\n");
		} catch {
			/* logging is best effort */
		}
		try {
			ui?.ui.notify(`Stalled? ${what} has been quiet for ${clock(quiet * 1000)}. Type a message to steer it, or press Esc to stop.`, "warning");
		} catch {
			/* no screen */
		}
		draw();
	};

	pi.on("session_start", async (_e, ctx) => {
		ui = ctx;
		session = (ctx as any).sessionManager?.getSessionId?.() ?? session;
		st = fresh();
		draw();
		const tick = () => {
			try {
				check();
			} catch {
				/* never throw from a timer */
			}
		};
		const host = typeof (ctx as any).setInterval === "function";
		if (timer) host ? (ctx as any).clearInterval(timer) : clearInterval(timer);
		timer = host ? (ctx as any).setInterval(tick, 1000) : setInterval(tick, 1000);
	});
	pi.on("session_shutdown", async (_e, ctx) => {
		if (timer) typeof (ctx as any)?.clearInterval === "function" ? (ctx as any).clearInterval(timer) : clearInterval(timer);
		timer = undefined;
	});

	pi.on("agent_start", async (_e, ctx) => {
		ui = ctx;
		set("thinking");
	});
	pi.on("turn_start", async () => set("thinking"));
	pi.on("message_update", async (e: any) => {
		const kind: string = e?.assistantMessageEvent?.type ?? "";
		if (kind.startsWith("thinking") && st.phase !== "thinking") set("thinking");
		else if (kind.startsWith("text") && st.phase !== "writing") set("writing");
		else alive();
	});
	pi.on("tool_execution_start", async (e: any) => set("tool", String(e.toolName ?? "tool"), argPreview(e.args)));
	pi.on("tool_execution_update", async () => alive());
	pi.on("tool_execution_end", async () => set("thinking"));
	pi.on("agent_end", async () => set("idle"));

	pi.events?.on?.("laurelin:approval", () => set("waiting", "", "approval"));
	pi.events?.on?.("laurelin:approval-decided", () => set("thinking"));
}
