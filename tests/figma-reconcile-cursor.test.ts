/**
 * Registry-integrity phase 02 (5.3, backlog item "the cursor cannot skip a dropped
 * target") — test-first (repo pattern: lock the bug, then fix in the SAME file so the
 * diff shows the behaviour change, not just a new green test).
 *
 * The bug (re-verified against `src/commands/figma-reconcile-run.ts`): `cursorTo =
 * frames.length` used to be computed PURELY from the parsed log length — nothing
 * referenced what the mirror-capture pass actually scanned. A batch of 45 changed
 * components with `MAX_SCANS = 40` (figma-agent's own cap) drops 5 — but because the
 * capture file carried no signal that anything was dropped, and the cursor formula never
 * looked at `captured`/`failed` coverage vs. the delta size, the persisted cursor still
 * advanced to the very end of the log. The 5 dropped components were gone from both the
 * registry AND any retry mechanism (there was no retry mechanism) — silent data loss.
 *
 * SAFE (the fix): the cursor may advance only to the earliest frame that produced a
 * still-unfinished target (dropped, failed, left `pending`, or `unresolved`); the rest
 * persist in `design/figma-sync.state.json`'s `pending` queue across runs, until they
 * either resolve or are explicitly `--skip`-ped.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import type { ChangeFrame } from "../src/core/figma-reconcile.js";
import { syncStatePath, type SyncState } from "../src/core/figma-sync-state.js";

const TOTAL = 45;
const MAX_SCANS = 40; // mirrors figma-agent/cli/src/transport/figma-mirror-capture-run.ts's own cap

/** The registry's NAME_PATTERN requires PascalCase/PascalCase, LETTERS ONLY — a numeric
 *  variant like "Comp/12" is rejected by `materialize()` as BAD_NAME, which would make
 *  every fixture "unregistrable" instead of only the ones this file means to test. Two
 *  letters (base-26) covers well past TOTAL. */
function letterName(i: number): string {
  return String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
}

function frame(i: number): ChangeFrame {
  return {
    v: 1, ts: 1000 + i, op: "created", nodeId: `n${i}`, nodeName: `Comp/${letterName(i)}`,
    nodeType: "COMPONENT", changedProps: [], origin: "LOCAL", scopeHint: "local",
    page: "Page 1", fileKey: "abc",
  };
}

let dir: string;

