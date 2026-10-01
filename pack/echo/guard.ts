// Pure helpers for echo_write (no imports), so tests run under plain Node.

/** Numbers, dates, links and quoted passages in a draft. */
export function claims(draft: string): string[] {
	const found = new Set<string>();
	for (const m of draft.matchAll(/https?:\/\/[^\s)>\]"]+/g)) found.add(m[0].replace(/[.,;:]+$/, ""));
	for (const m of draft.matchAll(/["“]([^"”]{12,200})["”]/g)) found.add(`"${m[1]}"`);
	for (const m of draft.matchAll(/\$?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|k|K|M|B|million|billion)?/g)) {
		const v = m[0].trim();
		if (/^\d$/.test(v)) continue; // lone digits ("2 sentences") are noise
		found.add(v);
	}
	return [...found];
}

const norm = (s: string) => s.toLowerCase().replace(/[\s,$"“”]/g, "");

/** The claims in a draft that do not appear in the facts. */
export function unsupported(draft: string, facts: string[]): string[] {
	const pool = norm(facts.join(" "));
	return claims(draft).filter((c) => {
		const n = norm(c);
		if (!n) return false;
		if (c.startsWith('"')) return !pool.includes(norm(c.slice(1, -1)));
		return !pool.includes(n);
	});
}

export function buildPrompt(task: string, facts: string[], samples: string[]): string {
	const parts = [
		`Task: ${task}`,
		"",
		"Facts, in order:",
		...facts.map((f, i) => `${i + 1}. ${f}`),
		"",
		"Use only these facts. Add no quotes, citations, links, dates, numbers or names that are not in the facts.",
	];
	if (samples.length) parts.push("", "Writing samples by this person, for voice only (not as facts):", ...samples.map((s, i) => `--- sample ${i + 1} ---\n${s}`));
	return parts.join("\n");
}
