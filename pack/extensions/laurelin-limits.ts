/**
 * Laurelin run limits (plan Step 5, section 19 row 5).
 *
 * Prime has no action-count or dollar limit of its own, so this extension
 * keeps two counters per run and blocks past either:
 *   LAURELIN_MAX_ACTIONS  tool calls per run (default 200)
 *   LAURELIN_MAX_SPEND    dollars per run, summed from usage.cost on every
 *                         assistant message. OFF unless set: Joe's models run on
 *                         subscriptions, and usage.cost is the list API price,
 *                         not money spent (Joe, 2026-09-27).
 *
 * A run is the session since it started or since `/limits reset`. The
 * counters are saved in the session after every change (pi.appendEntry), so
 * a restart picks them up. On session_start after a restart, the last
 * completed tool call is printed so Joe sees where the run stopped before
 * anything is repeated.
 *
 * `createLimiter` and `lastCompletedToolCall` are exported for tests.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface LimitState {
	actions: number;
	spend: number;
	startedAt: string;
	blockedBy: "actions" | "spend" | null;
}

export interface Limits {
	maxActions: number;
	maxSpend: number;
}

export function limitsFromEnv(): Limits {
	const a = Number(process.env.LAURELIN_MAX_ACTIONS);
	const s = Number(process.env.LAURELIN_MAX_SPEND);
	return {
		maxActions: Number.isFinite(a) && a > 0 ? Math.floor(a) : 200,
		maxSpend: Number.isFinite(s) && s > 0 ? s : Infinity,
	};
}

export interface Limiter {
	state: LimitState;
	limits: Limits;
	/** Count one tool call. Returns a block reason past the limit. */
	onToolCall(toolName: string): { block: boolean; reason?: string };
	/** Add one assistant message's cost. Returns a message when the cap is crossed. */
	onAssistantCost(total: number | undefined): string | undefined;
	reset(): void;
	summary(): string;
}

export function createLimiter(limits: Limits = limitsFromEnv(), initial?: Partial<LimitState>): Limiter {
	const fresh = (): LimitState => ({ actions: 0, spend: 0, startedAt: new Date().toISOString(), blockedBy: null });
	const state: LimitState = { ...fresh(), ...initial };
	const money = (n: number) => `$${n.toFixed(2)}`;
	return {
		state,
		limits,
		onToolCall(toolName) {
			if (state.blockedBy === "spend") {
				return { block: true, reason: `Laurelin limit: this run has spent ${money(state.spend)}, past the cap of ${money(limits.maxSpend)} (LAURELIN_MAX_SPEND). Stopped before "${toolName}". Joe can raise the cap or run /limits reset.` };
			}
			state.actions += 1;
			if (state.actions > limits.maxActions) {
				state.blockedBy = "actions";
				return { block: true, reason: `Laurelin limit: ${state.actions - 1} tool calls this run, which is the cap (LAURELIN_MAX_ACTIONS=${limits.maxActions}). Stopped before "${toolName}". Joe can raise the cap or run /limits reset.` };
			}
			return { block: false };
		},
		onAssistantCost(total) {
			if (typeof total !== "number" || !Number.isFinite(total)) return undefined;
			state.spend += total;
			if (state.spend > limits.maxSpend && state.blockedBy !== "spend") {
				state.blockedBy = "spend";
				return `Laurelin limit: spend is ${money(state.spend)}, past the cap of ${money(limits.maxSpend)} (LAURELIN_MAX_SPEND). No more tool calls this run.`;
			}
			return undefined;
		},
		reset() {
			Object.assign(state, fresh());
		},
		summary() {
			const spend = Number.isFinite(limits.maxSpend) ? `${money(state.spend)}/${money(limits.maxSpend)} spent` : `no spend cap (${money(state.spend)} at list API prices)`;
			return `Run limits: ${state.actions}/${limits.maxActions} actions, ${spend}, since ${state.startedAt}${state.blockedBy ? `, BLOCKED (${state.blockedBy})` : ""}`;
		},
	};
}

// ---------- resume: where did the run stop? ----------

