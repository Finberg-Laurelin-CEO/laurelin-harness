// Test for the router piece (docs/briefs/router.md). Run with tests/test-router.sh.
//
// Loads laurelin-router.ts through Prime's own extension loader and drives its
// input and before_agent_start handlers with a fake context, with no
// coordinator model in the loop. Twenty fixture messages must route to the
// expected worker and intent in at least 16 cases, and every case must leave
// one decision line with a numeric confidence in decision-log/router.jsonl.
// Without TYPESAFE_API_KEY the Jev part prints "skipped" and exits 0.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRIME = process.env.PRIME_AGENT_PKG || "/Users/Joe/.local/lib/node_modules/prime-agent";
const TMP = join(REPO, "tests", "tmp", `router-${Date.now()}`);
mkdirSync(TMP, { recursive: true });
process.env.LAURELIN_DECISION_LOG = join(TMP, "decision-log");
// Keep the test's gstack decisions out of Joe's real store.
process.env.GSTACK_HOME = join(TMP, "gstack-home");
mkdirSync(process.env.GSTACK_HOME, { recursive: true });

let failures = 0;
const pass = (name, note = "") => console.log(`PASS  ${name}${note ? `  (${note})` : ""}`);
const fail = (name, why) => {
	failures++;
	console.log(`FAIL  ${name}  ${why}`);
};

// ---- 1. the extension loads through Prime's loader
const { loadExtensions } = await import(pathToFileURL(join(PRIME, "dist/core/extensions/index.js")).href);
const { createEventBus } = await import(pathToFileURL(join(PRIME, "dist/core/event-bus.js")).href);
const bus = createEventBus();
const emitted = [];
bus.on("laurelin:classification", (v) => emitted.push(["classification", v]));
bus.on("laurelin:worker", (v) => emitted.push(["worker", v]));
const { extensions, errors } = await loadExtensions([join(REPO, "pack/extensions/laurelin-router.ts")], REPO, bus);
if (errors.length) {
	for (const e of errors) fail("load", `${e.path}: ${e.error}`);
	process.exit(1);
}
const ext = extensions[0];
const inputHandlers = ext.handlers.get("input") ?? [];
const startHandlers = ext.handlers.get("before_agent_start") ?? [];
if (ext.commands.has("route") && inputHandlers.length === 1 && startHandlers.length === 1) pass("load", "/route, input and before_agent_start registered");
else fail("load", `commands=${[...ext.commands.keys()]} input=${inputHandlers.length} start=${startHandlers.length}`);

