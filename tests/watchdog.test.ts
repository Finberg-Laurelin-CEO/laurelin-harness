// The watchdog line says what the agent is doing, and flags a stall only past its limit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { argPreview, clock, fresh, line, stalled } from "../pack/extensions/laurelin-watchdog.ts";

const t = { fg: (_c: string, s: string) => s, bold: (s: string) => s };
const T0 = 1_000_000;

test("clock", () => {
	assert.equal(clock(42_000), "0:42");
	assert.equal(clock(610_000), "10:10");
	assert.equal(clock(3_725_000), "1:02:05");
});

test("thinking: shown with its time, never stalled before the model limit", () => {
	const st = { ...fresh(T0), phase: "thinking" as const };
	assert.match(line(st, t, T0 + 42_000, 600, 300)!, /THINKING\s+0:42/);
	assert.equal(stalled(st, T0 + 299_000, 600, 300), false);
	assert.equal(stalled(st, T0 + 300_000, 600, 300), true);
});

test("a running tool shows its command; quiet past the tool limit is a stall", () => {
	const st = { ...fresh(T0), phase: "tool" as const, tool: "bash", detail: argPreview({ command: "sleep 150 &&\n echo SLEPT" }) };
	assert.match(line(st, t, T0 + 70_000, 600, 300)!, /BASH\s+1:10\s+sleep 150 && echo SLEPT/);
	assert.equal(stalled(st, T0 + 400_000, 600, 300), false); // the model limit does not apply to tools
	const s = line(st, t, T0 + 600_000, 600, 300)!;
	assert.match(s, /STALLED\?\s+BASH quiet 10:00/);
	assert.match(s, /type to steer, Esc to stop/);
});

test("idle draws nothing; waiting for an approval never counts as a stall", () => {
	assert.equal(line(fresh(T0), t, T0 + 9_999_000), undefined);
	const st = { ...fresh(T0), phase: "waiting" as const, detail: "approval" };
	assert.equal(stalled(st, T0 + 9_999_000, 600, 300), false);
	assert.match(line(st, t, T0 + 30_000, 600, 300)!, /WAITING\s+0:30\s+approval/);
});

test("long arguments are cut to one short line", () => {
	assert.ok(argPreview({ code: "x = 1\n".repeat(40) }).length <= 56);
});
