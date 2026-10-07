/**
 * Laurelin graph verify: check a step's result against its contract before the next step uses it.
 *
 * Borrowed idea (not the framework): DeepEval's per-output metrics, judged here by Jev instead of a large
 * model, so a check costs a fraction of a cent and about a second. Cheapest checks run first:
 *
 *   1. sources   if the contract asks for sources, citations, links or references, the result must contain
 *                at least one link, DOI or numbered reference. Plain text check, free.
 *   2. gates     the step may name harness gates: "gates": ["prose", "numbers"]. Each runs on the result
 *                file (LAURELIN_TARGET) and must pass. Exit 0 is pass or skip; exit 1 is fail with one line why.
 *   3. contract  Jev answers one yes/no question: does the result meet "expects" for "task"? Under
 *                LAURELIN_VERIFY_MIN (default 0.6) the step fails and retries with the reason in its prompt.
 *                If Jev cannot answer, this check is skipped and noted, so a Jev outage never stalls a graph.
 *
 * Returns { ok, reason, checks } where checks is a list of short strings for the trace.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const GATES = process.env.LAURELIN_GATES_DIR || join(REPO, "pack", "gates");
const MIN = Number(process.env.LAURELIN_VERIFY_MIN) || 0.6;
const RESULT_CHARS = 12000;

export const ASKS_FOR_SOURCES = /\b(source[sd]?|cit(e|ed|ation|ations)|link(s|ed)?|reference[sd]?)\b/i;
export const HAS_SOURCES = /(https?:\/\/\S+|\bdoi\.org\/\S+|\bDOI:\s*\S+|\[\d+\])/i;

function jevBin() {
	if (process.env.JEV_BIN) return process.env.JEV_BIN;
	const local = join(REPO, "bin", "jev");
	return existsSync(local) ? local : "jev";
}

/** The Jev request for the contract check. */
export function contractRequest(step, output) {
	return {
		state: { task: step.task, done_means: step.expects, result: String(output).slice(0, RESULT_CHARS) },
		questions: {
			meets: {
				type: "noul",
				instructions:
					"Does `result` fully meet `done_means` for `task`? Answer no if anything `done_means` requires is missing, " +
					"if the result is only a plan or a partial draft, or if it is about a different task.",
			},
		},
	};
}

export async function verify(_graph, step, output, ctx = {}) {
	const checks = [];

	// 1. sources
	if (ASKS_FOR_SOURCES.test(step.expects ?? "")) {
		if (!HAS_SOURCES.test(output)) return { ok: false, reason: "the contract asks for sources, and the result has no link, DOI or numbered reference", checks: [...checks, "sources: missing"] };
		checks.push("sources: ok");
	}

	// 2. gates named by the step
	for (const g of step.gates ?? []) {
		if (!/^[a-z0-9-]+$/.test(g) || !existsSync(join(GATES, `${g}.sh`))) return { ok: false, reason: `unknown gate "${g}"`, checks };
		if (!ctx.outFile) {
			checks.push(`gate ${g}: no file`);
			continue;
		}
		const r = spawnSync("bash", [join(GATES, `${g}.sh`)], {
			cwd: dirname(dirname(ctx.outFile)),
			env: { ...process.env, LAURELIN_TARGET: ctx.outFile },
			encoding: "utf8",
			timeout: 120_000,
		});
		const line = (r.stdout || r.stderr || "").trim().split("\n").pop() ?? "";
		if (r.status !== 0) return { ok: false, reason: `gate ${g} failed: ${line}`, checks: [...checks, `gate ${g}: fail`] };
		checks.push(`gate ${g}: ${/skip/i.test(line) ? "skipped" : "ok"}`);
	}

	// 3. the contract, judged by Jev
	const r = spawnSync(jevBin(), ["--raw"], { input: JSON.stringify(contractRequest(step, output)), encoding: "utf8", timeout: 60_000 });
	let p;
	try {
		if (r.status !== 0) throw new Error((r.stderr || "").trim().slice(0, 120));
		p = Number(JSON.parse(r.stdout).answers.meets.noul);
		if (!Number.isFinite(p)) throw new Error("no answer");
	} catch (e) {
		checks.push(`contract: skipped (Jev unavailable: ${String(e.message ?? e).slice(0, 80)})`);
		return { ok: true, reason: "", checks };
	}
	checks.push(`contract ${p.toFixed(2)}`);
	if (p < MIN) return { ok: false, reason: `Jev judged that the result does not meet "${step.expects}" (${p.toFixed(2)})`, checks };
	return { ok: true, reason: "", checks };
}
