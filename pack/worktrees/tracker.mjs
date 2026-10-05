// Worktree tracker: worktrunk (`wt`) does the git work; this file keeps what worktrunk does not know:
// the task, the worker, its process, a status and a comment for each worktree, and the worktree's
// last gate results. Used by the laurelin-worktrees extension and by `laurelin-agent worktrees`.
//
// State lives in <main checkout>/.laurelin/worktrees.json. Each worker writes its output to
// <worktree>/.laurelin/worker.log. Nothing here pushes or talks to a remote.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { graphLines, runIds } from "../graph/trace.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK = resolve(HERE, "..");
const REPO = resolve(PACK, "..");
export const STATUSES = ["todo", "running", "review", "done", "blocked"];
export const WORKERS = ["laurelin", "claude", "codex", "none"];

function sh(cmd, args, cwd, opts = {}) {
	const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: opts.timeout ?? 60_000, env: process.env });
	if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
	if (r.status !== 0 && !opts.allowFail) throw new Error(`${cmd} ${args.join(" ")} failed: ${(r.stderr || r.stdout).trim().slice(0, 400)}`);
	return r.stdout;
}

export function wtBin() {
	for (const c of [process.env.LAURELIN_WT, "/opt/homebrew/bin/wt", "wt"]) {
		if (!c) continue;
		const r = spawnSync(c, ["--version"], { encoding: "utf8" });
		if (r.status === 0) return c;
	}
	throw new Error("worktrunk (wt) is not installed. Install it with: brew install worktrunk");
}

