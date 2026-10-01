// echo_write's guard: every number, date, link and quote in a draft must be in the facts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPrompt, unsupported } from "../pack/echo/guard.ts";

const facts = ["Coils arrive in month four", "The vendor confirmed the date in writing on 12 September", "Revenue was $380 in July"];

test("a draft that sticks to the facts has nothing flagged", () => {
	assert.deepEqual(unsupported("Our coils arrive in month four; the vendor confirmed it in writing on 12 September. July revenue was $380.", facts), []);
});

test("invented numbers, links and quotes are flagged", () => {
	const draft = 'Revenue grew 40% to $380. As our CEO said, "we are years ahead of every rival in the field". See https://example.com/report.';
	const got = unsupported(draft, facts);
	assert.ok(got.includes("40%"), JSON.stringify(got));
	assert.ok(got.some((g) => g.startsWith('"we are years ahead')), JSON.stringify(got));
	assert.ok(got.includes("https://example.com/report"), JSON.stringify(got));
	assert.ok(!got.includes("$380"), JSON.stringify(got));
});

test("the prompt lists facts in order and marks samples as voice only", () => {
	const p = buildPrompt("a short email", ["a", "b"], ["sample text"]);
	assert.match(p, /Facts, in order:\n1\. a\n2\. b/);
	assert.match(p, /for voice only \(not as facts\)/);
});