function project(): void {
  dir = mkdtempSync(join(tmpdir(), "ui-cursor-safety-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  const frames = Array.from({ length: TOTAL }, (_, i) => frame(i));
  writeFileSync(
    join(dir, "design", "figma.changes.jsonl"),
    frames.map((f) => JSON.stringify(f)).join("\n") + "\n",
  );
  writeFileSync(join(dir, "design", "component-registry.json"), JSON.stringify({ version: "0.1.0", components: [] }, null, 2));
}

/** A minimal but REAL FigmaExportNode shape (type + name are the validated discriminant). */
function node(name: string) {
  return { type: "FRAME", name };
}

/** Write a v2 mirror-capture file naming exactly the given captured/failed/dropped nodeIds. */
function captureFile(opts: { captured?: number[]; failed?: number[]; dropped?: number[] }): string {
  const name = (i: number): string => `Comp/${letterName(i)}`;
  const payload = {
    v: 2,
    captured: (opts.captured ?? []).map((i) => ({ nodeId: `n${i}`, name: name(i), node: node(name(i)) })),
    failed: (opts.failed ?? []).map((i) => ({ nodeId: `n${i}`, name: name(i), reason: "scan timed out" })),
    dropped: (opts.dropped ?? []).map((i) => ({ nodeId: `n${i}`, name: name(i) })),
  };
  const path = join(dir, `capture-${Date.now()}-${Math.random()}.json`);
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

/** Simulates captureMirror's own MAX_SCANS=40 cap: only the first 40 of the 45 targets are
 *  captured; the other 5 are named in `dropped` (v2 — see figma-mirror-capture.ts §3). */
function cappedCaptureFile(): string {
  return captureFile({ captured: Array.from({ length: MAX_SCANS }, (_, i) => i), dropped: Array.from({ length: TOTAL - MAX_SCANS }, (_, i) => MAX_SCANS + i) });
}

function readState(): SyncState {
  return JSON.parse(readFileSync(syncStatePath(dir), "utf8"));
}

/** `run` writes to real stdout — capture it (cmd-test convention, see cmd-figma-reconcile-*.test.ts). */
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

function applyJson(extra: string[] = []): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--apply", "--json", ...extra]).out);
}

beforeEach(() => { project(); });

describe("ui figma reconcile --apply — the cursor and a dropped target (5.3)", () => {
  it("SAFE: the cursor stops at the 41st target's firstFrameIndex, not the log's end", () => {
    // 45 changed components, MAX_SCANS = 40 → 5 dropped, now NAMED to the kernel (v2 capture).
    const env = applyJson(["--mirror-file", cappedCaptureFile()]);
    expect(env.ok).toBe(true);

    // ← the fix: the cursor stops at Comp/40's own frame (index 40), not 45.
    expect(env.data.cursor_to).toBe(MAX_SCANS);
    expect(readState().cursor).toBe(MAX_SCANS);
    // ← the 5 dropped components are in the retry queue, not gone.
    expect(readState().pending).toHaveLength(5);
    expect(readState().pending!.map((p) => p.nodeId).sort()).toEqual(
      Array.from({ length: 5 }, (_, i) => `n${MAX_SCANS + i}`).sort(),
    );
    expect(env.data.pending).toHaveLength(5);
  });

  it("the second run processes the queued 5 first and drains it — cursor reaches frames.length", () => {
    applyJson(["--mirror-file", cappedCaptureFile()]); // run 1: 40 captured, 5 dropped
    expect(readState().cursor).toBe(MAX_SCANS);

    // run 2: resumes at cursor 40 automatically; this capture covers the remaining 5.
    const env = applyJson(["--mirror-file", captureFile({ captured: [40, 41, 42, 43, 44] })]);
    expect(env.ok).toBe(true);
    expect(env.data.cursor_from).toBe(MAX_SCANS);
    expect(env.data.cursor_to).toBe(TOTAL);
    expect(readState().cursor).toBe(TOTAL);
    expect(readState().pending).toBeUndefined(); // queue fully drained
  });

  it("a target that fails capture twice: attempts:2, still pending, still blocking", () => {
    applyJson(["--mirror-file", captureFile({ captured: Array.from({ length: 44 }, (_, i) => i), failed: [44] })]);
    expect(readState().pending).toHaveLength(1);
    expect(readState().pending![0]).toMatchObject({ nodeId: "n44", attempts: 1 });
    expect(readState().cursor).toBe(44); // stopped right at the failing target

    // run 2: the SAME target fails again (nothing new to process past cursor 44 except itself).
    const env = applyJson(["--mirror-file", captureFile({ failed: [44] })]);
    expect(env.data.cursor_to).toBe(44); // still blocked
    expect(readState().pending).toHaveLength(1);
    expect(readState().pending![0]).toMatchObject({ nodeId: "n44", attempts: 2, lastReason: "scan timed out" });
  });

  it("--skip on a failing target: the cursor passes it and skipped:true persists", () => {
    applyJson(["--mirror-file", captureFile({ captured: Array.from({ length: 44 }, (_, i) => i), failed: [44] })]);
    expect(readState().cursor).toBe(44);

    const skipEnv = JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--skip", "n44", "--json"]).out);
    expect(skipEnv.ok).toBe(true);
    expect(readState().pending![0]).toMatchObject({ nodeId: "n44", skipped: true });

    // A subsequent apply may now pass it — nothing left to capture (n44 already failed,
    // no mirror needed since it's skipped, not retried).
    const env = applyJson([]);
    expect(env.data.cursor_to).toBe(TOTAL);
    expect(readState().cursor).toBe(TOTAL);
    expect(readState().pending).toBeUndefined(); // fully behind the cursor now — pruned
  });

  it("stage-4 MAJOR10: --skip preserves byFile/cursorByte — a per-file cursor must never be silently wiped by an unrelated --skip call", () => {
    // A --file-slug run populates byFile (all fixture frames carry fileKey: 'abc').
    applyJson(["--file-slug", "abc", "--mirror-file", captureFile({ captured: Array.from({ length: 44 }, (_, i) => i), failed: [44] })]);
    const before = readState();
    expect(before.byFile?.["abc"]).toBeDefined();
    expect(typeof before.byFile?.["abc"]?.line).toBe("number");
    expect(typeof before.byFile?.["abc"]?.byte).toBe("number");

    const skipEnv = JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--skip", "n44", "--json"]).out);
    expect(skipEnv.ok).toBe(true);

    // The per-file cursor must survive completely untouched — --skip only ever changes
    // `pending`.
    const after = readState();
    expect(after.byFile?.["abc"]).toEqual(before.byFile?.["abc"]);
    expect(after.pending!.find((p) => p.nodeId === "n44")).toMatchObject({ skipped: true });
  });

  it("stage-4 N4: skip_history_truncated surfaces in the reconcile envelope once the 500-cap actually evicts a record", () => {
    applyJson(["--mirror-file", captureFile({ captured: Array.from({ length: 44 }, (_, i) => i), failed: [44] })]);
    capture(["figma", "reconcile", "--dir", dir, "--skip", "n44", "--json"]); // acknowledge

    // Seed a large pre-existing skipHistory (simulating a long-lived project) directly —
    // exactly at the cap, so ONE more pruned skip pushes it over.
    const existing = JSON.parse(readFileSync(syncStatePath(dir), "utf8")) as SyncState;
    const seededSkipHistory = Array.from({ length: 500 }, (_, i) => ({ nodeId: `old${i}`, name: "Comp/A", at: i }));
    writeFileSync(syncStatePath(dir), JSON.stringify({ ...existing, skipHistory: seededSkipHistory }));

    // The subsequent apply prunes n44's acknowledged skip into skipHistory (501 total),
    // pushing it 1 over the 500-cap — exactly one eviction.
    const env = applyJson([]);
    expect(env.ok).toBe(true);
    expect(env.data.skip_history_truncated).toBe(1);
    expect(readState().skipHistoryTruncated).toBe(1);
    // The record for n44 itself (the newest) must have survived the eviction — only the
    // OLDEST seeded record was dropped.
    expect(readState().skipHistory!.some((s) => s.nodeId === "n44")).toBe(true);
    expect(readState().skipHistory!.some((s) => s.nodeId === "old0")).toBe(false); // oldest, evicted
  });

  it("--skip on an unknown nodeId is refused (BAD_ARG)", () => {
    const env = JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--skip", "nope", "--json"]).out);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("BAD_ARG");
  });

  it("--since is refused on --apply while the queue is non-empty, unless --force", () => {
    applyJson(["--mirror-file", cappedCaptureFile()]); // leaves 5 pending
    const refused = JSON.parse(capture(["figma", "reconcile", "--dir", dir, "--apply", "--since", "0", "--json"]).out);
    expect(refused.ok).toBe(false);
    expect(refused.error.code).toBe("BAD_ARG");
    expect(refused.error.message).toMatch(/--skip/);

    const forced = applyJson(["--since", "0", "--force"]);
    expect(forced.ok).toBe(true); // --force bypasses the refusal
    expect(readState().forced).toHaveLength(1);
    expect(readState().forced![0]).toMatchObject({ since: 0 });
  });

  it("BLOCKER2 (stage-4): --since past a stale blocking target never persists a byte hint for the WRONG line — a rewind must self-heal via 0, never skip real content", () => {
    // Run 1: 40 captured, 5 (n40..n44) dropped/pending — cursor stops at 40.
    applyJson(["--mirror-file", cappedCaptureFile()]);
    expect(readState().cursor).toBe(MAX_SCANS);

    // Run 2: --since 44 --force bypasses the refusal but does NOT resolve n40..n43 (this
    // run only re-touches frame 44, no mirror). `merged` still carries n40..n43 at their
    // OWN (much earlier) firstFrameIndex, so `safeCursorTo` clamps back down to 40 — the
    // resulting `target` (40) is LESS than this run's own `from` (44): the persisted byte
    // hint must NEVER be `sliceStartByte` (that points at frame 44's own byte position, a
    // WRONG line for cursor 40) — it must self-heal to 0 so the NEXT run does a full scan
    // rather than silently trust a byte offset that would skip frames 40-43's real bytes
    // forever (the exact "frames 3-7 permanently unreachable" class of bug).
    applyJson(["--since", String(MAX_SCANS + 4), "--force"]);
    expect(readState().cursor).toBe(MAX_SCANS); // safeCursorTo clamps back to the real blocker (BLOCKER1)
    expect(readState().cursorByte).toBe(0); // never a byte hint for the wrong line

    // Proof of the whole point: a THIRD run (now trusting byte 0 → an honest full scan)
    // can still fully resolve n40..n44 — nothing was permanently skipped.
    const env3 = applyJson(["--mirror-file", captureFile({ captured: [40, 41, 42, 43, 44] })]);
    expect(env3.ok).toBe(true);
    expect(env3.data.cursor_to).toBe(TOTAL);
    expect(readState().pending).toBeUndefined();
  });

  it("a pre-existing {cursor}-only state file loads with pending undefined (migration)", () => {
    writeFileSync(syncStatePath(dir), JSON.stringify({ cursor: 3 }));
    const env = applyJson([]);
    expect(env.ok).toBe(true);
    expect(env.data.cursor_from).toBe(3);
  });

  it("an ADD that stays pending (no capture at all) blocks the cursor too — not just a mirror drop", () => {
    // Registry-integrity phase 02 widens "unfinished" beyond dropped/failed: applyDelta's
    // OWN `report.pending` (an ADD with no usable capture) must also block.
    const env = applyJson([]); // no --mirror-file at all — every ADD stays pending
    expect(env.data.apply.pending.length).toBe(TOTAL);
    expect(env.data.cursor_to).toBe(0); // blocked at the very first target
    expect(readState().pending).toHaveLength(TOTAL);
  });

  it("the text render surfaces the retry queue (not just the JSON envelope)", () => {
    const { out } = capture(["figma", "reconcile", "--dir", dir, "--apply", "--mirror-file", cappedCaptureFile()]);
    expect(out).toMatch(/5 targets waiting/);
  });
});

// ─── Codex fix round (5 findings, all accepted) ────────────────────────────────

describe("fix round, finding 1 — pending rotation: lastAttemptedAt stamped only on a REAL attempt", () => {
  it("a scan FAILURE stamps lastAttemptedAt; a mere batch-cap DROP does not", () => {
    const env = applyJson(["--mirror-file", captureFile({ failed: [0], dropped: [1] })]);
    expect(env.ok).toBe(true);
    const pending = readState().pending!;
    const failedEntry = pending.find((p) => p.nodeId === "n0")!;
    const droppedEntry = pending.find((p) => p.nodeId === "n1")!;
    expect(typeof failedEntry.lastAttemptedAt).toBe("number");
    expect(droppedEntry.lastAttemptedAt).toBeUndefined();
  });

  it("an ADD left pending with no capture at all (mirror undefined) is never marked attempted", () => {
    const env = applyJson([]); // no --mirror-file
    expect(env.ok).toBe(true);
    for (const p of readState().pending!) expect(p.lastAttemptedAt).toBeUndefined();
  });
});

describe("fix round, finding 2 — pending leaves ONLY on positive evidence, never by absence", () => {
  function updateProject(): void {
    dir = mkdtempSync(join(tmpdir(), "ui-cursor-safety-update-"));
    mkdirSync(join(dir, "design"), { recursive: true });
    const frame: ChangeFrame = {
      v: 1, ts: 1, op: "updated", nodeId: "u1", nodeName: "One/A", nodeType: "COMPONENT",
      changedProps: [], origin: "LOCAL", scopeHint: "local", page: "Page 1", fileKey: "abc",
    };
    writeFileSync(join(dir, "design", "figma.changes.jsonl"), `${JSON.stringify(frame)}\n`);
    writeFileSync(join(dir, "design", "component-registry.json"), JSON.stringify({
      version: "0.1.0",
      components: [{ name: "One/A", category: "One", markup: "<div></div>", tokensUsed: [], scope: "local" }],
    }, null, 2));
  }
  function updateCaptureFile(opts: { failed?: boolean }): string {
    const payload = {
      v: 2, captured: [],
      failed: opts.failed ? [{ nodeId: "u1", name: "One/A", reason: "scan timed out" }] : [],
      dropped: [],
    };
    const path = join(dir, `capture-${Date.now()}-${Math.random()}.json`);
    writeFileSync(path, JSON.stringify(payload));
    return path;
  }

  it("a pending UPDATE survives a later run whose mirror doesn't mention it — still pending, attempts unchanged", () => {
    updateProject();
    // Run 1: the mirror scans and FAILS on this node → pending, attempts:1.
    const run1 = applyJson(["--mirror-file", updateCaptureFile({ failed: true })]);
    expect(run1.ok).toBe(true);
    expect(readState().pending).toHaveLength(1);
    expect(readState().pending![0]).toMatchObject({ nodeId: "u1", attempts: 1 });
    expect(readState().cursor).toBe(0); // still blocked at its own frame

    // Run 2: NO --mirror-file at all — this run has zero signal about "u1" one way or the
    // other (no ADD involved, so report.pending never mentions an UPDATE; no mirror means
    // mirror.dropped/failures don't exist either). Before the fix, `thisRun` lacking this
    // nodeId was silently read as "resolved" and the entry vanished from the queue.
    const run2 = applyJson([]);
    expect(run2.ok).toBe(true);
    expect(readState().pending).toHaveLength(1); // ← still there, not silently dropped
    expect(readState().pending![0]).toMatchObject({ nodeId: "u1", attempts: 1 }); // ← unchanged, not bumped
    expect(readState().cursor).toBe(0); // still blocked — nothing actually landed
  });

  it("the SAME pending UPDATE is dropped once something ACTUALLY lands for it (positive evidence)", () => {
    updateProject();
    applyJson(["--mirror-file", updateCaptureFile({ failed: true })]);
    expect(readState().pending).toHaveLength(1);

    // A real capture success this time — genuine positive evidence (report.mirrored).
    const path = join(dir, "capture-ok.json");
    writeFileSync(path, JSON.stringify({
      v: 2, captured: [{ nodeId: "u1", name: "One/A", node: { type: "FRAME", name: "One/A" } }], failed: [], dropped: [],
    }));
    const env = applyJson(["--mirror-file", path]);
    expect(env.ok).toBe(true);
    expect(readState().pending).toBeUndefined(); // resolved — genuinely landed this time
    expect(readState().cursor).toBe(1);
  });
});

describe("fix round, finding 3 — no duplicate reconcile_applied memory event on an unchanged re-apply", () => {
  function ledgerLineCount(): number {
    try {
      return readFileSync(join(dir, "design", "memory.events.jsonl"), "utf8").trim().split("\n").filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  it("re-applying after a blocked target with byte-identical sidecar content records ZERO new events", () => {
    // 2 targets: n0 captured successfully (lands + records an event); n1 dropped (blocks
    // the cursor at frame 1, so n0's frame keeps re-entering every future slice too).
    const file = captureFile({ captured: [0], dropped: [1, 2, 3, 4] });
    const run1 = applyJson(["--mirror-file", file]);
    expect(run1.ok).toBe(true);
    const afterRun1 = ledgerLineCount();
    expect(afterRun1).toBeGreaterThan(0); // n0 genuinely landed — one real event

    // Run 2: n0's frame is STILL in the slice (cursor stuck at 1, behind n1..n4) and gets
    // re-applied — but with the EXACT SAME capture content, so `writeFigmaNode`'s content
    // guard reports `written:false`. Before the fix, `sidecarWrites.length > 0` alone
    // triggered a fresh `reconcile_applied` event on every such re-apply.
    const run2 = applyJson(["--mirror-file", captureFile({ captured: [0], dropped: [1, 2, 3, 4] })]);
    expect(run2.ok).toBe(true);
    expect(ledgerLineCount()).toBe(afterRun1); // ← no new event
  });
});

describe("fix round, finding 4 — durable skip history survives pending's self-pruning", () => {
  it("a skip is recorded in skipHistory the moment the cursor passes it, and is never itself pruned", () => {
    applyJson(["--mirror-file", captureFile({ captured: Array.from({ length: 44 }, (_, i) => i), failed: [44] })]);
    capture(["figma", "reconcile", "--dir", dir, "--skip", "n44", "--json"]);
    expect(readState().skipHistory).toBeUndefined(); // not pruned yet — cursor hasn't passed it

    const env = applyJson([]); // the skip lets the cursor run to the end this time
    expect(env.ok).toBe(true);
    expect(readState().pending).toBeUndefined(); // pruned from the active queue
    expect(readState().skipHistory).toHaveLength(1); // …but the audit trail survives
    expect(readState().skipHistory![0]).toMatchObject({ nodeId: "n44", name: "Comp/" + letterName(44) });
  });
});
