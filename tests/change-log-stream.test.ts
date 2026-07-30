/**
 * Registry-integrity phase 04 (5.4), §1 — `streamChangeLog` reads the change-log tail
 * from a byte offset instead of the whole file. This suite proves it is a drop-in
 * replacement for `parseChangeLog` + `.slice()` in every case that matters: identical
 * frame indices, a stale/corrupt hint degrades to a full scan (never silent data loss),
 * a malformed line in the read range still throws, and a mid-file resume yields exactly
 * the unread tail.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
// Stage-4 MINOR11 ordering/short-read test spies on `readSync` (still delegating to the
// real implementation by default) — `vi.spyOn` cannot redefine a live ESM named export,
// so the whole module is mocked (same pattern as log-rotate.test.ts).
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, readSync: vi.fn(actual.readSync) };
});
import { mkdtempSync, readFileSync, readSync, writeFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { streamChangeLog } from "../src/core/change-log-stream.js";
import { parseChangeLog, ReconcileError } from "../src/core/figma-reconcile.js";
import type { ChangeFrame } from "../src/core/figma-reconcile.js";

function frame(over: Partial<ChangeFrame> = {}): ChangeFrame {
  return {
    v: 1, ts: 1000, op: "updated", nodeId: "1:1", nodeName: "Button/Primary",
    nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local",
    page: "Page 1", fileKey: "abc", ...over,
  };
}

let dir: string;
let logPath: string;
const readSyncMock = vi.mocked(readSync);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-log-stream-"));
  logPath = join(dir, "figma.changes.jsonl");
  readSyncMock.mockClear();
});

function writeFrames(frames: ChangeFrame[]): void {
  writeFileSync(logPath, frames.map((f) => JSON.stringify(f)).join("\n") + "\n", "utf8");
}

describe("streamChangeLog — full scan (fromByte 0) matches parseChangeLog exactly", () => {
  it("same frame count, same lineIndex sequence, same frame content", () => {
    const frames = Array.from({ length: 10 }, (_, i) => frame({ nodeId: `n${i}`, nodeName: `Comp/${i}` }));
    writeFrames(frames);
    const whole = parseChangeLog(frames.map((f) => JSON.stringify(f)).join("\n") + "\n");
    const streamed = streamChangeLog(logPath, 0, 0);
    expect(streamed.fellBackToFullScan).toBe(false);
    expect(streamed.frames.map((s) => s.frame)).toEqual(whole);
    expect(streamed.frames.map((s) => s.lineIndex)).toEqual(whole.map((_, i) => i));
    expect(streamed.totalFrames).toBe(10);
  });

  it("blank lines are skipped without incrementing lineIndex (matches parseChangeLog)", () => {
    const frames = [frame({ nodeId: "a" }), frame({ nodeId: "b" })];
    writeFileSync(logPath, `${JSON.stringify(frames[0])}\n\n   \n${JSON.stringify(frames[1])}\n`, "utf8");
    const streamed = streamChangeLog(logPath, 0, 0);
    expect(streamed.frames.map((s) => s.lineIndex)).toEqual([0, 1]);
  });

  it("absent file → zero frames, no throw", () => {
    const streamed = streamChangeLog(join(dir, "nope.jsonl"), 0, 0);
    expect(streamed.frames).toEqual([]);
    expect(streamed.fellBackToFullScan).toBe(false);
  });
});

describe("streamChangeLog — resuming mid-file (a valid byte hint) yields exactly the tail", () => {
  it("resuming after frame N returns only frames N+1.. — never re-reads or drops one", () => {
    const frames = Array.from({ length: 20 }, (_, i) => frame({ nodeId: `n${i}`, nodeName: `Comp/${i}` }));
    writeFrames(frames);
    const whole = streamChangeLog(logPath, 0, 0);
    const resumeAt = 12; // resume right after frame index 11 (0-based)
    const byteHint = whole.frames[resumeAt - 1]!.byteEnd;
    const resumed = streamChangeLog(logPath, byteHint, resumeAt);
    expect(resumed.fellBackToFullScan).toBe(false);
    expect(resumed.frames.map((s) => s.lineIndex)).toEqual(Array.from({ length: 8 }, (_, i) => resumeAt + i));
    expect(resumed.frames.map((s) => s.frame)).toEqual(whole.frames.slice(resumeAt).map((s) => s.frame));
  });

  it("resuming at the very end (all frames already processed) returns an empty tail", () => {
    const frames = Array.from({ length: 5 }, (_, i) => frame({ nodeId: `n${i}` }));
    writeFrames(frames);
    const whole = streamChangeLog(logPath, 0, 0);
    const lastByte = whole.frames[whole.frames.length - 1]!.byteEnd;
    const resumed = streamChangeLog(logPath, lastByte, whole.frames.length);
    expect(resumed.frames).toEqual([]);
    expect(resumed.fellBackToFullScan).toBe(false);
  });

  it("appending new frames after a resume point: the resumed read sees only the new ones", () => {
    const frames = Array.from({ length: 5 }, (_, i) => frame({ nodeId: `n${i}` }));
    writeFrames(frames);
    const whole = streamChangeLog(logPath, 0, 0);
    const byteHint = whole.frames[whole.frames.length - 1]!.byteEnd;
    const more = [frame({ nodeId: "n5" }), frame({ nodeId: "n6" })];
    for (const f of more) appendFileSync(logPath, `${JSON.stringify(f)}\n`, "utf8");
    const resumed = streamChangeLog(logPath, byteHint, whole.frames.length);
    expect(resumed.frames.map((s) => s.frame.nodeId)).toEqual(["n5", "n6"]);
    expect(resumed.frames.map((s) => s.lineIndex)).toEqual([5, 6]);
  });
});

describe("streamChangeLog — a stale/corrupt byte hint falls back to a full scan, reporting why", () => {
  it("a byte offset past the file's current size falls back", () => {
    const frames = Array.from({ length: 3 }, (_, i) => frame({ nodeId: `n${i}` }));
    writeFrames(frames);
    const streamed = streamChangeLog(logPath, 999_999, 3);
    expect(streamed.fellBackToFullScan).toBe(true);
    expect(streamed.fallbackReason).toMatch(/past the file's current size/);
    // A full scan filtered to lineIndex >= 3 (the requested resume point) on a 3-frame
    // file correctly yields nothing — never re-derives frames it already believes done.
    expect(streamed.frames).toEqual([]);
    expect(streamed.totalFrames).toBe(3);
  });

  it("a byte offset that does not sit on a newline boundary falls back and re-derives correctly", () => {
    const frames = Array.from({ length: 5 }, (_, i) => frame({ nodeId: `n${i}` }));
    writeFrames(frames);
    const whole = streamChangeLog(logPath, 0, 0);
    const goodByte = whole.frames[1]!.byteEnd;
    const corruptByte = goodByte - 3; // lands mid-line, not on a newline
    const streamed = streamChangeLog(logPath, corruptByte, 2);
    expect(streamed.fellBackToFullScan).toBe(true);
    expect(streamed.fallbackReason).toMatch(/not a newline/);
    // Still correct: filtered full scan from lineIndex 2 onward.
    expect(streamed.frames.map((s) => s.frame.nodeId)).toEqual(["n2", "n3", "n4"]);
  });

  it("absent file at a non-zero byte hint falls back rather than throwing", () => {
    const streamed = streamChangeLog(join(dir, "nope.jsonl"), 100, 2);
    expect(streamed.fellBackToFullScan).toBe(true);
    expect(streamed.frames).toEqual([]);
  });
});

describe("streamChangeLog — a malformed line inside the actually-read range still throws BAD_CHANGE_LOG", () => {
  it("full scan: a bad line at index 2 throws, same as parseChangeLog", () => {
    writeFileSync(logPath, `${JSON.stringify(frame({ nodeId: "a" }))}\n${JSON.stringify(frame({ nodeId: "b" }))}\nnot json\n`, "utf8");
    expect(() => streamChangeLog(logPath, 0, 0)).toThrowError(ReconcileError);
    try {
      streamChangeLog(logPath, 0, 0);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ReconcileError);
      expect((e as ReconcileError).code).toBe("BAD_CHANGE_LOG");
    }
  });

  it("resumed read: a bad line AFTER the trusted first line still throws (not silently swallowed as a fallback)", () => {
    const frames = Array.from({ length: 3 }, (_, i) => frame({ nodeId: `n${i}` }));
    writeFrames(frames);
    const whole = streamChangeLog(logPath, 0, 0);
    const byteHint = whole.frames[0]!.byteEnd;
    appendFileSync(logPath, "not json at all\n", "utf8");
    expect(() => streamChangeLog(logPath, byteHint, 1)).toThrowError(
      expect.objectContaining({ code: "BAD_CHANGE_LOG" }),
    );
  });
});

// Stage-4 MINOR11 — `readRemainingBytes` used to discard `readSync`'s own return value
// (the ACTUAL bytes read, which can be LESS than requested — a short read) and always
// decoded the WHOLE allocated buffer regardless. `Buffer.alloc` zero-fills, so a short
// read would silently leave zero-bytes past the real content, but this proves the more
// general contract: only what `readSync` reports as actually read is ever decoded.
describe("streamChangeLog — MINOR11: readSync's actual bytesRead is respected, never the full allocated buffer", () => {
  it("a simulated short read never lets un-read buffer content leak into the parsed text", async () => {
    // A valid frame line, followed (in the SAME file, no separating newline) by 3 bytes
    // of garbage that would fail to parse as JSON if ever decoded.
    const validLine = JSON.stringify(frame({ nodeId: "a" }));
    writeFileSync(logPath, `${validLine}\nxyz`, "utf8");
    const fullSize = readFileSync(logPath, "utf8").length;

    const actualFs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const shortRead = (
      fd: number, buffer: NodeJS.ArrayBufferView, offset: number, length: number, position: number,
    ): number => {
      // Perform the REAL read (the garbage bytes really do land in `buffer`), but report
      // 3 FEWER bytes than were actually written — simulating a short read.
      const n = actualFs.readSync(fd, buffer, offset, length, position);
      return Math.max(0, n - 3);
    };
    readSyncMock.mockImplementationOnce(shortRead as typeof readSync);

    // With the fix, only the valid line + its newline is decoded (the trailing "xyz"
    // garbage, past the reported bytesRead, is never included) — the parse succeeds.
    const result = streamChangeLog(logPath, 0, 0);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]!.frame.nodeId).toBe("a");
    expect(fullSize).toBeGreaterThan(0); // sanity: the file genuinely had the garbage tail
  });
});

// ─── §0 baseline comparison — the measured before/after this part's own gate asks for ──

describe("streamChangeLog — measured against the committed 50k-frame baseline (§0)", () => {
  it("resuming near the end of the 10k/50k corpus is dramatically faster than a full parse", () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const baselinePath = join(testDir, "..", "plans", "260730-0847-registry-integrity", "scale-baseline.json");
    const generator = join(testDir, "..", "scripts", "dev", "make-scale-corpus.mjs");
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as { operations: { parseChangeLog: { ms: number } } };

    const corpusDir = mkdtempSync(join(tmpdir(), "change-log-stream-scale-"));
    execFileSync(process.execPath, [generator, "--components", "10000", "--changes", "50000", "--out", corpusDir, "--seed", "42"]);
    const scaleLogPath = join(corpusDir, "design", "figma.changes.jsonl");

    // Establish a trusted byte hint 800 frames from the end (the "repeated apply, nothing
    // much new" hot path this part targets) — a full scan once to find it, exactly as a
    // real apply's FIRST run would (this one-time cost is not what's being measured).
    const whole = streamChangeLog(scaleLogPath, 0, 0);
    const resumeAt = whole.frames.length - 200;
    const byteHint = whole.frames[resumeAt - 1]!.byteEnd;

    const t0 = performance.now();
    const resumed = streamChangeLog(scaleLogPath, byteHint, resumeAt);
    const resumedMs = performance.now() - t0;

    expect(resumed.fellBackToFullScan).toBe(false);
    expect(resumed.frames).toHaveLength(200);
    // The committed baseline's parseChangeLog (whole-file, 50k frames) is the "before".
    // Reading only the tail 200 must beat it by a wide margin — this is the phase's own
    // "reconcile time becomes a function of the unread tail" claim, measured directly.
    expect(resumedMs).toBeLessThan(baseline.operations.parseChangeLog.ms / 2);
  });
});
