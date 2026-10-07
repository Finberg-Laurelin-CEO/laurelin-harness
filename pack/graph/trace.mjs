/**
 * Laurelin graph trace: one trace per graph run, and a live view of the graph.
 *
 * Borrowed idea (not the framework): Langfuse's trace of every step, kept local. It reads only what the
 * runner writes under <repo>/.laurelin/graphs/<id>/ (graph.json, state.json, events.jsonl) and writes
 * nothing, so it never interferes with a run.
 *
 *   laurelin-agent graph trace <id> [--json]   one line per step: status, worker, attempts, time, checks
 *   laurelin-agent graph watch <id>            live view, wave by wave; blocked and failed steps in orange
 *   laurelin-agent worktrees watch             shows a GRAPHS section for every run (via graphLines)
 *
 * This module must not import the runner: the runner imports the tracker, and the tracker imports this.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { waves } from "./graph.mjs";

const dirOf = (root, id) => join(root, ".laurelin", "graphs", id);

export function runIds(root) {
	const base = join(root, ".laurelin", "graphs");
	return existsSync(base) ? readdirSync(base).filter((d) => existsSync(join(base, d, "state.json"))) : [];
}

function readRun(root, id) {
	const dir = dirOf(root, id);
	const graph = JSON.parse(readFileSync(join(dir, "graph.json"), "utf8"));
	const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
	let events = [];
	try {
		events = readFileSync(join(dir, "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
	} catch {}
	return { graph, state, events };
}

/** The trace: one span per step, plus totals. Times in ms. */
export function buildTrace(root, id, now = Date.now()) {
	const { graph, state, events } = readRun(root, id);
	const spans = graph.steps.map((s) => {
		const st = state.steps[s.id] ?? {};
		const evs = events.filter((e) => e.step === s.id);
		const firstStart = evs.find((e) => e.event === "started")?.ts ?? st.startedAt;
		const start = firstStart ? Date.parse(firstStart) : null;
		const end = st.endedAt ? Date.parse(st.endedAt) : null;
		const live = st.status === "running" || st.status === "starting";
		return {
			step: s.id,
			kind: s.kind ?? "work",
			worker: (s.kind ?? "work") === "branch" ? "jev" : s.model ? s.model.split("/").pop() : (s.worker ?? "laurelin"),
			status: st.status ?? "pending",
			attempts: st.attempt ?? 0,
			retries: evs.filter((e) => e.event === "retry").length,
			ms: start ? (live ? now : (end ?? now)) - start : 0,
			checks: st.checks ?? [],
			reason: st.reason ?? "",
			choice: st.choice ?? "",
			confidence: st.confidence ?? null,
		};
	});
	const started = Date.parse(state.started);
	const last = events.length ? Date.parse(events.at(-1).ts) : started;
	const finished = events.some((e) => e.event === "finished");
	const count = (f) => spans.filter(f).length;
	const totals = {
		steps: spans.length,
		done: count((s) => s.status === "done"),
		running: count((s) => s.status === "running" || s.status === "starting"),
		blocked: count((s) => s.status === "blocked"),
		failed: count((s) => s.status === "failed"),
		skipped: count((s) => s.status === "skipped"),
		retries: spans.reduce((n, s) => n + s.retries, 0),
		ms: (finished ? last : now) - started,
		finished,
	};
	return { id: graph.id, goal: graph.goal ?? "", spans, totals };
}

