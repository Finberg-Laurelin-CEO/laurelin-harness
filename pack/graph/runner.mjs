/**
 * Laurelin graph runner: runs a task graph (pack/graph/graph.mjs) with workers in worktrees, durably.
 *
 * Borrowed idea (not the framework): Temporal's durable execution. Every change is saved to disk before
 * the next action, so a crash, a closed terminal or a reboot loses nothing: `graph resume <id>` carries on.
 *
 * Files, under <main repo>/.laurelin/graphs/<id>/:
 *   graph.json     the graph as started
 *   state.json     { id, started, loopPid, steps: { stepId: { status, attempt, branch, path, pid, output,
 *                    choice, confidence, reason, startedAt, endedAt } } }   (times are ISO 8601, UTC)
 *   outputs/<step>.md   each finished step's result (merges read these; worktrees can then be removed)
 *   events.jsonl   one line per event: { ts, step, event, ...detail }   (graph-trace builds on this)
 *   loop.log       the background loop's own log
 *
 * A pass (tick):
 *   1. running steps: a worker that has exited is judged by its <worktree>/.laurelin/out.md. Text that
 *      starts with "BLOCKED:" blocks the step for Joe; other text passes through verify() and is done;
 *      no file is a failed attempt, retried once (LAURELIN_GRAPH_ATTEMPTS, default 2) in a fresh worktree.
 *      A step running longer than LAURELIN_GRAPH_STEP_TIMEOUT seconds (default 3600) is stopped and retried.
 *   2. skipped steps are marked.
 *   3. branch steps are decided by Jev; a confidence under 0.6 blocks the branch for Joe.
 *   4. ready work and merge steps start, at most LAURELIN_GRAPH_PARALLEL (default 3) at a time.
 *
 * Nothing here merges, pushes or removes a worktree. Joe merges.
 */

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { branchRequest, check, finished, promptFor, ready, skips } from "./graph.mjs";
import { verify } from "./verify.mjs";
import * as tracker from "../worktrees/tracker.mjs";
import { buildTrace, renderTrace, watchGraph } from "./trace.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const ATTEMPTS = Number(process.env.LAURELIN_GRAPH_ATTEMPTS) || 2;
const PARALLEL = Number(process.env.LAURELIN_GRAPH_PARALLEL) || 3;
const STEP_TIMEOUT_S = Number(process.env.LAURELIN_GRAPH_STEP_TIMEOUT) || 3600;
const JEV_MIN = 0.6;
const now = () => new Date().toISOString();

// ---------- files ----------

export function graphDir(root, id) {
	return join(root, ".laurelin", "graphs", id);
}

export function loadRun(root, id) {
	const dir = graphDir(root, id);
	const graph = JSON.parse(readFileSync(join(dir, "graph.json"), "utf8"));
	const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
	return { dir, graph, state };
}

function saveState(dir, state) {
	const tmp = join(dir, "state.json.tmp");
	writeFileSync(tmp, JSON.stringify(state, null, 2));
	renameSync(tmp, join(dir, "state.json")); // atomic: a crash never leaves half a file
}

function event(dir, step, name, detail = {}) {
	appendFileSync(join(dir, "events.jsonl"), JSON.stringify({ ts: now(), step, event: name, ...detail }) + "\n");
}

function outputsOf(dir, state) {
	const out = {};
	for (const [id, s] of Object.entries(state.steps))
		if (s.status === "done" && s.output) {
			try {
				out[id] = readFileSync(join(dir, s.output), "utf8");
			} catch {}
		}
	return out;
}

