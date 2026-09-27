/**
 * Laurelin connectors: the claude.ai connectors (Gmail, Google Calendar, Google Drive, Superhuman Mail,
 * Figma, DocuSign, Claude Docs, and any added later) reached through Claude Code, which holds their sign-ins.
 *
 * The harness picks the connector, the tool and the arguments. Claude Code makes exactly that one call
 * (`claude -p`, only that tool allowed, hooks off) and returns the raw result. Outward tools (send, reply,
 * forward, share, sign, deploy, buy, delete, trash) ask Joe first.
 *
 * Tools: connector_list, connector_call. Command: /connectors [refresh].
 * Catalogue cache: <agent dir>/connectors.json.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_DIR = process.env.LAURELIN_CODING_AGENT_DIR || join(homedir(), ".laurelin", "agent");
const CACHE = join(AGENT_DIR, "connectors.json");
const NO_HOOKS = join(AGENT_DIR, "claude-nohooks.json");
const CLAUDE = process.env.LAURELIN_CLAUDE_BIN || "claude";

/** Tool names that act outside the machine or destroy data. Matched against the tool name only. */
export const OUTWARD =
	/(^|_)(send|reply|forward|share|invite|publish|sign|buy|purchase|pay|delete|trash|discard|remove|spam|unsubscribe|undo_send|create_event|create_or_update_event|respond_to_event|update_event|create_deployment|promote|rollback|request_promote|request_rollback|transfer|envelope|reminder|create_project|pause|unpause|revoke|put_firewall|update_firewall)(_|$)/i;

/** Read-only tool name prefixes; never asked about even when a verb above appears later in the name. */
export const READ_ONLY = /^(get|list|search|query|read|count|aggregate|filter|status|suggest)(_|$)/i;
export const isOutward = (tool: string) => !READ_ONLY.test(tool) && OUTWARD.test(tool);

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

function claude(prompt: string, allowed?: string, timeoutMs = 180_000): Promise<string> {
	mkdirSync(AGENT_DIR, { recursive: true });
	if (!existsSync(NO_HOOKS)) writeFileSync(NO_HOOKS, JSON.stringify({ disableAllHooks: true }));
	const args = ["-p", "--settings", NO_HOOKS, "--output-format", "json"];
	if (allowed) args.push("--allowedTools", allowed);
	return new Promise((resolve, reject) => {
		const child = spawn(CLAUDE, args, { stdio: ["pipe", "pipe", "pipe"], env: process.env });
		let out = "";
		let err = "";
		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			reject(new Error("Claude Code did not answer in time"));
		}, timeoutMs);
		child.stdout.on("data", (d) => (out += d));
		child.stderr.on("data", (d) => (err += d));
		child.on("error", (e) => {
			clearTimeout(timer);
			reject(new Error(`Claude Code is not runnable: ${e.message}`));
		});
		child.on("close", () => {
			clearTimeout(timer);
			try {
				const parsed = JSON.parse(out);
				const res = Array.isArray(parsed) ? parsed.filter((e: any) => e?.type === "result").pop() : parsed;
				if (!res) return reject(new Error("no result from Claude Code"));
				if (res.is_error) return reject(new Error(String(res.result ?? "Claude Code reported an error")));
				resolve(String(res.result ?? ""));
			} catch {
				reject(new Error((err || out).trim().slice(0, 400) || "unreadable answer from Claude Code"));
			}
		});
		child.stdin.end(prompt);
	});
}

type Catalogue = { refreshed: string; connectors: Record<string, string[]> };

function loadCatalogue(): Catalogue | null {
	try {
		return JSON.parse(readFileSync(CACHE, "utf8"));
	} catch {
		return null;
	}
}

