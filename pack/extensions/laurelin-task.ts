/**
 * laurelin-task: the task state file (PLAN.md section 20, wave 2, bridge).
 *
 * Prime starts every autonomous gate in a fresh shell, so a value the agent
 * sets in its own environment never reaches a gate. The fix is one small
 * file, `.laurelin/task.json` in the working directory (gitignored), that the
 * agent writes with the `set_task` tool and every gate reads through
 * `pack/gates/lib.sh`. `bin/laurelin --target --claim` writes the same file.
 *
 * Keys: target (path), claim (text), original (path), classification
 * (green | yellow | red), notes (text).
 *
 * Tool:     set_task({ target?, claim?, original?, classification?, notes? })
 * Command:  /task   shows the file
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export interface Task {
	target?: string;
	claim?: string;
	original?: string;
	classification?: "green" | "yellow" | "red";
	notes?: string;
}

const KEYS = ["target", "claim", "original", "classification", "notes"] as const;
const PATH_KEYS = new Set(["target", "original"]);

export function taskPath(cwd: string): string {
	return join(cwd, ".laurelin", "task.json");
}

export function readTask(cwd: string): Task {
	try {
		return JSON.parse(readFileSync(taskPath(cwd), "utf8")) as Task;
	} catch {
		return {};
	}
}

/**
 * Merge `patch` into the task file and return the result. A key given as ""
 * is removed. Paths are stored absolute, resolved against cwd, so a gate
 * finds them from any working directory.
 */
export function writeTask(cwd: string, patch: Task): Task {
	const task: Record<string, string> = { ...(readTask(cwd) as Record<string, string>) };
	for (const key of KEYS) {
		const value = patch[key];
		if (value === undefined) continue;
		if (value === "") {
			delete task[key];
			continue;
		}
		task[key] = PATH_KEYS.has(key) && !isAbsolute(value) ? resolve(cwd, value) : value;
	}
	const file = taskPath(cwd);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(task, null, 2)}\n`);
	return task as Task;
}

export function describeTask(cwd: string): string {
	const file = taskPath(cwd);
	if (!existsSync(file)) return `no task set (${file})`;
	const task = readTask(cwd) as Record<string, string>;
	const lines = KEYS.filter((k) => task[k]).map((k) => `${k}: ${task[k]}`);
	return lines.length ? lines.join("\n") : `task file is empty (${file})`;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "set_task",
		label: "Set task",
		description:
			"Record the current task for the checks that run at the end of an autonomous run. " +
			"Writes .laurelin/task.json in the working directory. Give the file you are producing as target, " +
			"the claim of done as claim (the evidence check reads it), and the file of Joe's own text as original " +
			"(the word-for-word check reads it). Give \"\" to clear a key. Keys you leave out are kept.",
		promptGuidelines: [
			"Call set_task with the target path as soon as you know which file the task produces, and with the claim before you say the task is done.",
		],
		parameters: Type.Object({
			target: Type.Optional(Type.String({ description: "The file or folder the task produces" })),
			claim: Type.Optional(Type.String({ description: "The claim of done, in one sentence, for the evidence check" })),
			original: Type.Optional(Type.String({ description: "A file holding Joe's own text that must stay word for word" })),
			classification: Type.Optional(StringEnum(["green", "yellow", "red"] as const, { description: "Material classification" })),
			notes: Type.Optional(Type.String({ description: "Anything a check or a person should know about this task" })),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const task = writeTask(ctx.cwd, params);
			if (params.classification) pi.events.emit("laurelin:classification", params.classification);
			return {
				content: [{ type: "text", text: `Task recorded in ${taskPath(ctx.cwd)}:\n${describeTask(ctx.cwd)}` }],
				details: task,
			};
		},
	});

	pi.registerCommand("task", {
		description: "Show the task state file (.laurelin/task.json): target, claim, original, classification, notes",
		handler: async (_args, ctx) => {
			const text = describeTask(ctx.cwd);
			if (ctx.hasUI) ctx.ui.notify(text, "info");
			else process.stderr.write(`${text}\n`);
		},
	});
}
