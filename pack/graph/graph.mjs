/**
 * Laurelin task graphs: one job as a graph of steps that run as workers in worktrees.
 *
 * Ideas borrowed (not the frameworks): LangGraph's graph with parallel fan-out and fan-in and branch
 * points; CrewAI's task contract ("expects": what done means). The core is pure: it checks a graph,
 * says which steps are ready, which are skipped, and builds each worker's prompt. Running steps is the
 * runner's job (graph-runner); checking outputs is graph-verify's; tracing is graph-trace's.
 *
 * A graph file (JSON):
 *   {
 *     "id": "dcvc-brief",
 *     "goal": "A one-page brief on DCVC for Joe",
 *     "steps": [
 *       { "id": "partners", "kind": "work", "task": "List DCVC's partners", "expects": "names with a source link each" },
 *       { "id": "thesis",   "kind": "work", "task": "Summarise DCVC's fusion thesis", "expects": "3 bullets with sources" },
 *       { "id": "fit",      "kind": "branch", "inputs": ["thesis"], "question": "Does the thesis cover fusion directly?",
 *                           "options": { "yes": [], "no": ["adjacent"] } },
 *       { "id": "adjacent", "kind": "work", "task": "Find their nearest fusion-adjacent deals", "expects": "deals with sources" },
 *       { "id": "brief",    "kind": "merge", "inputs": ["partners", "thesis", "adjacent"], "task": "Write the brief",
 *                           "expects": "one page, every claim sourced" }
 *     ]
 *   }
 *
 * Kinds: work (one worker does a task), merge (one worker combines its inputs; skipped inputs are left
 * out), branch (Jev picks one option; the steps listed under the other options are skipped). An option lists
 * only the steps that run just for that answer; steps after the branch that always run are not listed.
 * Fields: id, kind, task, expects, inputs (step ids), worker (laurelin | claude | codex; default laurelin),
 * model ("provider/model" for a laurelin worker, e.g. "cheaperinference/deepseek-v4-flash" for bulk steps),
 * gates (graph-verify), question and options (branch only).
 *
 * Run state (kept by the runner): { [stepId]: { status, output?, choice?, attempts?, error? } }, where status
 * is pending | running | done | failed | skipped | blocked.
 */

export const KINDS = ["work", "merge", "branch"];
export const WORKERS = ["laurelin", "claude", "codex"];
const FINAL = new Set(["done", "skipped", "failed", "blocked"]);

/** Problems with a graph, as plain sentences. An empty list means the graph is valid. */
export function check(graph) {
	const problems = [];
	if (!graph || typeof graph !== "object") return ["the graph is not an object"];
	if (!graph.id || !/^[a-z0-9][a-z0-9._-]*$/i.test(graph.id)) problems.push("the graph needs an id of letters, digits, dots, dashes or underscores");
	const steps = Array.isArray(graph.steps) ? graph.steps : [];
	if (steps.length === 0) problems.push("the graph has no steps");
	const ids = new Set();
	for (const s of steps) {
		if (!s.id) { problems.push("a step has no id"); continue; }
		if (ids.has(s.id)) problems.push(`two steps are called "${s.id}"`);
		ids.add(s.id);
	}
	for (const s of steps) {
		if (!s.id) continue;
		const kind = s.kind ?? "work";
		if (!KINDS.includes(kind)) problems.push(`step "${s.id}" has an unknown kind "${kind}"`);
		if (s.worker && !WORKERS.includes(s.worker)) problems.push(`step "${s.id}" has an unknown worker "${s.worker}"`);
		if (s.model !== undefined) {
			if (typeof s.model !== "string" || !/^[a-z0-9._-]+\/[A-Za-z0-9._:\/-]+$/i.test(s.model)) problems.push(`step "${s.id}" has a model that is not "provider/model"`);
			else if ((s.worker ?? "laurelin") !== "laurelin") problems.push(`step "${s.id}" names a model, which only a laurelin worker can use`);
		}
		for (const i of s.inputs ?? []) if (!ids.has(i)) problems.push(`step "${s.id}" takes input from "${i}", which does not exist`);
		if (kind !== "branch" && !s.task) problems.push(`step "${s.id}" has no task`);
		if (kind !== "branch" && !s.expects) problems.push(`step "${s.id}" has no "expects" (what done means)`);
		if (kind === "merge" && (s.inputs ?? []).length < 2) problems.push(`merge step "${s.id}" needs at least two inputs`);
		if (kind === "branch") {
			if (!s.question) problems.push(`branch "${s.id}" has no question`);
			const opts = s.options && typeof s.options === "object" ? Object.entries(s.options) : [];
			if (opts.length < 2) problems.push(`branch "${s.id}" needs at least two options`);
			for (const [label, targets] of opts)
				for (const t of Array.isArray(targets) ? targets : [targets])
					if (!ids.has(t)) problems.push(`branch "${s.id}" option "${label}" points to "${t}", which does not exist`);
		}
	}
	const cycle = findCycle(steps);
	if (cycle) problems.push(`the steps form a loop: ${cycle.join(" -> ")}`);
	return problems;
}

