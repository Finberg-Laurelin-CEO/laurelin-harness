/**
 * Laurelin learning loop (PLAN.md Step 10, section 18 group 7, section 22).
 *
 * When Joe corrects the agent, the correction becomes a rule and a check:
 *
 *   Detect   After each prompt (agent_end), find the last message from Joe and
 *            the assistant output before it. The router already labeled the
 *            message (a `laurelin_decision` entry in the session); when the
 *            router is off, one Jev call asks the same intent question. A
 *            `correction` is appended to decision-log/corrections.jsonl.
 *   Draft    Jev says which kind of rule it is (Choice over nine kinds) and
 *            whether it carries private content (Noul). The coordinator model
 *            drafts ONE rule sentence and, when it can, the exact check. Code
 *            routes the change: a jev-sweep style pattern for the prose gate
 *            (pack/rules/prose-patterns.txt), a line in pack/rules/laurelin.md,
 *            a criterion sentence in a Jev question file (pack/skills/*\/fit.json),
 *            or, for private rules, a line in decision-log/proposed-rules.jsonl
 *            that Joe pastes into the vault note. The loop never writes to the vault.
 *   Approve  /learn shows each pending proposal: a apply, r reject, e edit.
 *            Nothing applies without Joe.
 *   Rerun    Apply writes the change, runs the tests (tests/run-all.sh and the
 *            test set), and compares with the last known results. A test that
 *            passed before and fails now reverts the change and marks the rule
 *            `reverted`. A clean run records the rule in Prime's refine store
 *            through /refine and session_before_refine (rollback for free) and
 *            in gstack's learnings store when it is installed.
 *
 * State is on disk (section 21 rule 9): decision-log/corrections.jsonl,
 * learn-proposals.jsonl (append-only events, the last event per id wins),
 * proposed-rules.jsonl, learn-baseline.json, learn-backups/<id>/.
 *
 * Settings: LAURELIN_LEARN=off, LAURELIN_LEARN_THRESHOLD (0.6),
 * LAURELIN_DECISION_LOG, LAURELIN_PROSE_PATTERNS, LAURELIN_RULES_FILE,
 * LAURELIN_LEARN_RERUN (the shell command; "off" skips the rerun),
 * LAURELIN_LEARN_RERUN_TIMEOUT (seconds), LAURELIN_LEARN_STORE (global|local),
 * JEV_BIN, GSTACK_LEARNINGS_LOG_BIN.
 */

import { complete, type UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, RefinementProposal } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { INTENT_CRITERIA, askJev } from "./laurelin-router.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK = resolve(HERE, "..");
const REPO = resolve(PACK, "..");
const MARKER = "laurelin-learn:";
const DEFAULT_THRESHOLD = 0.6;
const CORRECTION_CHARS = 2000;
const CORRECTED_CHARS = 1500;
const MESSAGE_CHARS = 4000; // the router hashes the first 4000 characters
const LEARNED_SECTION = "## 13. Learned rules";
const NOOP_SELECT_MS = 50;
const DEFAULT_RERUN = "tests/run-all.sh && tests/testset/run.sh";
const DEFAULT_RERUN_TIMEOUT_S = 45 * 60;

// ---------------------------------------------------------------- kinds

