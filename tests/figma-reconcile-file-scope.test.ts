/**
 * Registry-integrity phase 03 (5.2), §2 — `ui figma reconcile --file-slug <slug>` narrows
 * every downstream computation (delta, apply, blocking, cursor) to one Figma file's own
 * identity inside a change-log that may carry more than one file's frames (a broker
 * relaying several tabs before binding solidifies, or a pre-partitioning legacy log).
 *
 * Companion suites: `tests/cmd-figma-reconcile.test.ts`'s `coalesceFrames` file-identity
 * describe block covers §1 (the pure transform); `tests/figma-sync-state.test.ts` covers
 * the `byFile` round-trip at the state-file layer. This file exercises the COMMAND's own
 * filtering / per-file-cursor / cross-file blocking-isolation wiring end to end.
 *
 * A foreign frame is FILTERED and counted (`skipped_foreign_frames`), never rejected — a
 * mixed log is an expected transitional state, not an error.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import type { ChangeFrame } from "../src/core/figma-reconcile.js";
import { syncStatePath, type SyncState } from "../src/core/figma-sync-state.js";

let dir: string;

function frame(over: Partial<ChangeFrame> & { nodeId: string; fileKey: string }): ChangeFrame {
  return {
    v: 1, ts: 1000, op: "created", nodeName: `Comp/${over.nodeId}`, nodeType: "COMPONENT",
    changedProps: [], origin: "LOCAL", scopeHint: "local", page: "Page 1",
    ...over,
  };
}

function project(frames: ChangeFrame[]): void {
  dir = mkdtempSync(join(tmpdir(), "ui-file-scope-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(
    join(dir, "design", "figma.changes.jsonl"),
    frames.map((f) => JSON.stringify(f)).join("\n") + "\n",
  );
  writeFileSync(
    join(dir, "design", "component-registry.json"),
    JSON.stringify({ version: "0.1.0", components: [] }, null, 2),
  );
}

/** A v2 mirror-capture file naming exactly the given captured nodeIds (real FigmaExportNode
 *  shape — type + name are the validated discriminant). */
function captureFile(names: Record<string, string>): string {
  const payload = {
    v: 2,
    captured: Object.entries(names).map(([nodeId, name]) => ({ nodeId, name, node: { type: "FRAME", name } })),
    failed: [],
    dropped: [],
  };
  const path = join(dir, `capture-${Date.now()}-${Math.random()}.json`);
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

function readState(): SyncState {
  return JSON.parse(readFileSync(syncStatePath(dir), "utf8"));
}

/** `run` writes to real stdout — capture it (cmd-test convention). */
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

function reconcile(extra: string[]): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--json", ...extra]).out);
}

describe("ui figma reconcile --file-slug — dry-run narrows the delta, never rejects a mixed log", () => {
  it("previews only the bound file's targets; a foreign frame is filtered and counted", () => {
    project([
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" }),
      frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/One" }),
      frame({ nodeId: "a2", fileKey: "fileA", nodeName: "Ax/Two" }),
    ]);
    const env = reconcile(["--file-slug", "fileA"]);
    expect(env.ok).toBe(true);
    expect(env.data.delta.added.map((e: { name: string }) => e.name).sort()).toEqual(["Ax/One", "Ax/Two"]);
    expect(env.data.file_slug).toBe("fileA");
    expect(env.data.skipped_foreign_frames).toBe(1);
  });

  it("omitting --file-slug still previews the whole mixed log — the manual, unfiltered escape hatch", () => {
    project([
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" }),
      frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/One" }),
    ]);
    const env = reconcile([]);
    expect(env.ok).toBe(true);
    expect(env.data.delta.added.map((e: { name: string }) => e.name).sort()).toEqual(["Ax/One", "Bx/One"]);
    expect(env.data.file_slug).toBeUndefined();
    expect(env.data.skipped_foreign_frames).toBeUndefined();
  });

  it("--file-slug must be a non-empty string (BAD_ARG)", () => {
    project([frame({ nodeId: "a1", fileKey: "fileA" })]);
    const env = reconcile(["--file-slug", ""]);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("BAD_ARG");
  });
});

