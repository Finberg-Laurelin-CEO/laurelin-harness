// Extension test for the memory piece (docs/briefs/memory.md). Run with tests/test-memory.sh.
//
// Loads laurelin-memory.ts through Prime's own extension loader and drives its input and
// before_agent_start handlers with a fake context, with no coordinator model in the loop.
// The vault is the five invented notes in tests/fixtures/vault-sample, searched in local
// mode. Without TYPESAFE_API_KEY the Jev parts print "skipped" and exit 0.
//
// Environment set by test-memory.sh: LAURELIN_SAFE_VAULT (the fixture), LAURELIN_MEMORY_HOME,
// LAURELIN_DECISION_LOG (both under tests/tmp), LAURELIN_MEMORY_MODE=local,
// LAURELIN_MEMORY_MIN_WORDS=40 (the fixture notes are short).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRIME = process.env.PRIME_AGENT_PKG || "/Users/Joe/.local/lib/node_modules/prime-agent";
const TMP = process.env.LAURELIN_MEMORY_TMP || join(REPO, "tests", "tmp", "memory");
mkdirSync(TMP, { recursive: true });
process.env.LAURELIN_DECISION_LOG ||= join(TMP, "decision-log");
process.env.LAURELIN_MEMORY_HOME ||= join(TMP, "home");
process.env.LAURELIN_SAFE_VAULT ||= join(REPO, "tests", "fixtures", "vault-sample");
process.env.LAURELIN_MEMORY_MODE ||= "local";
process.env.LAURELIN_MEMORY_MIN_WORDS ||= "40";
const LOG = join(process.env.LAURELIN_DECISION_LOG, "memory.jsonl");
const FIXTURE_NOTE = "Cryostat Vendor Shortlist.md";

let failures = 0;
const pass = (name, note = "") => console.log(`PASS  ${name}${note ? `  (${note})` : ""}`);
const fail = (name, why) => {
	failures++;
	console.log(`FAIL  ${name}  ${why}`);
};
const lastLog = () => {
	const lines = existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n") : [];
	return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
};

// ---- 1. the extension loads through Prime's loader
const { loadExtensions } = await import(pathToFileURL(join(PRIME, "dist/core/extensions/index.js")).href);
const { createEventBus } = await import(pathToFileURL(join(PRIME, "dist/core/event-bus.js")).href);
const { extensions, errors } = await loadExtensions([join(REPO, "pack/extensions/laurelin-memory.ts")], REPO, createEventBus());
if (errors.length) {
	for (const e of errors) fail("load", `${e.path}: ${e.error}`);
	process.exit(1);
}
const ext = extensions[0];
const inputHandlers = ext.handlers.get("input") ?? [];
const startHandlers = ext.handlers.get("before_agent_start") ?? [];
if (ext.commands.has("memory") && inputHandlers.length === 1 && startHandlers.length === 1) pass("load", "/memory, input and before_agent_start registered");
else fail("load", `commands=${[...ext.commands.keys()]} input=${inputHandlers.length} start=${startHandlers.length}`);