export const KINDS = ["prose_style", "number", "layout", "location", "verbatim", "evidence", "process", "scope", "other"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_CRITERIA: Record<Kind, unknown> = {
	prose_style: { what: "How the text is written: word choice, tone, sentence shape, banned words, slop, metaphor, hedging, headings", examples: ["no slop, say 'we use'", "shorter sentences", "drop the em dashes"] },
	number: { what: "A figure, unit, date or count was wrong, unsourced, or not the canonical one", examples: ["the yield is 42 units/yr, not 80", "use the number from the newest engineering doc"] },
	layout: { what: "How a page, slide or PDF looks: overlap, overflow, white space, order of blocks, fonts", examples: ["the title runs over the image on page 7", "put the table before the chart"] },
	location: { what: "Where a file was written or read: wrong folder, wrong vault path, wrong file name", examples: ["that goes in Laurelin/investors, not the root", "you read the old deck"] },
	verbatim: { what: "The agent changed text that had to stay word for word: Joe's own words, a quote, a technical name", examples: ["you changed my prose, put it back", "keep the quote exactly"] },
	evidence: { what: "The agent claimed something was done, checked or true without proof, or the proof did not support the claim", examples: ["you said the tests passed, they did not run", "show me the ledger row"] },
	process: { what: "The order of work or a step that was skipped: ask first, run the check, read the note, wait for approval", examples: ["run the gates before you say done", "ask before you send", "read the playbook first"] },
	scope: { what: "The agent did too much, too little, or the wrong task", examples: ["I asked for the intro only", "you were not asked to rename files"] },
	other: { what: "A correction that fits none of the other kinds", examples: ["no", "that is not what I meant"] },
};

// ---------------------------------------------------------------- types

export interface Correction {
	id: string;
	ts: string;
	type: "correction";
	correction: string;
	corrected: string;
	task?: unknown;
	source: "router" | "jev";
	intent_confidence: number;
	prompt_sha256: string;
}

export type Change =
	| { type: "pattern"; file: string; name: string; pattern: string }
	| { type: "rule_line"; file: string; line: string }
	| { type: "vault_line"; file: string; line: string }
	| { type: "criterion"; file: string; path: string; sentence: string }
	| { type: "none"; why: string };

export interface Draft {
	rule: string;
	pattern?: string | null;
	good_example?: string | null;
	criterion?: { file: string; path: string; sentence: string } | null;
}

export type Status = "pending" | "applied" | "rejected" | "reverted";

export interface Proposal {
	id: string;
	ts: string;
	correction_id: string;
	kind: Kind;
	kind_confidence: number;
	private: boolean;
	private_confidence: number;
	rule: string;
	change: Change;
	correction: string;
	corrected: string;
	status: Status;
	note?: string;
	applied_ts?: string;
	rerun?: RerunResult;
	refinement_id?: string;
	gstack?: boolean;
	reverted_why?: string;
	edited?: boolean;
}

export interface Paths {
	dir: string;
	corrections: string;
	proposals: string;
	proposedRules: string;
	baseline: string;
	backups: string;
	patterns: string;
	rules: string;
	rerun: string;
	rerunTimeoutS: number;
	cwd: string;
}

export function learnPaths(env: NodeJS.ProcessEnv = process.env): Paths {
	const dir = env.LAURELIN_DECISION_LOG || join(REPO, "decision-log");
	return {
		dir,
		corrections: join(dir, "corrections.jsonl"),
		proposals: join(dir, "learn-proposals.jsonl"),
		proposedRules: join(dir, "proposed-rules.jsonl"),
		baseline: join(dir, "learn-baseline.json"),
		backups: join(dir, "learn-backups"),
		patterns: env.LAURELIN_PROSE_PATTERNS || join(PACK, "rules", "prose-patterns.txt"),
		rules: env.LAURELIN_RULES_FILE || join(PACK, "rules", "laurelin.md"),
		rerun: env.LAURELIN_LEARN_RERUN || DEFAULT_RERUN,
		rerunTimeoutS: Number(env.LAURELIN_LEARN_RERUN_TIMEOUT || DEFAULT_RERUN_TIMEOUT_S),
		cwd: REPO,
	};
}

export function threshold(env: NodeJS.ProcessEnv = process.env): number {
	const t = Number(env.LAURELIN_LEARN_THRESHOLD);
	return Number.isFinite(t) && t > 0 ? t : DEFAULT_THRESHOLD;
}

const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const newId = (seed: string) => createHash("sha256").update(`${Date.now()}:${Math.random()}:${seed}`).digest("hex").slice(0, 12);

function appendJsonl(file: string, row: unknown): void {
	mkdirSync(dirname(file), { recursive: true });
	appendFileSync(file, `${JSON.stringify(row)}\n`);
}

function readJsonl<T>(file: string): T[] {
	try {
		return readFileSync(file, "utf8")
			.split("\n")
			.filter((l) => l.trim())
			.map((l) => JSON.parse(l) as T);
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------- detect

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((c) => c && typeof c === "object" && c.type === "text" && typeof c.text === "string")
		.map((c) => c.text)
		.join("\n");
}

export interface Pair {
	correction: string;
	corrected: string;
	prompt_sha256: string;
	/** The router's decision for this message, when it left one in the session. */
	decision?: { intent: string; confidence: number; abstained: boolean };
}

/**
 * From a session branch, the last message from Joe and the assistant output it
 * answers, plus the router's label for it when there is one. Null when the
 * last message is a slash command or nothing came before it.
 */
export function findCorrectionPair(branch: any[]): Pair | null {
	let userIdx = -1;
	for (let i = branch.length - 1; i >= 0; i--) {
		const e = branch[i];
		if (e?.type === "message" && e.message?.role === "user") {
			userIdx = i;
			break;
		}
	}
	if (userIdx < 0) return null;
	const correction = textOf(branch[userIdx].message.content).trim();
	if (!correction || correction.startsWith("/")) return null;
	let assistantIdx = -1;
	for (let i = userIdx - 1; i >= 0; i--) {
		const e = branch[i];
		if (e?.type === "message" && e.message?.role === "assistant") {
			const t = textOf(e.message.content).trim();
			if (t) {
				assistantIdx = i;
				break;
			}
		}
	}
	if (assistantIdx < 0) return null;
	const corrected = textOf(branch[assistantIdx].message.content).trim();
	const prompt_sha256 = sha16(correction.slice(0, MESSAGE_CHARS));
	const pair: Pair = { correction: correction.slice(0, CORRECTION_CHARS), corrected: corrected.slice(-CORRECTED_CHARS), prompt_sha256 };
	// The router appends its decision during before_agent_start, which can land
	// just before or just after the user message entry. Look from the corrected
	// assistant message onward and match on the prompt hash.
	for (let i = branch.length - 1; i > assistantIdx; i--) {
		const e = branch[i];
		if (e?.type === "custom" && e.customType === "laurelin_decision" && e.data?.prompt_sha256 === prompt_sha256) {
			const a = e.data.answers?.intent;
			if (a) pair.decision = { intent: a.choice, confidence: Number(a.confidence ?? 0), abstained: Boolean(a.abstained) };
			break;
		}
	}
	return pair;
}

export interface IntentVerdict {
	intent: string;
	confidence: number;
	source: "router" | "jev";
	error?: string;
}

/** The router's label when present, else one Jev call with the router's own intent question. */
export async function intentOf(pair: Pair, t = threshold()): Promise<IntentVerdict> {
	if (pair.decision) {
		const d = pair.decision;
		return { intent: d.abstained || d.confidence < t ? "unsure" : d.intent, confidence: d.confidence, source: "router" };
	}
	try {
		const raw = await askJev(
			{ message: pair.correction, last_assistant: pair.corrected },
			{
				intent: {
					type: "choice",
					instructions: { question: "What kind of message is `message`, given what the agent said just before in `last_assistant`?", inspect: "message" },
					criteria: INTENT_CRITERIA,
				},
			},
		);
		const a = raw.intent;
		const confidence = Math.round(Number(a?.confidence ?? 0) * 1000) / 1000;
		const choice = typeof a?.choice === "string" && a.choice in INTENT_CRITERIA ? a.choice : "unsure";
		return { intent: confidence < t ? "unsure" : choice, confidence, source: "jev" };
	} catch (e) {
		return { intent: "unsure", confidence: 0, source: "jev", error: String((e as Error).message ?? e) };
	}
}

export function recordCorrection(pair: Pair, verdict: IntentVerdict, task: unknown, paths: Paths): Correction {
	const c: Correction = {
		id: newId(pair.correction),
		ts: new Date().toISOString(),
		type: "correction",
		correction: pair.correction,
		corrected: pair.corrected,
		source: verdict.source,
		intent_confidence: verdict.confidence,
		prompt_sha256: pair.prompt_sha256,
	};
	if (task !== undefined) c.task = task;
	appendJsonl(paths.corrections, c);
	return c;
}

// ---------------------------------------------------------------- classify (Jev)

export interface KindVerdict {
	kind: Kind;
	kind_confidence: number;
	private: boolean;
	private_confidence: number;
	error?: string;
}

/** One Jev call, two questions: which kind of rule, and does it carry private content. */
export async function classifyKind(c: Pick<Correction, "correction" | "corrected">, t = threshold()): Promise<KindVerdict> {
	try {
		// askJev types its state as the router's shape; this call carries its own two keys.
		const raw = await askJev(
			{ correction: c.correction, corrected: c.corrected } as any,
			{
				kind: {
					type: "choice",
					instructions: {
						question: "Joe wrote `correction` about the agent output in `corrected`. Which kind of rule would stop the same mistake next time?",
						inspect: "correction",
						note: "Judge the correction, not the output. The output is evidence of what went wrong.",
					},
					criteria: KIND_CRITERIA,
				},
				private: {
					type: "noul",
					instructions: {
						question: "Would a rule written from `correction` have to name private Laurelin content to make sense?",
						inspect: "correction",
						focus: "Private content: an investor, contact or person by name, an internal or canonical number, a vault note's contents, a classification or cryptonym, export-controlled technical detail. A rule about wording, order of work, file layout or checking is not private.",
					},
					criteria: {
						true: { what: "The rule must carry a name, number or fact that stays in the vault", examples: ["the yield figure is the one in the design basis, 42 units/yr", "never email this investor directly"] },
						false: { what: "The rule is generic: how to write, check, place or order work", examples: ["no slop, say 'we use'", "run the gates before you say done"] },
					},
				},
			},
		);
		const k = raw.kind;
		const kc = Math.round(Number(k?.confidence ?? 0) * 1000) / 1000;
		const kind: Kind = typeof k?.choice === "string" && (KINDS as readonly string[]).includes(k.choice) && kc >= t ? (k.choice as Kind) : "other";
		const p = raw.private;
		const noul = typeof p?.noul === "number" ? p.noul : 0;
		const pc = Math.round(Math.abs(noul - 0.5) * 2 * 1000) / 1000;
		// Under the threshold the safe answer is private: the line goes to the proposal file, not the open repo.
		const priv = pc < t ? true : noul >= 0.5;
		return { kind, kind_confidence: kc, private: priv, private_confidence: pc };
	} catch (e) {
		return { kind: "other", kind_confidence: 0, private: true, private_confidence: 0, error: String((e as Error).message ?? e) };
	}
}

// ---------------------------------------------------------------- draft (the model)

/** String-valued paths in the Jev question files a criterion sentence may be appended to. */
export function listCriterionPaths(pack = PACK, cap = 40): { file: string; paths: string[] }[] {
	const out: { file: string; paths: string[] }[] = [];
	let dirs: string[] = [];
	try {
		dirs = readdirSync(join(pack, "skills"));
	} catch {
		return out;
	}
	for (const d of dirs.sort()) {
		const file = join(pack, "skills", d, "fit.json");
		if (!existsSync(file)) continue;
		let q: Record<string, any>;
		try {
			q = JSON.parse(readFileSync(file, "utf8"));
		} catch {
			continue;
		}
		const paths: string[] = [];
		for (const [name, def] of Object.entries(q)) {
			const ins = def?.instructions ?? {};
			for (const k of ["focus", "note"]) if (typeof ins[k] === "string") paths.push(`${name}.instructions.${k}`);
			const crit = def?.criteria;
			if (crit && typeof crit === "object" && !Array.isArray(crit)) {
				for (const [ck, cv] of Object.entries(crit as Record<string, any>)) {
					if (typeof cv === "string") paths.push(`${name}.criteria.${ck}`);
					else if (typeof cv?.what === "string") paths.push(`${name}.criteria.${ck}.what`);
				}
			}
		}
		if (paths.length) out.push({ file, paths: paths.slice(0, cap) });
	}
	return out;
}

export type Drafter = (prompt: string) => Promise<string>;

export function draftPrompt(c: Pick<Correction, "correction" | "corrected">, kind: Kind, criterionFiles: { file: string; paths: string[] }[]): string {
	const files = criterionFiles.length
		? criterionFiles.map((f) => `${f.file}: ${f.paths.join(", ")}`).join("\n")
		: "(none)";
	return [
		"You keep the rules of a writing and research harness. Joe corrected the agent. Write ONE rule, one sentence, in plain words, that would have stopped the mistake. Then give the exact check when one fits.",
		"",
		`Kind of rule: ${kind}. ${JSON.stringify(KIND_CRITERIA[kind])}`,
		"",
		"What the agent wrote (the output Joe corrected):",
		"<<<",
		c.corrected,
		">>>",
		"",
		"Joe's correction:",
		"<<<",
		c.correction,
		">>>",
		"",
		"Answer with only a JSON object, no prose around it:",
		'{"rule": "one sentence in plain words",',
		' "pattern": "for a prose_style rule: a case-insensitive regular expression (Python re syntax) that matches the words or shape the rule forbids and that matches the agent output above; else null",',
		' "good_example": "a short sentence that follows the rule, or null",',
		' "criterion": {"file": "one of the files below", "path": "one of its paths", "sentence": "one sentence to append to that criterion"} or null}',
		"",
		"Jev question files and the paths a criterion sentence may be appended to:",
		files,
		"",
		"Keep the rule generic when the correction allows it. Do not repeat Joe's message. Name no person, firm or figure unless the correction is about that person, firm or figure.",
	].join("\n");
}

export function parseDraft(text: string): Draft | null {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end <= start) return null;
	try {
		const j = JSON.parse(text.slice(start, end + 1));
		if (typeof j?.rule !== "string" || !j.rule.trim()) return null;
		const d: Draft = { rule: j.rule.trim().replace(/\s+/g, " ") };
		if (typeof j.pattern === "string" && j.pattern.trim()) d.pattern = j.pattern.trim();
		if (typeof j.good_example === "string" && j.good_example.trim()) d.good_example = j.good_example.trim();
		if (j.criterion && typeof j.criterion.file === "string" && typeof j.criterion.path === "string" && typeof j.criterion.sentence === "string") {
			d.criterion = { file: j.criterion.file, path: j.criterion.path, sentence: j.criterion.sentence.trim() };
		}
		return d;
	} catch {
		return null;
	}
}

/** The default drafter: the coordinator's own model, through Prime's registry. */
export function modelDrafter(ctx: any): Drafter {
	return async (prompt: string) => {
		const model = ctx.model;
		if (!model) throw new Error("no coordinator model");
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || !auth.apiKey) throw new Error(auth.ok ? `no API key for ${model.provider}` : auth.error);
		const msg: UserMessage = { role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() };
		const r = await complete(model, { messages: [msg] }, { apiKey: auth.apiKey, headers: auth.headers, maxTokens: 1200 });
		return r.content
			.filter((c: any): c is { type: "text"; text: string } => c.type === "text")
			.map((c: any) => c.text)
			.join("\n");
	};
}

