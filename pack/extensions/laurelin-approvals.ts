/**
 * Laurelin approval gate (plan section 6, Step 5).
 *
 * A `tool_call` handler. Every tool call whose text matches an outward-action
 * pattern (deploys, pushes, merges, email sends, posts, payments, DNS, form
 * submits) waits for Joe. With a screen, Joe sees the command and confirms.
 * Without a screen, or when the dialog times out, the call is denied.
 *
 * Every decision is one JSON line in decision-log/approvals.jsonl, in a
 * receipt shape borrowed from gstack-egress: hashed payload, hash chain, a
 * status, never the full command text.
 *
 * The approvals panel (laurelin-ui) mirrors the wait through the shared bus:
 * `laurelin:approval` { id, kind, title, preview } when Joe is asked, and
 * `laurelin:approval-decided` { id, decision, source } when it is settled.
 * If the panel answers first (the same event, from laurelin-ui), that answer
 * is used and the confirm dialog is closed through its abort signal. In
 * practice the confirm dialog takes the editor's place and the focus, so it
 * stays the decision point; the panel shows the state.
 *
 * The pure functions are exported so tests and the interface branch can call
 * them without Prime: loadPatterns, classifyCall, decideCall, listPending.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- paths ----------

const HERE = dirname(fileURLToPath(import.meta.url)); // <repo>/pack/extensions
const REPO = resolve(HERE, "..", "..");

/** decision-log folder: $LAURELIN_DECISION_LOG or <repo>/decision-log (gitignored). */
export function decisionLogDir(): string {
	return process.env.LAURELIN_DECISION_LOG || join(REPO, "decision-log");
}

export function approvalsLogPath(): string {
	return join(decisionLogDir(), "approvals.jsonl");
}

// ---------- patterns ----------

export interface OutwardPattern {
	name: string;
	regex: RegExp;
	source: string;
}

function parsePatternFile(path: string, source: string, named: boolean): OutwardPattern[] {
	const out: OutwardPattern[] = [];
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return out;
	}
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		let name = `${source}:${line.slice(0, 40)}`;
		let body = line;
		if (named) {
			const m = /^([A-Za-z0-9_.\-]+):\s*(.+)$/.exec(line);
			if (!m) continue;
			name = m[1];
			body = m[2];
		}
		try {
			out.push({ name, regex: new RegExp(body, "i"), source });
		} catch {
			// a bad regex must never disable the gate; skip the line
		}
	}
	return out;
}

/**
 * Load the outward patterns: pack/safety/outward-patterns.txt plus, when they
 * exist, gstack's careful patterns (~/.claude/skills/gstack/careful-patterns,
 * a file or a folder of files) and ~/.gstack/careful-patterns.txt.
 */
export function loadPatterns(extraFiles: string[] = []): OutwardPattern[] {
	const patterns = parsePatternFile(join(REPO, "pack", "safety", "outward-patterns.txt"), "laurelin", true);
	const gstackDir = join(homedir(), ".claude", "skills", "gstack", "careful-patterns");
	const candidates = [gstackDir, join(homedir(), ".gstack", "careful-patterns.txt"), ...extraFiles];
	for (const c of candidates) {
		if (!existsSync(c)) continue;
		if (statSync(c).isDirectory()) {
			for (const f of readdirSync(c)) patterns.push(...parsePatternFile(join(c, f), "gstack-careful", false));
		} else {
			patterns.push(...parsePatternFile(c, "gstack-careful", false));
		}
	}
	return patterns;
}

/** The text a tool call will act on: the bash command, the python code, or the whole input. */
export function callText(toolName: string, input: unknown): string {
	const inp = (input ?? {}) as Record<string, unknown>;
	if (toolName === "bash" && typeof inp.command === "string") return inp.command;
	if (toolName === "ipython" && typeof inp.code === "string") return inp.code;
	if (toolName === "edit" || toolName === "write" || toolName === "read") return "";
	let body = "";
	try {
		body = JSON.stringify(inp);
	} catch {
		body = String(inp);
	}
	return `${toolName} ${body}`;
}

export function classifyCall(text: string, patterns: OutwardPattern[]): OutwardPattern | undefined {
	if (!text) return undefined;
	return patterns.find((p) => p.regex.test(text));
}

// ---------- receipts ----------

export type ApprovalStatus = "pending" | "approved" | "denied:user" | "denied:timeout" | "denied:no-ui";

/** Receipt shape borrowed from gstack-egress (ts, type, sink, host, payload_class, bytes, sha256, consent, prev, id, status). */
export interface ApprovalReceipt {
	ts: string;
	type: "approval";
	session: string;
	sink: string; // tool name
	host: string; // pattern name that matched
	payload_class: string; // pattern source (laurelin | gstack-careful)
	bytes: number;
	sha256: string; // of the full call text
	preview: string; // first 80 chars, long tokens masked
	consent: string; // who decided: joe | none
	ui: boolean; // whether a screen was available to ask on
	prev: string; // id of the previous receipt (hash chain)
	id: string;
	status: ApprovalStatus;
}

