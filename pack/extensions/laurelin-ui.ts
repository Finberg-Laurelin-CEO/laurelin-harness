/**
 * laurelin-ui: the Laurelin look on top of Prime's own layout.
 *
 * Adds only: a footer badge (classification, model, worker), a checks widget
 * below the editor, an approvals line and overlay, and a title screen at
 * startup. Every UI call is guarded by ctx.hasUI, so `-p` and JSON mode
 * are untouched.
 *
 * Commands
 *   /classify green|yellow|red   set the classification badge
 *   /checks demo                 cycle sample check states; /checks reset clears
 *   /approvals                   open the approvals overlay (a approve, r reject, esc)
 *   /approvals demo              add three sample items
 *   /title                       show the title screen again
 *
 * API for other extensions (pi.events, the shared bus):
 *   emit "laurelin:check"          { name, state: "pass"|"fail"|"skipped"|"none", detail? }
 *   emit "laurelin:classification" "green" | "yellow" | "red"
 *   emit "laurelin:worker"         "coordinator" | any worker name
 *   emit "laurelin:approval"       { id, kind, title, preview }
 *   on   "laurelin:approval-decided" { id, decision: "approve"|"reject" }
 *   (the same event from another extension removes the item from the panel)
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
	getCapabilities,
	Image,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

// ---------------------------------------------------------------- state

type Level = "green" | "yellow" | "red";
type CheckState = "pass" | "fail" | "skipped" | "none";
interface Check {
	state: CheckState;
	detail?: string;
}
interface Approval {
	id: string;
	kind: string;
	title: string;
	preview: string;
}

const LEVELS: Level[] = ["green", "yellow", "red"];
// Laurelin Visual System in the terminal: one accent (orange) at one value, hierarchy by ink opacity,
// mono capitals for labels, a solid-accent chip behind two or three words.
const ACCENT_RGB = [255, 79, 0];
const chip = (text: string) =>
	`\x1b[48;2;${ACCENT_RGB.join(";")}m\x1b[38;2;247;247;245m\x1b[1m ${text.toUpperCase()} \x1b[22m\x1b[39m\x1b[49m`;

const CHECK_NAMES = ["prose", "numbers", "layout", "location", "word for word", "evidence"];
// The mark must be the opposite colour of the terminal: black rings on a light
// terminal, white rings on a dark one. The launcher sets LAURELIN_BG.
const MARK_FILE = process.env.LAURELIN_BG === "light" ? "laurelin-ring-dark.png" : "laurelin-mark.png";
const MARK_PATH = process.env.LAURELIN_MARK || join(homedir(), "Laurelin_Brand_Assets", "imagery", "reference", "brand", MARK_FILE);

const DEMO_CHECKS: Array<Record<string, Check>> = [
	{},
	{ prose: { state: "pass" }, numbers: { state: "pass" } },
	{
		prose: { state: "pass" },
		numbers: { state: "pass" },
		layout: { state: "fail", detail: "p.7 overlap: title over image" },
		location: { state: "pass" },
	},
	{
		prose: { state: "pass" },
		numbers: { state: "pass" },
		layout: { state: "fail", detail: "p.7 overlap: title over image" },
		location: { state: "pass" },
		"word for word": { state: "pass" },
		evidence: { state: "fail", detail: "no ledger row for make-pdf" },
	},
	Object.fromEntries(CHECK_NAMES.map((n) => [n, { state: "pass" as CheckState }])),
];

const DEMO_APPROVALS: Approval[] = [
	{
		id: "demo-email",
		kind: "email",
		title: "Email: monthly update to one investor",
		preview:
			"To: (investor)\nSubject: Laurelin, September update\n\nShort note on the month: what shipped, what is next, one ask. Sample text only.",
	},
	{
		id: "demo-post",
		kind: "post",
		title: "Post: hiring a controls engineer",
		preview: "Laurelin is hiring a controls engineer in New York. Sample text only.",
	},
	{
		id: "demo-deploy",
		kind: "deploy",
		title: "Deploy: public site to production",
		preview: "vercel deploy --prod\n\nChanges: one copy fix on the team page. Sample text only.",
	},
];

// ---------------------------------------------------------------- helpers

function packVersion(): string {
	try {
		const here = dirname(fileURLToPath(import.meta.url));
		const json = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version?: string };
		return json.version ?? "dev";
	} catch {
		return "dev";
	}
}

/**
 * The footer's acceptance figure, from the last `laurelin-metrics` run:
 * metrics/latest.json (gitignored), or LAURELIN_METRICS_FILE. Returns
 * `accept 71% (wk)` for the latest ISO week, or null when there is no number.
 */