/** The main checkout of the repository that contains cwd. */
export function mainRoot(cwd) {
	const common = sh("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd).trim();
	return dirname(common);
}

function stateFile(root) {
	return join(root, ".laurelin", "worktrees.json");
}

export function loadState(root) {
	try {
		return JSON.parse(readFileSync(stateFile(root), "utf8"));
	} catch {
		return { worktrees: {} };
	}
}

function saveState(root, state) {
	mkdirSync(dirname(stateFile(root)), { recursive: true });
	writeFileSync(stateFile(root), JSON.stringify(state, null, 2) + "\n");
}

function alive(pid) {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function lastGates(path) {
	const out = {};
	try {
		for (const line of readFileSync(join(path, "decision-log", "gates.jsonl"), "utf8").trim().split("\n").slice(-200)) {
			try {
				const d = JSON.parse(line);
				if (d.check) out[d.check] = d.result;
			} catch {}
		}
	} catch {}
	return out;
}

/** worktrunk's view of every worktree, joined with the tracker's record and live process state. */
export function list(cwd) {
	const root = mainRoot(cwd);
	const state = loadState(root);
	const wt = JSON.parse(sh(wtBin(), ["list", "--format=json"], root));
	let changed = false;
	const rows = wt.map((w) => {
		const rec = state.worktrees[w.branch] ?? {};
		if (rec.status === "running" && rec.pid && !alive(rec.pid)) {
			rec.status = "review";
			rec.finished = rec.finished ?? new Date().toISOString();
			state.worktrees[w.branch] = rec;
			changed = true;
		}
		const tree = w.working_tree ?? {};
		const dirty = tree.staged || tree.modified || tree.untracked || tree.renamed || tree.deleted;
		return {
			branch: w.branch,
			path: w.path,
			main: w.main_state === "is_main",
			status: rec.status ?? (w.main_state === "is_main" ? "main" : "todo"),
			worker: rec.worker ?? "",
			task: rec.task ?? "",
			comment: rec.comment ?? "",
			running: rec.pid ? alive(rec.pid) : false,
			dirty: Boolean(dirty),
			added: tree.diff?.added ?? 0,
			deleted: tree.diff?.deleted ?? 0,
			ahead: w.main?.ahead ?? w.ahead ?? null,
			commit: w.commit?.message ?? "",
			age: w.commit?.timestamp ?? null,
			gates: w.path ? lastGates(w.path) : {},
			log: w.path ? join(w.path, ".laurelin", "worker.log") : "",
		};
	});
	if (changed) saveState(root, state);
	return rows;
}

function workerCommand(worker, task, path) {
	// Tests only: a stand-in script receives the task as its one argument and runs in the worktree.
	if (process.env.LAURELIN_FAKE_WORKER) return [process.env.LAURELIN_FAKE_WORKER, [task]];
	if (worker === "laurelin") {
		const bin = existsSync(join(REPO, "bin", "laurelin-agent")) ? join(REPO, "bin", "laurelin-agent") : "laurelin-agent";
		return [bin, ["--no-session", "--autonomous", "-p", task]];
	}
	if (worker === "claude") {
		return ["claude", ["-p", "--safe-mode", "--settings", join(PACK, "worker", "claude-settings.json"), "--permission-mode", "acceptEdits", task]];
	}
	if (worker === "codex") {
		let auth = [];
		try {
			const m = readFileSync(join(homedir(), ".codex", "config.toml"), "utf8").match(/^cli_auth_credentials_store\s*=\s*("[^"]*")/m);
			if (m) auth = ["-c", `cli_auth_credentials_store=${m[1]}`];
		} catch {}
		return ["codex", ["exec", "--sandbox", "workspace-write", "--ignore-user-config", ...auth, "-C", path, task]];
	}
	return null;
}

/** Create a worktree with worktrunk and start a worker in it in the background. */
export function start(cwd, { name, task = "", worker = "laurelin", base } = {}) {
	if (!name || !/^[A-Za-z0-9._/-]+$/.test(name)) throw new Error("name must be a branch name (letters, digits, . _ / -)");
	if (!WORKERS.includes(worker)) throw new Error(`worker must be one of ${WORKERS.join(", ")}`);
	const root = mainRoot(cwd);
	const args = ["switch", "--create", name, "--no-cd", "--no-hooks"];
	if (base) args.push("--base", base);
	sh(wtBin(), args, root, { timeout: 120_000 });
	const row = list(root).find((r) => r.branch === name);
	if (!row?.path) throw new Error(`worktrunk created ${name} but it is not in wt list`);
	const state = loadState(root);
	const rec = { branch: name, path: row.path, task, worker, status: "todo", comment: "", created: new Date().toISOString() };
	const cmd = worker === "none" || !task ? null : workerCommand(worker, task, row.path);
	if (cmd) {
		mkdirSync(join(row.path, ".laurelin"), { recursive: true });
		const out = openSync(join(row.path, ".laurelin", "worker.log"), "a");
		const child = spawn(cmd[0], cmd[1], { cwd: row.path, detached: true, stdio: ["ignore", out, out], env: process.env });
		child.unref();
		rec.pid = child.pid;
		rec.status = "running";
		rec.started = new Date().toISOString();
	}
	state.worktrees[name] = rec;
	saveState(root, state);
	return rec;
}

export function update(cwd, name, fields) {
	const root = mainRoot(cwd);
	const state = loadState(root);
	const rec = state.worktrees[name] ?? { branch: name };
	if (fields.status && !STATUSES.includes(fields.status)) throw new Error(`status must be one of ${STATUSES.join(", ")}`);
	Object.assign(rec, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)));
	state.worktrees[name] = rec;
	saveState(root, state);
	return rec;
}

export function logTail(cwd, name, lines = 40) {
	const row = list(cwd).find((r) => r.branch === name);
	if (!row) throw new Error(`no worktree ${name}`);
	try {
		return readFileSync(row.log, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
	} catch {
		return "(no worker log yet)";
	}
}

export function stop(cwd, name) {
	const root = mainRoot(cwd);
	const rec = loadState(root).worktrees[name];
	if (rec?.pid && alive(rec.pid)) {
		try {
			process.kill(-rec.pid);
		} catch {
			process.kill(rec.pid);
		}
	}
	return update(cwd, name, { status: "blocked", comment: rec?.comment || "stopped by Joe" });
}

/** Merge the worktree's branch into the default branch with worktrunk, run from inside that worktree. */
export function merge(cwd, name) {
	const row = list(cwd).find((r) => r.branch === name);
	if (!row?.path) throw new Error(`no worktree ${name}`);
	const out = sh(wtBin(), ["merge", "--no-hooks"], row.path, { timeout: 300_000 });
	update(mainRoot(cwd), name, { status: "done", merged: new Date().toISOString() });
	return out.trim();
}

export function remove(cwd, name) {
	const root = mainRoot(cwd);
	const out = sh(wtBin(), ["remove", name, "--no-hooks"], root, { timeout: 120_000 });
	const state = loadState(root);
	delete state.worktrees[name];
	saveState(root, state);
	return out.trim();
}

/** Last non-empty line a worktree's worker wrote, trimmed for one row. */
function lastLine(path) {
	try {
		const t = readFileSync(join(path, ".laurelin", "worker.log"), "utf8").trimEnd().split("\n").filter((l) => l.trim());
		return (t[t.length - 1] ?? "").replace(/\x1b\[[0-9;]*m/g, "").trim();
	} catch {
		return "";
	}
}

function since(iso) {
	if (!iso) return "";
	const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
	return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

/** Live dashboard in the terminal, Laurelin Visual System: ink, dim, one orange accent. q quits. */
export function watch(cwd, intervalMs = 2000) {
	const ink = (t) => `\x1b[38;2;16;18;20m${t}\x1b[39m`;
	const dim = (t) => `\x1b[2m${t}\x1b[22m`;
	const acc = (t) => `\x1b[38;2;255;79;0m${t}\x1b[39m`;
	const bold = (t) => `\x1b[1m${t}\x1b[22m`;
	const root = mainRoot(cwd);
	const draw = () => {
		const cols = process.stdout.columns || 100;
		let rows = [];
		try {
			rows = list(cwd);
		} catch {}
		const recs = loadState(root).worktrees;
		const trees = rows.filter((r) => !r.main);
		const n = (f) => trees.filter(f).length;
		const summary = [
			`${ink(String(trees.length))} ${dim("TOTAL")}`,
			`${ink(String(n((r) => r.running)))} ${dim("RUNNING")}`,
			`${acc(String(n((r) => !r.running && r.status === "review")))} ${dim("REVIEW")}`,
			`${ink(String(n((r) => r.status === "blocked")))} ${dim("BLOCKED")}`,
			`${ink(String(n((r) => r.status === "done")))} ${dim("DONE")}`,
		].join("   ");
		const out = [
			acc("━━━━"),
			`${bold(ink("W O R K T R E E S"))}  ${dim(basename(root))}  ${dim(new Date().toLocaleTimeString())}`,
			`${summary}`,
			"",
		];
		// Graph runs (pack/graph): each drawn wave by wave above the worktree list.
		let graphs = [];
		try {
			graphs = runIds(root);
		} catch {}
		if (graphs.length) {
			out.push(`${dim("GRAPHS")}`);
			for (const gid of graphs) {
				try {
					out.push(...graphLines(root, gid, { ink, dim, acc, bold }).map((l) => `  ${l}`), "");
				} catch {}
			}
		}
		if (trees.length === 0) out.push(dim('  No worktrees. Start one: laurelin-agent worktrees start <name> --worker claude "task"'));
		for (const r of trees) {
			const rec = recs[r.branch] ?? {};
			const st = r.running ? "RUNNING" : String(r.status).toUpperCase();
			const stc = r.running ? ink(bold(st)) : r.status === "review" ? acc(bold(st)) : dim(st);
			const time = r.running ? since(rec.started) : rec.finished ? `done ${since(rec.finished)} ago` : "";
			const changes = r.dirty ? `+${r.added} -${r.deleted}` : r.ahead ? `${r.ahead} ahead` : "clean";
			const gates = Object.entries(r.gates)
				.map(([k, v]) => (v === "fail" ? acc(`■ ${k}`) : v === "pass" ? ink(`■ ${k}`) : dim(`□ ${k}`)))
				.join("  ");
			out.push(`  ${bold(ink(r.branch.padEnd(22)))} ${stc}${" ".repeat(Math.max(1, 9 - st.length))} ${dim((r.worker || "none").padEnd(8))} ${dim(time.padEnd(12))} ${ink(changes)}`);
			if (r.task || r.comment) out.push(`      ${dim("TASK ")} ${ink((r.comment || r.task).slice(0, cols - 14))}`);
			if (gates) out.push(`      ${dim("GATES")} ${gates}`);
			const ll = r.path ? lastLine(r.path) : "";
			if (ll) out.push(`      ${dim("LAST ")} ${dim(ll.slice(0, cols - 14))}`);
			out.push("");
		}
		out.push(dim("  q quit   ·   laurelin-agent worktrees log|comment|status|stop|merge|remove <name>"));
		process.stdout.write("\x1b[H\x1b[2J" + out.join("\n") + "\n");
	};
	process.stdout.write("\x1b[?25l");
	draw();
	const timer = setInterval(draw, intervalMs);
	const quit = () => {
		clearInterval(timer);
		process.stdout.write("\x1b[?25h\n");
		process.exit(0);
	};
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.on("data", (b) => {
			const k = b.toString();
			if (k === "q" || k === "\u0003" || k === "\u001b") quit();
		});
	}
	process.on("SIGINT", quit);
}

/** A plain-text table for the shell (no colors). */
export function table(rows) {
	const g = (r) => {
		const v = Object.values(r.gates);
		const f = v.filter((x) => x === "fail").length;
		const p = v.filter((x) => x === "pass").length;
		return f ? `${f} fail` : p ? `${p} pass` : "";
	};
	const head = ["BRANCH", "STATUS", "WORKER", "CHANGES", "GATES", "TASK / COMMENT"];
	const body = rows.map((r) => [
		r.branch + (r.main ? " (main)" : ""),
		r.running ? "running" : r.status,
		r.worker,
		r.dirty ? `+${r.added} -${r.deleted}` : r.ahead ? `${r.ahead} ahead` : "clean",
		g(r),
		(r.comment || r.task).slice(0, 60),
	]);
	const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => String(b[i]).length)));
	const fmt = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join("  ").trimEnd();
	return [fmt(head), ...body.map(fmt)].join("\n");
}

