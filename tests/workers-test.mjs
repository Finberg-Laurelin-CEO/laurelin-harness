// Test for the workers piece (docs/briefs/workers.md). Run with tests/test-workers.sh.
//
// Loads both extensions through Prime's own extension loader, then drives
// the registered tools and the context handler directly, with no coordinator
// model in the loop. Checks that need a worker or model print
// "skipped: no model" and pass when none is available.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRIME = "/Users/Joe/.local/lib/node_modules/prime-agent";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = join(REPO, "tests", "tmp", `workers-${Date.now()}`);
mkdirSync(TMP, { recursive: true });

const { loadExtensions } = await import(`${PRIME}/dist/core/extensions/index.js`);
const { AuthStorage, ModelRegistry, SettingsManager, getAgentDir } = await import(`${PRIME}/dist/index.js`);

let failures = 0;
const pass = (name, note = "") => console.log(`PASS  ${name}${note ? `  (${note})` : ""}`);
const skip = (name, why) => console.log(`skipped: no model  ${name}  (${why})`);
const fail = (name, why) => {
	failures++;
	console.log(`FAIL  ${name}  ${why}`);
};
const looksLikeNoModel = (e) =>
	/login|logged in|auth|credential|api key|rate.?limit|out of credits|quota|overloaded|ENOENT|not found/i.test(String(e?.message ?? e));
