// Test for the learning loop (docs/briefs/learning-loop.md). Run with tests/test-learning-loop.sh.
//
// A synthetic session: the assistant wrote "we leverage a paradigm" and Joe
// replied "no slop, say 'we use'". The loop must log a correction, propose a
// prose_style rule with a jev-sweep style pattern, apply it headless through the
// extension's own functions so the prose gate fails on the old text and passes
// on the new, leave no file change for a rejected proposal, and revert a rule
// whose rerun breaks a test that passed before. The Jev parts (intent without
// the router, kind) print "skipped" without TYPESAFE_API_KEY. Everything the
// test writes goes under tests/tmp/.

import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRIME = process.env.PRIME_AGENT_PKG || "/Users/Joe/.local/lib/node_modules/prime-agent";
const TMP = join(REPO, "tests", "tmp", `learning-loop-${Date.now()}`);
mkdirSync(TMP, { recursive: true });
const HAVE_JEV = Boolean(process.env.TYPESAFE_API_KEY);

// Everything the loop writes goes to the temp folder: logs, and copies of the two pack files it may edit.
process.env.LAURELIN_DECISION_LOG = join(TMP, "decision-log");
process.env.LAURELIN_PROSE_PATTERNS = join(TMP, "prose-patterns.txt");
process.env.LAURELIN_RULES_FILE = join(TMP, "laurelin.md");
process.env.LAURELIN_GSTACK_DECISIONS = "0";
process.env.GSTACK_HOME = join(TMP, "gstack-home");
copyFileSync(join(REPO, "pack/rules/prose-patterns.txt"), process.env.LAURELIN_PROSE_PATTERNS);
copyFileSync(join(REPO, "pack/rules/laurelin.md"), process.env.LAURELIN_RULES_FILE);

// Two fake reruns in run-all.sh's output shape: one clean, one where the gates test fails.
const RERUN_OK = join(TMP, "rerun-ok.sh");
const RERUN_BAD = join(TMP, "rerun-bad.sh");
writeFileSync(RERUN_OK, "#!/bin/bash\nfor t in pack gates router; do echo \"=========== $t\"; done\necho '=========== all tests passed'\nexit 0\n");
writeFileSync(RERUN_BAD, "#!/bin/bash\necho '=========== pack'\necho '=========== gates'\necho 'FAILED: gates'\nexit 1\n");
chmodSync(RERUN_OK, 0o755);
chmodSync(RERUN_BAD, 0o755);
process.env.LAURELIN_LEARN_RERUN = RERUN_OK;

let failures = 0;
const pass = (name, note = "") => console.log(`PASS  ${name}${note ? `  (${note})` : ""}`);
const fail = (name, why) => {
	failures++;
	console.log(`FAIL  ${name}  ${why}`);
};
const skip = (name, why) => console.log(`SKIP  ${name}  ${why}`);
const sha = (file) => (existsSync(file) ? createHash("sha256").update(readFileSync(file)).digest("hex") : "absent");

// ---- 1. the extension loads through Prime's loader
const { loadExtensions } = await import(pathToFileURL(join(PRIME, "dist/core/extensions/index.js")).href);
const { createEventBus } = await import(pathToFileURL(join(PRIME, "dist/core/event-bus.js")).href);
const bus = createEventBus();
const { extensions, errors } = await loadExtensions([join(REPO, "pack/extensions/laurelin-learn.ts")], REPO, bus);
if (errors.length) {
	for (const e of errors) fail("load", `${e.path}: ${e.error}`);
	process.exit(1);
}
const ext = extensions[0];
const handler = (name) => (ext.handlers.get(name) ?? [])[0];
{
	const want = ["input", "agent_end", "session_before_refine", "refine_complete"];
	const missing = want.filter((h) => !handler(h));
	if (ext.commands.has("learn") && missing.length === 0) pass("load", "/learn and the four handlers registered");
	else fail("load", `commands=${[...ext.commands.keys()]} missing=${missing}`);
}

