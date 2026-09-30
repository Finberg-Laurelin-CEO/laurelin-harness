import { type AssistantMessage, type AssistantMessageEvent, EventStream } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { Agent, type AgentMessage, type AgentTool } from "../src/index.js";

// Laurelin: a message typed while the agent works stops the current step and is read at once.

class MockStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(e) => e.type === "done" || e.type === "error",
			(e) => {
				if (e.type === "done") return e.message;
				if (e.type === "error") return e.error;
				throw new Error("unexpected");
			},
		);
	}
}

function msg(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "mock",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: Date.now(),
	};
}

const done = (m: AssistantMessage) => {
	const s = new MockStream();
	queueMicrotask(() => s.push({ type: "done", reason: m.stopReason as "stop", message: m }));
	return s;
};

/** A tool that runs for `ms` unless its signal aborts. */
function slowTool(ms: number, started: () => void): AgentTool {
	return {
		name: "slow",
		label: "Slow",
		description: "Slow",
		parameters: Type.Object({}),
		execute: (_id, _p, signal) =>
			new Promise((resolve, reject) => {
				started();
				const t = setTimeout(() => resolve({ content: [{ type: "text", text: "finished" }], details: {} }), ms);
				signal?.addEventListener("abort", () => {
					clearTimeout(t);
					reject(new Error("aborted"));
				});
			}),
	};
}

const steerText = (ctx: { messages: AgentMessage[] }) =>
	ctx.messages.some((m) => m.role === "user" && JSON.stringify(m.content).includes("change course"));

function setup(opts: { steerInterrupts: boolean; toolMs: number }) {
	let calls = 0;
	let secondCallSawSteer = false;
	let toolStarted = () => {};
	const started = new Promise<void>((r) => (toolStarted = r));
	const agent = new Agent({
		steerInterrupts: opts.steerInterrupts,
		initialState: { tools: [slowTool(opts.toolMs, () => toolStarted())] },
		streamFn: (_model, context) => {
			calls += 1;
			if (calls === 1) {
				return done(
					msg(
						[
							{ type: "toolCall", id: "a", name: "slow", arguments: {} },
							{ type: "toolCall", id: "b", name: "slow", arguments: {} },
						],
						"toolUse",
					),
				);
			}
			if (steerText(context)) secondCallSawSteer = true;
			return done(msg([{ type: "text", text: "ok" }], "stop"));
		},
	});
	agent.toolExecution = "sequential" as never;
	return { agent, started, calls: () => calls, sawSteer: () => secondCallSawSteer };
}

describe("steering interrupts the current step", () => {
	it("stops a running tool at once and reads the message next", async () => {
		const { agent, started, sawSteer } = setup({ steerInterrupts: true, toolMs: 10_000 });
		const t0 = Date.now();
		const run = agent.prompt("start");
		await started;
		agent.steer({ role: "user", content: "change course", timestamp: Date.now() });
		await run;
		expect(Date.now() - t0).toBeLessThan(2_000);
		expect(sawSteer()).toBe(true);
		const results = agent.state.messages.filter((m) => m.role === "toolResult");
		expect(results.map((r) => (r as { toolCallId: string }).toolCallId).sort()).toEqual(["a", "b"]);
		expect(JSON.stringify(results)).toContain("Not run: Joe sent a new message");
	});

	it("stops a model reply in progress", async () => {
		let calls = 0;
		let replyStarted = () => {};
		const started = new Promise<void>((r) => (replyStarted = r));
		let sawSteer = false;
		const agent = new Agent({
			steerInterrupts: true,
			streamFn: (_model, context) => {
				calls += 1;
				if (calls === 1) {
					const s = new MockStream();
					queueMicrotask(() => {
						s.push({ type: "start", partial: msg([{ type: "text", text: "thinking" }], "stop") });
						replyStarted();
					});
					return s; // never finishes on its own
				}
				if (steerText(context)) sawSteer = true;
				return done(msg([{ type: "text", text: "ok" }], "stop"));
			},
		});
		const t0 = Date.now();
		const run = agent.prompt("start");
		await started;
		agent.steer({ role: "user", content: "change course", timestamp: Date.now() });
		await run;
		expect(Date.now() - t0).toBeLessThan(2_000);
		expect(calls).toBe(2);
		expect(sawSteer).toBe(true);
	});

	it("waits for the turn when the option is off (Prime's behavior)", async () => {
		const { agent, started, sawSteer } = setup({ steerInterrupts: false, toolMs: 300 });
		const t0 = Date.now();
		const run = agent.prompt("start");
		await started;
		agent.steer({ role: "user", content: "change course", timestamp: Date.now() });
		await run;
		expect(Date.now() - t0).toBeGreaterThanOrEqual(550); // both tools ran to the end
		expect(sawSteer()).toBe(true);
	});

	it("a message from another agent does not interrupt", async () => {
		const { agent, started } = setup({ steerInterrupts: true, toolMs: 300 });
		const t0 = Date.now();
		const run = agent.prompt("start");
		await started;
		agent.steer({ role: "custom", customType: "agent-message", content: "fyi", display: true, timestamp: Date.now() } as never);
		await run;
		expect(Date.now() - t0).toBeGreaterThanOrEqual(550);
	});
});
