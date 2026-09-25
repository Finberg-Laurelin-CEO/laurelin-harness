// Test for the worker-settings piece (docs/briefs/worker-settings.md). Run with tests/test-worker-settings.sh.
//
// 1. pack/worker/claude-settings.json parses and carries the permission rules.
// 2. delegate_worker(claude) still creates a file.
// 3. The same small task costs at most half the input tokens of the wave-1
//    setup (Claude Code with the user's global hooks, plugins and CLAUDE.md).
//    Both numbers are printed. Prints "skipped: no model" when Claude Code is
//    not on the PATH or not signed in.

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRIME = "/Users/Joe/.local/lib/node_modules/prime-agent";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SETTINGS = join(REPO, "pack/worker/claude-settings.json");
const TMP = join(REPO, "tests", "tmp", `worker-settings-${Date.now()}`);
mkdirSync(TMP, { recursive: true });

let failures = 0;
const pass = (name, note = "") => console.log(`PASS  ${name}${note ? `  (${note})` : ""}`);
const skip = (name, why) => console.log(`skipped: no model  ${name}  (${why})`);
const fail = (name, why) => {
	failures++;
	console.log(`FAIL  ${name}  ${why}`);
};
const looksLikeNoModel = (s) => /not logged in|login|logged in|auth|credential|api key|rate.?limit|quota|overloaded|ENOENT|not found/i.test(String(s));
const has = (cmd) => {
	try {
		execSync(`command -v ${cmd}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};
const finish = () => {
	if (failures === 0) rmSync(TMP, { recursive: true, force: true });
	else console.log(`kept ${TMP} for inspection`);
	console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
	process.exit(failures === 0 ? 0 : 1);
};

// ---- 1. the settings file parses and holds the rules ----
let settings;
try {
	settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
	const p = settings.permissions ?? {};
	const problems = [];
	if (!Array.isArray(p.allow) || p.allow.length === 0) problems.push("permissions.allow missing or empty");
	if (!Array.isArray(p.deny) || !p.deny.includes("WebFetch")) problems.push("permissions.deny must include WebFetch");
	if (p.defaultMode !== "acceptEdits") problems.push(`defaultMode is ${p.defaultMode}, expected acceptEdits`);
	if (settings.hooks && Object.keys(settings.hooks).length) problems.push("settings file must not define hooks");
	if (settings.disableAllHooks !== true) problems.push("disableAllHooks must be true");
	if (problems.length) fail("settings file", problems.join("; "));
	else pass("settings file", `${p.allow.length} allow, ${p.deny.length} deny, hooks off`);
} catch (e) {
	fail("settings file", String(e?.message ?? e));
	finish();
}

if (!has("claude")) {
	skip("delegate_worker(claude)", "claude not on PATH");
	skip("token cut", "claude not on PATH");
	finish();
}

const TASK = "create a file hello.txt containing hello in the cwd";
const inputTokens = (u) => (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0);

// ---- old setup: the wave-1 command line, run directly ----
// Same rules as the settings file, passed as flags; the user's global hooks,
// plugins, MCP servers and CLAUDE.md all load. ECC_GATEGUARD=off is what the
// wave-1 tool set so the GateGuard hook would not block the first command.
async function runOld() {
	const cwd = join(TMP, "old");
	mkdirSync(cwd, { recursive: true });
	const args = [
		"-p", "--output-format", "stream-json", "--verbose",
		"--permission-mode", "acceptEdits",
		"--allowedTools", settings.permissions.allow.join(","),
		"--disallowedTools", settings.permissions.deny.join(","),
	];
	const child = spawn("claude", args, { cwd, env: { ...process.env, ECC_GATEGUARD: "off" }, stdio: ["pipe", "pipe", "pipe"] });
	child.stdin.end(TASK);
	let out = "";
	let err = "";
	child.stdout.on("data", (d) => (out += d));
	child.stderr.on("data", (d) => (err += d));
	const code = await new Promise((res) => child.on("close", res));
	let result;
	for (const line of out.split("\n")) {
		try {
			const ev = JSON.parse(line);
			if (ev.type === "result") result = ev;
		} catch {}
	}
	if (!result) throw new Error(`no result event (exit ${code}): ${err.slice(-300)}`);
	if (result.is_error) throw new Error(String(result.result ?? result.subtype));
	return { input: inputTokens(result.usage), turns: result.num_turns, file: existsSync(join(cwd, "hello.txt")) };
}

// ---- new setup: delegate_worker through the extension ----
async function runNew() {
	const { loadExtensions } = await import(`${PRIME}/dist/core/extensions/index.js`);
	const { AuthStorage, ModelRegistry } = await import(`${PRIME}/dist/index.js`);
	const { extensions, errors } = await loadExtensions([join(REPO, "pack/extensions/laurelin-workers.ts")], REPO);
	if (errors.length) throw new Error(errors.map((e) => `${e.path}: ${e.error}`).join("; "));
	let tool;
	for (const ext of extensions) for (const [name, t] of ext.tools) if (name === "delegate_worker") tool = t.definition;
	if (!tool) throw new Error("delegate_worker not registered");
	const cwd = join(TMP, "new");
	mkdirSync(cwd, { recursive: true });
	const ctx = { cwd, hasUI: false, ui: { notify() {} }, modelRegistry: ModelRegistry.create(AuthStorage.create()), model: undefined };
	const r = await tool.execute("t-claude", { worker: "claude", task: TASK, cwd, timeout_seconds: 600 }, undefined, undefined, ctx);
	const file = join(cwd, "hello.txt");
	return {
		input: r.details.usage?.input_tokens,
		turns: r.details.usage?.turns,
		file: existsSync(file) && /hello/.test(readFileSync(file, "utf8")),
		filesReported: r.details.files,
	};
}

const [oldRes, newRes] = await Promise.allSettled([runOld(), runNew()]);
const reasons = [oldRes, newRes].filter((r) => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason));
if (reasons.some(looksLikeNoModel)) {
	skip("delegate_worker(claude)", reasons.find(looksLikeNoModel).slice(0, 120));
	skip("token cut", "same");
	finish();
}
if (newRes.status === "rejected") fail("delegate_worker(claude)", String(newRes.reason?.stack ?? newRes.reason));
else if (!newRes.value.file) fail("delegate_worker(claude)", "hello.txt missing or lacks 'hello'");
else if (!newRes.value.filesReported?.includes("hello.txt")) fail("delegate_worker(claude)", `files changed = ${JSON.stringify(newRes.value.filesReported)}`);
else pass("delegate_worker(claude)", "hello.txt created");

if (oldRes.status === "rejected") fail("token cut", `old setup failed: ${String(oldRes.reason?.message ?? oldRes.reason).slice(0, 200)}`);
else if (newRes.status === "rejected") fail("token cut", "new setup failed (above)");
else {
	const o = oldRes.value;
	const n = newRes.value;
	console.log(`  old setup (global hooks, plugins, CLAUDE.md): ${o.input} input tokens over ${o.turns} turn(s)`);
	console.log(`  new setup (--safe-mode --settings):          ${n.input} input tokens over ${n.turns} turn(s)`);
	if (typeof n.input !== "number") fail("token cut", "delegate_worker returned no usage");
	else if (n.input * 2 > o.input) fail("token cut", `${n.input} is more than half of ${o.input}`);
	else pass("token cut", `${Math.round((1 - n.input / o.input) * 100)}% fewer input tokens`);
}
finish();