// ---------------------------------------------------------------- route the change (code)

const PATTERN_CHECKER = join(PACK, "gates", "prose-patterns.py");

/** Does the pattern hit this text, judged by the same checker the prose gate runs. Null when the pattern is invalid. */
export function patternHits(pattern: string, text: string): boolean | null {
	const tmp = join(learnPaths().dir, `.pattern-check-${process.pid}.md`);
	try {
		mkdirSync(dirname(tmp), { recursive: true });
		writeFileSync(tmp, `${text}\n`);
		const r = spawnSync("python3", [PATTERN_CHECKER, "--check", pattern, tmp], { encoding: "utf8", timeout: 10_000 });
		if (r.status === 0) return true;
		if (r.status === 1) return false;
		return null;
	} catch {
		return null;
	} finally {
		try {
			spawnSync("rm", ["-f", tmp]);
		} catch {
			// nothing
		}
	}
}

export function patternName(kind: Kind, rule: string): string {
	const words = rule
		.toLowerCase()
		.replace(/[^a-z0-9 ]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 2 && !["the", "and", "not", "never", "use", "say", "write"].includes(w))
		.slice(0, 3)
		.join("_");
	return `${kind === "prose_style" ? "learned" : kind}.${words || "rule"}`;
}

/** Read a dot path in a parsed JSON file; returns the parent and the last key when the value is a string. */
function stringAt(obj: any, path: string): { parent: any; key: string } | null {
	const parts = path.split(".");
	let cur = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		if (cur == null || typeof cur !== "object") return null;
		cur = cur[parts[i]];
	}
	const key = parts[parts.length - 1];
	if (cur == null || typeof cur !== "object" || typeof cur[key] !== "string") return null;
	return { parent: cur, key };
}