describe("ui figma reconcile --apply --file-slug — per-file cursor (byFile)", () => {
  it("advances byFile[slug] only; the global cursor is left untouched", () => {
    project([
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" }),
      frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/One" }),
    ]);
    const mirror = captureFile({ a1: "Ax/One" });
    const env = reconcile(["--apply", "--file-slug", "fileA", "--mirror-file", mirror]);
    expect(env.ok).toBe(true);
    expect(env.data.apply.added).toEqual(["Ax/One"]);
    const state = readState();
    expect(state.cursor).toBe(0); // global cursor untouched by a filtered run
    expect(state.byFile).toEqual({ fileA: 2 }); // nothing blocks fileA → advances to frames.length
  });

  it("a second file's own filtered run starts fresh at 0 — never wherever fileA's run left off", () => {
    project([
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" }),
      frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/One" }),
    ]);
    reconcile(["--apply", "--file-slug", "fileA", "--mirror-file", captureFile({ a1: "Ax/One" })]);
    const envB = reconcile(["--apply", "--file-slug", "fileB", "--mirror-file", captureFile({ b1: "Bx/One" })]);
    expect(envB.ok).toBe(true);
    expect(envB.data.cursor_from).toBe(0);
    expect(envB.data.apply.added).toEqual(["Bx/One"]);
    expect(readState().byFile).toEqual({ fileA: 2, fileB: 2 });
  });

  it("an unfiltered apply still advances the global cursor across every file (the escape hatch)", () => {
    project([
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" }),
      frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/One" }),
    ]);
    const env = reconcile(["--apply", "--mirror-file", captureFile({ a1: "Ax/One", b1: "Bx/One" })]);
    expect(env.ok).toBe(true);
    expect(readState().cursor).toBe(2);
    expect(readState().byFile).toBeUndefined();
  });
});

describe("legacy migration — byFile seeds from the pre-existing global cursor on first filtered use", () => {
  it("a pre-existing {cursor: N}-only state seeds the filtered run's cursorFrom from N, not 0", () => {
    project([
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One", ts: 1 }),
      frame({ nodeId: "a2", fileKey: "fileA", nodeName: "Ax/Two", ts: 2 }),
    ]);
    writeFileSync(syncStatePath(dir), JSON.stringify({ cursor: 1 }));
    const env = reconcile(["--apply", "--file-slug", "fileA", "--mirror-file", captureFile({ a2: "Ax/Two" })]);
    expect(env.ok).toBe(true);
    expect(env.data.cursor_from).toBe(1); // seeded from the legacy global cursor, not 0
    expect(env.data.apply.added).toEqual(["Ax/Two"]);
    expect(readState().byFile).toEqual({ fileA: 2 });
    expect(readState().cursor).toBe(1); // the legacy global field itself is left untouched
  });
});

describe("cross-file isolation — a foreign file's pending target never gates THIS file's cursor", () => {
  it("fileA's own unresolved ADD blocks only fileA's cursor; fileB's filtered run is unaffected", () => {
    project([
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" }), // absolute frame 0
      frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/One" }), // absolute frame 1
    ]);
    // No --mirror-file: both ADDs stay in report.pending (nothing to materialize a new
    // component from) — exactly the "unfinished, blocks the cursor" case the retry queue
    // exists for (see figma-reconcile-cursor.test.ts).
    const runA = reconcile(["--apply", "--file-slug", "fileA"]);
    expect(runA.ok).toBe(true);
    expect(readState().byFile).toEqual({ fileA: 0 }); // blocked at fileA's own frame

    const runB = reconcile(["--apply", "--file-slug", "fileB"]);
    expect(runB.ok).toBe(true);
    expect(runB.data.cursor_from).toBe(0); // fileB's own cursor, untouched by fileA's run
    expect(readState().byFile).toEqual({ fileA: 0, fileB: 1 }); // fileA's entry left exactly as-is

    const pending = readState().pending!;
    expect(pending).toHaveLength(2);
    expect(pending.find((p) => p.nodeId === "a1")).toMatchObject({ fileSlug: "fileA", firstFrameIndex: 0 });
    expect(pending.find((p) => p.nodeId === "b1")).toMatchObject({ fileSlug: "fileB", firstFrameIndex: 1 });
  });
});
