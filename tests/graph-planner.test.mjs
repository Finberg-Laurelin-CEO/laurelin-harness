// Graph planner: a task plus "done" becomes a checked graph. Stand-in drafter and stand-in Jev only.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const T = mkdtempSync(join(tmpdir(), "graph-planner-"));
const script = (name, body) => {
	const p = join(T, name);
	writeFileSync(p, `#!/bin/bash\n${body}\n`);
	chmodSync(p, 0o755);
	return p;
};
const GOOD = JSON.stringify({
	id: "x",
	goal: "brief",
	steps: [
		{ id: "a", task: "List partners", expects: "names with a source link each" },
		{ id: "b", task: "Summarise thesis", expects: "3 bullets" },
		{ id: "brief", kind: "merge", inputs: ["a", "b"], task: "Write the brief", expects: "one page" },
	],
});
const TWO_FINALS = JSON.stringify({ id: "x", steps: [{ id: "a", task: "t", expects: "e" }, { id: "b", task: "t", expects: "e" }] });
// The drafter answers from a list, one answer per call; it records each prompt it got.
const drafter = (...answers) => {
	answers.forEach((a, i) => writeFileSync(join(T, `answer-${i + 1}`), a));
	rmSync(join(T, "calls"), { force: true });
	return script(
		"drafter.sh",
		`n=$(( $(cat "${T}/calls" 2>/dev/null || echo 0) + 1 )); echo $n > "${T}/calls"; printf '%s' "$1" > "${T}/prompt-$n"; cat "${T}/answer-$n"`,
	);
};
const jev = (p) => script(`jev-${p}.sh`, `cat >/dev/null; echo '{"answers":{"covers":{"type":"noul","noul":${p}}}}'`);
const calls = () => Number(readFileSync(join(T, "calls"), "utf8"));

const P = await import("../pack/graph/planner.mjs");

test("pure helpers: slug, JSON in prose, one final step", () => {
	assert.equal(P.slug("Write a one-page brief on DCVC's fusion thesis today please"), "write-a-one-page-brief-on");
	assert.deepEqual(P.extractJson('Here it is:\n```json\n{"a":{"b":"}"}}\n```'), { a: { b: "}" } });
	assert.throws(() => P.extractJson("no json"), /no JSON/);
	assert.deepEqual(P.finalSteps(JSON.parse(GOOD)).map((s) => s.id), ["brief"]);
	assert.match(P.planProblems({ ...JSON.parse(TWO_FINALS), id: "x" }).join(), /exactly one final step.*a, b/);
	assert.match(P.draftPrompt("T", "D", "- fix this"), /TASK: T\nDONE: D[\s\S]*- fix this/);
});

test("a good first draft is saved with its contract and Jev's coverage", () => {
	process.env.LAURELIN_PLANNER_CMD = drafter(`Sure!\n${GOOD}`);
	process.env.JEV_BIN = jev(0.9);
	const r = P.plan(T, "Brief on DCVC", "one page, every claim sourced", { id: "dcvc" });
	assert.equal(r.attempts, 1);
	assert.equal(r.coverage, 0.9);
	const saved = JSON.parse(readFileSync(join(T, ".laurelin/graphs/plans/dcvc.json"), "utf8"));
	assert.equal(saved.id, "dcvc");
	assert.deepEqual(saved.contract, { task: "Brief on DCVC", done: "one page, every claim sourced" });
	assert.match(P.summary(r), /wave 1 \(2 in parallel\)[\s\S]*Jev coverage 0\.90, 1 draft/);
});

test("an invalid draft goes back to the drafter with its problems", () => {
	process.env.LAURELIN_PLANNER_CMD = drafter(TWO_FINALS, GOOD);
	process.env.JEV_BIN = jev(0.9);
	const r = P.plan(T, "Brief", "done", { id: "fix" });
	assert.equal(r.attempts, 2);
	assert.match(readFileSync(join(T, "prompt-2"), "utf8"), /had problems[\s\S]*exactly one final step/);
	const log = readFileSync(join(T, ".laurelin/graphs/plans/fix.log.jsonl"), "utf8").trim().split("\n");
	assert.equal(log.length, 2);
});

test("low Jev coverage is a problem; after the last draft the planner gives up with the reasons", () => {
	process.env.LAURELIN_PLANNER_CMD = drafter(GOOD, GOOD, GOOD);
	process.env.JEV_BIN = jev(0.2);
	assert.throws(() => P.plan(T, "Brief", "done", { id: "low" }), /no valid plan after 3 drafts[\s\S]*does not fully achieve DONE \(0\.20\)/);
	assert.equal(calls(), 3);
	assert.equal(existsSync(join(T, ".laurelin/graphs/plans/low.json")), false);
});

test("when Jev is down the plan is kept and the skipped check is noted", () => {
	process.env.LAURELIN_PLANNER_CMD = drafter(GOOD);
	process.env.JEV_BIN = script("jev-down.sh", "exit 1");
	const r = P.plan(T, "Brief", "done", { id: "down" });
	assert.equal(r.coverage, null);
	assert.match(r.note, /skipped/);
	assert.match(P.summary(r), /coverage not checked/);
});

test("the task and done are required", () => {
	assert.throws(() => P.plan(T, "Brief", ""), /what done means/);
});