const has = (cmd) => {
	try {
		execSync(`command -v ${cmd}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

// ---- 1. both extensions load through Prime's loader ----
const { extensions, errors } = await loadExtensions(
	[join(REPO, "pack/extensions/laurelin-workers.ts"), join(REPO, "pack/extensions/laurelin-context.ts")],
	REPO,
);
if (errors.length) {
	for (const e of errors) fail("load", `${e.path}: ${e.error}`);
	process.exit(1);
}
const tools = new Map();
const contextHandlers = [];
for (const ext of extensions) {
	for (const [name, t] of ext.tools) tools.set(name, t.definition);
	for (const h of ext.handlers.get("context") ?? []) contextHandlers.push(h);
}
if (tools.has("delegate_worker") && tools.has("call_model") && contextHandlers.length === 1) pass("load", "2 tools, 1 context handler");
else fail("load", `tools=${[...tools.keys()]} contextHandlers=${contextHandlers.length}`);

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const settings = SettingsManager.create(REPO, getAgentDir());
const baseCtx = { cwd: TMP, hasUI: false, ui: { notify() {} }, modelRegistry, model: undefined };

// ---- 2. context handler: 80 synthetic messages ----
{
	const stale = [
		["bash", "ls ~/Pictures/vacation-2019: IMG_0001.jpg IMG_0002.jpg IMG_0003.jpg (412 files)"],
		["bash", "brew list: git node python@3.12 ripgrep (54 formulae)"],
		["read", "recipes/banana-bread.md: 3 ripe bananas, 1/2 cup butter, 1 cup sugar, 2 eggs..."],
		["bash", "weather: Tuesday 71F sunny, Wednesday 68F cloudy"],
		["read", "side-project/game/level3.json: {\"enemies\": 12, \"coins\": 40, \"boss\": \"slime king\"}"],
	];
	const relevant = ["read", "memo.md: # Seed memo draft\n## 1. Problem\n## 2. Approach\n## 3. Why now (needs work)"];
	const msgs = [];
	const user = (text) => ({ role: "user", content: text, timestamp: Date.now() });
	const assistantText = (text) => ({ role: "assistant", content: [{ type: "text", text }], stopReason: "stop", timestamp: Date.now() });
	const pair = (n, [tool, text]) => [
		{ role: "assistant", content: [{ type: "toolCall", id: `call_${n}`, name: tool, arguments: {} }], stopReason: "toolUse", timestamp: Date.now() },
		{ role: "toolResult", toolCallId: `call_${n}`, toolName: tool, content: [{ type: "text", text }], isError: false, timestamp: Date.now() },
	];
	msgs.push(user("Write the seed round memo for Laurelin in memo.md"));
	for (let n = 0; n < 38; n++) msgs.push(...pair(n, n % 6 === 5 ? relevant : stale[n % stale.length]));
	msgs.push(assistantText("Section 3 still needs work."));
	msgs.push(user("Continue: fix section 3 of the memo in memo.md"));
	msgs.push(assistantText("On it."));
	if (msgs.length !== 80) throw new Error(`expected 80 synthetic messages, built ${msgs.length}`);

	const original = structuredClone(msgs);
	let result;
	try {
		result = await contextHandlers[0]({ type: "context", messages: structuredClone(msgs) }, baseCtx);
	} catch (e) {
		fail("context", String(e?.stack ?? e));
	}
	const logPath = join(TMP, "decision-log", "context.jsonl");
	const logged = existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
	if (result === undefined) {
		if (logged.some((l) => l.error === "jev unavailable")) skip("context", "jev unavailable");
		else fail("context", "handler returned nothing and did not log why");
	} else {
		const out = result.messages;
		const problems = [];
		if (!(out.length < 80)) problems.push(`expected fewer than 80 messages, got ${out.length}`);
		if (JSON.stringify(out.slice(-10)) !== JSON.stringify(original.slice(-10))) problems.push("last 10 messages changed");
		const calls = new Set(out.flatMap((m) => (m.role === "assistant" ? m.content.filter((b) => b.type === "toolCall").map((b) => b.id) : [])));
		const results = new Set(out.filter((m) => m.role === "toolResult").map((m) => m.toolCallId));
		for (const id of results) if (!calls.has(id)) problems.push(`orphan result ${id}`);
		for (const id of calls) if (!results.has(id)) problems.push(`call without result ${id}`);
		const relevantKept = out.filter((m) => m.role === "toolResult" && m.content[0].text.startsWith("memo.md")).length;
		if (relevantKept === 0) problems.push("every relevant memo.md result was dropped");
		if (!logged.length) problems.push("no decision-log line written");
		if (problems.length) fail("context", problems.join("; "));
		else pass("context", `80 -> ${out.length} messages, ${logged.at(-1).dropped.length} dropped, memo results kept: ${relevantKept}`);
	}
}

// ---- 3. call_model ----
{
	const name = "call_model";
	const available = modelRegistry.getAvailable();
	let model;
	const wanted = process.env.LAURELIN_TEST_MODEL;
	if (wanted) {
		const [p, id] = wanted.split("/", 2);
		model = modelRegistry.find(p, id);
	} else {
		// The coordinator route in PLAN.md is Prime's ChatGPT sign-in (openai-codex);
		// the Anthropic sign-in is ruled out there. Prefer the settings default only
		// when it is not on that ruled-out provider.
		const dp = settings.getDefaultProvider();
		const dm = settings.getDefaultModel();
		const def = dp && dm ? modelRegistry.find(dp, dm) : undefined;
		const codex = available.find((m) => m.provider === "openai-codex" && m.id === "gpt-5.6-sol") ?? available.find((m) => m.provider === "openai-codex");
		model = def && dp !== "anthropic" ? def : codex ?? def ?? available[0];
	}
	if (!model) skip(name, "no configured model");
	else {
		try {
			const r = await tools.get(name).execute("t-call", { model: `${model.provider}/${model.id}`, prompt: "Reply with the single word: ready" }, undefined, undefined, { ...baseCtx, model });
			const text = r.content.map((c) => c.text ?? "").join("").trim();
			if (text) pass(name, `${model.provider}/${model.id} -> "${text.slice(0, 40)}"`);
			else fail(name, "empty answer");
		} catch (e) {
			if (looksLikeNoModel(e)) skip(name, `${model.provider}/${model.id}: ${String(e.message).slice(0, 120)}`);
			else fail(name, String(e?.stack ?? e));
		}
	}
}

// ---- 4. delegate_worker, claude and codex in parallel ----
const TASK = "create a file hello.txt containing hello in the cwd";
async function workerCheck(worker) {
	const name = `delegate_worker(${worker})`;
	if (!has(worker)) return skip(name, `${worker} not on PATH`);
	const cwd = join(TMP, worker);
	mkdirSync(cwd, { recursive: true });
	const updates = [];
	try {
		const r = await tools.get("delegate_worker").execute(
			`t-${worker}`,
			{ worker, task: TASK, cwd, timeout_seconds: 600 },
			undefined,
			(u) => updates.push(u),
			baseCtx,
		);
		const text = r.content.map((c) => c.text ?? "").join("");
		const file = join(cwd, "hello.txt");
		const problems = [];
		if (!text.trim()) problems.push("empty text");
		if (!existsSync(file)) problems.push("hello.txt missing");
		else if (!/hello/.test(readFileSync(file, "utf8"))) problems.push("hello.txt lacks 'hello'");
		if (!r.details.files.includes("hello.txt")) problems.push(`files changed = ${JSON.stringify(r.details.files)}`);
		if (problems.length) fail(name, problems.join("; "));
		else pass(name, `${updates.length} progress updates, files=${r.details.files.join(",")}`);
	} catch (e) {
		if (looksLikeNoModel(e)) skip(name, String(e.message).slice(0, 160));
		else fail(name, String(e?.stack ?? e));
	}
}
await Promise.all([workerCheck("claude"), workerCheck("codex")]);

if (failures === 0) rmSync(TMP, { recursive: true, force: true });
else console.log(`kept ${TMP} for inspection`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