function sha256(s: string): string {
	return createHash("sha256").update(s).digest("hex");
}

/** First 80 chars of the call text with any long token masked, so a key in a command never lands in the log. */
export function maskPreview(text: string): string {
	return text
		.replace(/\s+/g, " ")
		.replace(/[A-Za-z0-9_\-+/=]{20,}/g, (m) => `${m.slice(0, 4)}…`)
		.slice(0, 80);
}

function lastReceiptId(path: string): string {
	if (!existsSync(path)) return "";
	const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
	for (let i = lines.length - 1; i >= 0; i--) {
		try {
			const row = JSON.parse(lines[i]);
			if (row && typeof row.id === "string") return row.id;
		} catch {
			// skip a bad line
		}
	}
	return "";
}

export function writeReceipt(
	partial: Omit<ApprovalReceipt, "ts" | "type" | "prev" | "id" | "bytes" | "sha256" | "preview"> & { text: string },
	logPath = approvalsLogPath(),
): ApprovalReceipt {
	mkdirSync(dirname(logPath), { recursive: true });
	const { text, ...rest } = partial;
	const base = {
		ts: new Date().toISOString(),
		type: "approval" as const,
		...rest,
		bytes: Buffer.byteLength(text, "utf8"),
		sha256: sha256(text),
		preview: maskPreview(text),
		prev: lastReceiptId(logPath),
	};
	const id = sha256(JSON.stringify(base));
	const row: ApprovalReceipt = { ...base, id };
	appendFileSync(logPath, `${JSON.stringify(row)}\n`);
	return row;
}

export function readReceipts(logPath = approvalsLogPath()): ApprovalReceipt[] {
	if (!existsSync(logPath)) return [];
	const rows: ApprovalReceipt[] = [];
	for (const line of readFileSync(logPath, "utf8").split("\n")) {
		if (!line.trim()) continue;
		try {
			rows.push(JSON.parse(line));
		} catch {
			// skip a bad line
		}
	}
	return rows;
}

// ---------- pending items (for the interface branch) ----------

export interface PendingItem {
	id: string;
	ts: string;
	tool: string;
	pattern: string;
	preview: string;
	state: "awaiting-joe" | "denied-no-ui" | "denied-timeout";
}

const awaiting = new Map<string, PendingItem>();

/**
 * Items that need Joe: calls whose dialog is open right now, plus calls this
 * session denied for lack of a screen or by timeout (Joe may want to rerun them).
 * The interface branch calls this to fill its approvals panel.
 */
export function listPending(session?: string, logPath = approvalsLogPath()): PendingItem[] {
	const items = [...awaiting.values()];
	for (const r of readReceipts(logPath)) {
		if (session && r.session !== session) continue;
		if (r.status === "denied:no-ui" || r.status === "denied:timeout") {
			items.push({
				id: r.id,
				ts: r.ts,
				tool: r.sink,
				pattern: r.host,
				preview: r.preview,
				state: r.status === "denied:no-ui" ? "denied-no-ui" : "denied-timeout",
			});
		}
	}
	return items;
}

// ---------- the decision ----------

/** The shared bus (pi.events): only emit and on are needed. */
export interface ApprovalBus {
	emit(channel: string, data: unknown): void;
	on(channel: string, handler: (data: unknown) => void): () => void;
}

export interface DecideOptions {
	hasUI: boolean;
	/** The shared bus, so the approvals panel can mirror and answer the wait. */
	bus?: ApprovalBus;
	/** Ask Joe. Resolves true on approve, false on deny; must honour `signal` for the timeout. */
	confirm?: (title: string, message: string, opts: { signal: AbortSignal }) => Promise<boolean>;
	timeoutMs?: number;
	session?: string;
	logPath?: string;
	patterns?: OutwardPattern[];
}

export interface Decision {
	block: boolean;
	reason?: string;
	receipt?: ApprovalReceipt;
	pattern?: OutwardPattern;
}

/** A confirm answered "no" faster than this was never shown to a person. */
export const NOOP_CONFIRM_MS = 50;

export function approvalTimeoutMs(): number {
	const n = Number(process.env.LAURELIN_APPROVAL_TIMEOUT_MS);
	return Number.isFinite(n) && n > 0 ? n : 120_000;
}

