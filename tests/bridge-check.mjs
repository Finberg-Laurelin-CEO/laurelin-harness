// Unit checks for the bridge piece, with Prime's own extension loader and no model.
// Usage: node tests/bridge-check.mjs <prime-agent package root> <scratch folder>
//   (a) set_task writes .laurelin/task.json (the shell test then runs a gate on it)
//   (d) a gate log line becomes a laurelin:check event and a light on the checks widget
//   (+) an outward tool call shows in the approvals panel; the panel's answer settles it
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [primeRoot, scratch] = process.argv.slice(2);
if (!primeRoot || !scratch) {
	console.error("usage: node tests/bridge-check.mjs <prime-agent root> <scratch folder>");
	process.exit(2);
}
const repo = resolve(new URL("..", import.meta.url).pathname);
const ext = (name) => join(repo, "pack", "extensions", name);
let failed = false;
const fail = (msg) => {
	failed = true;
	console.log(`FAIL ${msg}`);
};
const ok = (msg) => console.log(`ok   ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const gateLog = join(scratch, "gates.jsonl");
process.env.LAURELIN_GATE_LOG = gateLog;
process.env.LAURELIN_DECISION_LOG = join(scratch, "decision-log");
process.env.LAURELIN_NO_IMAGE = "1";

// ---- load the four extensions on one shared bus, as Prime does
const loader = await import(pathToFileURL(join(primeRoot, "dist/core/extensions/loader.js")).href);
const busMod = await import(pathToFileURL(join(primeRoot, "dist/core/event-bus.js")).href);
const bus = busMod.createEventBus();
const seen = { classification: [], approval: [], decided: [] };
bus.on("laurelin:classification", (d) => seen.classification.push(d));
bus.on("laurelin:approval", (d) => seen.approval.push(d));
bus.on("laurelin:approval-decided", (d) => seen.decided.push(d));
const result = await loader.loadExtensions(
	["laurelin-task.ts", "laurelin-ui.ts", "laurelin-bridge.ts", "laurelin-approvals.ts"].map(ext),
	repo,
	bus,
);
for (const err of result.errors) fail(`${err.path}: ${err.error}`);
const get = (name) => result.extensions.find((e) => e.path.endsWith(name));
const task = get("laurelin-task.ts");
const ui = get("laurelin-ui.ts");
const bridge = get("laurelin-bridge.ts");
const approvals = get("laurelin-approvals.ts");
if (!task || !ui || !bridge || !approvals) {
	fail("an extension did not load");
	process.exit(1);
}

// ---- (a) set_task writes the file; a second call keeps other keys and clears one
const taskCwd = join(scratch, "task");
mkdirSync(taskCwd, { recursive: true });
const setTask = task.tools.get("set_task")?.definition;
if (!setTask) fail("set_task tool not registered");
else {
	await setTask.execute("t1", { target: "kept.md", original: "original.txt", claim: "the text is kept", classification: "yellow" }, undefined, undefined, { cwd: taskCwd, hasUI: false });
	let file = JSON.parse(readFileSync(join(taskCwd, ".laurelin", "task.json"), "utf8"));
	if (file.target !== join(taskCwd, "kept.md")) fail(`target not stored absolute: ${file.target}`);
	if (file.original !== join(taskCwd, "original.txt")) fail(`original not stored absolute: ${file.original}`);
	if (file.claim !== "the text is kept" || file.classification !== "yellow") fail(`claim or classification wrong: ${JSON.stringify(file)}`);
	if (!seen.classification.includes("yellow")) fail("set_task classification did not reach the bus");
	await setTask.execute("t2", { claim: "" }, undefined, undefined, { cwd: taskCwd, hasUI: false });
	file = JSON.parse(readFileSync(join(taskCwd, ".laurelin", "task.json"), "utf8"));
	if ("claim" in file) fail("claim \"\" should clear the key");
	if (!file.target || !file.original) fail("second set_task call lost keys");
	if (!task.commands.has("task")) fail("/task command not registered");
	if (!failed) ok("(a) set_task writes .laurelin/task.json: absolute paths, merge, clear, classification event");
}

// ---- a fake screen for laurelin-ui, as tests/interface-check.mjs does
const theme = { fg: (_c, s) => s, bg: (_c, s) => s, bold: (s) => s };
const widgets = new Map();
let overlayKeys = [];
const fakeUi = {
	theme,
	notify() {},
	setStatus() {},
	setWidget: (key, content, opts) => {
		if (content === undefined) return widgets.delete(key);
		const lines = Array.isArray(content) ? content : content({ requestRender() {} }, theme).render(80);
		widgets.set(key, { lines, placement: opts?.placement });
	},
	custom: (factory, opts) =>
		new Promise((done) => {
			const comp = factory({ requestRender() {} }, theme, {}, done);
			comp.render(80);
			if (!opts?.overlay) return done();
			for (const k of overlayKeys) comp.handleInput(k);
		}),
};
const timers = new Set();
const ctx = {
	hasUI: true,
	ui: fakeUi,
	model: { id: "test-model" },
	cwd: scratch,
	sessionManager: { getSessionFile: () => "unit-session" },
	setInterval: (fn, ms) => {
		const t = setInterval(fn, ms);
		timers.add(t);
		return t;
	},
	clearInterval: (t) => {
		clearInterval(t);
		timers.delete(t);
	},
};
const start = async (e, reason) => {
	for (const h of e.handlers.get("session_start") ?? []) await h({ type: "session_start", reason }, ctx);
};
const checkLine = (name) => widgets.get("checks")?.lines.find((l) => l.includes(name)) ?? "";

// ---- (d) a line already in the log is replayed at session_start; new lines arrive live
const row = (check, res, answer, confidence = 1) =>
	`${JSON.stringify({ ts: new Date().toISOString(), check, inputs: {}, question: "q", answer, confidence, result: res })}\n`;
writeFileSync(gateLog, row("prose", "pass", "0 hits", 0.9));
await start(ui, "new");
await start(bridge, "new");
if (!checkLine("prose").includes("●") || !checkLine("prose").includes("jev 0.90")) fail(`prose light not replayed at session_start: ${checkLine("prose")}`);
appendFileSync(gateLog, row("verbatim", "fail", "1 of 3 sentences missing"));
appendFileSync(gateLog, row("evidence", "skipped", "no claim", 0));
await sleep(1200);
const w4w = checkLine("word for word");
if (!w4w.includes("●") || !w4w.includes("1 of 3 sentences missing")) fail(`word for word light not lit from a live log line: ${w4w}`);
if (!checkLine("evidence").includes("○") || !checkLine("evidence").includes("no claim")) fail(`evidence skipped light wrong: ${checkLine("evidence")}`);
if (!failed) ok("(d) gate log lines reach the checks widget: replay at start, live fail, live skipped, pass with confidence");

// ---- (+) an outward tool call is mirrored in the approvals panel; the panel's answer settles it
const toolCall = approvals.handlers.get("tool_call")?.[0];
if (!toolCall) fail("laurelin-approvals has no tool_call handler");
else {
	let dialogSeen = false;
	let abortedDialog = false;
	ctx.ui.confirm = (_t, _m, o) =>
		new Promise((r) => {
			dialogSeen = true;
			o.signal.addEventListener("abort", () => {
				abortedDialog = true;
				r(false);
			});
		});
	const pending = toolCall({ type: "tool_call", toolName: "bash", input: { command: "git push origin main" } }, ctx);
	await sleep(30);
	const item = seen.approval[0];
	if (!item || !item.id || !item.preview.includes("git push")) fail(`laurelin:approval not emitted with the call text: ${JSON.stringify(item)}`);
	if (!widgets.get("approvals")?.lines[0]?.includes("1 waiting")) fail(`approvals line should say 1 waiting: ${widgets.get("approvals")?.lines[0]}`);
	if (!dialogSeen) fail("confirm dialog was not opened");
	overlayKeys = ["a"]; // Joe approves in the panel
	await ui.commands.get("approvals").handler("", ctx);
	const decision = await pending;
	if (decision !== undefined) fail(`panel approval should let the call through, got ${JSON.stringify(decision)}`);
	if (!abortedDialog) fail("panel answer should close the confirm dialog through its signal");
	if (widgets.has("approvals")) fail("approvals line should disappear after the decision");
	const decided = seen.decided.filter((d) => d.id === item.id);
	if (!decided.some((d) => d.source === "panel" && d.decision === "approve")) fail(`approval-decided from the panel missing: ${JSON.stringify(decided)}`);
	const receipts = readFileSync(join(scratch, "decision-log", "approvals.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
	const last = receipts[receipts.length - 1];
	if (last.status !== "approved" || last.consent !== "joe") fail(`receipt should be approved by joe: ${JSON.stringify(last)}`);

	// the dialog answers: the panel item goes away too
	ctx.ui.confirm = () => new Promise((r) => setTimeout(() => r(false), 120));
	const blocked = await toolCall({ type: "tool_call", toolName: "bash", input: { command: "vercel deploy --prod" } }, ctx);
	if (!blocked?.block) fail("dialog \"no\" should block the call");
	if (widgets.has("approvals")) fail("approvals line should disappear after the dialog decides");
	const d2 = seen.decided[seen.decided.length - 1];
	if (d2.source !== "dialog" || d2.decision !== "reject") fail(`approval-decided from the dialog wrong: ${JSON.stringify(d2)}`);
	if (!failed) ok("(+) approvals mirror: laurelin:approval on ask, panel answer settles the call and closes the dialog, dialog answer clears the panel");
}

for (const e of [ui, bridge]) for (const h of e.handlers.get("session_shutdown") ?? []) await h({ type: "session_shutdown" }, ctx);
for (const t of timers) clearInterval(t);
process.exit(failed ? 1 : 0);