// ---- 2. the module's functions (through Prime's jiti, as the loader does)
const { createJiti } = await import(pathToFileURL(join(PRIME, "node_modules/jiti/lib/jiti.mjs")).href);
// The same package aliases Prime's loader gives extensions, so pi-ai resolves as it does in a session.
const alias = Object.fromEntries(
	["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai", "@earendil-works/pi-agent-core", "@earendil-works/pi-tui", "typebox"].map((name) => [
		name,
		name === "@earendil-works/pi-coding-agent" ? join(PRIME, "dist/index.js") : name === "typebox" ? join(PRIME, "node_modules/typebox/build/index.mjs") : join(PRIME, "node_modules", name, "dist/index.js"),
	]),
);
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false, alias });
const lib = await jiti.import(join(REPO, "pack/extensions/laurelin-learn.ts"));
const paths = lib.learnPaths();

// ---- 3. the synthetic session
const CORRECTED = "Here is the new intro. We leverage a paradigm to deliver value across the landscape.";
const CORRECTION = "no slop, say 'we use'";
const msg = (role, text) => ({ type: "message", message: { role, content: [{ type: "text", text }] } });
const promptSha = createHash("sha256").update(CORRECTION).digest("hex").slice(0, 16);
const decisionEntry = (intent, confidence, abstained = false) => ({
	type: "custom",
	customType: "laurelin_decision",
	data: { type: "route", prompt_sha256: promptSha, answers: { intent: { choice: intent, confidence, threshold: 0.6, abstained } } },
});
const branch = [msg("user", "rewrite the intro"), msg("assistant", CORRECTED), decisionEntry("correction", 0.91), msg("user", CORRECTION)];
{
	const pair = lib.findCorrectionPair(branch);
	if (pair && pair.correction === CORRECTION && pair.corrected === CORRECTED && pair.decision?.intent === "correction") pass("correction pair", "Joe's message, the output before it, the router's label");
	else fail("correction pair", JSON.stringify(pair));
	if (lib.findCorrectionPair([...branch, msg("user", "/learn")]) === null) pass("slash command is not a correction");
	else fail("slash command is not a correction", "returned a pair");
	if (lib.findCorrectionPair([msg("user", "hello")]) === null) pass("first message has nothing to correct");
	else fail("first message has nothing to correct", "returned a pair");
	const v = await lib.intentOf(pair);
	if (v.intent === "correction" && v.source === "router") pass("intent from the router", `confidence ${v.confidence}`);
	else fail("intent from the router", JSON.stringify(v));
	const low = await lib.intentOf(lib.findCorrectionPair([msg("assistant", CORRECTED), decisionEntry("correction", 0.3, true), msg("user", CORRECTION)]));
	if (low.intent === "unsure") pass("abstained router label is unsure");
	else fail("abstained router label is unsure", JSON.stringify(low));
}

// ---- 4. Jev: intent without the router, and the kind of rule
let kindVerdict = null;
if (HAVE_JEV) {
	const pair = lib.findCorrectionPair([msg("assistant", CORRECTED), msg("user", CORRECTION)]);
	const v = await lib.intentOf(pair);
	if (v.intent === "correction" && v.source === "jev") pass("Jev labels the message a correction (router off)", `confidence ${v.confidence}`);
	else fail("Jev labels the message a correction (router off)", JSON.stringify(v));
	kindVerdict = await lib.classifyKind({ correction: CORRECTION, corrected: CORRECTED });
	if (kindVerdict.kind === "prose_style" && kindVerdict.private === false) pass("Jev: kind prose_style, not private", `kind ${kindVerdict.kind_confidence}, private ${kindVerdict.private_confidence}`);
	else fail("Jev: kind prose_style, not private", JSON.stringify(kindVerdict));
} else {
	skip("Jev intent and kind", "TYPESAFE_API_KEY not set");
}

