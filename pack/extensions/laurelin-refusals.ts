/**
 * Laurelin refusal flags (plan section 7, Step 5).
 *
 * A `before_agent_start` hook. Each new prompt is classified by Jev against
 * pack/safety/refusals.md through refusal-check.sh. When a category other
 * than none comes back, Joe is warned and the model gets one line telling it
 * to stop and ask Joe. It warns; it does not block. Every answer is one line
 * in decision-log/refusals.jsonl.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");
const CHECK = join(REPO, "pack", "safety", "refusal-check.sh");

export function refusalsLogPath(): string {
	return join(process.env.LAURELIN_DECISION_LOG || join(REPO, "decision-log"), "refusals.jsonl");
}

/** Prompts too short to be a task, and slash commands, are not checked. */
export function worthChecking(prompt: string): boolean {
	const p = prompt.trim();
	if (!p || p.startsWith("/")) return false;
	return p.split(/\s+/).length >= 3;
}

export default function (pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		if (!worthChecking(event.prompt)) return undefined;
		let category = "unknown";
		let detail = "";
		try {
			const r = await pi.exec(CHECK, [event.prompt.slice(0, 4000)], { timeout: 45_000 });
			category = (r.stdout || "").trim().split("\n").pop() || "unknown";
			detail = (r.stderr || "").trim().split("\n").pop() || "";
		} catch (e) {
			detail = String(e);
		}
		const row = { ts: new Date().toISOString(), type: "refusal-check", category, detail, prompt_chars: event.prompt.length };
		try {
			mkdirSync(dirname(refusalsLogPath()), { recursive: true });
			appendFileSync(refusalsLogPath(), `${JSON.stringify(row)}\n`);
		} catch {
			// the log must never stop a prompt
		}
		if (category === "none") return undefined;
		if (category === "unknown") {
			if (ctx.hasUI) ctx.ui.notify("Refusal check could not run (Jev unavailable). Proceeding.", "warning");
			return undefined;
		}
		const name = category.replace(/^review:/, "");
		const unsure = category.startsWith("review:");
		if (name === "none") return undefined; // a low-confidence "none" is still none
		const line = unsure
			? `Refusal check: this may be "${name}" (low confidence). Joe decides.`
			: `Refusal check: this task looks like "${name}" (plan section 7). Stop and ask Joe before doing it.`;
		if (ctx.hasUI) ctx.ui.notify(line, "warning");
		else process.stderr.write(`${line}\n`);
		return {
			message: { customType: "laurelin-refusal", content: `[Laurelin safety] ${line} Ask Joe to confirm before acting on this request.`, display: true },
		};
	});
}