const alive = (pid) => {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

// ---------- verify: pack/graph/verify.mjs (sources, named gates, Jev contract check) ----------

// ---------- Jev ----------

function jevBin() {
	if (process.env.JEV_BIN) return process.env.JEV_BIN;
	const local = join(REPO, "bin", "jev");
	return existsSync(local) ? local : "jev";
}

function askJev(request) {
	const r = spawnSync(jevBin(), ["--raw"], { input: JSON.stringify(request), encoding: "utf8", timeout: 60_000 });
	if (r.status !== 0) throw new Error(`jev failed: ${(r.stderr || r.stdout || "").trim().slice(0, 200)}`);
	return JSON.parse(r.stdout).answers;
}

// ---------- start ----------

/** Copy the graph into its folder and create the initial state. Refuses an invalid graph or an existing run. */
export function create(cwd, graph) {
	const problems = check(graph);
	if (problems.length) throw new Error(`invalid graph:\n- ${problems.join("\n- ")}`);
	const root = tracker.mainRoot(cwd);
	const dir = graphDir(root, graph.id);
	if (existsSync(join(dir, "state.json"))) throw new Error(`graph ${graph.id} already exists; use: graph resume ${graph.id}`);
	mkdirSync(join(dir, "outputs"), { recursive: true });
	writeFileSync(join(dir, "graph.json"), JSON.stringify(graph, null, 2));
	const state = { id: graph.id, started: now(), steps: Object.fromEntries(graph.steps.map((s) => [s.id, { status: "pending", attempt: 0 }])) };
	saveState(dir, state);
	event(dir, null, "created", { steps: graph.steps.length });
	return { root, dir, state };
}

function startStep(root, dir, graph, state, step) {
	const s = state.steps[step.id];
	s.attempt = (s.attempt ?? 0) + 1;
	const name = `g-${graph.id}-${step.id}${s.attempt > 1 ? `-r${s.attempt}` : ""}`.replace(/[^A-Za-z0-9._/-]/g, "-");
	const retryNote = s.reason && s.attempt > 1 ? `\n\nThe last attempt did not meet the contract: ${s.reason}` : "";
	// Write ahead: record the intent before creating anything, so a crash here is recoverable (see adopt()).
	Object.assign(s, { status: "starting", branch: name, startedAt: now(), endedAt: undefined });
	saveState(dir, state);
	if (adopt(root, s)) return event(dir, step.id, "adopted", { branch: name });
	const rec = tracker.start(root, { name, task: promptFor(graph, step, outputsOf(dir, state)) + retryNote, worker: step.worker ?? "laurelin", model: step.model });
	Object.assign(s, { status: "running", path: rec.path, pid: rec.pid, model: step.model });
	event(dir, step.id, "started", { attempt: s.attempt, branch: name, worker: step.worker ?? "laurelin", ...(step.model ? { model: step.model } : {}) });
}

/**
 * A step marked "starting" may already have its worktree (the loop died between creating it and saving).
 * If the worktree exists, take it over as running: the next pass judges it by its worker and out.md.
 * Returns true when adopted.
 */
function adopt(root, s) {
	let rec, row;
	try {
		rec = tracker.loadState(root).worktrees?.[s.branch];
		// The tracker's record can lag the branch itself (a crash between the two), so ask worktrunk too.
		row = rec?.path ? null : tracker.list(root).find((r) => r.branch === s.branch);
	} catch {
		return false;
	}
	const path = rec?.path ?? row?.path;
	if (!path) return false;
	Object.assign(s, { status: "running", path, pid: rec?.pid }); // no pid: judged by its out.md on the next pass
	return true;
}

// ---------- one pass ----------

/** One pass over the graph. Saves after every change. Returns { finished, stuck, counts }. */
export async function tick(root, id) {
	const { dir, graph, state } = loadRun(root, id);
	const byId = new Map(graph.steps.map((s) => [s.id, s]));
	const save = () => saveState(dir, state);

	// 0. steps left "starting" by a crash: adopt the worktree if it was created, else start again
	for (const [sid, s] of Object.entries(state.steps)) {
		if (s.status !== "starting") continue;
		if (adopt(root, s)) event(dir, sid, "adopted", { branch: s.branch });
		else {
			Object.assign(s, { status: "pending", attempt: Math.max(0, (s.attempt ?? 1) - 1) });
			event(dir, sid, "restart", { reason: "the loop stopped before the worktree was created" });
		}
		save();
	}

	// 1. running steps
	for (const [sid, s] of Object.entries(state.steps)) {
		if (s.status !== "running") continue;
		const tooLong = s.startedAt && (Date.now() - Date.parse(s.startedAt)) / 1000 > STEP_TIMEOUT_S;
		if (alive(s.pid) && !tooLong) continue;
		if (tooLong && alive(s.pid)) {
			try {
				tracker.stop(root, s.branch);
			} catch {}
			event(dir, sid, "timeout", { after_s: STEP_TIMEOUT_S });
		}
		const outFile = s.path ? join(s.path, ".laurelin", "out.md") : "";
		const text = outFile && existsSync(outFile) ? readFileSync(outFile, "utf8").trim() : "";
		s.endedAt = now();
		if (text.startsWith("BLOCKED:")) {
			Object.assign(s, { status: "blocked", reason: text.slice(8).trim().split("\n")[0] });
			event(dir, sid, "blocked", { reason: s.reason });
		} else if (text) {
			const v = await verify(graph, byId.get(sid), text, { root, dir, state, outFile });
			if (v.ok) {
				writeFileSync(join(dir, "outputs", `${sid}.md`), text + "\n");
				Object.assign(s, { status: "done", output: `outputs/${sid}.md`, reason: undefined, checks: v.checks });
				event(dir, sid, "done", { chars: text.length, checks: v.checks });
			} else {
				Object.assign(s, { status: s.attempt < ATTEMPTS ? "pending" : "failed", reason: v.reason, checks: v.checks });
				event(dir, sid, s.status === "pending" ? "retry" : "failed", { reason: v.reason, attempt: s.attempt, checks: v.checks });
			}
		} else {
			const reason = tooLong ? `no result after ${STEP_TIMEOUT_S} s` : "the worker stopped without writing .laurelin/out.md";
			Object.assign(s, { status: s.attempt < ATTEMPTS ? "pending" : "failed", reason });
			event(dir, sid, s.status === "pending" ? "retry" : "failed", { reason, attempt: s.attempt });
		}
		save();
	}

	// 2. skips
	for (const sid of skips(graph, state.steps)) {
		state.steps[sid].status = "skipped";
		event(dir, sid, "skipped");
		save();
	}

	// 3 and 4. ready steps: branches now, work and merges up to the parallel limit
	let running = Object.values(state.steps).filter((s) => s.status === "running").length;
	for (const sid of ready(graph, state.steps)) {
		const step = byId.get(sid);
		const s = state.steps[sid];
		if ((step.kind ?? "work") === "branch") {
			try {
				const a = askJev(branchRequest(step, outputsOf(dir, state))).choice;
				const conf = a.confidence ?? Math.max(0, ...Object.values(a.probabilities ?? {}));
				if (conf < JEV_MIN) {
					Object.assign(s, { status: "blocked", reason: `Jev unsure (${conf.toFixed(2)}): ${step.question} Pick one of: ${Object.keys(step.options).join(", ")}` });
					event(dir, sid, "blocked", { reason: s.reason });
				} else {
					Object.assign(s, { status: "done", choice: a.choice, confidence: conf, endedAt: now() });
					event(dir, sid, "branch", { choice: a.choice, confidence: conf });
				}
			} catch (e) {
				Object.assign(s, { status: "blocked", reason: String(e.message ?? e) });
				event(dir, sid, "blocked", { reason: s.reason });
			}
			save();
			continue;
		}
		if (running >= PARALLEL) continue;
		try {
			startStep(root, dir, graph, state, step);
			running++;
		} catch (e) {
			Object.assign(s, { status: "failed", reason: `could not start: ${String(e.message ?? e).slice(0, 200)}` });
			event(dir, sid, "failed", { reason: s.reason });
		}
		save();
	}

	const counts = {};
	for (const s of Object.values(state.steps)) counts[s.status] = (counts[s.status] ?? 0) + 1;
	const stuck = !finished(graph, state.steps) && running === 0 && ready(graph, state.steps).length === 0 && skips(graph, state.steps).length === 0;
	return { finished: finished(graph, state.steps), stuck, counts };
}

/** Pick a branch by hand (when Jev was unsure), or reset a blocked or failed step so it runs again. */
export function decide(root, id, stepId, choice) {
	const { dir, graph, state } = loadRun(root, id);
	const step = graph.steps.find((s) => s.id === stepId);
	if (!step) throw new Error(`no step ${stepId}`);
	const s = state.steps[stepId];
	if ((step.kind ?? "work") === "branch") {
		if (!Object.keys(step.options).includes(choice)) throw new Error(`choice must be one of ${Object.keys(step.options).join(", ")}`);
		Object.assign(s, { status: "done", choice, confidence: 1, reason: undefined, endedAt: now() });
		event(dir, stepId, "branch", { choice, by: "joe" });
	} else {
		Object.assign(s, { status: "pending", reason: undefined });
		event(dir, stepId, "retry", { by: "joe" });
	}
	saveState(dir, state);
}

// ---------- the loop ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tick until the graph finishes or nothing more can happen without Joe. */
export async function loop(root, id, intervalMs = Number(process.env.LAURELIN_GRAPH_INTERVAL_MS) || 5000) {
	const { dir, state } = loadRun(root, id);
	state.loopPid = process.pid;
	saveState(dir, state);
	event(dir, null, "loop", { pid: process.pid });
	for (;;) {
		const r = await tick(root, id);
		if (r.finished || r.stuck) {
			event(dir, null, r.finished ? "finished" : "waiting", { counts: r.counts });
			return r;
		}
		await sleep(intervalMs);
	}
}

/** Start the loop in the background; it outlives the terminal. */
export function detach(root, id) {
	const dir = graphDir(root, id);
	const log = openSync(join(dir, "loop.log"), "a");
	const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "loop", id], { cwd: root, detached: true, stdio: ["ignore", log, log], env: process.env });
	child.unref();
	return child.pid;
}