/** Edges: inputs, plus branch -> each step it gates. */
function parentsOf(steps) {
	const parents = new Map(steps.map((s) => [s.id, new Set(s.inputs ?? [])]));
	for (const s of steps)
		if ((s.kind ?? "work") === "branch")
			for (const targets of Object.values(s.options ?? {}))
				for (const t of Array.isArray(targets) ? targets : [targets]) parents.get(t)?.add(s.id);
	return parents;
}

function findCycle(steps) {
	const parents = parentsOf(steps);
	const state = new Map(); // 1 visiting, 2 done
	const path = [];
	const visit = (id) => {
		if (state.get(id) === 2) return null;
		if (state.get(id) === 1) return [...path.slice(path.indexOf(id)), id];
		state.set(id, 1);
		path.push(id);
		for (const p of parents.get(id) ?? []) {
			const c = visit(p);
			if (c) return c;
		}
		path.pop();
		state.set(id, 2);
		return null;
	};
	for (const s of steps) {
		if (!s.id) continue;
		const c = visit(s.id);
		if (c) return c;
	}
	return null;
}

/** For each step, the branches that gate it and the option that lets it run: stepId -> [[branchId, label]]. */
function gatesOf(steps) {
	const gates = new Map();
	for (const s of steps)
		if ((s.kind ?? "work") === "branch")
			for (const [label, targets] of Object.entries(s.options ?? {}))
				for (const t of Array.isArray(targets) ? targets : [targets]) {
					if (!gates.has(t)) gates.set(t, []);
					gates.get(t).push([s.id, label]);
				}
	return gates;
}

const statusOf = (state, id) => state?.[id]?.status ?? "pending";

/**
 * Steps that must be skipped now, given the state: a gated step whose branches all chose another option,
 * and any work or branch step with a skipped input (a merge just leaves skipped inputs out, and is skipped
 * only when every input is). Repeats until stable.
 */
export function skips(graph, state) {
	const steps = graph.steps;
	const gates = gatesOf(steps);
	const skipped = new Set(steps.filter((s) => statusOf(state, s.id) === "skipped").map((s) => s.id));
	let changed = true;
	while (changed) {
		changed = false;
		for (const s of steps) {
			if (skipped.has(s.id) || statusOf(state, s.id) !== "pending") continue;
			const g = gates.get(s.id) ?? [];
			const gateDecided = g.length > 0 && g.every(([b]) => statusOf(state, b) === "done" || skipped.has(b));
			const gateOpen = g.some(([b, label]) => statusOf(state, b) === "done" && state[b]?.choice === label);
			const kind = s.kind ?? "work";
			const ins = s.inputs ?? [];
			const inputSkipped = ins.some((i) => skipped.has(i));
			const allInputsSkipped = ins.length > 0 && ins.every((i) => skipped.has(i));
			if ((gateDecided && !gateOpen) || (kind !== "merge" && inputSkipped) || (kind === "merge" && allInputsSkipped)) {
				skipped.add(s.id);
				changed = true;
			}
		}
	}
	return [...skipped].filter((id) => statusOf(state, id) !== "skipped");
}

