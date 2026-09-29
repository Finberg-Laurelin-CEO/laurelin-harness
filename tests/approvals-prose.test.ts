// The approval gate asks only for real outward actions, not for words in prose (Joe, 9/29: "asks for too
// many permissions"). Cases come from the 52 prompts in decision-log/approvals.jsonl, all false alarms.
import assert from "node:assert/strict";
import { test } from "node:test";
import { callText, classifyCall, loadPatterns } from "../pack/extensions/laurelin-approvals.ts";

const patterns = loadPatterns();
const hit = (tool: string, input: unknown) => classifyCall(callText(tool, input), patterns)?.name;

const essay = "Its output rises only with more Canadian reactors, and a utility could purchase tritium forward contracts from Vercel-hosted exchanges.";

test("prose inside code does not ask", () => {
	const quiet: Array<[string, unknown]> = [
		["ipython", { code: `msg = r"""Review of doe.tex (v16). ${essay} Send message to the editor."""\nprint(msg)` }],
		["ipython", { code: `brief = r'''# V6 brief: "Our Kuhnian Moment". ${essay}'''` }],
		["ipython", { code: `r = await agent_message.send(r'''Independent editorial review: ${essay}''')` }],
		["ipython", { code: `for a in soup.find_all("a", href=True):\n    txt = a.get_text(strip=True)` }],
		["ipython", { code: `os.makedirs('V6/drafts', exist_ok=True)\nnow = datetime.datetime.now().isoformat()` }],
		["ipython", { code: `edits = [{'old': r'${essay}', 'new': r'${essay}'}]` }],
		["bash", { command: `git commit -m "Draft: ${essay}"` }],
		["connector_call", { connector: "Gmail", tool: "search_threads", arguments: { query: "forward the purchase order from vercel" } }],
		["bash", { command: "vercel ls && vercel logs my-app" }],
	];
	for (const [tool, input] of quiet) assert.equal(hit(tool, input), undefined, JSON.stringify(input).slice(0, 90));
});

test("real outward actions still ask", () => {
	const loud: Array<[string, unknown, string]> = [
		["bash", { command: "git push origin main" }, "deploy.git-push"],
		["ipython", { code: `subprocess.run("git push origin main", shell=True)` }, "deploy.git-push"],
		["bash", { command: "npx vercel deploy --prod" }, "deploy.vercel"],
		["bash", { command: "cd site && vercel --prod" }, "deploy.vercel"],
		["ipython", { code: `subprocess.run(["vercel", "deploy", "--prod"])` }, "deploy.vercel"],
		["ipython", { code: `await mcp.call_tool("superhuman", "send_draft", {"draft_id": "d1"})` }, "email.tool"],
		["ipython", { code: `await mcp.call_tool("gmail", "forward", {"message_id": "m1", "to": ["a@b.com"]})` }, "email.superhuman-actions"],
		["ipython", { code: "await mcp.superhuman.send_draft(draft_id='d1')" }, "email.superhuman-actions"],
		["connector_call", { connector: "Superhuman_Mail", tool: "unsubscribe", arguments: {} }, "email.superhuman-actions"],
		["ipython", { code: "service.users().messages().send(userId='me', body=m)" }, "email.tool"],
		["bash", { command: "stripe charges create --amount 500" }, "pay.stripe-cli"],
		["ipython", { code: "client.buy_domain(name='laurelin.energy')" }, "pay.generic"],
		["ipython", { code: "shop.create_payment(amount=5)" }, "pay.generic"],
	];
	// Several rules can cover one action (send_draft is in email.tool and email.superhuman-actions):
	// the family (email, deploy, pay) is what must match.
	for (const [tool, input, name] of loud) {
		const got = hit(tool, input);
		assert.ok(got?.startsWith(name.split(".")[0] + "."), `${JSON.stringify(input)} -> ${got}, want ${name}`);
	}
});
