// Task graph core: checks, readiness, skipping, waves and worker prompts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { branchRequest, check, describe, finished, promptFor, ready, skips, waves } from "../pack/graph/graph.mjs";

const g = JSON.parse(readFileSync(new URL("../pack/graph/examples/dcvc-brief.json", import.meta.url)));
const done = (o = {}) => ({ status: "done", ...o });

test("the example graph is valid", () => assert.deepEqual(check(g), []));

test("problems are named: missing input, loop, merge with one input, branch to nowhere", () => {
	const bad = {
		id: "bad",
		steps: [
			{ id: "a", task: "t", expects: "e", inputs: ["b"] },
			{ id: "b", task: "t", expects: "e", inputs: ["a"] },
			{ id: "m", kind: "merge", task: "t", expects: "e", inputs: ["a"] },
			{ id: "c", task: "t", expects: "e", inputs: ["ghost"] },
			{ id: "br", kind: "branch", question: "q", options: { x: ["a"], y: ["nowhere"] } },
		],
	};
	const p = check(bad).join("\n");
	assert.match(p, /loop: .*a.*b|loop: .*b.*a/);
	assert.match(p, /merge step "m" needs at least two inputs/);
	assert.match(p, /"ghost", which does not exist/);
	assert.match(p, /option "y" points to "nowhere"/);
});

test("first wave: the two independent steps start in parallel", () => {
	assert.deepEqual(ready(g, {}).sort(), ["partners", "thesis"]);
});

test("branch says yes: adjacent is skipped and the merge runs without it", () => {
	const st = { partners: done(), thesis: done(), fit: done({ choice: "yes" }) };
	assert.deepEqual(skips(g, st), ["adjacent"]);
	assert.deepEqual(ready(g, st), ["brief"]);
});

test("branch says no: adjacent runs first, then the merge", () => {
	const st = { partners: done(), thesis: done(), fit: done({ choice: "no" }) };
	assert.deepEqual(skips(g, st), []);
	assert.deepEqual(ready(g, st), ["adjacent"]);
	assert.deepEqual(ready(g, { ...st, adjacent: done() }), ["brief"]);
});

test("the branch waits for its input", () => {
	assert.ok(!ready(g, { partners: done() }).includes("fit"));
	assert.ok(ready(g, { thesis: done() }).includes("fit"));
});

test("finished only when every step is done, skipped, failed or blocked", () => {
	const st = { partners: done(), thesis: done(), fit: done({ choice: "yes" }), adjacent: { status: "skipped" } };
	assert.equal(finished(g, st), false);
	assert.equal(finished(g, { ...st, brief: done() }), true);
});

test("waves and the plan view", () => {
	assert.deepEqual(waves(g), [["partners", "thesis"], ["fit"], ["adjacent"], ["brief"]]);
	assert.match(describe(g), /wave 1 \(2 in parallel\): partners \(laurelin\), thesis \(laurelin\)/);
});

test("a worker prompt carries the goal, the contract and the earlier results", () => {
	const brief = g.steps.find((s) => s.id === "brief");
	const p = promptFor(g, brief, { partners: "A, B", thesis: "fusion yes" });
	assert.match(p, /Overall goal: A one-page brief on DCVC/);
	assert.match(p, /Done means: one page, every claim sourced/);
	assert.match(p, /--- partners ---\nA, B/);
	assert.ok(!p.includes("--- adjacent ---"));
	assert.match(p, /\.laurelin\/out\.md/);
});

test("a branch becomes one Jev choice question over its inputs", () => {
	const fit = g.steps.find((s) => s.id === "fit");
	const r = branchRequest(fit, { thesis: "they back fusion" });
	assert.deepEqual(r.questions.choice.options, ["yes", "no"]);
	assert.equal(r.state.thesis, "they back fusion");
});

test("a step can name a model for its laurelin worker; a bad or misplaced model is a problem", () => {
	const ok = { id: "m", steps: [{ id: "a", task: "t", expects: "e", model: "cheaperinference/deepseek-v4-flash" }] };
	assert.deepEqual(check(ok), []);
	const bad = { id: "m", steps: [{ id: "a", task: "t", expects: "e", model: "deepseek" }, { id: "b", task: "t", expects: "e", worker: "claude", model: "x/y" }] };
	const p = check(bad).join("\n");
	assert.match(p, /step "a" has a model that is not "provider\/model"/);
	assert.match(p, /step "b" names a model, which only a laurelin worker can use/);
});
