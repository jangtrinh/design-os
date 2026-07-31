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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function project(frames: ChangeFrame[], components: any[] = []): void {
  dir = mkdtempSync(join(tmpdir(), "ui-file-scope-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(
    join(dir, "design", "figma.changes.jsonl"),
    frames.map((f) => JSON.stringify(f)).join("\n") + "\n",
  );
  writeFileSync(
    join(dir, "design", "component-registry.json"),
    JSON.stringify({ version: "0.1.0", components }, null, 2),
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
    // nothing blocks fileA → the per-file line cursor advances to frames.length (registry-
    // integrity phase 04 §1 additionally pairs it with a byte seek hint, not asserted here).
    expect(state.byFile?.["fileA"]?.line).toBe(2);
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
    const byFile = readState().byFile;
    expect(byFile?.["fileA"]?.line).toBe(2);
    expect(byFile?.["fileB"]?.line).toBe(2);
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
    expect(readState().byFile?.["fileA"]?.line).toBe(2);
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
    expect(readState().byFile?.["fileA"]?.line).toBe(0); // blocked at fileA's own frame

    const runB = reconcile(["--apply", "--file-slug", "fileB"]);
    expect(runB.ok).toBe(true);
    expect(runB.data.cursor_from).toBe(0); // fileB's own cursor, untouched by fileA's run
    const byFileAfterB = readState().byFile;
    expect(byFileAfterB?.["fileA"]?.line).toBe(0); // fileA's entry left exactly as-is
    expect(byFileAfterB?.["fileB"]?.line).toBe(1);

    const pending = readState().pending!;
    expect(pending).toHaveLength(2);
    expect(pending.find((p) => p.nodeId === "a1")).toMatchObject({ fileSlug: "fileA", firstFrameIndex: 0 });
    expect(pending.find((p) => p.nodeId === "b1")).toMatchObject({ fileSlug: "fileB", firstFrameIndex: 1 });
  });
});

// ─── Fix round (stage-4 review, 3 MAJOR findings) ──────────────────────────────