// ---- 2. pure pieces: menu, shortlist, decide
const mod = await import(pathToFileURL(join(REPO, "pack/extensions/laurelin-router.ts")).href).catch(() => null);
const lib = mod ?? (await importViaJiti());
async function importViaJiti() {
	// Node cannot import .ts directly; use Prime's jiti the way the loader does.
	const { createJiti } = await import(pathToFileURL(join(PRIME, "node_modules/jiti/lib/jiti.mjs")).href);
	const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
	return await jiti.import(join(REPO, "pack/extensions/laurelin-router.ts"));
}
{
	const skills = lib.loadSkillMenu();
	if (skills.length >= 10 && skills.every((s) => s.name && s.description)) pass("skill menu", `${skills.length} skills with descriptions`);
	else fail("skill menu", `${skills.length} skills, missing descriptions: ${skills.filter((s) => !s.description).map((s) => s.name)}`);
	const many = Array.from({ length: 60 }, (_, i) => ({ name: `skill-${i}`, description: i < 3 ? "deck writing rewrite" : "unrelated thing" }));
	const short = lib.shortlistSkills("rewrite the deck", many, 40);
	if (short.length === 40 && short.slice(0, 3).every((s) => /deck|writing|rewrite/.test(s.description))) pass("shortlist", "capped at 40, keyword matches first");
	else fail("shortlist", `length ${short.length}, first ${short[0]?.name}`);
	const menu = { workers: ["coordinator", "claude", "abstain"], skills: skills };
	const shortlist = lib.shortlistSkills("write the memo", skills);
	const t = { default: 0.6 };
	const low = lib.decide({ message: "x" }, menu, shortlist, { worker: { type: "choice", choice: "claude", confidence: 0.3 }, intent: { type: "choice", choice: "steer", confidence: 0.9 }, outward: { type: "noul", noul: 0.5 } }, t);
	if (low.answers.worker.abstained && low.answers.worker.choice === "coordinator" && !low.answers.intent.abstained && low.answers.outward.abstained) pass("abstain under threshold", low.note);
	else fail("abstain under threshold", low.note);
	const notAllowed = lib.decide({ message: "x" }, menu, shortlist, { worker: { type: "choice", choice: "codex", confidence: 0.95 }, skill: { type: "choice", choice: "made-up-skill", confidence: 0.99 } }, t);
	if (notAllowed.answers.worker.not_allowed === "codex" && notAllowed.answers.worker.choice === "coordinator" && notAllowed.answers.skill.not_allowed === "made-up-skill" && notAllowed.answers.skill.choice === "none") pass("allowed-choice check", "off-menu worker and skill fall back to defaults");
	else fail("allowed-choice check", JSON.stringify(notAllowed.answers));
	const noJev = lib.decide({ message: "x" }, menu, shortlist, null, t, "jev unavailable");
	if (noJev.error && noJev.answers.worker.choice === "coordinator" && noJev.answers.classification.choice === "green" && noJev.answers.skill.choice === "none") pass("defaults without Jev", noJev.note);
	else fail("defaults without Jev", noJev.note);
}

// ---- 3. handler plumbing that needs no Jev
const fakeCtx = (lastAssistant) => ({
	cwd: TMP,
	hasUI: false,
	ui: { notify() {}, select: async () => undefined },
	sessionManager: {
		getBranch: () => (lastAssistant ? [{ type: "message", message: { role: "assistant", content: [{ type: "text", text: lastAssistant }] } }] : []),
	},
});
const routeOne = async (message, lastAssistant, source = "interactive") => {
	for (const h of inputHandlers) await h({ type: "input", text: message, source }, fakeCtx(lastAssistant));
	let out;
	for (const h of startHandlers) out = await h({ type: "before_agent_start", prompt: message, systemPrompt: "" }, fakeCtx(lastAssistant));
	return out;
};
{
	const a = await routeOne("/route", undefined);
	const b = await routeOne("[Laurelin] injected", undefined, "extension");
	if (a === undefined && b === undefined) pass("skips slash commands and extension-injected messages");
	else fail("skips slash commands and extension-injected messages", JSON.stringify({ a, b }));
	const toggle = ext.commands.get("route").handler;
	const seen = [];
	const uiCtx = { ...fakeCtx(), hasUI: true, ui: { notify: (t) => seen.push(t), select: async () => undefined } };
	await toggle("off", uiCtx);
	const c = await routeOne("Rewrite the deck intro.", undefined);
	await toggle("on", uiCtx);
	if (c === undefined && seen.some((s) => /off/.test(s))) pass("/route off disables the router");
	else fail("/route off disables the router", JSON.stringify({ c, seen }));
}

