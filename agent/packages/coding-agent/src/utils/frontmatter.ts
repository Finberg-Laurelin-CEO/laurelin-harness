import { parse } from "yaml";

type ParsedFrontmatter<T extends Record<string, unknown>> = {
	frontmatter: T;
	body: string;
};

const normalizeNewlines = (value: string): string =>
	value
		.replace(/^\uFEFF/, "")
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n");

const extractFrontmatter = (content: string): { yamlString: string | null; body: string } => {
	const normalized = normalizeNewlines(content);

	if (!normalized.startsWith("---")) {
		return { yamlString: null, body: normalized };
	}

	const endIndex = normalized.indexOf("\n---", 3);
	if (endIndex === -1) {
		return { yamlString: null, body: normalized };
	}

	return {
		yamlString: normalized.slice(4, endIndex),
		body: normalized.slice(endIndex + 4).trim(),
	};
};

const looseFrontmatter = (yamlString: string): Record<string, string> | null => {
	const out: Record<string, string> = {};
	for (const line of yamlString.split("\n")) {
		const m = /^([A-Za-z_][A-Za-z0-9_-]*):\s?(.*)$/.exec(line);
		if (m) out[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
	}
	return out.name || out.description ? out : null;
};

export const parseFrontmatter = <T extends Record<string, unknown> = Record<string, unknown>>(
	content: string,
): ParsedFrontmatter<T> => {
	const { yamlString, body } = extractFrontmatter(content);
	if (!yamlString) {
		return { frontmatter: {} as T, body };
	}
	let parsed: unknown;
	try {
		parsed = parse(yamlString);
	} catch (error) {
		// laurelin fork: many published skills put an unquoted colon in a one-line description,
		// which strict YAML rejects. Fall back to reading top-level "key: value" lines literally.
		const loose = looseFrontmatter(yamlString);
		if (!loose) throw error;
		parsed = loose;
	}
	return { frontmatter: (parsed ?? {}) as T, body };
};

export const stripFrontmatter = (content: string): string => parseFrontmatter(content).body;
