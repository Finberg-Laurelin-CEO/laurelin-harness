#!/usr/bin/env bun
/**
 * redact-spans: read text on stdin, print the same text with every span that
 * gstack's redact engine finds replaced by <REDACTED:id>.
 *
 * This is the span-replacement half of gstack-redact. The gstack-redact
 * command only auto-redacts a small PII subset; live keys are not in it, so
 * the scrubber calls this helper, which uses the engine's fail-closed
 * `redactFindingSpans` (every finding, overlapping spans merged).
 *
 * Exit 0 and print the body on success. Exit 4 and print nothing when the
 * engine says the paste cannot be spliced safely (a PEM or GCP key body
 * follows its marker); the caller then drops the whole paste.
 */
import { homedir } from "node:os";
import { join } from "node:path";

const enginePath = process.env.GSTACK_REDACT_ENGINE || join(homedir(), ".claude", "skills", "gstack", "lib", "redact-engine.ts");
const { redactFindingSpans } = await import(enginePath);

const chunks: Buffer[] = [];
for await (const c of process.stdin) chunks.push(c as Buffer);
const input = Buffer.concat(chunks).toString("utf8");

const body = redactFindingSpans(input, { repoVisibility: "private" });
if (body === null) process.exit(4);
process.stdout.write(body.replace(/<REDACTED-([^>]+)>/g, "<REDACTED:$1>"));