// ---- 4. the twenty fixtures through Jev
const cases = JSON.parse(readFileSync(join(REPO, "tests/fixtures/router-cases.json"), "utf8")).cases;
if (!process.env.TYPESAFE_API_KEY) {
	console.log(`skipped: no TYPESAFE_API_KEY  (${cases.length} fixture routes need Jev)`);
} else {
	const logFile = join(process.env.LAURELIN_DECISION_LOG, "router.jsonl");
	rmSync(logFile, { force: true });
	emitted.length = 0;
	let matches = 0;
	let jevErrors = 0;
	const rows = [];
	const t0 = Date.now();
	for (const c of cases) {
		const out = await routeOne(c.message, c.last_assistant);
		const note = out?.message?.content ?? "";
		const lines = existsSync(logFile) ? readFileSync(logFile, "utf8").trim().split("\n") : [];
		const d = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
		if (!d || d.prompt_chars !== c.message.length) {
			fail(`case ${c.id} log`, "no decision line for this case");
			continue;
		}
		if (d.error) jevErrors++;
		const w = d.answers.worker.choice;
		const i = d.answers.intent.choice;
		const ok = w === c.expect.worker && i === c.expect.intent;
		if (ok) matches++;
		rows.push(`${ok ? "ok  " : "MISS"} ${String(c.id).padStart(2)}  worker ${w.padEnd(11)} (${d.answers.worker.confidence.toFixed(2)}) want ${c.expect.worker.padEnd(11)}  intent ${i.padEnd(10)} (${d.answers.intent.confidence.toFixed(2)}) want ${c.expect.intent.padEnd(10)}  class ${d.answers.classification.choice.padEnd(6)} outward ${d.answers.outward.choice.padEnd(3)} skill ${d.answers.skill.choice}`);
		if (!/^\[Laurelin router\] Route: worker /.test(note)) fail(`case ${c.id} note`, JSON.stringify(note));
	}
	console.log(rows.join("\n"));
	const secs = ((Date.now() - t0) / 1000).toFixed(1);
	const lines = existsSync(logFile) ? readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
	const withConf = lines.filter((d) => typeof d.confidence === "number" && Number.isFinite(d.confidence));
	if (lines.length === cases.length && withConf.length === cases.length) pass("decision log", `${lines.length} lines, each with a confidence, in ${logFile}`);
	else fail("decision log", `${lines.length} lines, ${withConf.length} with a confidence`);
	if (jevErrors === 0) pass("jev calls", `${cases.length} calls in ${secs}s`);
	else fail("jev calls", `${jevErrors} of ${cases.length} calls failed: ${lines.find((d) => d.error)?.error}`);
	const workerEvents = emitted.filter((e) => e[0] === "worker").length;
	const classEvents = emitted.filter((e) => e[0] === "classification").length;
	if (workerEvents === cases.length && classEvents === cases.length) pass("panel events", `laurelin:worker and laurelin:classification emitted ${cases.length} times each`);
	else fail("panel events", `worker ${workerEvents}, classification ${classEvents}`);
	if (matches >= 16) pass("routing accuracy", `${matches} of ${cases.length} match on worker and intent (need 16)`);
	else fail("routing accuracy", `${matches} of ${cases.length} match on worker and intent (need 16)`);
	// gstack store, informational: only when bun and gstack are present. The
	// writes are fire-and-forget, so give the last one a moment to land.
	await new Promise((r) => setTimeout(r, 2000));
	const gstackLog = join(process.env.GSTACK_HOME, "projects");
	let gstackRows = 0;
	try {
		gstackRows = Number(execSync(`cat "${gstackLog}"/*/decisions.jsonl 2>/dev/null | wc -l`, { shell: "/bin/bash" }).toString().trim());
	} catch {}
	console.log(gstackRows > 0 ? `info  gstack-decision-log wrote ${gstackRows} rows under ${gstackLog} (test store, not Joe's)` : "info  gstack-decision-log wrote nothing (not installed, no bun, or still writing)");
	// no prompt text in the gstack store
	if (gstackRows > 0) {
		const store = execSync(`cat "${gstackLog}"/*/decisions.jsonl`, { shell: "/bin/bash" }).toString();
		if (cases.some((c) => store.includes(c.message))) fail("gstack privacy", "a prompt text reached the gstack store");
		else pass("gstack privacy", "no prompt text in the gstack store");
	}
}

console.log(failures === 0 ? "ALL PASS" : `SOME FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