export function stopRun(root, id) {
	const { dir, state } = loadRun(root, id);
	if (state.loopPid && alive(state.loopPid)) {
		try {
			process.kill(state.loopPid);
		} catch {}
	}
	for (const [sid, s] of Object.entries(state.steps))
		if (s.status === "running") {
			try {
				tracker.stop(root, s.branch);
			} catch {}
			Object.assign(s, { status: "pending", pid: undefined });
			event(dir, sid, "stopped");
		}
	saveState(dir, state);
}

export function status(root, id) {
	const { graph, state } = loadRun(root, id);
	const lines = [`GRAPH ${graph.id}  ${graph.goal ?? ""}`.trimEnd(), `  loop ${alive(state.loopPid) ? `running (pid ${state.loopPid})` : "not running"}`];
	for (const s of graph.steps) {
		const st = state.steps[s.id];
		const extra = st.choice ? ` -> ${st.choice}` : st.reason ? `  ${st.reason}` : st.branch ? `  ${st.branch}` : "";
		lines.push(`  ${s.id.padEnd(16)} ${st.status.toUpperCase().padEnd(8)} ${(s.kind ?? "work").padEnd(6)}${extra}`);
	}
	return lines.join("\n");
}

export function runs(root) {
	const base = join(root, ".laurelin", "graphs");
	return existsSync(base) ? readdirSync(base).filter((d) => existsSync(join(base, d, "state.json"))) : [];
}