/**
 * Where the rule lands. Plain code, the same answer for the same input
 * (section 21 rule 5). The pattern is anchored: it must hit the corrected
 * output and must not hit the good example.
 */
export function routeChange(kind: Kind, priv: boolean, draft: Draft, c: Pick<Correction, "corrected">, paths: Paths): { change: Change; note?: string } {
	const dated = `${draft.rule} [${kind}, ${new Date().toISOString().slice(0, 10)}]`;
	if (priv) return { change: { type: "vault_line", file: paths.proposedRules, line: dated }, note: "private rule: the line goes to proposed-rules.jsonl for Joe to paste into the vault note" };
	if (kind === "prose_style" && draft.pattern) {
		const hitsBad = patternHits(draft.pattern, c.corrected);
		const hitsGood = draft.good_example ? patternHits(draft.pattern, draft.good_example) : false;
		if (hitsBad === null) return { change: { type: "rule_line", file: paths.rules, line: dated }, note: `pattern rejected: not a valid regular expression (${draft.pattern})` };
		if (!hitsBad) return { change: { type: "rule_line", file: paths.rules, line: dated }, note: `pattern rejected: it does not match the corrected output (${draft.pattern})` };
		if (hitsGood) return { change: { type: "rule_line", file: paths.rules, line: dated }, note: `pattern rejected: it also matches the good example (${draft.pattern})` };
		return { change: { type: "pattern", file: paths.patterns, name: patternName(kind, draft.rule), pattern: draft.pattern } };
	}
	if (draft.criterion) {
		const file = resolve(paths.cwd, draft.criterion.file);
		const allowed = listCriterionPaths().find((f) => f.file === file);
		if (allowed?.paths.includes(draft.criterion.path)) {
			return { change: { type: "criterion", file, path: draft.criterion.path, sentence: draft.criterion.sentence } };
		}
		return { change: { type: "rule_line", file: paths.rules, line: dated }, note: `criterion rejected: ${draft.criterion.file} ${draft.criterion.path} is not an allowed target` };
	}
	return { change: { type: "rule_line", file: paths.rules, line: dated } };
}

