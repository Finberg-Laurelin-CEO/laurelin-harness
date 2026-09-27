/**
 * Laurelin worktrees: parallel work in git worktrees, tracked inside the harness (Orca's job, done here).
 *
 * worktrunk (`wt`) creates, merges and removes the worktrees; pack/worktrees/tracker.mjs keeps each one's
 * task, worker, process, status (todo, running, review, done, blocked), comment and last gate results.
 *
 * Tools the model can call: worktree_start, worktree_list, worktree_update, worktree_log, worktree_stop,
 * worktree_merge and worktree_remove (the last two ask Joe first).
 * Command: /worktrees [list | log <name> | comment <name> <text> | status <name> <state> | stop <name>
 *          | merge <name> | remove <name>]
 * Widget: one line under the gates, refreshed every 15 seconds: TREES n · running · review.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
// @ts-ignore: plain JavaScript module shared with the shell command
import * as tracker from "../worktrees/tracker.mjs";

const REFRESH_MS = 15_000;
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export default function (pi: ExtensionAPI) {
	let ui: any;
	let timer: ReturnType<typeof setInterval> | undefined;

	const widget = () => {
		if (!ui?.hasUI) return;
		let rows: any[] = [];
		try {
			rows = tracker.list(ui.cwd).filter((r: any) => !r.main);
		} catch {
			return ui.ui.setWidget("worktrees", undefined);
		}
		if (rows.length === 0) return ui.ui.setWidget("worktrees", undefined);
		const t = ui.ui.theme;
		const running = rows.filter((r) => r.running).length;
		const review = rows.filter((r) => !r.running && r.status === "review").length;
		const blocked = rows.filter((r) => r.status === "blocked").length;
		const parts = [
			`${t.fg("text", String(rows.length))} ${t.fg("dim", rows.length === 1 ? "WORKTREE" : "WORKTREES")}`,
			running ? `${t.fg("text", String(running))} ${t.fg("dim", "RUNNING")}` : "",
			review ? `${t.fg("accent", String(review))} ${t.fg("accent", "REVIEW")}` : "",
			blocked ? `${t.fg("text", String(blocked))} ${t.fg("dim", "BLOCKED")}` : "",
		].filter(Boolean);
		ui.ui.setWidget("worktrees", [` ${t.fg("dim", "TREES")}  ${parts.join("   ")}   ${t.fg("dim", "/worktrees")}`], {
			placement: "belowEditor",
		});
	};

	pi.on("session_start", async (_e, ctx) => {
		ui = ctx;
		for (const ms of [0, 800, 2000, 4000, 8000]) setTimeout(() => ctx.hasUI && widget(), ms);
		if (!timer) timer = setInterval(() => ui?.hasUI && widget(), REFRESH_MS);
	});
	pi.on("session_shutdown", async () => {
		if (timer) clearInterval(timer);
		timer = undefined;
	});

	const guard = async (ctx: any, title: string, message: string) => {
		if (!ctx.hasUI || typeof ctx.ui.confirm !== "function") return false;
		return await ctx.ui.confirm(title, message);
	};

	pi.registerTool({
		name: "worktree_start",
		label: "Start work in a worktree",
		description:
			"Create a new git worktree and branch with worktrunk and start a worker there in the background. Workers: " +
			"'laurelin' (this harness, with its gates), 'claude' (Claude Code), 'codex' (Codex), 'none' (just the worktree). " +
			"The worker runs the task alone; follow it with worktree_list and worktree_log.",
		parameters: Type.Object({
			name: Type.String({ description: "Branch name for the worktree, for example 'deck-v9' or 'fix-footer'" }),
			task: Type.String({ description: "The full task for the worker, written for someone with no context" }),
			worker: Type.Optional(StringEnum(["laurelin", "claude", "codex", "none"] as const, { description: "Default laurelin" })),
			base: Type.Optional(Type.String({ description: "Base branch (default: the repository's default branch)" })),
		}),
		async execute(_id, params, _signal, _update, ctx) {
			const rec = tracker.start(ctx.cwd, { name: params.name, task: params.task, worker: params.worker ?? "laurelin", base: params.base });
			ui = ctx;
			widget();
			return text(`Started ${rec.branch} at ${rec.path} (worker ${rec.worker}${rec.pid ? `, pid ${rec.pid}` : ""}). Log: ${rec.path}/.laurelin/worker.log`);
		},
	});

	pi.registerTool({
		name: "worktree_list",
		label: "List worktrees",
		description: "Every worktree of this repository with its status, worker, changes, gate results, task and comment.",
		parameters: Type.Object({}),
		async execute(_id, _p, _s, _u, ctx) {
			return text(tracker.table(tracker.list(ctx.cwd)));
		},
	});

	pi.registerTool({
		name: "worktree_update",
		label: "Update a worktree",
		description: "Set a worktree's comment and/or status (todo, running, review, done, blocked).",
		parameters: Type.Object({
			name: Type.String(),
			comment: Type.Optional(Type.String()),
			status: Type.Optional(StringEnum(["todo", "running", "review", "done", "blocked"] as const)),
		}),
		async execute(_id, p, _s, _u, ctx) {
			const rec = tracker.update(ctx.cwd, p.name, { comment: p.comment, status: p.status });
			widget();
			return text(`${rec.branch}: ${rec.status}${rec.comment ? `, "${rec.comment}"` : ""}`);
		},
	});

	pi.registerTool({
		name: "worktree_log",
		label: "Read a worker's log",
		description: "The last lines a worktree's worker wrote.",
		parameters: Type.Object({ name: Type.String(), lines: Type.Optional(Type.Number()) }),
		async execute(_id, p, _s, _u, ctx) {
			return text(tracker.logTail(ctx.cwd, p.name, p.lines ?? 40));
		},
	});

	pi.registerTool({
		name: "worktree_stop",
		label: "Stop a worker",
		description: "Stop the worker running in a worktree and mark it blocked.",
		parameters: Type.Object({ name: Type.String() }),
		async execute(_id, p, _s, _u, ctx) {
			tracker.stop(ctx.cwd, p.name);
			widget();
			return text(`Stopped the worker in ${p.name}.`);
		},
	});

	pi.registerTool({
		name: "worktree_merge",
		label: "Merge a worktree",
		description: "Merge a worktree's branch into the default branch with worktrunk. Asks Joe first.",
		parameters: Type.Object({ name: Type.String() }),
		async execute(_id, p, _s, _u, ctx) {
			if (!(await guard(ctx, `Merge ${p.name} into the main branch?`, "worktrunk squashes, rebases and merges it, then cleans up.")))
				return text(`Not merged: Joe did not approve merging ${p.name}.`);
			const out = tracker.merge(ctx.cwd, p.name);
			widget();
			return text(`Merged ${p.name}.\n${out}`);
		},
	});

	pi.registerTool({
		name: "worktree_remove",
		label: "Remove a worktree",
		description: "Delete a worktree and its branch with worktrunk. Asks Joe first.",
		parameters: Type.Object({ name: Type.String() }),
		async execute(_id, p, _s, _u, ctx) {
			if (!(await guard(ctx, `Remove worktree ${p.name}?`, "The worktree folder and its branch are deleted.")))
				return text(`Not removed: Joe did not approve removing ${p.name}.`);
			const out = tracker.remove(ctx.cwd, p.name);
			widget();
			return text(`Removed ${p.name}.\n${out}`);
		},
	});

	pi.registerCommand("worktrees", {
		description: "Worktrees: list | log <name> | comment <name> <text> | status <name> <state> | stop | merge | remove",
		handler: async (args, ctx) => {
			ui = ctx;
			const [sub = "list", name, ...rest] = (args ?? "").trim().split(/\s+/).filter(Boolean);
			try {
				if (sub === "list") return ctx.ui.notify(tracker.table(tracker.list(ctx.cwd)), "info");
				if (!name) return ctx.ui.notify("usage: /worktrees list | log <name> | comment <name> <text> | status <name> <state> | stop <name> | merge <name> | remove <name>", "warning");
				if (sub === "log") return ctx.ui.notify(tracker.logTail(ctx.cwd, name, 30), "info");
				if (sub === "comment") tracker.update(ctx.cwd, name, { comment: rest.join(" ") });
				else if (sub === "status") tracker.update(ctx.cwd, name, { status: rest[0] });
				else if (sub === "stop") tracker.stop(ctx.cwd, name);
				else if (sub === "merge") {
					if (!(await guard(ctx, `Merge ${name} into the main branch?`, "worktrunk squashes, rebases and merges it, then cleans up."))) return;
					ctx.ui.notify(tracker.merge(ctx.cwd, name) || `Merged ${name}.`, "info");
				} else if (sub === "remove") {
					if (!(await guard(ctx, `Remove worktree ${name}?`, "The worktree folder and its branch are deleted."))) return;
					tracker.remove(ctx.cwd, name);
				} else return ctx.ui.notify(`unknown: /worktrees ${sub}`, "warning");
				widget();
			} catch (e) {
				ctx.ui.notify(`worktrees: ${(e as Error).message}`, "error");
			}
		},
	});
}
