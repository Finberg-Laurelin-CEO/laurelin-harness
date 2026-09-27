// Checks the interface piece with Prime's own code.
// Usage: node tests/interface-check.mjs <prime-agent package root>
// 1. Every theme JSON in pack/themes has every required color token (from Prime's schema)
//    and loads through Prime's theme loader.
// 2. Every extension in pack/extensions loads through Prime's extension loader
//    (jiti compile plus the factory run) with no error, and laurelin-ui registers its commands.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const primeRoot = process.argv[2];
if (!primeRoot) {
	console.error("usage: node tests/interface-check.mjs <prime-agent root>");
	process.exit(2);
}
const repo = resolve(new URL("..", import.meta.url).pathname);
const packDir = join(repo, "pack");
let failed = false;
const fail = (msg) => {
	failed = true;
	console.log(`FAIL ${msg}`);
};
const ok = (msg) => console.log(`ok   ${msg}`);

// ---- themes
const schema = JSON.parse(readFileSync(join(primeRoot, "dist/modes/interactive/theme/theme-schema.json"), "utf8"));
const required = schema.properties.colors.required;
const known = new Set(Object.keys(schema.properties.colors.properties));
const themeMod = await import(pathToFileURL(join(primeRoot, "dist/modes/interactive/theme/theme.js")).href);
await themeMod.preloadThemeValidator();

const themeFiles = readdirSync(join(packDir, "themes")).filter((f) => f.endsWith(".json"));
if (themeFiles.length === 0) fail("no theme files in pack/themes");
for (const file of themeFiles) {
	const path = join(packDir, "themes", file);
	let json;
	try {
		json = JSON.parse(readFileSync(path, "utf8"));
	} catch (e) {
		fail(`${file}: does not parse: ${e.message}`);
		continue;
	}
	const colors = json.colors ?? {};
	const missing = required.filter((t) => !(t in colors));
	const unknown = Object.keys(colors).filter((t) => !known.has(t));
	if (missing.length) fail(`${file}: missing tokens: ${missing.join(", ")}`);
	if (unknown.length) fail(`${file}: unknown tokens: ${unknown.join(", ")}`);
	try {
		themeMod.loadThemeFromPath(path);
		if (!missing.length && !unknown.length) ok(`${file}: ${required.length} required tokens present, loads in Prime (name "${json.name}")`);
	} catch (e) {
		fail(`${file}: Prime rejects it: ${e.message}`);
	}
}

// ---- extensions
const loader = await import(pathToFileURL(join(primeRoot, "dist/core/extensions/loader.js")).href);
const extFiles = readdirSync(join(packDir, "extensions"))
	.filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
	.map((f) => join(packDir, "extensions", f));
if (extFiles.length === 0) fail("no extensions in pack/extensions");
const result = await loader.loadExtensions(extFiles, repo);
for (const err of result.errors) fail(`${err.path}: ${err.error}`);
for (const ext of result.extensions) {
	ok(`${ext.path.replace(repo + "/", "")}: loads, ${ext.commands.size} commands, ${ext.handlers.size} event types`);
}
const laurelinUi = result.extensions.find((e) => e.path.endsWith("laurelin-ui.ts"));
if (!laurelinUi) fail("laurelin-ui.ts did not load");
else {
	for (const cmd of ["classify", "checks", "approvals", "title"]) {
		if (!laurelinUi.commands.has(cmd)) fail(`laurelin-ui.ts: command /${cmd} not registered`);
	}
	if (!laurelinUi.handlers.has("session_start")) fail("laurelin-ui.ts: no session_start handler");
}

// ---- headless render: drive laurelin-ui with a fake screen, 80 columns wide
if (laurelinUi) {
	const tui = await import(pathToFileURL(join(primeRoot, "node_modules/@earendil-works/pi-tui/dist/index.js")).href);
	const WIDTH = 80;
	const theme = { fg: (_c, s) => s, bg: (_c, s) => s, bold: (s) => s };
	const widgets = new Map();
	let status;
	const rendered = [];
	const checkLines = (label, lines) => {
		for (const l of lines) if (tui.visibleWidth(l) > WIDTH) fail(`${label}: line wider than ${WIDTH}: ${JSON.stringify(l)}`);
		rendered.push(label);
	};
	const keys = { title: ["x"], approvals: ["\x1b[B", "a", "\x1b[A", "r", "\x1b"] };
	// Scripted answers for the approvals pick list: approve the first item, reject the next, then finish.
	const picks = [(o) => o[0], () => "Approve", (o) => o[0], () => "Reject", () => "Done"];
	const ui = {
		theme,
		notify() {},
		select: async (title, options) => {
			checkLines("approvals list", [title.split("\n")[0], ...options]);
			rendered.push("approvals list");
			const f = picks.shift();
			return f ? f(options) : undefined;
		},
		setStatus: (_k, text) => (status = text),
		setWidget: (key, content, opts) => {
			if (content === undefined) return widgets.delete(key);
			const lines = Array.isArray(content) ? content : content({ requestRender() {} }, theme).render(WIDTH);
			widgets.set(key, { lines, placement: opts?.placement });
			checkLines(`widget ${key}`, lines);
		},
		custom: (factory, opts) =>
			new Promise((resolve) => {
				const comp = factory({ requestRender() {} }, theme, {}, resolve);
				const label = opts?.overlay ? "approvals overlay" : "title screen";
				checkLines(label, comp.render(WIDTH));
				for (const k of keys[opts?.overlay ? "approvals" : "title"]) {
					comp.handleInput(k);
					checkLines(label, comp.render(WIDTH));
				}
			}),
	};
	const ctx = { hasUI: true, ui, model: { id: "test-model" }, cwd: repo };
	const run = (name, args) => laurelinUi.commands.get(name).handler(args, ctx);
	process.env.LAURELIN_NO_IMAGE = "1";
	for (const h of laurelinUi.handlers.get("session_start")) await h({ type: "session_start", reason: "startup" }, ctx);
	await new Promise((r) => setTimeout(r, 50)); // the first draw is scheduled
	if (!widgets.has("checks") || !["PROSE","NUMBERS","LAYOUT","LOCATION","WORD FOR WORD","EVIDENCE"].every((n) => widgets.get("checks").lines[0]?.includes(n))) fail("checks widget should show all six checks in one row");
	if (widgets.get("checks")?.placement !== "belowEditor") fail("checks widget should sit below the editor");
	await run("checks", "demo");
	await run("checks", "demo");
	if (!widgets.get("checks").lines.some((l) => l.includes("p.7 overlap"))) fail("checks demo step 2 should show the layout failure text");
	await run("classify", "red");
	if (!status || !status.includes("RED") || !status.includes("test-model") || !status.includes("coordinator")) fail(`badge wrong: ${status}`);
	await run("approvals", "demo");
	if (!widgets.get("approvals")?.lines[0]?.includes("3 APPROVALS")) fail("approvals line should say 3 waiting");
	await run("approvals", "");
	if (!rendered.includes("approvals list")) fail("approvals list did not open");
	if (!widgets.get("approvals")?.lines[0]?.includes("1 APPROVAL")) fail("after one approve and one reject, 1 should remain");
	if (!failed) ok(`headless render at ${WIDTH} cols: checks widget, badge, approvals pick list`);
}

process.exit(failed ? 1 : 0);