export function describeChange(ch: Change): string {
	switch (ch.type) {
		case "pattern":
			return `prose gate pattern in ${ch.file}: ${ch.name}: ${ch.pattern}`;
		case "rule_line":
			return `new line in ${ch.file} under "${LEARNED_SECTION}": ${ch.line}`;
		case "vault_line":
			return `proposed line for the vault rules note, written to ${ch.file}: ${ch.line}`;
		case "criterion":
			return `append to ${ch.path} in ${ch.file}: ${ch.sentence}`;
		case "none":
			return `no file change (${ch.why})`;
	}
}

// ---------------------------------------------------------------- proposals on disk

export function recordProposal(p: Proposal, paths: Paths): void {
	appendJsonl(paths.proposals, { ts: new Date().toISOString(), event: p.status, proposal: p });
}

/** The current state of every proposal: the last event per id wins. */
export function loadProposals(paths: Paths): Proposal[] {
	const byId = new Map<string, Proposal>();
	for (const row of readJsonl<{ proposal: Proposal }>(paths.proposals)) if (row?.proposal?.id) byId.set(row.proposal.id, row.proposal);
	return [...byId.values()];
}

export function pendingProposals(paths: Paths): Proposal[] {
	return loadProposals(paths).filter((p) => p.status === "pending");
}

/** The whole loop from a correction to a pending proposal: Jev, the model, code. */
export async function propose(c: Correction, drafter: Drafter, paths: Paths, t = threshold()): Promise<Proposal> {
	const kv = await classifyKind(c, t);
	const text = await drafter(draftPrompt(c, kv.kind, listCriterionPaths()));
	const draft = parseDraft(text);
	if (!draft) throw new Error("the model's draft was not a JSON object with a rule");
	const routed = routeChange(kv.kind, kv.private, draft, c, paths);
	const p: Proposal = {
		id: newId(c.id),
		ts: new Date().toISOString(),
		correction_id: c.id,
		kind: kv.kind,
		kind_confidence: kv.kind_confidence,
		private: kv.private,
		private_confidence: kv.private_confidence,
		rule: draft.rule,
		change: routed.change,
		correction: c.correction.slice(0, 300),
		corrected: c.corrected.slice(-300),
		status: "pending",
	};
	const notes = [routed.note, kv.error ? `Jev unavailable (${kv.error}); kind other, treated as private` : undefined].filter(Boolean);
	if (notes.length) p.note = notes.join("; ");
	recordProposal(p, paths);
	return p;
}

// ---------------------------------------------------------------- edit

export function editText(p: Proposal): string {
	const lines = [`rule: ${p.rule}`];
	if (p.change.type === "pattern") lines.push(`pattern: ${p.change.pattern}`);
	if (p.change.type === "criterion") lines.push(`sentence: ${p.change.sentence}`);
	if (p.change.type === "rule_line" || p.change.type === "vault_line") lines.push(`line: ${p.change.line}`);
	lines.push("", "# Edit the values above. Keep the keys. Lines starting with # are ignored.");
	return lines.join("\n");
}

export function applyEdit(p: Proposal, text: string): Proposal {
	const out: Proposal = { ...p, change: { ...p.change } as Change, edited: true };
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const m = line.match(/^(rule|pattern|sentence|line):\s*(.*)$/);
		if (!m) continue;
		const [, key, value] = m;
		if (key === "rule" && value.trim()) out.rule = value.trim();
		if (key === "pattern" && out.change.type === "pattern" && value.trim()) out.change.pattern = value.trim();
		if (key === "sentence" && out.change.type === "criterion" && value.trim()) out.change.sentence = value.trim();
		if (key === "line" && (out.change.type === "rule_line" || out.change.type === "vault_line") && value.trim()) out.change.line = value.trim();
	}
	return out;
}

// ---------------------------------------------------------------- rerun

export interface RerunResult {
	ok: boolean;
	started: string[];
	failed: string[];
	seconds: number;
	tail: string;
	command: string;
	timed_out?: boolean;
	skipped?: boolean;
}

/** Test names from tests/run-all.sh headers and FAILED lines, and test-set rows whose status is not ok. */
export function parseRerun(output: string): { started: string[]; failed: string[] } {
	const started: string[] = [];
	const failed: string[] = [];
	for (const raw of output.split("\n")) {
		const line = raw.trimEnd();
		let m = line.match(/^=+ (\S+)(?: \(no test file, skipped\))?$/);
		if (m && m[1] !== "all") {
			started.push(m[1]);
			continue;
		}
		m = line.match(/^FAILED: (\S+)/);
		if (m) {
			failed.push(m[1]);
			continue;
		}
		// test-set row: id gates score cost seconds status
		m = line.match(/^(\S+)\s+\d+\/\d+\s+\S+\s+\$[\d.]+\s+\d+\s+(.+)$/);
		if (m) {
			started.push(`testset:${m[1]}`);
			if (m[2].trim() !== "ok") failed.push(`testset:${m[1]}`);
		}
	}
	return { started: [...new Set(started)], failed: [...new Set(failed)] };
}