// ---- 5. record the correction, draft the rule, route the change
const correction = lib.recordCorrection(lib.findCorrectionPair(branch), { intent: "correction", confidence: 0.91, source: "router" }, { target: "intro.md" }, paths);
{
	const rows = readFileSync(paths.corrections, "utf8").trim().split("\n").map((l) => JSON.parse(l));
	const r = rows.find((x) => x.id === correction.id);
	if (r && r.correction === CORRECTION && r.corrected === CORRECTED && r.task?.target === "intro.md" && r.source === "router") pass("corrections.jsonl", `one line, id ${r.id}`);
	else fail("corrections.jsonl", JSON.stringify(r));
}
// The coordinator model drafts in production; the test's drafter answers the way the prompt asks.
const cannedDraft = { rule: "Write 'we use'; never 'leverage' or 'paradigm'.", pattern: "\\b(leverage|paradigm)\\b", good_example: "We use a method to build faster.", criterion: null };
const drafter = async (prompt) => {
	if (!prompt.includes(CORRECTED) || !prompt.includes(CORRECTION) || !prompt.includes("prose_style")) throw new Error("the draft prompt lacks the correction, the output or the kind");
	return `Here you go:\n${JSON.stringify(cannedDraft)}`;
};
const draft = lib.parseDraft(await drafter(lib.draftPrompt(correction, "prose_style", lib.listCriterionPaths())));
if (draft?.rule === cannedDraft.rule && draft.pattern === cannedDraft.pattern) pass("draft parsed", draft.rule);
else fail("draft parsed", JSON.stringify(draft));
const routed = lib.routeChange("prose_style", false, draft, correction, paths);
if (routed.change.type === "pattern" && routed.change.file === paths.patterns && routed.change.pattern === cannedDraft.pattern) pass("routed to a prose-gate pattern", routed.change.name);
else fail("routed to a prose-gate pattern", JSON.stringify(routed));
{
	const miss = lib.routeChange("prose_style", false, { ...draft, pattern: "\\bsynergy\\b" }, correction, paths);
	if (miss.change.type === "rule_line" && /does not match/.test(miss.note ?? "")) pass("pattern that misses the corrected text falls back to a rule line", miss.note);
	else fail("pattern that misses the corrected text falls back to a rule line", JSON.stringify(miss));
	const broken = lib.routeChange("prose_style", false, { ...draft, pattern: "(" }, correction, paths);
	if (broken.change.type === "rule_line" && /not a valid/.test(broken.note ?? "")) pass("invalid pattern falls back to a rule line");
	else fail("invalid pattern falls back to a rule line", JSON.stringify(broken));
	const priv = lib.routeChange("number", true, { rule: "The yield figure comes from the design basis." }, correction, paths);
	if (priv.change.type === "vault_line" && priv.change.file === paths.proposedRules) pass("private rule goes to proposed-rules.jsonl, never the vault");
	else fail("private rule goes to proposed-rules.jsonl", JSON.stringify(priv));
}
const mkProposal = (id, kind, change, rule = cannedDraft.rule) => ({
	id, ts: new Date().toISOString(), correction_id: correction.id, kind, kind_confidence: 0.9, private: false, private_confidence: 0.9,
	rule, change, correction: CORRECTION, corrected: CORRECTED, status: "pending",
});
const p1 = mkProposal("aaaaaaaaaaa1", "prose_style", routed.change);
lib.recordProposal(p1, paths);
if (HAVE_JEV) {
	// The whole chain, Jev included, with the canned drafter standing in for the model.
	const p = await lib.propose(correction, drafter, paths);
	if (p.kind === "prose_style" && p.change.type === "pattern" && p.status === "pending") pass("propose: Jev kind, model draft, code route", p.id);
	else fail("propose", JSON.stringify(p));
	lib.rejectProposal(p, paths); // keep the rest of the test to the hand-built proposals
}

// ---- 6. /learn apply, headless: the file change lands, the tests rerun, the store is asked
const sent = [];
const applied = lib.applyProposal(p1, paths, { sendUserMessage: (t) => sent.push(t), notify: () => {} });
{
	const pats = readFileSync(paths.patterns, "utf8");
	if (applied.status === "applied" && pats.includes(`${routed.change.name}: ${cannedDraft.pattern}`) && pats.includes(`# learn ${p1.id}:`)) pass("apply writes the pattern", `${routed.change.name} in ${paths.patterns}`);
	else fail("apply writes the pattern", `status ${applied.status} ${applied.reverted_why ?? ""}\n${pats.slice(-300)}`);
	if (applied.rerun?.ok && applied.rerun.started.includes("gates")) pass("apply reruns the tests", `${applied.rerun.started.length} started, ${applied.rerun.seconds}s`);
	else fail("apply reruns the tests", JSON.stringify(applied.rerun));
	if (sent.length === 1 && sent[0] === `/refine --global laurelin-learn:${p1.id}`) pass("apply asks Prime to store the rule", sent[0]);
	else fail("apply asks Prime to store the rule", JSON.stringify(sent));
	if (existsSync(paths.baseline)) pass("baseline recorded", paths.baseline);
	else fail("baseline recorded", "no file");
}

