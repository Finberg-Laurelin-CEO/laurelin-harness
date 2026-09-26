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
const CHECK_NAMES = ["prose", "numbers", "layout", "location", "word for word", "evidence"];
const MARK_PATH = join(homedir(), "Laurelin_Brand_Assets", "imagery", "reference", "brand", "laurelin-mark.png");

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
		const color = classification === "green" ? "success" : classification === "yellow" ? "warning" : "error";
		const dot = t.fg("dim", " · ");
		ui.ui.setStatus(
			"laurelin",
			t.fg(color, t.bold(`■ ${classification.toUpperCase()}`)) +
				dot +
				t.fg("muted", ui.model?.id ?? "no model") +
				dot +
				t.fg("muted", worker),
		);
	};

	const checksWidget = () => {
		if (!ui?.hasUI) return;
		ui.ui.setWidget(
			"checks",
			(_tui, theme) => {
				const lines = CHECK_NAMES.map((name) => {
					const c = checks.get(name) ?? { state: "none" as CheckState };
					const light =
						c.state === "pass"
							? theme.fg("success", "●")
							: c.state === "fail"
								? theme.fg("error", "●")
								: c.state === "skipped"
									? theme.fg("warning", "○")
									: theme.fg("dim", "○");
					const label = c.state === "none" ? theme.fg("dim", name) : name;
					const detail = c.detail ? "  " + theme.fg(c.state === "fail" ? "error" : "muted", c.detail) : "";
					return ` ${light} ${label}${detail}`;
				});
				return { render: (w: number) => lines.map((l) => truncateToWidth(l, w, "…")), invalidate() {} };
			},
			{ placement: "belowEditor" },
		);
	};

	const approvalsWidget = () => {
		if (!ui?.hasUI) return;
		if (approvals.length === 0) return ui.ui.setWidget("approvals", undefined);
		const t = ui.ui.theme;
		ui.ui.setWidget(
			"approvals",
			[` ${t.fg("warning", "■")} ${t.fg("warning", `approvals: ${approvals.length} waiting`)}  ${t.fg("dim", "/approvals")}`],
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
	pi.on("session_start", async (event, ctx) => {
		ui = ctx;
		if (!ctx.hasUI) return;
		badge();
		checksWidget();
		approvalsWidget();
		if (event.reason === "startup") await showTitle(ctx);
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
			ctx.ui.notify(`classification: ${level.toUpperCase()}`, "info");
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
			ctx.ui.notify(`checks: ${checks.size} run, ${fails} failed`, fails ? "warning" : "info");
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
				return ctx.ui.notify(`approvals: ${approvals.length} waiting`, "info");
			}
			await ctx.ui.custom<void>(
				(tui, theme, _kb, done) =>
					new ApprovalsOverlay(theme, approvals, decide, () => tui.requestRender(), () => done()),
				{ overlay: true, overlayOptions: { width: "70%", minWidth: 50, maxHeight: "80%", anchor: "center" } },
			);
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