/** Steps that can start now: pending, not skipped, every input finished (done, or skipped for a merge), gates open. */
export function ready(graph, state) {
	const willSkip = new Set(skips(graph, state));
	const gates = gatesOf(graph.steps);
	return graph.steps
		.filter((s) => statusOf(state, s.id) === "pending" && !willSkip.has(s.id))
		.filter((s) => {
			const kind = s.kind ?? "work";
			const inputsOk = (s.inputs ?? []).every((i) => {
				const st = statusOf(state, i);
				return st === "done" || (kind === "merge" && (st === "skipped" || willSkip.has(i)));
			});
			const g = gates.get(s.id) ?? [];
			const gateOk = g.length === 0 || g.some(([b, label]) => statusOf(state, b) === "done" && state[b]?.choice === label);
			return inputsOk && gateOk;
		})
		.map((s) => s.id);
}

/** True when every step has finished: done, skipped, failed or blocked. */
export function finished(graph, state) {
	return graph.steps.every((s) => FINAL.has(statusOf(state, s.id)));
}

/** Parallel waves for display: steps grouped by depth (a step comes after every step it depends on). */
export function waves(graph) {
	const parents = parentsOf(graph.steps);
	const depth = new Map();
	const d = (id) => {
		if (depth.has(id)) return depth.get(id);
		const ps = [...(parents.get(id) ?? [])];
		const v = ps.length ? 1 + Math.max(...ps.map(d)) : 0;
		depth.set(id, v);
		return v;
	};
	const out = [];
	for (const s of graph.steps) (out[d(s.id)] ??= []).push(s.id);
	return out.filter(Boolean);
}

/** The prompt a worker gets: the goal, its task, the contract, and the outputs of its inputs. */
export function promptFor(graph, step, outputs) {
	const ins = (step.inputs ?? []).filter((i) => outputs[i] !== undefined);
	const parts = [
		`You are one step ("${step.id}") of a larger job.`,
		`Overall goal: ${graph.goal ?? graph.id}`,
		"",
		`Your task: ${step.task}`,
		`Done means: ${step.expects}`,
	];
	if (ins.length) {
		parts.push("", "Results from earlier steps (use them; do not redo them):");
		for (const i of ins) parts.push(`--- ${i} ---`, String(outputs[i]).trim());
	}
	parts.push(
		"",
		"Write your final result to .laurelin/out.md in this worktree, then stop.",
		"If you cannot meet the contract, write what you have and start the file with BLOCKED: and the reason.",
	);
	return parts.join("\n");
}

/** A Jev request that picks a branch option from the outputs of the branch's inputs. */
export function branchRequest(step, outputs) {
	const state = Object.fromEntries((step.inputs ?? []).map((i) => [i, String(outputs[i] ?? "").slice(0, 6000)]));
	return { state, questions: { choice: { type: "choice", instructions: step.question, options: Object.keys(step.options) } } };
}

/** A one-screen plan of the graph: its waves, with kind and worker. */
export function describe(graph) {
	const byId = new Map(graph.steps.map((s) => [s.id, s]));
	const lines = [`GRAPH ${graph.id}  ${graph.goal ?? ""}`.trimEnd()];
	waves(graph).forEach((wave, i) => {
		const cells = wave.map((id) => {
			const s = byId.get(id);
			const kind = s.kind ?? "work";
			return kind === "work" ? `${id} (${s.worker ?? "laurelin"})` : `${id} [${kind}]`;
		});
		lines.push(`  wave ${i + 1}${wave.length > 1 ? ` (${wave.length} in parallel)` : ""}: ${cells.join(", ")}`);
	});
	return lines.join("\n");
}

// ---------- CLI: node pack/graph/graph.mjs check <file> ----------
if (import.meta.url === `file://${process.argv[1]}`) {
	const { readFileSync } = await import("node:fs");
	const [cmd, file] = process.argv.slice(2);
	if (cmd !== "check" || !file) {
		console.error("usage: graph.mjs check <graph.json>");
		process.exit(2);
	}
	const graph = JSON.parse(readFileSync(file, "utf8"));
	const problems = check(graph);
	if (problems.length) {
		for (const p of problems) console.error(`problem: ${p}`);
		process.exit(1);
	}
	console.log(describe(graph));
}