// ---------- CLI ----------
if (import.meta.url === `file://${process.argv[1]}`) {
	const [cmd, arg, a2, a3] = process.argv.slice(2);
	const root = tracker.mainRoot(process.cwd());
	const usage = "usage: graph plan \"<task>\" --done \"<criteria>\" [--id <id>] [--run] | run <file> [--foreground] | resume <id> | status <id> | trace <id> [--json] | watch <id> | list | stop <id> | decide <id> <step> [choice] | loop <id>";
	try {
		if (cmd === "plan" && arg) {
			const argv = process.argv.slice(3);
			const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
			const { plan, summary } = await import("./planner.mjs");
			const result = plan(root, arg, flag("--done"), { id: flag("--id") });
			console.log(summary(result));
			if (argv.includes("--run")) {
				create(root, result.graph);
				console.log(`started ${result.graph.id} in the background (pid ${detach(root, result.graph.id)}). Follow it: laurelin-agent graph watch ${result.graph.id}`);
			} else console.log(`run it: laurelin-agent graph run ${result.file}`);
		} else if (cmd === "run" && arg) {
			const graph = JSON.parse(readFileSync(arg, "utf8"));
			create(root, graph);
			if (a2 === "--foreground") console.log(JSON.stringify(await loop(root, graph.id)));
			else console.log(`started ${graph.id} in the background (pid ${detach(root, graph.id)}). Follow it: laurelin-agent graph status ${graph.id}`);
		} else if (cmd === "resume" && arg) console.log(`resumed ${arg} (pid ${detach(root, arg)})`);
		else if (cmd === "loop" && arg) await loop(root, arg);
		else if (cmd === "status" && arg) console.log(status(root, arg));
		else if (cmd === "trace" && arg) console.log(a2 === "--json" ? JSON.stringify(buildTrace(root, arg), null, 2) : renderTrace(buildTrace(root, arg)));
		else if (cmd === "watch" && arg) watchGraph(root, arg);
		else if (cmd === "list") console.log(runs(root).map((id) => status(root, id).split("\n").slice(0, 2).join("  ")).join("\n") || "no graphs");
		else if (cmd === "stop" && arg) {
			stopRun(root, arg);
			console.log(`stopped ${arg}`);
		} else if (cmd === "decide" && arg && a2) {
			decide(root, arg, a2, a3);
			console.log(`updated ${a2}; run: laurelin-agent graph resume ${arg}`);
		} else {
			console.error(usage);
			process.exit(2);
		}
	} catch (e) {
		console.error(String(e.message ?? e));
		process.exit(1);
	}
}
