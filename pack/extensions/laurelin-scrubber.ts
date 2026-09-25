/**
 * Laurelin secret scrubber (plan section 7, Step 5).
 *
 * An `input` handler. Every paste Joe makes goes through gstack-redact before
 * the model sees it. When it finds a secret (HIGH or MEDIUM), the paste is
 * rewritten with <REDACTED:kind> in place of the secret, Joe is told in one
 * line, and the kind (never the value) is appended to
 * decision-log/scrubber.jsonl.
 *
 * `scrub` is exported so tests can run it without Prime.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

export function decisionLogDir(): string {
	return process.env.LAURELIN_DECISION_LOG || join(REPO, "decision-log");
}

export function scrubberLogPath(): string {
	return join(decisionLogDir(), "scrubber.jsonl");
}

export const REDACT_BIN = process.env.GSTACK_REDACT_BIN || join(homedir(), ".claude", "skills", "gstack", "bin", "gstack-redact");
export const SPANS_HELPER = join(REPO, "pack", "safety", "redact-spans.ts");

export interface Kind {
	id: string;
	tier: string;
	category: string;
	description: string;
}

export interface ScrubResult {
	/** Text to hand on. Equals the input when nothing was found. */
	text: string;
	changed: boolean;
	/** Kinds found (id, tier, category, description). Never a value or a preview. */
	kinds: Kind[];
	/** Set when the scanner could not run; the text passes through unchanged. */
	scannerError?: string;
	/** Set when the whole paste was replaced because spans could not be spliced safely. */
	droppedWholePaste?: boolean;
}

export function scrubberAvailable(): boolean {
	return existsSync(REDACT_BIN);
}

/** Run gstack-redact on the text. Never writes the text to disk. */
export function scrub(text: string): ScrubResult {
	if (!text) return { text, changed: false, kinds: [] };
	const scan = spawnSync(REDACT_BIN, ["--json", "--repo-visibility", "private"], {
		input: text,
		encoding: "utf8",
		timeout: 20_000,
	});
	if (scan.error || scan.status === null || scan.status === 1) {
		const why = scan.error?.message || scan.stderr?.trim() || `exit ${scan.status}`;
		return { text, changed: false, kinds: [], scannerError: why };
	}
	let findings: Array<Record<string, string>> = [];
	try {
		findings = JSON.parse(scan.stdout).findings ?? [];
	} catch {
		return { text, changed: false, kinds: [], scannerError: "unreadable scanner output" };
	}
	// exit 0 = nothing of weight (LOW/WARN only). exit 2 = MEDIUM. exit 3 = HIGH.
	if (scan.status === 0) return { text, changed: false, kinds: [] };

	const kinds: Kind[] = findings.map((f) => ({ id: f.id, tier: f.tier, category: f.category, description: f.description }));
	const ids = [...new Set(kinds.map((k) => k.id))];

	const splice = spawnSync("bun", [SPANS_HELPER], { input: text, encoding: "utf8", timeout: 20_000 });
	if (!splice.error && splice.status === 0 && typeof splice.stdout === "string" && !containsAnyPreviewedSecret(splice.stdout, text, findings)) {
		return { text: splice.stdout, changed: true, kinds };
	}
	// Fail closed: replace the whole paste.
	return { text: `<REDACTED:${ids.join("+")}>`, changed: true, kinds, droppedWholePaste: true };
}

/**
 * Belt and braces: the redacted body must not still contain the original
 * secret. We only know each finding's line and column, so check that the
 * original text at that position no longer appears in the body.
 */
function containsAnyPreviewedSecret(body: string, original: string, findings: Array<Record<string, unknown>>): boolean {
	const lines = original.split("\n");
	for (const f of findings) {
		const line = lines[Number(f.line) - 1];
		if (!line) continue;
		const tail = line.slice(Number(f.col) - 1);
		const token = /^\S{8,}/.exec(tail)?.[0];
		if (token && body.includes(token)) return true;
	}
	return false;
}

export function logScrub(result: ScrubResult, session: string, logPath = scrubberLogPath()): void {
	mkdirSync(dirname(logPath), { recursive: true });
	const row = {
		ts: new Date().toISOString(),
		type: "scrub",
		session,
		kinds: result.kinds.map((k) => ({ id: k.id, tier: k.tier, category: k.category })),
		count: result.kinds.length,
		replaced: result.changed,
		dropped_whole_paste: result.droppedWholePaste ?? false,
		scanner_error: result.scannerError ?? null,
	};
	appendFileSync(logPath, `${JSON.stringify(row)}\n`);
}

export function oneLine(result: ScrubResult): string {
	const names = [...new Set(result.kinds.map((k) => k.id))].join(", ");
	if (result.droppedWholePaste) return `Scrubber: the whole paste was replaced (${names}); the secret could not be cut out safely.`;
	return `Scrubber: ${result.kinds.length} secret${result.kinds.length === 1 ? "" : "s"} replaced with <REDACTED:...> (${names}). Add it with: laurelin keys add NAME`;
}

function sessionId(ctx: ExtensionContext): string {
	try {
		return ctx.sessionManager.getSessionFile?.() ?? "ephemeral";
	} catch {
		return "ephemeral";
	}
}

export default function (pi: ExtensionAPI) {
	let warnedUnavailable = false;

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };
		if (!scrubberAvailable()) {
			if (!warnedUnavailable && ctx.hasUI) {
				ctx.ui.notify("Scrubber: gstack-redact not found; pastes are not scanned.", "warning");
				warnedUnavailable = true;
			}
			return { action: "continue" };
		}
		const result = scrub(event.text);
		if (result.scannerError) {
			logScrub(result, sessionId(ctx));
			if (ctx.hasUI) ctx.ui.notify(`Scrubber could not scan this paste (${result.scannerError}).`, "warning");
			return { action: "continue" };
		}
		if (!result.changed) return { action: "continue" };
		logScrub(result, sessionId(ctx));
		if (ctx.hasUI) ctx.ui.notify(oneLine(result), "warning");
		else process.stderr.write(`${oneLine(result)}\n`);
		return { action: "transform", text: result.text };
	});
}
