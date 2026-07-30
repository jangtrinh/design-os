/**
 * Registry-integrity phase 04 (5.4), §2 — direct unit coverage for the kernel's
 * `readRotateMarker` (a read-only duplicate of figma-agent's `log-rotate.ts` marker
 * shape — see that module's own header for why duplication, not import, is correct
 * here). Exercised indirectly through `tests/figma-reconcile-rotation.test.ts`'s command-
 * level suite; this file targets the reader's own degrade-safely contract directly.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readRotateMarker } from "../src/core/change-log-rotation.js";

const dirs: string[] = [];
function tmpPath(): string {
  const d = mkdtempSync(join(tmpdir(), "change-log-rotation-"));
  dirs.push(d);
  return join(d, "figma.changes.jsonl");
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("readRotateMarker", () => {
  it("undefined when no marker file exists", () => {
    expect(readRotateMarker(tmpPath())).toBeUndefined();
  });

  it("round-trips a well-formed marker", () => {
    const path = tmpPath();
    writeFileSync(`${path}.rotated.json`, JSON.stringify({ atLine: 42, atByte: 12345, ts: 1700000000000 }), "utf8");
    expect(readRotateMarker(path)).toEqual({ atLine: 42, atByte: 12345, ts: 1700000000000 });
  });

  it("undefined for malformed JSON (never throws)", () => {
    const path = tmpPath();
    writeFileSync(`${path}.rotated.json`, "{not json", "utf8");
    expect(readRotateMarker(path)).toBeUndefined();
  });

  it("undefined for a marker missing atLine or ts — those stay required", () => {
    const path = tmpPath();
    writeFileSync(`${path}.rotated.json`, JSON.stringify({ ts: 1 }), "utf8");
    expect(readRotateMarker(path)).toBeUndefined();
    writeFileSync(`${path}.rotated.json`, JSON.stringify({ atLine: 1 }), "utf8");
    expect(readRotateMarker(path)).toBeUndefined();
  });

  // Stage-4 MINOR16 — `atByte` is demoted to OPTIONAL: the kernel's only consumer never
  // reads it (a confirmed rotation always resets to a byte-0 full scan), so a marker
  // missing it entirely is no longer treated as malformed.
  it("a marker missing atByte entirely still validates — atByte is optional (stage-4 MINOR16)", () => {
    const path = tmpPath();
    writeFileSync(`${path}.rotated.json`, JSON.stringify({ atLine: 42, ts: 1700000000000 }), "utf8");
    expect(readRotateMarker(path)).toEqual({ atLine: 42, ts: 1700000000000 });
  });

  it("undefined for an out-of-range field (negative or non-integer)", () => {
    const path = tmpPath();
    writeFileSync(`${path}.rotated.json`, JSON.stringify({ atLine: -1, atByte: 0, ts: 1 }), "utf8");
    expect(readRotateMarker(path)).toBeUndefined();
    writeFileSync(`${path}.rotated.json`, JSON.stringify({ atLine: 1.5, atByte: 0, ts: 1 }), "utf8");
    expect(readRotateMarker(path)).toBeUndefined();
    // atByte itself, when PRESENT, is still validated (present-and-invalid still rejects
    // the whole marker — only its absence is now tolerated).
    writeFileSync(`${path}.rotated.json`, JSON.stringify({ atLine: 1, atByte: -1, ts: 1 }), "utf8");
    expect(readRotateMarker(path)).toBeUndefined();
  });
});
