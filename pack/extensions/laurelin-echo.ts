/**
 * Laurelin echo_write: Fulcrum's Echo writes in a named person's voice (https://echo.fulcrum.inc/dev/).
 *
 * The agent gathers the facts; Echo only does the wording. Echo's own docs warn that it "invents evidence"
 * (quotes, citations, links, dates, statistics), so the tool:
 *   1. sends the facts as an ordered list and tells Echo to add none of its own;
 *   2. checks the draft afterwards: every number, date, link and quotation must appear in the facts.
 *      Anything else comes back flagged as UNSUPPORTED for the agent to remove or source.
 *
 * Key: FULCRUM_ECHO_API_KEY (key store). Default persona: LAURELIN_ECHO_PERSONA, else "Joe Finberg".
 * A lesser-known persona needs writing samples: pass file paths in `samples`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { Type } from "typebox";
import { buildPrompt, unsupported } from "../echo/guard.ts";

const BASE = process.env.FULCRUM_ECHO_BASE_URL || "https://echo.fulcrum.inc/api/v1";
const SAMPLE_CHARS = 6000;
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "echo_write",
		label: "Write in a person's voice (Echo)",
		description:
			"Draft prose in a named person's voice with Fulcrum's Echo (default: Joe Finberg). Give the task and the facts in " +
			"order; Echo does only the wording. Echo can invent evidence, so every number, date, link or quote in the draft " +
			"that is not in the facts comes back flagged UNSUPPORTED: remove or source each before using the draft. For " +
			"Joe's voice, pass a few of his past emails or posts as `samples` (file paths).",
		parameters: Type.Object({
			task: Type.String({ description: "What to write, e.g. 'a 120-word investor update email'" }),
			facts: Type.Array(Type.String(), { description: "Every fact the text may use, in the order to use them" }),
			persona: Type.Optional(Type.String({ description: "Whose voice; default Joe Finberg" })),
			samples: Type.Optional(Type.Array(Type.String(), { description: "Paths to writing samples by the persona" })),
			effort: Type.Optional(Type.String({ description: "low, medium, high or max (default medium)" })),
			max_tokens: Type.Optional(Type.Number()),
		}),
		async execute(_id, p, signal) {
			const key = process.env.FULCRUM_ECHO_API_KEY;
			if (!key) throw new Error("No FULCRUM_ECHO_API_KEY. Run: laurelin-agent keys add FULCRUM_ECHO_API_KEY");
			const persona = p.persona || process.env.LAURELIN_ECHO_PERSONA || "Joe Finberg";
			const samples = (p.samples ?? []).map((f: string) => readFileSync(f, "utf8").slice(0, SAMPLE_CHARS));
			const res = await fetch(`${BASE}/chat/completions`, {
				method: "POST",
				signal,
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
				body: JSON.stringify({
					model: "echo",
					persona,
					reasoning_effort: p.effort || "medium",
					max_tokens: p.max_tokens || 4000,
					messages: [{ role: "user", content: buildPrompt(p.task, p.facts, samples) }],
				}),
			});
			if (!res.ok) throw new Error(`Echo HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
			const body: any = await res.json();
			const draft: string = body?.choices?.[0]?.message?.content ?? "";
			if (!draft) throw new Error("Echo returned no text");
			const flagged = unsupported(draft, p.facts);
			const note = flagged.length
				? `\n\nUNSUPPORTED (not in the facts; remove or source each before use):\n${flagged.map((f) => `- ${f}`).join("\n")}`
				: "\n\nEvery number, date, link and quote in the draft is in the facts.";
			return text(`Draft in the voice of ${persona}:\n\n${draft}${note}`);
		},
	});
}