// ---- 2. pure pieces
const { createJiti } = await import(pathToFileURL(join(PRIME, "node_modules/jiti/lib/jiti.mjs")).href);
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const lib = await jiti.import(join(REPO, "pack/extensions/laurelin-memory.ts"));
{
	const q = lib.buildQuery("Rewrite the intro.", { target: "/tmp/General Deck v7.pdf", claim: "deck matches the memo", classification: "green" });
	if (q.includes("Rewrite the intro.") && q.includes("deck matches the memo") && q.includes("General Deck v7") && !q.includes("green")) pass("buildQuery", "message, claim and target name; no label");
	else fail("buildQuery", JSON.stringify(q));
	const cands = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, path: `Note ${i}.md`, section: 0, heading: `H${i}`, score: 8 - i, words: 50, via: "", text: `text ${i}` }));
	const answers = {
		c0: { type: "score", score: 0.1, confidence: 0.99 }, // unrelated, drop
		c1: { type: "score", score: 2.9, confidence: 0.9 }, // needed
		c2: { type: "score", score: 2.0, confidence: 0.4 }, // useful but unsure, drop
		c3: { type: "score", score: 1.2, confidence: 0.95 }, // background, drop
		c4: { type: "score", score: 2.1, confidence: 0.8 }, // useful
		c5: { type: "score", score: 3.0, confidence: 0.7 }, // needed
		c6: { type: "score", score: 2.4, confidence: 0.61 }, // useful
		c7: { type: "score", score: 2.0, confidence: 0.99 }, // useful
	};
	const kept = lib.decideKeep(cands, answers, 0.6, 5);
	const ids = kept.map((k) => k.id).join(",");
	if (ids === "s1,s5,s7,s4,s6") pass("decideKeep", `kept ${ids}: needed first, then useful by confidence; unrelated, background and unsure dropped`);
	else fail("decideKeep", `kept ${ids}`);
	const none = lib.decideKeep(cands, null, 0.6, 5);
	if (none.length === 0) pass("decideKeep without answers", "keeps nothing, caller falls back to search order");
	else fail("decideKeep without answers", `${none.length} kept`);
	const msg = lib.formatMessage(kept, { mode: "local", query: "", ms: 1, note: "", results: cands }, 3, true);
	if (msg.startsWith("[Laurelin memory] 5 vault sections") && msg.includes("### Note 1.md § H1 (needed before starting the task, 0.90)") && msg.includes("tex … (read the note for the rest)")) pass("formatMessage", "header, path § heading with level, text cut at the limit");
	else fail("formatMessage", msg.slice(0, 300));
	const empty = lib.formatMessage([], { mode: "local", query: "", ms: 1, note: "", results: cands.slice(0, 2) }, 1500, true);
	if (/No vault section was judged useful/.test(empty) && empty.includes("Note 0.md § H0")) pass("formatMessage empty", "says so and names the closest");
	else fail("formatMessage empty", empty);
	if (lib.worthReading("hello") && !lib.worthReading("/memory") && !lib.worthReading("  ")) pass("worthReading");
	else fail("worthReading", "slash command or blank accepted");
}