function acceptanceFooter(): string | null {
	try {
		const here = dirname(fileURLToPath(import.meta.url));
		const file = process.env.LAURELIN_METRICS_FILE || join(here, "..", "..", "metrics", "latest.json");
		const json = JSON.parse(readFileSync(file, "utf8")) as { latest_week?: { acceptance?: number | null } };
		const a = json.latest_week?.acceptance;
		if (typeof a !== "number") return null;
		return `accept ${Math.round(a * 100)}% (wk)`;
	} catch {
		return null;
	}
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

function center(line: string, width: number): string {
	const pad = Math.max(0, Math.floor((width - visibleWidth(line)) / 2));
	return " ".repeat(pad) + line;
}

/** The Laurelin mark: one large ring carrying eight small rings, in block glyphs. */
const MARK_LINES = [
	"             ▄▄",
	"           ▄█▀▀█▄",
	"     ▄██▄▄███▄▄███▄▄██▄",
	"    ██  ██   ▀▀   ██  ██",
	"     ███▀          ▀███",
	"   ▄██                ██▄",
	" ▄█▀▀█▄              ▄█▀▀█▄",
	" ▀█▄▄█▀              ▀█▄▄█▀",
	"   ▀██                ██▀",
	"     ███▄          ▄███",
	"    ██  ██   ▄▄   ██  ██",
	"     ▀██▀▀███▀▀███▀▀██▀",
	"           ▀█▄▄█▀",
	"             ▀▀"
];
function glyphMark(theme: Theme): string[] {
	return MARK_LINES.map((l) => theme.fg("accent", l));
}

function loadMark(theme: Theme): Image | undefined {
	if (process.env.LAURELIN_NO_IMAGE) return undefined;
	if (!getCapabilities().images) return undefined;
	try {
		const base64 = readFileSync(MARK_PATH).toString("base64");
		return new Image(base64, "image/png", { fallbackColor: (s) => theme.fg("dim", s) }, {
			maxWidthCells: 24,
			filename: "laurelin-mark.png",
		});
	} catch {
		return undefined;
	}
}

function box(theme: Theme, width: number, title: string, body: string[]): string[] {
	const inner = Math.max(10, width - 2);
	const edge = (s: string) => theme.fg("border", s);
	const head = ` ${title} `;
	const top = edge("╭─") + theme.fg("accent", head) + edge("─".repeat(Math.max(0, inner - visibleWidth(head) - 1)) + "╮");
	const row = (s: string) => {
		const t = truncateToWidth(s, inner - 2, "…");
		return edge("│") + " " + t + " ".repeat(Math.max(0, inner - 2 - visibleWidth(t))) + " " + edge("│");
	};
	return [top, ...body.map(row), edge(`╰${"─".repeat(inner)}╯`)];
}

// ---------------------------------------------------------------- components

class TitleScreen {
	private image: Image | undefined;
	constructor(
		private theme: Theme,
		private done: () => void,
		private version: string,
		private jobs: number,
	) {
		this.image = loadMark(theme);
	}
	handleInput(_data: string): void {
		this.done();
	}
	render(width: number): string[] {
		const t = this.theme;
		const mark = this.image ? this.image.render(width) : glyphMark(t).map((l) => center(l, width));
		const word = t.fg("accent", t.bold("L A U R E L I N"));
		const sub = t.fg("muted", `harness ${this.version}  ·  ${today()}  ·  jobs today: ${this.jobs}`);
		const hint = t.fg("dim", "press any key");
		return ["", ...mark, "", center(word, width), center(sub, width), "", center(hint, width), ""].map((l, i) =>
			this.image && i > 0 && i <= mark.length ? l : truncateToWidth(l, width, ""),
		);
	}
	invalidate(): void {
		this.image?.invalidate();
	}
}

class ApprovalsOverlay {
	private selected = 0;
	constructor(
		private theme: Theme,
		private items: Approval[],
		private decide: (item: Approval, decision: "approve" | "reject") => void,
		private requestRender: () => void,
		private done: () => void,
	) {}
	handleInput(data: string): void {
		if (matchesKey(data, "escape")) return this.done();
		if (this.items.length === 0) return this.done();
		if (matchesKey(data, "up")) this.selected = Math.max(0, this.selected - 1);
		else if (matchesKey(data, "down")) this.selected = Math.min(this.items.length - 1, this.selected + 1);
		else if (data === "a" || data === "r") {
			const item = this.items[this.selected]!;
			this.decide(item, data === "a" ? "approve" : "reject");
			this.selected = Math.min(this.selected, Math.max(0, this.items.length - 1));
			if (this.items.length === 0) return this.done();
		} else return;
		this.requestRender();
	}
	render(width: number): string[] {
		const t = this.theme;
		const inner = Math.max(10, width - 4);
		const body: string[] = [];
		if (this.items.length === 0) body.push(t.fg("dim", "nothing waiting"));
		for (let i = 0; i < this.items.length; i++) {
			const it = this.items[i]!;
			const on = i === this.selected;
			const kind = t.fg(on ? "accent" : "muted", it.kind.padEnd(7));
			body.push(`${on ? t.fg("accent", "▶") : " "} ${kind} ${on ? t.bold(it.title) : it.title}`);
		}
		const cur = this.items[this.selected];
		if (cur) {
			body.push(t.fg("border", "─".repeat(inner)));
			for (const para of cur.preview.split("\n")) {
				body.push(...(para === "" ? [""] : wrapTextWithAnsi(t.fg("muted", para), inner)));
			}
		}
		body.push("");
		body.push(t.fg("dim", "↑↓ select  ·  a approve  ·  r reject  ·  esc close"));
		return box(t, width, `approvals: ${this.items.length} waiting`, body);
	}
	invalidate(): void {}
}

// ---------------------------------------------------------------- extension

/** Prime's host timer when present (cancelled on /reload, a throw is reported); else a guarded global one. */
function later(ctx: any, fn: () => void, ms: number): void {
	const safe = () => {
		try {
			fn();
		} catch {
			/* stale ctx after /reload: nothing to draw */
		}
	};
	if (typeof ctx?.setTimeout === "function") ctx.setTimeout(safe, ms);
	else setTimeout(safe, ms);
}

export default function laurelinUi(pi: ExtensionAPI) {
	let classification: Level = "green";
	let worker = "coordinator";
	const checks = new Map<string, Check>();
	const approvals: Approval[] = [];
	let demoStep = 0;
	let ui: ExtensionContext | undefined;

	const badge = () => {
		if (!ui?.hasUI) return;
		const t = ui.ui.theme;
		const label = (l: string) => t.fg("dim", l);
		const cls = classification === "red" ? chip("red") : t.bold(t.fg("text", classification.toUpperCase()));
		const accept = acceptanceFooter();
		ui.ui.setStatus(
			"laurelin",
			`${label("CLASS")} ${cls}   ${label("MODEL")} ${t.fg("text", ui.model?.id ?? "none")}   ${label("WORKER")} ${t.fg("text", worker)}` +
				(accept ? `   ${label("ACCEPT")} ${t.fg("text", accept.replace(/^accept\s*/i, ""))}` : ""),
		);
	};

	const checksWidget = () => {
		if (!ui?.hasUI) return;
		const t = ui.ui.theme;
		const cells = CHECK_NAMES.map((name) => {
			const c = checks.get(name) ?? { state: "none" as CheckState };
			const label = name.toUpperCase();
			if (c.state === "pass") return `${t.fg("text", "■")} ${t.fg("text", label)}`;
			if (c.state === "fail") return `${t.fg("accent", "■")} ${t.bold(t.fg("accent", label))}`;
			if (c.state === "skipped") return `${t.fg("dim", "□")} ${t.fg("dim", label)}`;
			return `${t.fg("dim", "·")} ${t.fg("dim", label)}`;
		});
		const lines = [` ${t.fg("dim", "GATES")}  ${cells.join("  ")}`];
		for (const name of CHECK_NAMES) {
			const c = checks.get(name);
			if (c?.state === "fail" && c.detail) lines.push(`        ${t.fg("accent", "↳")} ${t.fg("text", `${name.toUpperCase()}  ${c.detail}`)}`);
		}
		ui.ui.setWidget("checks", lines, { placement: "belowEditor" });
	};

	const approvalsWidget = () => {
		if (!ui?.hasUI) return;
		if (approvals.length === 0) return ui.ui.setWidget("approvals", undefined);
		const t = ui.ui.theme;
		ui.ui.setWidget(
			"approvals",
			[` ${chip(`${approvals.length} approval${approvals.length === 1 ? "" : "s"}`)}  ${t.fg("dim", "waiting on you · /approvals to review")}`],
			{ placement: "belowEditor" },
		);
	};

	const decide = (item: Approval, decision: "approve" | "reject") => {
		const i = approvals.findIndex((a) => a.id === item.id);
		if (i >= 0) approvals.splice(i, 1);
		pi.events.emit("laurelin:approval-decided", { id: item.id, decision });
		approvalsWidget();
	};

	const showTitle = async (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		await ctx.ui.custom<void>((_tui, theme, _kb, done) => new TitleScreen(theme, () => done(), packVersion(), 0));
	};

	// ---- lifecycle
	const drawAll = () => {
		badge();
		checksWidget();
		approvalsWidget();
	};
	// The session starts in the background worker before the screen attaches, and draws sent before the
	// attach are dropped. Draw now, then again over the first seconds and on the first message.
	pi.on("session_start", async (_event, ctx) => {
		ui = ctx;
		// Prime's host timers: cancelled on /reload and session replacement, and a throw is reported, not fatal.
		// (Global setTimeout here outlived a /reload, touched the stale ctx and crashed the worker, 9/27.)
		for (const ms of [0, 800, 2000, 4000, 8000]) later(ctx, () => { if (ctx.hasUI) drawAll(); }, ms);
	});
	pi.on("input", async (_event, ctx) => {
		ui = ctx;
		if (ctx.hasUI) drawAll();
	});
	pi.on("session_shutdown", async () => {
		ui = undefined;
	});
	pi.on("model_select", async (_event, ctx) => {
		ui = ctx;
		badge();
	});

	// ---- bus API for other extensions
	pi.events.on("laurelin:check", (data) => {
		const { name, state, detail } = data as { name: string; state: CheckState; detail?: string };
		checks.set(name, { state, detail });
		checksWidget();
	});
	pi.events.on("laurelin:classification", (data) => {
		if (LEVELS.includes(data as Level)) {
			classification = data as Level;
			badge();
		}
	});
	pi.events.on("laurelin:worker", (data) => {
		worker = String(data || "coordinator");
		badge();
	});
	pi.events.on("laurelin:approval", (data) => {
		const item = data as Approval;
		if (!approvals.some((a) => a.id === item.id)) approvals.push(item);
		approvalsWidget();
	});
	// Decided elsewhere (the confirm dialog, a timeout): drop it from the panel. Our own
	// decide() removes the item before it emits, so this stays idempotent.
	pi.events.on("laurelin:approval-decided", (data) => {
		const { id } = data as { id: string };
		const i = approvals.findIndex((a) => a.id === id);
		if (i < 0) return;
		approvals.splice(i, 1);
		approvalsWidget();
	});

	// ---- commands
	pi.registerCommand("classify", {
		description: "Set the classification badge: /classify green|yellow|red",
		getArgumentCompletions: (prefix) => {
			const hits = LEVELS.filter((l) => l.startsWith(prefix)).map((l) => ({ value: l, label: l }));
			return hits.length ? hits : null;
		},
		handler: async (args, ctx) => {
			ui = ctx;
			const level = args.trim().toLowerCase() as Level;
			if (!LEVELS.includes(level)) return ctx.ui.notify("usage: /classify green|yellow|red", "warning");
			classification = level;
			badge();
			pi.events.emit("laurelin:classification", level);
			// the CLASS chip in the footer shows the change
		},
	});

	pi.registerCommand("checks", {
		description: "Checks panel: /checks demo cycles sample states, /checks reset clears",
		getArgumentCompletions: (prefix) => {
			const hits = ["demo", "reset"].filter((l) => l.startsWith(prefix)).map((l) => ({ value: l, label: l }));
			return hits.length ? hits : null;
		},
		handler: async (args, ctx) => {
			ui = ctx;
			const sub = args.trim();
			if (sub === "reset") {
				checks.clear();
				demoStep = 0;
			} else if (sub === "demo") {
				demoStep = (demoStep + 1) % DEMO_CHECKS.length;
				checks.clear();
				for (const [name, c] of Object.entries(DEMO_CHECKS[demoStep]!)) checks.set(name, c);
			} else {
				return ctx.ui.notify("usage: /checks demo | reset", "warning");
			}
			checksWidget();
			const fails = [...checks.values()].filter((c) => c.state === "fail").length;
			void fails; // the lights below the editor show the result
		},
	});

	pi.registerCommand("approvals", {
		description: "Approvals waiting on Joe: /approvals opens the list, /approvals demo adds samples",
		getArgumentCompletions: (prefix) => ("demo".startsWith(prefix) ? [{ value: "demo", label: "demo" }] : null),
		handler: async (args, ctx) => {
			ui = ctx;
			if (args.trim() === "demo") {
				for (const item of DEMO_APPROVALS) if (!approvals.some((a) => a.id === item.id)) approvals.push({ ...item });
				approvalsWidget();
				return;
			}
			// Pick an item, read its preview, then approve, reject or go back. Repeats until the list is empty or Esc.
			if (typeof ctx.ui.select !== "function") return; // no screen to ask on
			while (approvals.length > 0) {
				const labels = approvals.map((a, i) => `${i + 1}. [${a.kind}] ${a.title}`);
				const picked = await ctx.ui.select(`${approvals.length} waiting for your approval`, [...labels, "Done"]);
				if (picked === undefined || picked === "Done") break;
				const item = approvals[labels.indexOf(picked)];
				if (!item) break;
				const choice = await ctx.ui.select(`${item.title}\n\n${item.preview}`, ["Approve", "Reject", "Back"]);
				if (choice === "Approve") decide(item, "approve");
				else if (choice === "Reject") decide(item, "reject");
			}
			if (approvals.length === 0) ctx.ui.notify("Nothing waiting for approval.", "info");
		},
	});

	pi.registerCommand("title", {
		description: "Show the Laurelin title screen again",
		handler: async (_args, ctx) => {
			ui = ctx;
			await showTitle(ctx);
		},
	});
}