/** Decide one tool call. Pure apart from the log write and the confirm callback. */
export async function decideCall(toolName: string, input: unknown, opts: DecideOptions): Promise<Decision> {
	const text = callText(toolName, input);
	const pattern = classifyCall(text, opts.patterns ?? loadPatterns());
	if (!pattern) return { block: false };

	const session = opts.session ?? "unknown";
	const logPath = opts.logPath ?? approvalsLogPath();
	const common = { session, sink: toolName, host: pattern.name, payload_class: pattern.source, ui: !!opts.hasUI, text };

	if (!opts.hasUI || !opts.confirm) {
		const receipt = writeReceipt({ ...common, consent: "none", status: "denied:no-ui" }, logPath);
		return {
			block: true,
			reason: `Laurelin gate: "${pattern.name}" is an outward action and waits for Joe. No screen to ask on, so it is denied. Receipt ${receipt.id.slice(0, 12)}.`,
			receipt,
			pattern,
		};
	}

	const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	awaiting.set(key, { id: key, ts: new Date().toISOString(), tool: toolName, pattern: pattern.name, preview: maskPreview(text), state: "awaiting-joe" });
	opts.bus?.emit("laurelin:approval", {
		id: key,
		kind: pattern.name,
		title: `${toolName}: ${pattern.name}`,
		preview: text.slice(0, 2000),
	});
	// The panel may answer first: laurelin-ui emits approval-decided with our id.
	let panel: "approve" | "reject" | undefined;
	let settlePanel: (ok: boolean) => void = () => {};
	const fromPanel = new Promise<boolean>((r) => (settlePanel = r));
	const offPanel = opts.bus?.on("laurelin:approval-decided", (data) => {
		const d = data as { id?: string; decision?: "approve" | "reject" };
		if (d?.id !== key || panel) return;
		panel = d.decision === "approve" ? "approve" : "reject";
		settlePanel(panel === "approve");
	});
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? approvalTimeoutMs());
	const asked = Date.now();
	let ok = false;
	try {
		ok = await Promise.race([
			opts.confirm(
				`Outward action: ${pattern.name}`,
				`${toolName} wants to run:\n\n${text.slice(0, 2000)}\n\nApprove?`,
				{ signal: controller.signal },
			),
			fromPanel,
		]);
		if (panel) controller.abort(); // the panel answered: close the dialog
	} catch {
		ok = false;
	} finally {
		clearTimeout(timer);
		offPanel?.();
		awaiting.delete(key);
	}
	const timedOut = controller.signal.aborted && !panel;
	// Prime's JSON and print modes report hasUI=true but their confirm() is a
	// no-op that returns false at once (measured 0 ms). Nobody was asked, so
	// an instant "no" is recorded as no-ui, not as Joe's decision.
	const nobodyAsked = !ok && !timedOut && !panel && Date.now() - asked < NOOP_CONFIRM_MS;
	const status: ApprovalStatus = ok ? "approved" : timedOut ? "denied:timeout" : nobodyAsked ? "denied:no-ui" : "denied:user";
	const receipt = writeReceipt({ ...common, ui: !nobodyAsked, consent: ok ? "joe" : "none", status }, logPath);
	opts.bus?.emit("laurelin:approval-decided", {
		id: key,
		decision: ok ? "approve" : "reject",
		source: panel ? "panel" : timedOut ? "timeout" : nobodyAsked ? "no-ui" : "dialog",
	});
	if (ok) return { block: false, receipt, pattern };
	return {
		block: true,
		reason: timedOut
			? `Laurelin gate: "${pattern.name}" waited for Joe and timed out, so it is denied.`
			: nobodyAsked
				? `Laurelin gate: "${pattern.name}" is an outward action and waits for Joe. No screen to ask on, so it is denied. Receipt ${receipt.id.slice(0, 12)}.`
				: `Laurelin gate: Joe denied "${pattern.name}".`,
		receipt,
		pattern,
	};
}

// ---------- Prime extension ----------

function sessionId(ctx: ExtensionContext): string {
	try {
		return ctx.sessionManager.getSessionFile?.() ?? "ephemeral";
	} catch {
		return "ephemeral";
	}
}

export default function (pi: ExtensionAPI) {
	let patterns = loadPatterns();

	pi.on("session_start", async () => {
		patterns = loadPatterns();
	});

	pi.on("tool_call", async (event, ctx) => {
		const decision = await decideCall(event.toolName, event.input, {
			hasUI: ctx.hasUI,
			confirm: ctx.hasUI ? (t, m, o) => ctx.ui.confirm(t, m, o) : undefined,
			bus: pi.events,
			session: sessionId(ctx),
			patterns,
		});
		if (decision.receipt && ctx.hasUI) {
			ctx.ui.notify(`${decision.block ? "Denied" : "Approved"}: ${decision.pattern?.name} (${event.toolName})`, decision.block ? "warning" : "info");
		}
		if (decision.block) return { block: true, reason: decision.reason };
		return undefined;
	});

	pi.registerCommand("approvals-log", {
		description: "List outward actions waiting on Joe this session (log view; /approvals is the panel)",
		handler: async (_args, ctx) => {
			const items = listPending(sessionId(ctx));
			const text = items.length
				? items.map((i) => `${i.state}  ${i.tool}  ${i.pattern}  ${i.preview}`).join("\n")
				: "No outward actions waiting.";
			if (ctx.hasUI) ctx.ui.notify(text, "info");
			else process.stderr.write(`${text}\n`);
		},
	});
}
