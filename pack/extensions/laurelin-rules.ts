import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Laurelin rules: appends the generic rules file and, if present, the private
 * half from the vault to the system prompt on every turn. PLAN Step 1.
 */
const VAULT_RULES = "/Users/Joe/Documents/Obsidian Vault/Laurelin/LaurelinOS/Harness Rules.md";

function readIfExists(p: string): string {
	try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
}

export default function (pi: ExtensionAPI) {
	const packRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
	const generic = readIfExists(path.join(packRoot, "rules", "laurelin.md"));
	const priv = readIfExists(process.env.LAURELIN_VAULT_RULES || VAULT_RULES);
	if (!generic && !priv) return;
	pi.on("before_agent_start", async (event) => {
		let extra = "\n\n## Laurelin rules\n\n" + generic;
		if (priv) extra += "\n\n## Laurelin rules, private half (from the vault)\n\n" + priv;
		return { systemPrompt: event.systemPrompt + extra };
	});
}
