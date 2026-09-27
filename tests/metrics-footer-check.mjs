// Checks that laurelin-ui's footer shows the acceptance figure from metrics/latest.json.
// Usage: LAURELIN_METRICS_FILE=<json> node tests/metrics-footer-check.mjs <prime-agent root> "<expected text or empty>"
// Loads the extension through Prime's own loader, fires session_start with a fake
// screen, and reads the status line the badge set.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [primeRoot, expected] = process.argv.slice(2);
if (!primeRoot) {
	console.error("usage: node tests/metrics-footer-check.mjs <prime-agent root> <expected>");
	process.exit(2);
}
const repo = resolve(new URL("..", import.meta.url).pathname);
const loader = await import(pathToFileURL(join(primeRoot, "dist/core/extensions/loader.js")).href);
const result = await loader.loadExtensions([join(repo, "pack/extensions/laurelin-ui.ts")], repo);
for (const err of result.errors) {
	console.log(`FAIL ${err.path}: ${err.error}`);
	process.exit(1);
}
const ext = result.extensions[0];
let status = "";
const theme = { fg: (_c, s) => s, bg: (_c, s) => s, bold: (s) => s };
const ui = {
	theme,
	notify() {},
	setStatus: (_k, text) => (status = text),
	setWidget() {},
	custom: () => Promise.resolve(),
};
const ctx = { hasUI: true, ui, model: { id: "test-model" }, cwd: repo };
process.env.LAURELIN_NO_IMAGE = "1";
for (const h of ext.handlers.get("session_start")) await h({ type: "session_start", reason: "resume" }, ctx);
await new Promise((r) => setTimeout(r, 50)); // the badge draws on a short timer
status = status.replace(/\x1b\[[0-9;]*m/g, "");

if (expected) {
	if (status.toLowerCase().includes(expected.toLowerCase())) {
		console.log(`ok   footer shows "${expected}"`);
	} else {
		console.log(`FAIL footer should show "${expected}", got: ${status}`);
		process.exit(1);
	}
} else if (/accept/i.test(status)) {
	console.log(`FAIL footer should omit the acceptance item when there is no number, got: ${status}`);
	process.exit(1);
} else {
	console.log("ok   footer omits the acceptance item when latest.json has no number");
}