export function runRerun(paths: Paths): RerunResult {
	if (paths.rerun === "off") return { ok: true, started: [], failed: [], seconds: 0, tail: "", command: "off", skipped: true };
	const t0 = Date.now();
	const r = spawnSync("bash", ["-c", paths.rerun], { cwd: paths.cwd, encoding: "utf8", timeout: paths.rerunTimeoutS * 1000, maxBuffer: 64 * 1024 * 1024, env: process.env });
	const output = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
	const parsed = parseRerun(output);
	const timedOut = r.signal === "SIGTERM" && Date.now() - t0 >= paths.rerunTimeoutS * 1000 - 1000;
	return {
		ok: r.status === 0 && !timedOut,
		started: parsed.started,
		failed: timedOut ? [...parsed.failed, "timeout"] : parsed.failed,
		seconds: Math.round((Date.now() - t0) / 1000),
		tail: output.trim().split("\n").slice(-12).join("\n"),
		command: paths.rerun,
		...(timedOut ? { timed_out: true } : {}),
	};
}

export interface Baseline {
	ts: string;
	passed: string[];
	failed: string[];
	ok: boolean;
}

export function loadBaseline(paths: Paths): Baseline | null {
	try {
		return JSON.parse(readFileSync(paths.baseline, "utf8"));
	} catch {
		return null;
	}
}

export function saveBaseline(r: RerunResult, paths: Paths): Baseline {
	const b: Baseline = { ts: new Date().toISOString(), passed: r.started.filter((s) => !r.failed.includes(s)), failed: r.failed, ok: r.ok };
	mkdirSync(dirname(paths.baseline), { recursive: true });
	writeFileSync(paths.baseline, `${JSON.stringify(b, null, 2)}\n`);
	return b;
}

/** Tests that fail now and did not fail before. A whole-run failure with no named test counts when the run passed before. */
export function regressions(before: Baseline | null, now: RerunResult): string[] {
	if (now.skipped) return [];
	const beforeFailed = new Set(before?.failed ?? []);
	const out = now.failed.filter((f) => !beforeFailed.has(f));
	if (!now.ok && out.length === 0 && (before?.ok ?? true)) out.push("run");
	return out;
}

// ---------------------------------------------------------------- apply

function backup(p: Proposal, file: string, paths: Paths): string | null {
	const dir = join(paths.backups, p.id);
	mkdirSync(dir, { recursive: true });
	const dest = join(dir, basename(file));
	if (existsSync(file)) {
		copyFileSync(file, dest);
		return dest;
	}
	writeFileSync(`${dest}.absent`, "");
	return null;
}

function restore(p: Proposal, file: string, paths: Paths): void {
	const dest = join(paths.backups, p.id, basename(file));
	if (existsSync(dest)) copyFileSync(dest, file);
	else if (existsSync(`${dest}.absent`)) spawnSync("rm", ["-f", file]);
}

/** Write the change to disk. Returns the file touched, or null for a change with no file. */
export function writeChange(p: Proposal): string | null {
	const ch = p.change;
	const stamp = `learn ${p.id}`;
	switch (ch.type) {
		case "pattern": {
			mkdirSync(dirname(ch.file), { recursive: true });
			const cur = existsSync(ch.file) ? readFileSync(ch.file, "utf8") : "";
			const sep = cur.endsWith("\n") || cur === "" ? "" : "\n";
			appendFileSync(ch.file, `${sep}\n# ${stamp}: ${p.rule}\n${ch.name}: ${ch.pattern}\n`);
			return ch.file;
		}
		case "rule_line": {
			mkdirSync(dirname(ch.file), { recursive: true });
			let cur = existsSync(ch.file) ? readFileSync(ch.file, "utf8") : "";
			if (!cur.includes(LEARNED_SECTION)) {
				cur = `${cur.replace(/\s*$/, "")}\n\n${LEARNED_SECTION}\n\nRules added by the learning loop (Step 10) after Joe approved them in \`/learn\`.\n`;
			}
			cur = `${cur.replace(/\s*$/, "")}\n- ${ch.line} (${stamp})\n`;
			writeFileSync(ch.file, cur);
			return ch.file;
		}
		case "vault_line": {
			appendJsonl(ch.file, { ts: new Date().toISOString(), id: p.id, kind: p.kind, line: ch.line, rule: p.rule, correction_id: p.correction_id });
			return ch.file;
		}
		case "criterion": {
			const j = JSON.parse(readFileSync(ch.file, "utf8"));
			const at = stringAt(j, ch.path);
			if (!at) throw new Error(`${ch.path} is not a string in ${ch.file}`);
			const cur = String(at.parent[at.key]).replace(/\s*$/, "");
			at.parent[at.key] = `${cur}${cur.endsWith(".") ? "" : "."} ${ch.sentence}`;
			writeFileSync(ch.file, `${JSON.stringify(j, null, 2)}\n`);
			return ch.file;
		}
		case "none":
			return null;
	}
}

/** The one-edit refinement Prime stores for an applied rule; rollback comes from Prime's snapshots. */
export function refinementFor(p: Proposal): RefinementProposal {
	return {
		summary: `Learned rule ${p.id}: ${p.rule}`,
		rationale: `Joe corrected the agent (correction ${p.correction_id}, kind ${p.kind}): "${p.correction.slice(0, 200)}". The rule and its check were approved in /learn.`,
		expectedOutcome: `The agent follows the rule; the check (${describeChange(p.change)}) enforces it.`,
		edits: [
			{
				action: "create",
				kind: "memory",
				title: `Laurelin rule ${p.id} (${p.kind})`,
				content: `${p.rule}\n\nCheck: ${describeChange(p.change)}\nFrom correction ${p.correction_id}: "${p.correction.slice(0, 300)}"`,
				reason: "approved by Joe in /learn",
			},
		],
	};
}