// ---- 7. the prose gate: fails on the old text, passes on the new
const OLD = join(TMP, "intro-old.md");
const NEW = join(TMP, "intro-new.md");
writeFileSync(OLD, `# Intro\n\n${CORRECTED}\n`);
writeFileSync(NEW, "# Intro\n\nHere is the new intro. We use a method to build faster.\n");
const gate = (target) =>
	spawnSync("bash", [join(REPO, "pack/gates/prose.sh")], {
		encoding: "utf8",
		env: { ...process.env, LAURELIN_TARGET: target, LAURELIN_GATE_LOG: join(TMP, "gates.jsonl"), PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
	});
{
	const r = gate(OLD);
	if (r.status === 1 && /^prose: fail/.test(r.stdout) && r.stdout.includes(`[${routed.change.name} 1.00]`)) pass("prose gate fails on the old text", r.stdout.split("\n")[0]);
	else fail("prose gate fails on the old text", `exit ${r.status}\n${r.stdout}${r.stderr}`);
	if (HAVE_JEV) {
		const g = gate(NEW);
		if (g.status === 0 && /^prose: pass/.test(g.stdout)) pass("prose gate passes on the new text", g.stdout.trim());
		else fail("prose gate passes on the new text", `exit ${g.status}\n${g.stdout}${g.stderr}`);
	} else skip("prose gate passes on the new text", "jev-sweep needs TYPESAFE_API_KEY");
	const log = readFileSync(join(TMP, "gates.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
	if (log.some((l) => l.check === "prose" && l.result === "fail" && l.inputs?.patterns === paths.patterns)) pass("gate log names the pattern file");
	else fail("gate log names the pattern file", JSON.stringify(log.slice(-2)));
}

// ---- 8. reject: nothing changes on disk
const before = { patterns: sha(paths.patterns), rules: sha(paths.rules), proposed: sha(paths.proposedRules) };
const p2 = mkProposal("aaaaaaaaaaa2", "process", { type: "rule_line", file: paths.rules, line: "Run the gates before saying done. [process, 2026-09-25]" }, "Run the gates before saying done.");
lib.recordProposal(p2, paths);
const rejected = lib.rejectProposal(p2, paths);
{
	const after = { patterns: sha(paths.patterns), rules: sha(paths.rules), proposed: sha(paths.proposedRules) };
	if (rejected.status === "rejected" && JSON.stringify(before) === JSON.stringify(after)) pass("reject leaves no file change");
	else fail("reject leaves no file change", JSON.stringify({ before, after }));
	const pending = lib.pendingProposals(paths).map((p) => p.id);
	if (!pending.includes(p1.id) && !pending.includes(p2.id)) pass("proposal states on disk", `applied ${p1.id}, rejected ${p2.id}, pending ${pending.length}`);
	else fail("proposal states on disk", JSON.stringify(pending));
}

// ---- 9. a rule whose rerun breaks a test that passed before is reverted
const p3 = mkProposal("aaaaaaaaaaa3", "process", { type: "rule_line", file: paths.rules, line: "Ask before you rename files. [process, 2026-09-25]" }, "Ask before you rename files.");
lib.recordProposal(p3, paths);
{
	const rulesBefore = readFileSync(paths.rules, "utf8");
	const badPaths = { ...paths, rerun: RERUN_BAD };
	const r = lib.applyProposal(p3, badPaths, { sendUserMessage: (t) => sent.push(t), notify: () => {} });
	const rulesAfter = readFileSync(paths.rules, "utf8");
	if (r.status === "reverted" && /gates/.test(r.reverted_why) && rulesAfter === rulesBefore) pass("regression reverts the change", r.reverted_why);
	else fail("regression reverts the change", `status ${r.status} why ${r.reverted_why} changed=${rulesAfter !== rulesBefore}`);
	if (sent.length === 1) pass("a reverted rule is not stored");
	else fail("a reverted rule is not stored", JSON.stringify(sent));
}
// and a clean rerun on a rule line lands in the Learned rules section
{
	const p4 = mkProposal("aaaaaaaaaaa4", "process", { type: "rule_line", file: paths.rules, line: "Ask before you rename files. [process, 2026-09-25]" }, "Ask before you rename files.");
	lib.recordProposal(p4, paths);
	const r = lib.applyProposal(p4, paths, { notify: () => {} });
	const rules = readFileSync(paths.rules, "utf8");
	if (r.status === "applied" && rules.includes("## 13. Learned rules") && rules.includes(`- Ask before you rename files. [process, 2026-09-25] (learn ${p4.id})`)) pass("rule line lands under Learned rules");
	else fail("rule line lands under Learned rules", `status ${r.status}\n${rules.slice(-300)}`);
}

// ---- 10. the refine hook returns the approved rule for our marker only
{
	const call = (instructions) => handler("session_before_refine")({ type: "session_before_refine", preparation: { trigger: "manual", instructions, scope: "global", planningState: { entries: {} }, history: [], conversationText: "" }, signal: new AbortController().signal }, {});
	const ours = await call(`laurelin-learn:${p1.id}`);
	if (ours?.proposal?.edits?.[0]?.kind === "memory" && ours.proposal.summary.startsWith(`Learned rule ${p1.id}:`) && ours.proposal.edits[0].content.includes(cannedDraft.rule)) pass("refine hook: one memory edit for an applied rule", ours.proposal.summary);
	else fail("refine hook: one memory edit for an applied rule", JSON.stringify(ours));
	const theirs = await call("tidy up the memories");
	if (theirs === undefined) pass("refine hook: Joe's own /refine falls through to Prime");
	else fail("refine hook: Joe's own /refine falls through to Prime", JSON.stringify(theirs));
	const notApplied = await call(`laurelin-learn:${p2.id}`);
	if (notApplied?.skip === true) pass("refine hook: a rejected id skips the round");
	else fail("refine hook: a rejected id skips the round", JSON.stringify(notApplied));
	await handler("refine_complete")({ type: "refine_complete", id: "ref-123", summary: `Learned rule ${p1.id}: x`, appliedEdits: [], scope: "global" }, {});
	const stored = lib.loadProposals(paths).find((p) => p.id === p1.id);
	if (stored?.refinement_id === "ref-123") pass("refine_complete records the refinement id for rollback");
	else fail("refine_complete records the refinement id", JSON.stringify(stored));
}

// ---- 11. small pieces: rerun parsing, edit round trip, marker
{
	const parsed = lib.parseRerun("=========== pack\n=========== gates\nFAILED: gates\nsynthetic-1   3/3   0.8    $0.0123   42   ok\nsynthetic-2   1/3   0.2    $0.0100   40   exit 1\n");
	if (parsed.started.join() === "pack,gates,testset:synthetic-1,testset:synthetic-2" && parsed.failed.join() === "gates,testset:synthetic-2") pass("rerun output parsed", `${parsed.started.length} started, ${parsed.failed.length} failed`);
	else fail("rerun output parsed", JSON.stringify(parsed));
	const text = lib.editText(p1).replace(cannedDraft.pattern, "\\bleverage\\b").replace(cannedDraft.rule, "Never write 'leverage'.");
	const edited = lib.applyEdit(p1, text);
	if (edited.rule === "Never write 'leverage'." && edited.change.pattern === "\\bleverage\\b" && edited.edited) pass("edit round trip", "rule and pattern replaced");
	else fail("edit round trip", JSON.stringify(edited));
	if (lib.markerId("laurelin-learn:aaaaaaaaaaa1") === "aaaaaaaaaaa1" && lib.markerId("laurelin-learn:nope") === null && lib.markerId(undefined) === null) pass("marker parsing");
	else fail("marker parsing", "");
}

// ---- 12. the repo's own pack files were not touched
{
	const g = spawnSync("git", ["status", "--porcelain", "--", "pack/rules/prose-patterns.txt", "pack/rules/laurelin.md"], { cwd: REPO, encoding: "utf8" });
	const changed = g.stdout.trim().split("\n").filter((l) => l && !l.startsWith("??") && !l.startsWith("A "));
	if (changed.length === 0) pass("the real pack files were not touched");
	else fail("the real pack files were not touched", g.stdout);
}

console.log(failures ? `\n${failures} FAILED` : "\nall learning-loop checks passed");
console.log(`artifacts: ${TMP}`);
process.exit(failures ? 1 : 0);
