/**
 * Unit tests for the safety extensions. Run with:  node --test tests/safety-unit.test.ts
 * Handlers are exercised directly; Prime is not needed. LAURELIN_DECISION_LOG
 * must point at a scratch folder (tests/test-safety.sh sets it).
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { decideCall, loadPatterns, classifyCall, callText, listPending, readReceipts, approvalsLogPath, maskPreview } from "../pack/extensions/laurelin-approvals.ts";
import { scrub, logScrub, scrubberAvailable, scrubberLogPath } from "../pack/extensions/laurelin-scrubber.ts";
import { limitsFromEnv, createLimiter, lastCompletedToolCall, resumeLine } from "../pack/extensions/laurelin-limits.ts";
import { worthChecking } from "../pack/extensions/laurelin-refusals.ts";

const LOG_DIR = process.env.LAURELIN_DECISION_LOG;
assert.ok(LOG_DIR && LOG_DIR.includes("tests/tmp"), "LAURELIN_DECISION_LOG must point into tests/tmp");
rmSync(LOG_DIR, { recursive: true, force: true });
mkdirSync(LOG_DIR, { recursive: true });

const FAKE_KEY = "sk_live_" + "abcdefghijklmnopqrstuvwx"; // 24 chars after the prefix, never a real key

function allLogText(): string {
	if (!existsSync(LOG_DIR!)) return "";
	return readdirSync(LOG_DIR!).map((f) => readFileSync(join(LOG_DIR!, f), "utf8")).join("\n");
}

// ---------- approvals ----------

test("patterns load and classify outward actions", () => {
	const p = loadPatterns();
	assert.ok(p.length >= 20, "outward-patterns.txt loaded");
	assert.equal(classifyCall("git push origin main", p)?.name, "deploy.git-push");
	assert.equal(classifyCall("gh pr merge 12 --squash", p)?.name, "deploy.gh-merge");
	assert.equal(classifyCall("vercel --prod", p)?.name, "deploy.vercel");
	assert.equal(classifyCall("vercel ls", p), undefined, "read-only vercel is not outward");
	assert.equal(classifyCall("git status && git log", p), undefined);
	assert.equal(classifyCall("ls -la", p), undefined);
	assert.equal(classifyCall(callText("send_email", { to: "x@y.z" }), p)?.name, "email.tool");
	assert.equal(classifyCall(callText("edit", { path: "git push" }), p), undefined, "file edits are not outward");
});

test("git push with no UI is blocked and gets a receipt", async () => {
	const d = await decideCall("bash", { command: "git push origin main" }, { hasUI: false, session: "t1" });
	assert.equal(d.block, true);
	assert.match(d.reason!, /waits for Joe/);
	assert.equal(d.receipt?.status, "denied:no-ui");
	assert.equal(d.receipt?.sink, "bash");
	assert.equal(d.receipt?.host, "deploy.git-push");
	assert.match(d.receipt!.sha256, /^[0-9a-f]{64}$/);
	assert.match(d.receipt!.id, /^[0-9a-f]{64}$/);
	const rows = readReceipts(approvalsLogPath());
	assert.equal(rows.at(-1)?.id, d.receipt?.id);
	assert.ok(listPending("t1").some((i) => i.id === d.receipt?.id && i.state === "denied-no-ui"), "pending list shows it");
});

test("safe calls pass without a receipt", async () => {
	const before = readReceipts(approvalsLogPath()).length;
	const d = await decideCall("bash", { command: "git status" }, { hasUI: false, session: "t1" });
	assert.equal(d.block, false);
	assert.equal(readReceipts(approvalsLogPath()).length, before);
});

test("with a UI: approve passes, deny blocks, timeout denies; chain links", async () => {
	const yes = await decideCall("bash", { command: "git push origin main" }, { hasUI: true, session: "t2", confirm: async () => true });
	assert.equal(yes.block, false);
	assert.equal(yes.receipt?.status, "approved");
	assert.equal(yes.receipt?.consent, "joe");

	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
	const no = await decideCall("bash", { command: "git push origin main" }, { hasUI: true, session: "t2", confirm: async () => (await wait(80), false) });
	assert.equal(no.block, true);
	assert.equal(no.receipt?.status, "denied:user");
	assert.equal(no.receipt?.ui, true);
	assert.equal(no.receipt?.prev, yes.receipt?.id, "receipts chain by id");

	// Prime's JSON/print modes say hasUI=true but confirm() returns false at once with no dialog.
	const noop = await decideCall("bash", { command: "git push origin main" }, { hasUI: true, session: "t2", confirm: async () => false });
	assert.equal(noop.block, true);
	assert.equal(noop.receipt?.status, "denied:no-ui", "an instant no means nobody was asked");
	assert.equal(noop.receipt?.ui, false);
	assert.match(noop.reason!, /No screen to ask on/);

	let sawPreview = "";
	const slow = await decideCall("bash", { command: "gh pr merge 7" }, {
		hasUI: true,
		session: "t2",
		timeoutMs: 30,
		confirm: (_t, message, { signal }) => {
			sawPreview = message;
			return new Promise((res) => signal.addEventListener("abort", () => res(false)));
		},
	});
	assert.match(sawPreview, /gh pr merge 7/, "the command text is the dialog preview");
	assert.equal(slow.block, true);
	assert.equal(slow.receipt?.status, "denied:timeout");
	assert.equal(listPending("t2").length, 2, "the no-ui denial and the timeout are pending for t2");
});

test("receipt preview masks long tokens", () => {
	assert.ok(!maskPreview(`curl -H "Authorization: Bearer ${FAKE_KEY}"`).includes(FAKE_KEY));
});

// ---------- scrubber ----------

test("a pasted fake Stripe key is redacted and never logged", { skip: !scrubberAvailable() && "gstack-redact not installed" }, () => {
	const paste = `please use this key: ${FAKE_KEY} for the checkout`;
	const r = scrub(paste);
	assert.equal(r.scannerError, undefined, `scanner ran: ${r.scannerError}`);
	assert.equal(r.changed, true);
	assert.ok(!r.text.includes(FAKE_KEY), "key removed from the text");
	assert.match(r.text, /<REDACTED:stripe\.secret>/);
	assert.match(r.text, /^please use this key: <REDACTED:stripe\.secret> for the checkout$/, "the rest of the paste survives");
	assert.deepEqual(r.kinds.map((k) => k.id), ["stripe.secret"]);
	logScrub(r, "t3");
	const log = readFileSync(scrubberLogPath(), "utf8");
	assert.ok(!log.includes(FAKE_KEY), "key not in scrubber log");
	assert.ok(!log.includes("sk_l"), "not even a prefix preview in the log");
	assert.match(log, /"id":"stripe\.secret"/);
});

test("clean text passes through unchanged", { skip: !scrubberAvailable() && "gstack-redact not installed" }, () => {
	const r = scrub("draft the deck for the seed round");
	assert.equal(r.changed, false);
	assert.equal(r.text, "draft the deck for the seed round");
});

test("the fake key appears in no decision log", () => {
	assert.ok(!allLogText().includes(FAKE_KEY));
});

// ---------- limits ----------

test("the 201st tool call is blocked", () => {
	const lim = createLimiter({ maxActions: 200, maxSpend: 5 });
	for (let i = 1; i <= 200; i++) assert.equal(lim.onToolCall("bash").block, false, `call ${i} allowed`);
	const r = lim.onToolCall("bash");
	assert.equal(r.block, true);
	assert.match(r.reason!, /200 tool calls/);
	assert.equal(lim.state.blockedBy, "actions");
	lim.reset();
	assert.equal(lim.onToolCall("bash").block, false, "reset starts a new run");
});

test("spend past the cap blocks further tool calls with a clear message", () => {
	const lim = createLimiter({ maxActions: 200, maxSpend: 5 });
	assert.equal(lim.onAssistantCost(2.5), undefined);
	assert.equal(lim.onAssistantCost(undefined), undefined, "missing cost is ignored");
	const msg = lim.onAssistantCost(3.0);
	assert.match(msg!, /\$5\.50, past the cap of \$5\.00/);
	const r = lim.onToolCall("bash");
	assert.equal(r.block, true);
	assert.match(r.reason!, /LAURELIN_MAX_SPEND/);
});

test("resume reports the last completed tool call, or an unfinished one", () => {
	const entries = [
		{ type: "message", message: { role: "user", content: "hi" } },
		{ type: "message", message: { role: "assistant", timestamp: 1, content: [{ type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls -la" } }] } },
		{ type: "message", message: { role: "toolResult", toolCallId: "c1", toolName: "bash", isError: false, timestamp: 2 } },
	];
	const done = lastCompletedToolCall(entries);
	assert.equal(done?.completed, true);
	assert.match(resumeLine(done), /last completed tool call was bash: ls -la/);

	entries.push({ type: "message", message: { role: "assistant", timestamp: 3, content: [{ type: "toolCall", id: "c2", name: "bash", arguments: { command: "git commit -m x" } }] } });
	const open = lastCompletedToolCall(entries);
	assert.equal(open?.completed, false);
	assert.match(resumeLine(open), /STARTED but no result/);
	assert.match(resumeLine(undefined), /no tool call recorded/);
});

// ---------- refusals ----------

test("short prompts and slash commands skip the refusal check", () => {
	assert.equal(worthChecking("/limits"), false);
	assert.equal(worthChecking("hi"), false);
	assert.equal(worthChecking("filter the candidates by nationality"), true);
});

test("no spend cap by default: subscription runs never block on list API prices", () => {
	const prev = process.env.LAURELIN_MAX_SPEND;
	delete process.env.LAURELIN_MAX_SPEND;
	try {
		const lim = createLimiter(limitsFromEnv());
		assert.equal(lim.onAssistantCost(500), undefined);
		assert.equal(lim.onToolCall("bash").block, false);
		assert.match(lim.summary(), /no spend cap/);
	} finally {
		if (prev !== undefined) process.env.LAURELIN_MAX_SPEND = prev;
	}
});