/** Exact list: Claude Code's startup event names every tool it can call. Stop it as soon as that event arrives. */
function refreshCatalogue(timeoutMs = 90_000): Promise<Catalogue> {
	mkdirSync(AGENT_DIR, { recursive: true });
	if (!existsSync(NO_HOOKS)) writeFileSync(NO_HOOKS, JSON.stringify({ disableAllHooks: true }));
	return new Promise((resolve, reject) => {
		const child = spawn(CLAUDE, ["-p", "--settings", NO_HOOKS, "--output-format", "stream-json", "--verbose", "--max-turns", "1"], {
			stdio: ["pipe", "pipe", "ignore"],
			env: process.env,
		});
		let buf = "";
		let done = false;
		const finish = (err: Error | null, cat?: Catalogue) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			child.kill("SIGTERM");
			err ? reject(err) : resolve(cat!);
		};
		const timer = setTimeout(() => finish(new Error("Claude Code did not start in time")), timeoutMs);
		child.on("error", (e) => finish(new Error(`Claude Code is not runnable: ${e.message}`)));
		child.on("close", () => finish(new Error("Claude Code ended without listing its tools")));
		child.stdout.on("data", (d) => {
			buf += d;
			let nl: number;
			while ((nl = buf.indexOf("\n")) >= 0) {
				const line = buf.slice(0, nl);
				buf = buf.slice(nl + 1);
				let e: any;
				try {
					e = JSON.parse(line);
				} catch {
					continue;
				}
				if (e?.subtype !== "init" || !Array.isArray(e.tools)) continue;
				const connectors: Record<string, string[]> = {};
				for (const t of e.tools as string[]) {
					const m = /^mcp__claude_ai_([^_].*?)__(.+)$/.exec(t);
					if (m) (connectors[m[1]] ??= []).push(m[2]);
				}
				const cat = { refreshed: new Date().toISOString(), connectors };
				writeFileSync(CACHE, JSON.stringify(cat, null, 2));
				return finish(null, cat);
			}
		});
		child.stdin.end("ok");
	});
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "connector_list",
		label: "List connectors",
		description:
			"The claude.ai connectors reachable through Claude Code (Gmail, Google Calendar, Google Drive, Superhuman Mail, " +
			"Figma, DocuSign, Claude Docs, ...) and their tool names. Call it before connector_call when unsure of a name.",
		parameters: Type.Object({ refresh: Type.Optional(Type.Boolean({ description: "Ask Claude Code again instead of using the cache" })) }),
		async execute(_id, p) {
			const cat = (!p.refresh && loadCatalogue()) || (await refreshCatalogue());
			const lines = Object.entries(cat.connectors).map(([c, tools]) => `${c} (${tools.length}): ${tools.join(", ")}`);
			return text(`Connectors (catalogue from ${cat.refreshed.slice(0, 16)}):\n${lines.join("\n")}`);
		},
	});

	pi.registerTool({
		name: "connector_call",
		label: "Call a connector",
		description:
			"Call one tool of a claude.ai connector through Claude Code and return its raw result. connector is the name from " +
			"connector_list (for example Gmail, Google_Calendar, Google_Drive, Superhuman_Mail), tool is the tool name " +
			"(for example search_threads), arguments is the JSON object the tool takes. Sending, sharing, signing, deploying, " +
			"buying and deleting ask Joe first.",
		parameters: Type.Object({
			connector: Type.String(),
			tool: Type.String(),
			arguments: Type.Optional(Type.Record(Type.String(), Type.Any())),
		}),
		async execute(_id, p, _signal, _update, ctx) {
			if (!/^[A-Za-z0-9_]+$/.test(p.connector) || !/^[A-Za-z0-9_.-]+$/.test(p.tool)) throw new Error("connector and tool must be plain names");
			const full = `mcp__claude_ai_${p.connector}__${p.tool}`;
			const args = JSON.stringify(p.arguments ?? {});
			if (isOutward(p.tool)) {
				const ok = ctx.hasUI && typeof ctx.ui.confirm === "function" && (await ctx.ui.confirm(`${p.connector}: ${p.tool}?`, args.slice(0, 600)));
				if (!ok) return text(`Not done: Joe did not approve ${p.connector} ${p.tool}.`);
			}
			const out = await claude(
				`Call the tool ${full} exactly once with these arguments: ${args}\nThen output only the tool's raw result text, ` +
					"unchanged, nothing else. If the tool is not available or the call fails, output only the exact error message.",
				full,
			);
			return text(out);
		},
	});

	pi.registerCommand("connectors", {
		description: "The claude.ai connectors reachable through Claude Code; `/connectors refresh` asks again",
		handler: async (args, ctx) => {
			try {
				const cat = (args?.trim() !== "refresh" && loadCatalogue()) || (await refreshCatalogue());
				ctx.ui.notify(
					Object.entries(cat.connectors)
						.map(([c, tools]) => `${c.padEnd(18)} ${tools.length} tools`)
						.join("\n"),
					"info",
				);
			} catch (e) {
				ctx.ui.notify(`connectors: ${(e as Error).message}`, "error");
			}
		},
	});
}
