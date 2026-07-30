/**
 * Registry-integrity phase 04 (5.4), §2 — reconcile's own side of log rotation: a
 * `.rotated.json` marker (written by figma-agent's `log-rotate.ts`, on the broker's
 * append path) is what lets a persisted cursor recognize its absolute numbering no
 * longer corresponds to anything in the fresh (post-rotation) live file, so it resets to
 * 0 for that file's own numbering and reports the gap — rather than either silently
 * re-deriving nothing (stuck) or misreading the new file's own line 0 as wherever the
 * old cursor thought it was. This is the part of the phase most likely to destroy or
 * strand real history, hence the most tests.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import type { ChangeFrame } from "../src/core/figma-reconcile.js";
import { syncStatePath, type SyncState } from "../src/core/figma-sync-state.js";

let dir: string;

function frame(nodeId: string, name: string, ts: number): ChangeFrame {
  return {
    v: 1, ts, op: "updated", nodeId, nodeName: name, nodeType: "COMPONENT",
    changedProps: ["fills"], origin: "LOCAL", scopeHint: "local", page: "Page 1", fileKey: "abc",
  };
}

/** Names must satisfy the registry's Category/Variant, letters-only pattern. */
const NAMES = ["Comp/Aa", "Comp/Bb", "Comp/Cc", "Comp/Dd", "Comp/Ee", "Comp/Xx", "Comp/Yy", "Comp/Zz"];