export function clock(ms) {
	const s = Math.max(0, Math.round(ms / 1000));
	const m = Math.floor(s / 60);
	if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
	return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Plain text trace, one line per step. */
export function renderTrace(t) {
	const x = t.totals;
	const lines = [
		`TRACE ${t.id}  ${t.goal}`.trimEnd(),
		`  ${x.done}/${x.steps} done   ${x.running} running   ${x.blocked} blocked   ${x.failed} failed   ${x.skipped} skipped   ${x.retries} retries   ${clock(x.ms)}${x.finished ? "   finished" : ""}`,
	];
	for (const s of t.spans) {
		const tail = s.choice ? `-> ${s.choice}${s.confidence != null ? ` (${Number(s.confidence).toFixed(2)})` : ""}` : s.reason || s.checks.join(", ");
		lines.push(`  ${s.step.padEnd(16)} ${s.status.toUpperCase().padEnd(8)} ${s.worker.padEnd(9)} x${s.attempts}  ${clock(s.ms).padStart(6)}  ${tail}`);
	}
	return lines.join("\n");
}

const MARK = { done: "■", running: "●", starting: "●", pending: "□", skipped: "–", blocked: "▲", failed: "✕" };

/**
 * The graph as lines for a terminal, wave by wave. `c` holds colour functions { ink, dim, acc, bold };
 * pass identity functions for plain text. Only blocked and failed steps use the accent.
 */
export function graphLines(root, id, c, now = Date.now()) {
	const t = buildTrace(root, id, now);
	const { graph } = readRun(root, id);
	const span = new Map(t.spans.map((s) => [s.step, s]));
	const cell = (sid) => {
		const s = span.get(sid);
		const label = `${MARK[s.status] ?? "?"} ${sid}`;
		const live = s.status === "running" || s.status === "starting";
		const time = live ? ` ${clock(s.ms)}` : s.choice ? ` -> ${s.choice}` : "";
		if (s.status === "blocked" || s.status === "failed") return c.acc(c.bold(label)) + c.dim(time);
		if (s.status === "done" || live) return c.ink(label) + c.dim(time);
		return c.dim(label + time);
	};
	const x = t.totals;
	const out = [
		`${c.bold(c.ink(t.id))}  ${c.dim(t.goal.slice(0, 60))}`,
		`  ${c.ink(`${x.done}/${x.steps}`)} ${c.dim("DONE")}   ${c.ink(String(x.running))} ${c.dim("RUNNING")}   ` +
			`${(x.blocked ? c.acc : c.ink)(String(x.blocked))} ${c.dim("BLOCKED")}   ${(x.failed ? c.acc : c.ink)(String(x.failed))} ${c.dim("FAILED")}   ${c.dim(clock(x.ms))}`,
	];
	waves(graph).forEach((wave, i) => out.push(`  ${c.dim(`${i + 1}`.padStart(2))}  ${wave.map(cell).join("   ")}`));
	for (const s of t.spans) if (s.status === "blocked" || s.status === "failed") out.push(`      ${c.acc("↳")} ${c.ink(`${s.step}: ${s.reason}`)}`);
	return out;
}

/** Live view of one graph; q quits. */
export function watchGraph(root, id, intervalMs = 2000) {
	const c = {
		ink: (t) => `\x1b[39m${t}`,
		dim: (t) => `\x1b[2m${t}\x1b[22m`,
		acc: (t) => `\x1b[38;2;255;79;0m${t}\x1b[39m`,
		bold: (t) => `\x1b[1m${t}\x1b[22m`,
	};
	const draw = () => {
		let lines;
		try {
			lines = graphLines(root, id, c);
		} catch (e) {
			lines = [`no graph ${id}: ${e.message}`];
		}
		process.stdout.write(`\x1b[H\x1b[2J${c.acc("━━━━")}\n${c.bold("G R A P H")}  ${c.dim(new Date().toLocaleTimeString())}\n\n${lines.join("\n")}\n\n${c.dim(`  q quit   ·   graph trace|status|decide|stop ${id}`)}\n`);
	};
	process.stdout.write("\x1b[?25l");
	draw();
	const timer = setInterval(draw, intervalMs);
	const quit = () => {
		clearInterval(timer);
		process.stdout.write("\x1b[?25h\n");
		process.exit(0);
	};
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.on("data", (b) => ["q", "\u0003", "\u001b"].includes(b.toString()) && quit());
	}
	process.on("SIGINT", quit);
}
