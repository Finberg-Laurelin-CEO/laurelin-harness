/**
 * Laurelin graph planner: a task plus what "done" means becomes a task graph, checked twice before it runs.
 *
 * Borrowed idea (not the product): AdaL Engineer's layer above the workers, which turns a task and its
 * success criteria into a shared contract and a set of workers. Here the plan is a normal graph file
 * (pack/graph/graph.mjs), so the durable runner, verify and trace all apply unchanged.
 *
 *   1. a model drafts the graph as JSON (the harness itself, one-shot: `laurelin-agent -p`);
 *   2. the graph core checks it (ids, inputs, loops, contracts); problems go back to the model;
 *   3. Jev checks the plan against "done" (a separate evaluator: the drafter never grades its own plan);
 *      under 0.6 the gap goes back to the model;
 *   4. the plan carries the contract ({ task, done }) and its final step must meet "done".
 * At most LAURELIN_PLANNER_ATTEMPTS drafts (default 3). Every attempt is logged next to the plan.
 *
 *   laurelin-agent graph plan "<task>" --done "<success criteria>" [--id <id>] [--run]
 *
 * Drafting command: LAURELIN_PLANNER_CMD (tests), else `laurelin-agent -p --no-session`, with
 * LAURELIN_PLANNER_MODEL ("provider/model") when set. The draft prompt sends only the task and the criteria.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, describe } from "./graph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const ATTEMPTS = Number(process.env.LAURELIN_PLANNER_ATTEMPTS) || 3;
const MIN = Number(process.env.LAURELIN_PLANNER_MIN) || 0.6;

export function slug(text) {
	return (
		String(text)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.split("-")
			.slice(0, 6)
			.join("-") || "plan"
	);
}

/** The drafting prompt: the graph format, the rules, the task and what done means. */
export function draftPrompt(task, done, feedback = "") {
	return [
		"Plan this job as a task graph for parallel AI workers. Output ONLY one JSON object, no prose, no code fence.",
		"",
		"Format:",
		'{ "id": "<short-id>", "goal": "<one line>", "steps": [ ... ] }',
		'Step kinds: "work" (one worker does one task), "merge" (combines the results of its inputs), "branch" (a yes/no or',
		"multiple-choice question decided from its inputs; each option lists only the steps that run just for that answer).",
		'Step fields: "id", "kind", "task", "expects" (what done means for this step, checkable), "inputs" (ids of earlier steps',
		'whose results it needs), "worker" ("laurelin", "claude" for code, "codex" for code), optionally "model" ("provider/model";',
		'use "cheaperinference/deepseek-v4-flash" for bulk reading or extraction), optionally "gates" (["prose"] for prose',
		'deliverables, ["numbers"] when numbers must match canonical figures). Branch steps have "question" and "options".',
		"",
		"Rules:",
		"- Independent steps have no inputs between them, so they run in parallel. Do not chain steps that do not need each other.",
		'- Every work and merge step has a specific, checkable "expects". If sources matter, say so ("with a source link for each").',
		'- Exactly one final step produces the deliverable, and its "expects" covers everything in DONE below.',
		"- Use the fewest steps that do the job well (usually 3 to 8). Use a branch only when the path truly depends on an answer.",
		"- Nothing is sent, posted, paid or deleted by any step; steps produce drafts and findings for the user.",
		"",
		`TASK: ${task}`,
		`DONE: ${done}`,
		...(feedback ? ["", "Your last draft had problems. Fix all of them:", feedback] : []),
	].join("\n");
}

/** The first balanced JSON object in a model's answer (tolerates prose or a code fence around it). */
export function extractJson(text) {
	const s = String(text);
	const start = s.indexOf("{");
	if (start < 0) throw new Error("no JSON object in the draft");
	let depth = 0;
	let inStr = false;
	for (let i = start; i < s.length; i++) {
		const c = s[i];
		if (inStr) {
			if (c === "\\") i++;
			else if (c === '"') inStr = false;
		} else if (c === '"') inStr = true;
		else if (c === "{") depth++;
		else if (c === "}" && --depth === 0) return JSON.parse(s.slice(start, i + 1));
	}
	throw new Error("the JSON object in the draft is not closed");
}

/** Final steps: steps no other step takes as input or gates. */
export function finalSteps(graph) {
	const used = new Set();
	for (const s of graph.steps) {
		for (const i of s.inputs ?? []) used.add(i);
		for (const t of Object.values(s.options ?? {})) for (const x of [].concat(t)) used.add(x);
	}
	return graph.steps.filter((s) => !used.has(s.id) && (s.kind ?? "work") !== "branch");
}

/** Problems beyond the core check: exactly one final step, which produces the deliverable. */
export function planProblems(graph) {
	const problems = check(graph);
	const finals = finalSteps(graph);
	if (finals.length !== 1)
		problems.push(`the plan needs exactly one final step that produces the deliverable; it has ${finals.length}${finals.length ? ` (${finals.map((s) => s.id).join(", ")})` : ""}`);
	return problems;
}