function project(frames: ChangeFrame[]): void {
  dir = mkdtempSync(join(tmpdir(), "ui-rotation-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(join(dir, "design", "figma.changes.jsonl"), frames.map((f) => JSON.stringify(f)).join("\n") + "\n");
  writeFileSync(join(dir, "design", "component-registry.json"), JSON.stringify({
    version: "0.1.0",
    components: NAMES.map((name) => ({ name, category: name.split("/")[0], markup: "<div></div>", tokensUsed: [], scope: "local" })),
  }, null, 2));
}

function readState(): SyncState {
  return JSON.parse(readFileSync(syncStatePath(dir), "utf8"));
}

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { out += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyJson(extra: string[] = []): Record<string, any> {
  return JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--apply", "--json", ...extra]).out);
}

function logPath(): string {
  return join(dir, "design", "figma.changes.jsonl");
}

/** Simulate the broker's OWN rotation (figma-agent's `log-rotate.ts`): replace the live
 *  file with fresh post-rotation content and write the marker recording the PRE-rotation
 *  totals — exactly what `rotateIfNeeded` does, without spinning up figma-agent's own
 *  transport layer (a repo-root test cannot import it — cross-package boundary). */
function simulateRotation(atLine: number, newFrames: ChangeFrame[]): void {
  writeFileSync(logPath(), newFrames.map((f) => JSON.stringify(f)).join("\n") + "\n");
  writeFileSync(`${logPath()}.rotated.json`, JSON.stringify({ atLine, atByte: 999_999, ts: Date.now() }, null, 2) + "\n");
}

beforeEach(() => {
  project([frame("n0", "Comp/Aa", 0), frame("n1", "Comp/Bb", 1), frame("n2", "Comp/Cc", 2), frame("n3", "Comp/Dd", 3), frame("n4", "Comp/Ee", 4)]);
});

describe("a rotated log with a stale persisted cursor — reset, never silent re-apply", () => {
  it("first apply catches up cleanly (no rotation yet)", () => {
    const env = applyJson([]);
    expect(env.ok).toBe(true);
    expect(readState().cursor).toBe(5);
    expect(typeof readState().cursorByte).toBe("number");
  });

  it("after rotation, the next apply resets to 0 and reports rotated_away_lines — never stuck, never a silent re-apply of vanished history", () => {
    applyJson([]); // cursor=5, a real byte hint pointing into the pre-rotation file
    expect(readState().cursor).toBe(5);

    // Simulate: 15 MORE frames accumulated after our cursor caught up (never applied by
    // us — a different run, or accrued before this project bound), THEN the log rotated
    // at 20 total lines. The fresh live file starts over with 3 brand-new frames.
    simulateRotation(20, [frame("m0", "Comp/Xx", 100), frame("m1", "Comp/Yy", 101), frame("m2", "Comp/Zz", 102)]);

    const env = applyJson([]);
    expect(env.ok).toBe(true);
    expect(env.data.cursor_from).toBe(0); // reset — the OLD numbering is gone from the live file
    expect(env.data.rotated_away_lines).toBe(15); // 20 (marker) - 5 (our own last-known cursor)
    expect(env.data.cursor_to).toBe(3); // the fresh file's own 3 frames, numbered from 0
    expect(readState().cursor).toBe(3); // per-file numbering restarted, not the stale absolute 20/25

    // The three NEW frames actually landed (scope refresh on real, pre-existing records) —
    // never silently dropped, never conflated with the vanished 15.
    const registry = JSON.parse(readFileSync(join(dir, "design", "component-registry.json"), "utf8"));
    expect(registry.components.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(["Comp/Xx", "Comp/Yy", "Comp/Zz"]),
    );
  });

  it("a fully-caught-up cursor at the exact rotation boundary reports rotated_away_lines: 0 (nothing was actually missed)", () => {
    applyJson([]); // cursor=5
    simulateRotation(5, [frame("m0", "Comp/Xx", 100)]); // rotated exactly where we'd already reached
    const env = applyJson([]);
    expect(env.ok).toBe(true);
    expect(env.data.rotated_away_lines).toBeUndefined(); // 0 is omitted, same convention as other optional envelope fields
    expect(env.data.cursor_from).toBe(0);
    expect(env.data.cursor_to).toBe(1);
  });

  it("a THIRD run after the reset behaves normally — the byte hint is trusted again, no repeated fallback", () => {
    applyJson([]); // cursor=5
    simulateRotation(20, [frame("m0", "Comp/Xx", 100)]);
    applyJson([]); // reset run: cursor=1 (post-rotation numbering), fresh byte hint established

    // A normal run with nothing new: the byte hint now verifies cleanly (no rotation
    // marker confusion carried forward — the STALE marker file is harmless once the
    // cursor's own byte hint is fresh and valid again).
    const env = applyJson([]);
    expect(env.ok).toBe(true);
    expect(env.data.rotated_away_lines).toBeUndefined();
    expect(env.data.cursor_from).toBe(1);
    expect(env.data.cursor_to).toBe(1);
  });

  it("stage-4 MAJOR4: no rotation marker present — a stale byte hint (hand-truncated file) resets and reports a history gap, and the truncated file's OWN new content actually lands (not silently excluded by the now-meaningless stale line number)", () => {
    applyJson([]); // cursor=5, real byte hint
    // Truncate the live file WITHOUT the rotation marker (a hand-edit/corruption, not a
    // real rotation) — one NEW frame, numbered 0 in this now-different file, that
    // promotes Comp/Aa's scope: an unambiguous, observable "did this actually get read"
    // signal. Before MAJOR4, the stale persisted fromLine (5) would filter this out
    // entirely (a 1-frame file has nothing at index >= 5) — silently dropping it while
    // still reporting `ok: true` and quietly "catching up" the cursor.
    writeFileSync(logPath(), `${JSON.stringify({ ...frame("n0", "Comp/Aa", 0), scopeHint: "global", origin: "REMOTE" })}\n`);
    const env = applyJson([]);
    expect(env.ok).toBe(true);
    expect(env.data.rotated_away_lines).toBeUndefined(); // no marker → never attributed to rotation
    expect(env.data.history_gap_lines).toBe(5); // named honestly — the stale cursor's own prior claim
    expect(env.data.cursor_from).toBe(0); // reset — never filtered by the now-meaningless stale line 5
    expect(env.data.cursor_to).toBe(1);
    // Proof it actually landed: Comp/Aa's scope promoted to global — the frame was READ,
    // not silently excluded.
    const registry = JSON.parse(readFileSync(join(dir, "design", "component-registry.json"), "utf8"));
    const rec = (registry.components as { name: string; scope?: string }[]).find((c) => c.name === "Comp/Aa");
    expect(rec?.scope).toBe("global");
  });

  it("BLOCKER1 (stage-4): safeCursorTo clamps to cursorTo, and a pending entry rebases to 0 after a confirmed rotation — a stale pre-rotation index must never leap the cursor past the fresh file's EOF", () => {
    // First run: an unresolved ADD (no --mirror-file) blocks the cursor at its own frame.
    project([
      frame("n0", "Comp/Aa", 0), frame("n1", "Comp/Bb", 1), frame("n2", "Comp/Cc", 2), frame("n3", "Comp/Dd", 3),
      { v: 1, ts: 4, op: "created", nodeId: "newnode", nodeName: "New/Thing", nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local", page: "Page 1", fileKey: "abc" },
    ]);
    const first = applyJson([]);
    expect(first.ok).toBe(true);
    expect(first.data.cursor_to).toBe(4); // blocked at the unresolved ADD's own frame index
    expect(readState().cursor).toBe(4);
    expect(readState().pending).toHaveLength(1);
    expect(readState().pending![0]!.firstFrameIndex).toBe(4);

    // Rotation: 20 total lines existed pre-rotation (well past the blocked cursor of 4),
    // and the fresh live file starts over with only 3 brand-new frames.
    simulateRotation(20, [frame("m0", "Comp/Xx", 100), frame("m1", "Comp/Yy", 101), frame("m2", "Comp/Zz", 102)]);

    const second = applyJson([]);
    expect(second.ok).toBe(true);
    // The stale pending entry's PRE-rotation index (4) must never make the cursor exceed
    // the fresh file's actual total of 3 frames — no leap past EOF.
    expect(second.data.cursor_to).toBeLessThanOrEqual(3);
    expect(readState().cursor).toBeLessThanOrEqual(3);
  });

  it("the text render surfaces the rotation, not just the JSON envelope", () => {
    applyJson([]);
    simulateRotation(20, [frame("m0", "Comp/Xx", 100)]);
    const { out } = capture(["figma", "reconcile", "--dir", dir, "--apply"]);
    expect(out).toMatch(/rotated.*15 frame/);
  });

  // Stage-4 N3 — the rotation rebase must be SCOPED to isBoundToRun(t) (this run's own
  // file, or an untagged legacy entry), never every pending entry: a DIFFERENT real
  // file's entry is invisible to this run's blocking math either way, so rebasing it here
  // is pure waste — worse, it PINS that file's own future safeCursorTo at 0 forever.
  it("N3: a rotation detected during a --file-slug run never rebases a DIFFERENT file's pending entry", () => {
    project([
      { v: 1, ts: 0, op: "updated", nodeId: "b1", nodeName: "Comp/Bb", nodeType: "COMPONENT", changedProps: ["fills"], origin: "LOCAL", scopeHint: "local", page: "Page 1", fileKey: "fileB" },
      { v: 1, ts: 1, op: "created", nodeId: "a1", nodeName: "New/Thing", nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local", page: "Page 1", fileKey: "fileA" },
    ]);

    // Run 1: fileB's own frame resolves cleanly (an ordinary UPDATE to a pre-seeded
    // record) — no pending entry, but its own byFile advances past both frames (nothing
    // of fileB's own blocks it).
    const b1 = applyJson(["--file-slug", "fileB"]);
    expect(b1.ok).toBe(true);
    expect(readState().byFile?.["fileB"]?.line).toBe(2);

    // Run 2: fileA's own frame is an unresolved ADD (no --mirror-file) — stays pending at
    // its OWN absolute index (1), non-zero, so a later "was it rebased to 0" check is
    // meaningful.
    const a1 = applyJson(["--file-slug", "fileA"]);
    expect(a1.ok).toBe(true);
    expect(readState().pending).toHaveLength(1);
    expect(readState().pending![0]).toMatchObject({ fileSlug: "fileA", firstFrameIndex: 1 });

    // Rotation: fileB's OWN stale byte hint (from run 1) is what will trigger detection
    // on its next run — 2 total lines existed pre-rotation, matching what we've seen so
    // far, and the fresh file starts over with ONE new fileB frame.
    simulateRotation(2, [
      { v: 1, ts: 100, op: "updated", nodeId: "b1", nodeName: "Comp/Bb", nodeType: "COMPONENT", changedProps: ["fills"], origin: "LOCAL", scopeHint: "local", page: "Page 1", fileKey: "fileB" },
    ]);

    // Run 3: --file-slug fileB detects the rotation via ITS OWN stale byte hint.
    const b2 = applyJson(["--file-slug", "fileB"]);
    expect(b2.ok).toBe(true);

    // fileA's pending entry — untouched by fileB's run — must still carry its ORIGINAL
    // firstFrameIndex (1), never silently rebased to 0 just because an UNRELATED file's
    // run happened to detect rotation.
    const after = readState();
    expect(after.pending).toHaveLength(1);
    expect(after.pending![0]).toMatchObject({ fileSlug: "fileA", firstFrameIndex: 1 });
  });
});
