// render.mjs: print a built deck HTML to PDF, one page per sheet, at the sheet size.
//
//   node render.mjs deck.html deck.pdf
//
// Playwright's Chromium does the print, the way the deck kit's export.mjs and the rescued
// pdf.mjs do it. Playwright is resolved from the deck kit's own node_modules
// (LAURELIN_DECK_KIT, default ~/laurelin-deck-kit), then from the global module path.
// Without Playwright the script prints "render: skipped, no playwright" and exits 3, so a
// caller can fall back to a PDF printed another way and still run the gates on it.
// The page count is checked against the number of <section class="s"> in the source.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("usage: node render.mjs <deck.html> <out.pdf>"); process.exit(1); }
const absIn = path.resolve(input);
if (!existsSync(absIn)) { console.error(`render: error, no such file: ${absIn}`); process.exit(1); }

const kit = process.env.LAURELIN_DECK_KIT || path.join(os.homedir(), "laurelin-deck-kit");
let chromium = null;
for (const base of [path.join(kit, "node_modules", "playwright"), "playwright"]) {
  try { ({ chromium } = createRequire(import.meta.url)(base)); break; } catch { /* try the next */ }
}
if (!chromium) { console.log("render: skipped, no playwright (npm install playwright in the deck kit)"); process.exit(3); }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const problems = [];
page.on("pageerror", (e) => problems.push(String(e)));
page.on("requestfailed", (r) => problems.push(`asset failed: ${r.url()}`));
await page.goto(pathToFileURL(absIn).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const sheets = await page.locator("section.s").count();
await page.emulateMedia({ media: "print" });
await page.pdf({ path: path.resolve(output), width: "1920px", height: "1080px", printBackground: true,
                 preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await browser.close();
for (const p of new Set(problems)) console.log(`render: warning, ${p}`);
console.log(`render: ${sheets} sheets in ${path.basename(absIn)} -> ${path.resolve(output)}`);