// CLI: node tracker.mjs <list|start|comment|status|log|stop|merge|remove> ...
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [cmd = "list", ...rest] = process.argv.slice(2);
	const cwd = process.cwd();
	try {
		if (cmd === "watch") watch(cwd, Number(rest[0] ?? 2000));
		else if (cmd === "list") console.log(rest.includes("--json") ? JSON.stringify(list(cwd), null, 2) : table(list(cwd)));
		else if (cmd === "start") {
			const [name, ...t] = rest;
			const wi = t.indexOf("--worker");
			const worker = wi >= 0 ? t.splice(wi, 2)[1] : "laurelin";
			console.log(JSON.stringify(start(cwd, { name, task: t.join(" "), worker }), null, 2));
		} else if (cmd === "comment") console.log(JSON.stringify(update(cwd, rest[0], { comment: rest.slice(1).join(" ") })));
		else if (cmd === "status") console.log(JSON.stringify(update(cwd, rest[0], { status: rest[1] })));
		else if (cmd === "log") console.log(logTail(cwd, rest[0], Number(rest[1] ?? 40)));
		else if (cmd === "stop") console.log(JSON.stringify(stop(cwd, rest[0])));
		else if (cmd === "merge") console.log(merge(cwd, rest[0]));
		else if (cmd === "remove") console.log(remove(cwd, rest[0]));
		else {
			console.log("usage: worktrees [watch | list [--json] | start <name> [--worker laurelin|claude|codex|none] <task> | comment <name> <text> | status <name> <todo|running|review|done|blocked> | log <name> [n] | stop <name> | merge <name> | remove <name>]");
			process.exit(2);
		}
	} catch (e) {
		console.error(`worktrees: ${e.message}`);
		process.exit(1);
	}
}