/** The Jev request: does the plan cover what done means? */
export function coverageRequest(graph, task, done) {
	const outline = graph.steps
		.map((s) => `${s.id} [${s.kind ?? "work"}]: ${s.task ?? s.question} -> ${s.expects ?? Object.keys(s.options ?? {}).join("/")}`)
		.join("\n");
	return {
		state: { task, done_means: done, plan: outline },
		questions: {
			covers: {
				type: "noul",
				instructions:
					"Will completing every step of `plan` fully achieve `done_means` for `task`? Answer no if any part of `done_means` " +
					"is not produced by some step, or if the final step does not deliver it.",
			},
		},
	};
}

function jevBin() {
	if (process.env.JEV_BIN) return process.env.JEV_BIN;
	const local = join(REPO, "bin", "jev");
	return existsSync(local) ? local : "jev";
}

function askCoverage(graph, task, done) {
	const r = spawnSync(jevBin(), ["--raw"], { input: JSON.stringify(coverageRequest(graph, task, done)), encoding: "utf8", timeout: 60_000 });
	if (r.status !== 0) return { p: null, note: "coverage check skipped (Jev unavailable)" };
	try {
		return { p: Number(JSON.parse(r.stdout).answers.covers.noul), note: "" };
	} catch {
		return { p: null, note: "coverage check skipped (unreadable answer)" };
	}
}

function draft(prompt) {
	const custom = process.env.LAURELIN_PLANNER_CMD;
	const model = process.env.LAURELIN_PLANNER_MODEL;
	const modelArgs = model ? ["--provider", model.slice(0, model.indexOf("/")), "--model", model.slice(model.indexOf("/") + 1)] : [];
	const [cmd, args] = custom ? [custom, [prompt]] : ["laurelin-agent", ["-p", "--no-session", ...modelArgs, prompt]];
	// The draft is plain planning: memory and the router add nothing here, so they are off for this call.
	const r = spawnSync(cmd, args, {
		encoding: "utf8",
		timeout: 600_000,
		env: { ...process.env, LAURELIN_MEMORY: "off", LAURELIN_ROUTER: "off" },
		maxBuffer: 20 * 1024 * 1024,
	});
	if (r.status !== 0) throw new Error(`the drafting model failed: ${(r.stderr || r.stdout || "").trim().slice(0, 300)}`);
	return r.stdout;
}

/**
 * Plan a task. Returns { graph, file, attempts, coverage, note } or throws after the last attempt with every problem.
 * `root` is the main repository; the plan goes to <root>/.laurelin/graphs/plans/<id>.json.
 */
export function plan(root, task, done, { id } = {}) {
	if (!task?.trim() || !done?.trim()) throw new Error('give the task and what done means: graph plan "<task>" --done "<criteria>"');
	const dir = join(root, ".laurelin", "graphs", "plans");
	mkdirSync(dir, { recursive: true });
	const planId = (id ?? slug(task)).replace(/[^a-z0-9._-]/gi, "-");
	const log = join(dir, `${planId}.log.jsonl`);
	let feedback = "";
	let lastProblems = [];
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		let graph;
		let problems = [];
		try {
			graph = extractJson(draft(draftPrompt(task, done, feedback)));
			graph.id = planId;
			graph.contract = { task, done };
			problems = planProblems(graph);
		} catch (e) {
			problems = [String(e.message ?? e)];
		}
		let coverage = null;
		let note = "";
		if (problems.length === 0) {
			const c = askCoverage(graph, task, done);
			coverage = c.p;
			note = c.note;
			if (coverage !== null && coverage < MIN)
				problems.push(`Jev judged that the plan does not fully achieve DONE (${coverage.toFixed(2)}): make sure some step produces every part of DONE and the final step delivers it`);
		}
		appendFileSync(log, JSON.stringify({ ts: new Date().toISOString(), attempt, problems, coverage, note }) + "\n");
		if (problems.length === 0) {
			const file = join(dir, `${planId}.json`);
			writeFileSync(file, JSON.stringify(graph, null, 2) + "\n");
			return { graph, file, attempts: attempt, coverage, note };
		}
		lastProblems = problems;
		feedback = problems.map((p) => `- ${p}`).join("\n");
	}
	throw new Error(`no valid plan after ${ATTEMPTS} drafts. Last problems:\n${lastProblems.map((p) => `- ${p}`).join("\n")}`);
}

export function summary(result) {
	const cov = result.coverage === null ? "coverage not checked" : `Jev coverage ${result.coverage.toFixed(2)}`;
	return `${describe(result.graph)}\n  contract: ${result.graph.contract.done}\n  ${cov}, ${result.attempts} draft${result.attempts === 1 ? "" : "s"}\n  saved: ${result.file}`;
}