// ---- 3. handler plumbing, no Jev, local search over the fixture
const fakeCtx = (lastAssistant) => ({
	cwd: TMP,
	hasUI: false,
	ui: { notify() {} },
	sessionManager: {
		getBranch: () => (lastAssistant ? [{ type: "message", message: { role: "assistant", content: [{ type: "text", text: lastAssistant }] } }] : []),
	},
});
const runOne = async (message, lastAssistant, source = "interactive") => {
	for (const h of inputHandlers) await h({ type: "input", text: message, source }, fakeCtx(lastAssistant));
	let out;
	for (const h of startHandlers) out = await h({ type: "before_agent_start", prompt: message, systemPrompt: "" }, fakeCtx(lastAssistant));
	return out;
};
rmSync(LOG, { force: true });
{
	const a = await runOne("/memory", undefined);
	const b = await runOne("[Laurelin] injected", undefined, "extension");
	if (a === undefined && b === undefined && !existsSync(LOG)) pass("skips slash commands and extension-injected messages", "no log line either");
	else fail("skips slash commands and extension-injected messages", JSON.stringify({ a, b }));
}
const saidJev = process.env.LAURELIN_MEMORY_JEV;
process.env.LAURELIN_MEMORY_JEV = "off";
{
	const task = "Pick a cryostat vendor for the test stand and write the comparison memo for the reviewers.";
	const out = await runOne(task, undefined);
	const content = out?.message?.content ?? "";
	const d = lastLog();
	if (out?.message?.customType === "laurelin-memory" && out.message.display === true && content.includes(FIXTURE_NOTE) && /^\[Laurelin memory\] \d vault sections? for this task \(local, search order\)/.test(content)) pass("injects without Jev", `${d?.kept?.length} sections, ${FIXTURE_NOTE} named, ${d?.candidates} candidates in ${d?.query_ms} ms`);
	else fail("injects without Jev", JSON.stringify(out).slice(0, 400));
	if (d && d.mode === "local" && d.intent?.source === "heuristic" && d.candidates > 0 && d.kept.length <= 5 && d.reranked === false && !JSON.stringify(d).includes("Vendor Alpha")) pass("decision log", `mode local, heuristic intent, ${d.kept.length} kept, no section text in the log`);
	else fail("decision log", JSON.stringify(d));
	const steer = await runOne("shorter", "Here is the memo draft.");
	if (steer === undefined && lastLog()?.skipped) pass("heuristic skips a short steer", lastLog().skipped);
	else fail("heuristic skips a short steer", JSON.stringify(steer));
	// task file changes make the next short message a task again
	mkdirSync(join(TMP, ".laurelin"), { recursive: true });
	writeFileSync(join(TMP, ".laurelin", "task.json"), JSON.stringify({ target: join(TMP, "memo.md"), claim: "slide typography follows the style notes" }));
	const withTask = await runOne("go", undefined);
	if (withTask?.message?.content?.includes("Deck Style Notes.md")) pass("task file feeds the query", "a two-letter message with a task file pulls the style note");
	else fail("task file feeds the query", JSON.stringify(withTask).slice(0, 300));
	rmSync(join(TMP, ".laurelin"), { recursive: true, force: true });
	const toggle = ext.commands.get("memory").handler;
	const seen = [];
	const uiCtx = { ...fakeCtx(), hasUI: true, ui: { notify: (t) => seen.push(t) } };
	await toggle("", uiCtx);
	if (seen.some((s) => /Memory: last run/.test(s) && s.includes("Deck Style Notes.md"))) pass("/memory shows the last injection");
	else fail("/memory shows the last injection", JSON.stringify(seen));
	await toggle("cryostat vendor", uiCtx);
	if (seen.some((s) => /Memory search \(local/.test(s) && s.includes(FIXTURE_NOTE))) pass("/memory <words> searches without injecting");
	else fail("/memory <words> searches without injecting", JSON.stringify(seen.slice(-1)));
	await toggle("off", uiCtx);
	const off = await runOne("Pick a cryostat vendor for the test stand and write the memo.", undefined);
	await toggle("on", uiCtx);
	if (off === undefined && seen.some((s) => /Memory off/.test(s))) pass("/memory off disables injection");
	else fail("/memory off disables injection", JSON.stringify({ off, seen }));
}

// ---- 4. with Jev: intent gate and rerank
if (saidJev === undefined) delete process.env.LAURELIN_MEMORY_JEV;
else process.env.LAURELIN_MEMORY_JEV = saidJev;
if (!process.env.TYPESAFE_API_KEY || process.env.LAURELIN_MEMORY_JEV === "off") {
	console.log("skipped: no TYPESAFE_API_KEY  (intent gate and Jev rerank need Jev)");
} else {
	const t0 = Date.now();
	const out = await runOne("Pick a cryostat vendor for the test stand and write the comparison memo for the reviewers.", undefined);
	const d = lastLog();
	const content = out?.message?.content ?? "";
	if (d?.intent?.source === "jev" && d.intent.choice === "new_task" && d.reranked && d.kept.length >= 1 && d.kept.length <= 5 && d.kept.every((k) => k.level >= 2 && typeof k.confidence === "number" && k.confidence >= 0.6)) pass("jev rerank", `intent new_task at ${d.intent.confidence.toFixed(2)}, kept ${d.kept.length} of ${d.candidates}: ${d.kept.map((k) => `${k.path}#${k.section} (${k.level}, ${k.confidence.toFixed(2)})`).join(", ")}; ${Date.now() - t0} ms in all`);
	else fail("jev rerank", JSON.stringify(d));
	if (content.includes(FIXTURE_NOTE) && /Jev reranked/.test(content)) pass("jev-reranked message names the vendor note");
	else fail("jev-reranked message names the vendor note", content.slice(0, 300));
	const steer = await runOne("Keep my sentences as they are, just fix the numbers.", "Here is the memo draft with the numbers filled in.");
	const s = lastLog();
	if (steer === undefined && s?.intent?.source === "jev" && s.intent.choice !== "new_task" && s.skipped) pass("jev intent gate skips a steer", `${s.intent.choice} at ${s.intent.confidence.toFixed(2)}`);
	else fail("jev intent gate skips a steer", JSON.stringify(s));
}

console.log(failures === 0 ? "ALL PASS" : `SOME FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