describe("fix round MAJOR 1 — an unfiltered apply bumps every stale byFile entry, never leaves it to rewind", () => {
  it("a stale byFile[fileA] entry is bumped to the unfiltered cursor, so a later filtered run does not re-derive/re-apply it", () => {
    project([
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" }), // absolute frame 0
      frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/One" }), // absolute frame 1
    ]);
    // Filtered fileA run with NO mirror: a1 stays pending — blocked at its own frame 0.
    reconcile(["--apply", "--file-slug", "fileA"]);
    expect(readState().byFile?.["fileA"]?.line).toBe(0);

    // An UNFILTERED apply now cleanly lands BOTH targets (mirror captures both).
    const env = reconcile(["--apply", "--mirror-file", captureFile({ a1: "Ax/One", b1: "Bx/One" })]);
    expect(env.ok).toBe(true);
    expect(readState().cursor).toBe(2);
    // ← the fix: fileA's stale entry (0) is bumped to the unfiltered cursor (2), not left behind.
    expect(readState().byFile?.["fileA"]?.line).toBe(2);

    // A THIRD run, filtered for fileA again: resumes from 2 (not a rewind to 0), and finds
    // nothing new to re-derive/re-apply.
    const runA = reconcile(["--apply", "--file-slug", "fileA"]);
    expect(runA.ok).toBe(true);
    expect(runA.data.cursor_from).toBe(2);
    expect(runA.data.apply.added).toEqual([]);
  });

  it("never REWINDS an entry that is already further ahead than the unfiltered cursor", () => {
    project([frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" })]);
    // Seed a byFile entry already AHEAD of what an unfiltered run over this 1-frame log
    // would reach (frames.length === 1), simulating a filtered run that raced further.
    writeFileSync(syncStatePath(dir), JSON.stringify({ cursor: 0, byFile: { fileA: { line: 5, byte: 999 } } }));
    const env = reconcile(["--apply", "--mirror-file", captureFile({ a1: "Ax/One" })]);
    expect(env.ok).toBe(true);
    expect(readState().byFile?.["fileA"]).toEqual({ line: 5, byte: 999 }); // untouched, never rewound
  });
});

describe("fix round MAJOR 2 — the 'unknown' bucket is counted separately and named, never auto-adopted", () => {
  it("a frame with neither fileKey nor fileName slugs to 'unknown' — filtered as foreign AND counted as legacy", () => {
    project([
      frame({ nodeId: "u1", fileKey: null as unknown as string, nodeName: "Ux/One" }),
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" }),
    ]);
    const env = reconcile(["--file-slug", "fileA"]);
    expect(env.ok).toBe(true);
    expect(env.data.skipped_foreign_frames).toBe(1);
    expect(env.data.skipped_legacy_frames).toBe(1); // the SAME frame, named specifically
  });

  it("a foreign frame from a REAL other file is never counted as legacy", () => {
    project([
      frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/One" }),
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" }),
    ]);
    const env = reconcile(["--file-slug", "fileA"]);
    expect(env.data.skipped_foreign_frames).toBe(1);
    expect(env.data.skipped_legacy_frames).toBeUndefined(); // omitted when zero, not 0
  });

  it("--file-slug unknown drains the bucket explicitly — the one deliberate recovery path", () => {
    project([frame({ nodeId: "u1", fileKey: null as unknown as string, nodeName: "Ux/One" })]);
    const env = reconcile(["--file-slug", "unknown"]);
    expect(env.ok).toBe(true);
    expect(env.data.delta.added.map((e: { name: string }) => e.name)).toEqual(["Ux/One"]);
    expect(env.data.skipped_foreign_frames).toBe(0);
  });

  it("the text render names the drain command", () => {
    project([
      frame({ nodeId: "u1", fileKey: null as unknown as string, nodeName: "Ux/One" }),
      frame({ nodeId: "a1", fileKey: "fileA", nodeName: "Ax/One" }),
    ]);
    const { out } = capture(["figma", "reconcile", "--dir", dir, "--file-slug", "fileA"]);
    expect(out).toMatch(/--file-slug unknown/);
  });
});

describe("fix round F3 (team-lead ruling: asymmetric, not a migration stamp) — an untagged legacy pending entry never gates a DIFFERENT file's cursor", () => {
  it("an untagged entry does not block the very FIRST filtered run either — no migration/stamp needed", () => {
    project(
      [frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/Clean" })],
      [{ name: "Bx/Clean", category: "Bx", markup: "<div></div>", tokensUsed: [], scope: "local" }],
    );
    writeFileSync(syncStatePath(dir), JSON.stringify({
      cursor: 0,
      pending: [{ nodeId: "legacy1", name: "Comp/Legacy", firstFrameIndex: 0, attempts: 1, lastReason: "x", firstSeenTs: 1 }],
    }));
    const env = reconcile(["--apply", "--file-slug", "fileB"]);
    expect(env.ok).toBe(true);
    expect(env.data.cursor_to).toBe(1); // fileB's own cursor reaches the log's end, unblocked
    // NEVER stamped — the asymmetric predicate needs no migration at all, ruled over the
    // stamp precisely because the stamp rested on an unproven "byFile empty ⇒ single-file
    // project" assumption. Because pruning stays LENIENT while blocking is now STRICT, this
    // untagged entry is ALSO pruned (dropped from `pending`) the moment ANY file's cursor
    // passes its position — it is no longer a permanent wedge, but F3-follow-up (team-lead
    // ruling, option B) requires it never vanish with zero trace: a durable skipHistory
    // record documents exactly this prune.
    const state = readState();
    expect(state.pending).toBeUndefined();
    expect(state.skipHistory).toEqual([
      { nodeId: "legacy1", name: "Comp/Legacy", at: expect.any(Number), reason: "legacy-untagged-pruned", firstFrameIndex: 0, prunedByFileSlug: "fileB" },
    ]);
  });

  // Contrast case: a TAGGED (strictly-matched) own-file entry can only ever leave
  // `pending` via this run's prune when it was already an ACKNOWLEDGED skip (a strictly-
  // bound, non-skipped entry always self-blocks — it is in `blocking`, so `safeCursorTo`
  // can never pass it). An acknowledged skip already had its own durable record before
  // this fix (fix round #4/#111) — that path is UNCHANGED: no `reason`/`prunedByFileSlug`.
  it("a TAGGED own-file prune (ordinary acknowledged skip, strict match) keeps today's plain skipHistory shape — no legacy-untagged reason", () => {
    project(
      [frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/Clean" })],
      [{ name: "Bx/Clean", category: "Bx", markup: "<div></div>", tokensUsed: [], scope: "local" }],
    );
    writeFileSync(syncStatePath(dir), JSON.stringify({
      cursor: 0,
      // Tagged to fileB itself (not untagged) AND already acknowledged-skipped — a strict
      // match, ordinary pruning path that predates this fix round entirely.
      pending: [{ nodeId: "own1", name: "Comp/Own", fileSlug: "fileB", firstFrameIndex: 0, attempts: 1, lastReason: "x", firstSeenTs: 1, skipped: true }],
    }));
    const env = reconcile(["--apply", "--file-slug", "fileB"]);
    expect(env.ok).toBe(true);
    const state = readState();
    expect(state.pending).toBeUndefined(); // pruned same as before this fix
    expect(state.skipHistory).toEqual([{ nodeId: "own1", name: "Comp/Own", at: expect.any(Number) }]); // plain shape, no `reason`
  });

  it("stays unblocked for a SECOND, different file too — no permanent wedge in either order", () => {
    project(
      [
        frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/Clean", ts: 1 }),
        frame({ nodeId: "c1", fileKey: "fileC", nodeName: "Cx/Clean", ts: 2 }),
      ],
      [
        { name: "Bx/Clean", category: "Bx", markup: "<div></div>", tokensUsed: [], scope: "local" },
        { name: "Cx/Clean", category: "Cx", markup: "<div></div>", tokensUsed: [], scope: "local" },
      ],
    );
    writeFileSync(syncStatePath(dir), JSON.stringify({
      cursor: 0,
      pending: [{ nodeId: "legacy1", name: "Comp/Legacy", firstFrameIndex: 0, attempts: 1, lastReason: "x", firstSeenTs: 1 }],
    }));
    reconcile(["--apply", "--file-slug", "fileB"]);
    const envC = reconcile(["--apply", "--file-slug", "fileC"]);
    expect(envC.ok).toBe(true);
    expect(envC.data.cursor_from).toBe(0);
    expect(envC.data.cursor_to).toBe(2); // fileC's own cursor reaches the log's end, unblocked
    expect(readState().byFile?.["fileC"]?.line).toBe(2);
  });

  // Team-lead's required interaction test: does a §2 rotation reset resurrect the
  // "untagged entry gates everyone" wedge? The two fixes are architecturally orthogonal
  // (rotation only changes WHERE the read starts; the strict/lenient predicates apply
  // identically either way) — this proves it empirically, not just by code inspection.
  it("a §2 rotation reset, happening while an untagged legacy pending entry exists, does not resurrect the wedge", () => {
    project(
      [frame({ nodeId: "b1", fileKey: "fileB", nodeName: "Bx/Clean" })],
      [{ name: "Bx/Clean", category: "Bx", markup: "<div></div>", tokensUsed: [], scope: "local" }],
    );
    // Seed a byFile[fileB] byte hint that is now stale (points past the live file's
    // current size) alongside a rotation marker — the exact trigger §2's fallback uses —
    // AND an untagged legacy pending entry, in the SAME state file.
    writeFileSync(syncStatePath(dir), JSON.stringify({
      cursor: 0,
      byFile: { fileB: { line: 2, byte: 999_999 } }, // BEHIND the rotation point (5) — a real gap
      pending: [{ nodeId: "legacy1", name: "Comp/Legacy", firstFrameIndex: 0, attempts: 1, lastReason: "x", firstSeenTs: 1 }],
    }));
    writeFileSync(
      join(dir, "design", "figma.changes.jsonl.rotated.json"),
      JSON.stringify({ atLine: 5, atByte: 999_999, ts: Date.now() }),
    );
    const env = reconcile(["--apply", "--file-slug", "fileB"]);
    expect(env.ok).toBe(true);
    expect(env.data.rotated_away_lines).toBe(3); // marker.atLine(5) - the stale cursor(2)
    expect(env.data.cursor_from).toBe(0); // reset to the fresh file's own numbering
    // The untagged legacy entry did NOT resurrect a block: fileB's cursor still reaches
    // the (single-frame) log's end, exactly as it would with no legacy entry present.
    expect(env.data.cursor_to).toBe(1);
    expect(readState().byFile?.["fileB"]?.line).toBe(1);
  });
});