function gstackLearningsBin(): string | null {
	const bin = process.env.GSTACK_LEARNINGS_LOG_BIN || join(homedir(), ".claude", "skills", "gstack", "bin", "gstack-learnings-log");
	return existsSync(bin) ? bin : null;
}

/** Record a generic rule in gstack's learnings store (PLAN section 17). Private rules never go there: the store can sync off the machine. */
export function gstackLearn(p: Proposal): boolean {
	if (p.private || process.env.LAURELIN_GSTACK_DECISIONS === "0") return false;
	const bin = gstackLearningsBin();
	if (!bin) return false;
	const payload = { skill: "laurelin-learn", type: "preference", key: `learn-${p.id}`, insight: `${p.rule} (kind ${p.kind}; check: ${p.change.type})`, confidence: 8, source: "user-stated" };
	try {
		const r = spawnSync(bin, [JSON.stringify(payload)], { encoding: "utf8", timeout: 15_000 });
		return r.status === 0;
	} catch {
		return false;
	}
}

export interface ApplyHooks {
	/** Send a user message to the session (pi.sendUserMessage). Absent in tests. */
	sendUserMessage?: (text: string) => void;
	notify?: (text: string) => void;
	storeScope?: "global" | "local";
}

/**
 * Apply a proposal: file change, rerun, and, when nothing broke, the stores.
 * Returns the proposal in its final state (applied or reverted).
 */
export function applyProposal(p0: Proposal, paths: Paths, hooks: ApplyHooks = {}): Proposal {
	const say = hooks.notify ?? (() => {});
	const p: Proposal = { ...p0 };
	let before = loadBaseline(paths);
	if (!before && paths.rerun !== "off") {
		say("No test baseline yet; running the tests once before the change so a regression can be told apart from an old failure.");
		before = saveBaseline(runRerun(paths), paths);
	}
	const file = p.change.type === "none" ? null : p.change.file;
	if (file) backup(p, file, paths);
	try {
		writeChange(p);
	} catch (e) {
		if (file) restore(p, file, paths);
		p.status = "reverted";
		p.reverted_why = `could not write the change: ${String((e as Error).message ?? e)}`;
		recordProposal(p, paths);
		return p;
	}
	say(`Applied ${describeChange(p.change)}. Rerunning the tests (${paths.rerun})...`);
	const now = runRerun(paths);
	p.rerun = now;
	const broke = regressions(before, now);
	if (broke.length) {
		if (file) restore(p, file, paths);
		p.status = "reverted";
		p.reverted_why = `these passed before and fail now: ${broke.join(", ")}`;
		recordProposal(p, paths);
		return p;
	}
	if (!now.skipped) saveBaseline(now, paths);
	p.status = "applied";
	p.applied_ts = new Date().toISOString();
	p.gstack = gstackLearn(p);
	recordProposal(p, paths);
	if (hooks.sendUserMessage) {
		const scope = hooks.storeScope ?? (process.env.LAURELIN_LEARN_STORE === "local" ? "local" : "global");
		// Store the rule only when running under the fork's own settings folder. Loaded by a
		// plain prime-agent, /refine --global would write into ~/.prime/agent (rule 17).
		if (!process.env.LAURELIN_CODING_AGENT_DIR) {
			hooks.warn?.(`learn ${p.id}: applied on disk; not stored in the refine store because this is not the laurelin-agent launcher (LAURELIN_CODING_AGENT_DIR unset).`);
		} else {
			hooks.sendUserMessage(`/refine ${scope === "global" ? "--global " : ""}${MARKER}${p.id}`);
		}
	}
	return p;
}

export function rejectProposal(p0: Proposal, paths: Paths): Proposal {
	const p: Proposal = { ...p0, status: "rejected" };
	recordProposal(p, paths);
	return p;
}

/** The proposal id in a /refine instruction written by this extension, or null. */
export function markerId(instructions: string | undefined): string | null {
	const m = (instructions ?? "").trim().match(new RegExp(`^${MARKER}([0-9a-f]{12})$`));
	return m ? m[1] : null;
}

export function describeProposal(p: Proposal): string {
	const lines = [
		`${p.id}  ${p.kind} (${p.kind_confidence.toFixed(2)})${p.private ? ", private" : ""}  ${p.status}`,
		`  rule:   ${p.rule}`,
		`  change: ${describeChange(p.change)}`,
		`  Joe:    "${p.correction.slice(0, 120)}"`,
	];
	if (p.note) lines.push(`  note:   ${p.note}`);
	if (p.reverted_why) lines.push(`  why:    ${p.reverted_why}`);
	return lines.join("\n");
}

// ---------------------------------------------------------------- the extension