export interface LastCall {
	toolName: string;
	/** true when a result exists for the call; false when the call started but no result was saved. */
	completed: boolean;
	isError?: boolean;
	summary: string;
	timestamp?: number;
}

/**
 * Walk session entries and report the last tool call. If the last assistant
 * message asked for a tool and no toolResult follows, the call is reported as
 * not completed: a restart must not assume it ran.
 */
export function lastCompletedToolCall(entries: Array<Record<string, any>>): LastCall | undefined {
	let last: LastCall | undefined;
	const pendingCalls = new Map<string, { toolName: string; summary: string; timestamp?: number }>();
	for (const e of entries) {
		if (e?.type !== "message") continue;
		const m = e.message;
		if (m?.role === "assistant" && Array.isArray(m.content)) {
			for (const c of m.content) {
				if (c?.type === "toolCall") {
					pendingCalls.set(c.id, { toolName: c.name, summary: summarizeArgs(c.name, c.arguments), timestamp: m.timestamp });
				}
			}
		} else if (m?.role === "toolResult") {
			const call = pendingCalls.get(m.toolCallId);
			pendingCalls.delete(m.toolCallId);
			last = { toolName: m.toolName ?? call?.toolName ?? "?", completed: true, isError: !!m.isError, summary: call?.summary ?? "", timestamp: m.timestamp };
		}
	}
	if (pendingCalls.size) {
		const [, open] = [...pendingCalls.entries()].pop()!;
		return { toolName: open.toolName, completed: false, summary: open.summary, timestamp: open.timestamp };
	}
	return last;
}

function summarizeArgs(name: string, args: unknown): string {
	const a = (args ?? {}) as Record<string, unknown>;
	const s = typeof a.command === "string" ? a.command : typeof a.code === "string" ? a.code : typeof a.path === "string" ? a.path : JSON.stringify(a);
	return `${name}: ${String(s).replace(/\s+/g, " ").slice(0, 100)}`;
}

export function resumeLine(last: LastCall | undefined): string {
	if (!last) return "Resumed: no tool call recorded in this session yet.";
	if (!last.completed) return `Resumed: the last tool call STARTED but no result was saved (${last.summary}). Check whether it ran before repeating it.`;
	return `Resumed: last completed tool call was ${last.summary}${last.isError ? " (it returned an error)" : ""}.`;
}

// ---------- Prime extension ----------

const ENTRY = "laurelin-limits";

export default function (pi: ExtensionAPI) {
	const limiter = createLimiter();
	const save = () => pi.appendEntry(ENTRY, limiter.state);
	const say = (ctx: any, text: string, level: "info" | "warning" = "info") => {
		if (ctx.hasUI) ctx.ui.notify(text, level);
		else process.stderr.write(`${text}\n`);
	};

	pi.on("session_start", async (event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		let restored = false;
		for (const e of entries) {
			if (e.type === "custom" && e.customType === ENTRY && e.data) {
				Object.assign(limiter.state, e.data);
				restored = true;
			}
		}
		// A run saved as blocked on spend is unblocked once the spend cap is off.
		if (limiter.state.blockedBy === "spend" && !Number.isFinite(limiter.limits.maxSpend)) limiter.state.blockedBy = null;
		if (restored || event.reason === "resume") {
			say(ctx, resumeLine(lastCompletedToolCall(entries as any)));
			say(ctx, limiter.summary());
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		const r = limiter.onToolCall(event.toolName);
		save();
		if (r.block) {
			say(ctx, r.reason!, "warning");
			return { block: true, reason: r.reason };
		}
		return undefined;
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		const msg = limiter.onAssistantCost((event.message as any).usage?.cost?.total);
		save();
		if (msg) say(ctx, msg, "warning");
	});

	pi.registerCommand("limits", {
		description: "Show this run's action and spend counters; `/limits reset` starts a new run",
		handler: async (args, ctx) => {
			if ((args ?? "").trim() === "reset") {
				limiter.reset();
				save();
				say(ctx, "Run limits reset.");
				return;
			}
			say(ctx, limiter.summary());
		},
	});
}
