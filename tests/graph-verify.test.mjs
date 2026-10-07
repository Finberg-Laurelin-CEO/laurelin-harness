// Graph verify: sources check, named gates, Jev contract check, and a Jev outage never blocking a graph.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const T = mkdtempSync(join(tmpdir(), "graph-verify-"));
const script = (name, body) => {
	const p = join(T, name);
	writeFileSync(p, `#!/bin/bash\n${body}\n`);
	chmodSync(p, 0o755);
	return p;
};
const jev = (p) => script(`jev-${p}.sh`, `cat >/dev/null; echo '{"answers":{"meets":{"type":"noul","noul":${p}}}}'`);
const gates = join(T, "gates");
mkdirSync(gates);
writeFileSync(join(gates, "ok.sh"), "#!/bin/bash\necho 'ok: fine'\nexit 0\n");
writeFileSync(join(gates, "nope.sh"), "#!/bin/bash\necho 'nope: two numbers do not match the canonical file'\nexit 1\n");
process.env.LAURELIN_GATES_DIR = gates;
mkdirSync(join(T, "wt", ".laurelin"), { recursive: true });
const out = join(T, "wt", ".laurelin", "out.md");
writeFileSync(out, "result\n");

const { verify, ASKS_FOR_SOURCES } = await import("../pack/graph/verify.mjs");
const step = (o = {}) => ({ id: "s", task: "List DCVC partners", expects: "names", ...o });

test("a contract that asks for sources needs a link, DOI or numbered reference", async () => {
	process.env.JEV_BIN = jev(0.9);
	const s = step({ expects: "names with a source link each" });
	assert.ok(ASKS_FOR_SOURCES.test(s.expects));
	const bad = await verify({}, s, "Alice, Bob", { outFile: out });
	assert.equal(bad.ok, false);
	assert.match(bad.reason, /asks for sources/);
	const good = await verify({}, s, "Alice https://dcvc.com/team, Bob [1]", { outFile: out });
	assert.equal(good.ok, true);
	assert.ok(good.checks.includes("sources: ok"));
});

test("named gates run on the result file; a failing gate fails the step with its reason", async () => {
	process.env.JEV_BIN = jev(0.9);
	const pass = await verify({}, step({ gates: ["ok"] }), "x", { outFile: out });
	assert.equal(pass.ok, true);
	assert.ok(pass.checks.includes("gate ok: ok"));
	const fail = await verify({}, step({ gates: ["ok", "nope"] }), "x", { outFile: out });
	assert.equal(fail.ok, false);
	assert.match(fail.reason, /gate nope failed: nope: two numbers/);
	const unknown = await verify({}, step({ gates: ["ghost"] }), "x", { outFile: out });
	assert.match(unknown.reason, /unknown gate "ghost"/);
});

test("Jev's contract check passes at 0.9 and fails at 0.2 with a reason", async () => {
	process.env.JEV_BIN = jev(0.9);
	const yes = await verify({}, step(), "Alice, Bob", { outFile: out });
	assert.equal(yes.ok, true);
	assert.ok(yes.checks.includes("contract 0.90"));
	process.env.JEV_BIN = jev(0.2);
	const no = await verify({}, step(), "I will look this up later", { outFile: out });
	assert.equal(no.ok, false);
	assert.match(no.reason, /does not meet "names" \(0\.20\)/);
});

test("when Jev cannot answer, the contract check is skipped and noted, never blocking", async () => {
	process.env.JEV_BIN = script("jev-down.sh", "echo 'jev: TypeSafe 402; classifier.dev unreachable' >&2; exit 1");
	const r = await verify({}, step(), "Alice, Bob", { outFile: out });
	assert.equal(r.ok, true);
	assert.match(r.checks.at(-1), /contract: skipped \(Jev unavailable/);
});