export default function (pi: ExtensionAPI) {
	const enabled = process.env.LAURELIN_LEARN !== "off";
	let lastSource: string | undefined;
	let busy = false;

	const say = (ctx: any, text: string, level: "info" | "warning" = "info") => {
		if (ctx?.hasUI) ctx.ui.notify(text, level);
		else process.stderr.write(`${text}\n`);
	};

	function readTask(cwd: string): unknown {
		try {
			return JSON.parse(readFileSync(join(cwd, ".laurelin", "task.json"), "utf8"));
		} catch {
			return undefined;
		}
	}

	pi.on("input", async (event) => {
		lastSource = event.source;
		return { action: "continue" };
	});

	pi.on("agent_end", async (_event, ctx) => {
		const source = lastSource;
		lastSource = undefined;
		if (!enabled || busy || source === "extension") return;
		busy = true;
		try {
			const paths = learnPaths();
			const branch = ctx.sessionManager.getBranch() as any[];
			const pair = findCorrectionPair(branch);
			if (!pair) return;
			const verdict = await intentOf(pair);
			if (verdict.intent !== "correction") return;
			const c = recordCorrection(pair, verdict, readTask(ctx.cwd), paths);
			const p = await propose(c, modelDrafter(ctx), paths);
			pi.events.emit("laurelin:learn", p);
			say(ctx, `Learned a correction (${p.kind}). Proposed rule: ${p.rule} Review with /learn.`);
		} catch (e) {
			say(ctx, `Learning loop: ${String((e as Error).message ?? e)}`, "warning");
		} finally {
			busy = false;
		}
	});

	// Prime's /refine asks for a plan. When the instruction is our marker, the
	// plan is the approved rule; any other /refine falls through to Prime's planner.
	pi.on("session_before_refine", async (event) => {
		const id = markerId(event.preparation.instructions);
		if (!id) return undefined;
		const p = loadProposals(learnPaths()).find((x) => x.id === id);
		if (!p || p.status !== "applied") return { skip: true };
		return { proposal: refinementFor(p) };
	});

	pi.on("refine_complete", async (event) => {
		const m = event.summary?.match(/^Learned rule ([0-9a-f]{12}):/);
		if (!m) return;
		const paths = learnPaths();
		const p = loadProposals(paths).find((x) => x.id === m[1]);
		if (p) recordProposal({ ...p, refinement_id: event.id }, paths);
	});

	async function review(ctx: any): Promise<void> {
		const paths = learnPaths();
		let pending = pendingProposals(paths);
		if (!pending.length) {
			say(ctx, "No pending proposals. Corrections are detected after each of your messages; /learn list shows every proposal.");
			return;
		}
		if (!ctx.hasUI) {
			say(ctx, `${pending.length} pending. Use /learn apply <id>, /learn reject <id> or /learn show <id>.\n${pending.map(describeProposal).join("\n")}`);
			return;
		}
		const hooks: ApplyHooks = {
			sendUserMessage: (t) => pi.sendUserMessage(t, ctx.isIdle?.() === false ? { deliverAs: "followUp" } : undefined),
			notify: (t) => say(ctx, t),
		};
		for (let p of pending) {
			let decided = false;
			while (!decided) {
				const t0 = Date.now();
				let pick: string | undefined;
				try {
					pick = await ctx.ui.select(`${describeProposal(p)}\nApply this rule?`, ["a: apply", "r: reject", "e: edit in the editor", "skip"]);
				} catch {
					pick = undefined;
				}
				if (pick === undefined || Date.now() - t0 < NOOP_SELECT_MS) return; // nobody answered
				if (pick.startsWith("a")) {
					const done = applyProposal(p, paths, hooks);
					say(ctx, done.status === "applied" ? `Applied ${done.id}. ${describeChange(done.change)}` : `Reverted ${done.id}: ${done.reverted_why}`, done.status === "applied" ? "info" : "warning");
					decided = true;
				} else if (pick.startsWith("r")) {
					rejectProposal(p, paths);
					say(ctx, `Rejected ${p.id}. Nothing changed on disk.`);
					decided = true;
				} else if (pick.startsWith("e")) {
					let text: string | undefined;
					try {
						text = await ctx.ui.editor("Edit the proposal", editText(p));
					} catch {
						text = undefined;
					}
					if (text) {
						p = applyEdit(p, text);
						recordProposal(p, paths);
					}
				} else decided = true; // skip
			}
		}
		pending = pendingProposals(paths);
		say(ctx, pending.length ? `${pending.length} still pending.` : "No proposals pending.");
	}

	pi.registerCommand("learn", {
		description: "Review rules learned from your corrections: /learn (a apply, r reject, e edit), /learn list, /learn show|apply|reject <id>, /learn baseline",
		handler: async (args, ctx) => {
			const [verb, id] = (args ?? "").trim().split(/\s+/);
			const paths = learnPaths();
			if (!verb) return review(ctx);
			if (verb === "list") {
				const all = loadProposals(paths);
				say(ctx, all.length ? all.map(describeProposal).join("\n") : "No proposals yet.");
				return;
			}
			if (verb === "baseline") {
				say(ctx, `Running ${paths.rerun} to record what passes today...`);
				const b = saveBaseline(runRerun(paths), paths);
				say(ctx, `Baseline: ${b.passed.length} passed, ${b.failed.length} failed${b.failed.length ? ` (${b.failed.join(", ")})` : ""}.`);
				return;
			}
			const p = loadProposals(paths).find((x) => x.id === id);
			if (!p) {
				say(ctx, `No proposal ${id ?? ""}. /learn list shows them.`, "warning");
				return;
			}
			if (verb === "show") return say(ctx, describeProposal(p));
			if (p.status !== "pending") return say(ctx, `${p.id} is ${p.status}, not pending.`, "warning");
			if (verb === "apply") {
				const done = applyProposal(p, paths, {
					sendUserMessage: (t) => pi.sendUserMessage(t, ctx.isIdle?.() === false ? { deliverAs: "followUp" } : undefined),
					notify: (t) => say(ctx, t),
				});
				say(ctx, done.status === "applied" ? `Applied ${done.id}. ${describeChange(done.change)}` : `Reverted ${done.id}: ${done.reverted_why}`, done.status === "applied" ? "info" : "warning");
				return;
			}
			if (verb === "reject") {
				rejectProposal(p, paths);
				say(ctx, `Rejected ${p.id}. Nothing changed on disk.`);
				return;
			}
			say(ctx, "Usage: /learn | /learn list | /learn show|apply|reject <id> | /learn baseline", "warning");
		},
	});
}
