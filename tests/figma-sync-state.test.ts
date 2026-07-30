/**
 * Direct unit coverage for `src/core/figma-sync-state.ts` — the apply cursor + retry
 * queue + audit trails (registry-integrity phase 02, 5.3, + its Codex fix round).
 * Exercised indirectly through `figma-reconcile-run.ts`'s command tests elsewhere; this
 * file targets the module's OWN read/write/validate contract directly.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readSyncState, syncStatePath, writeSyncState,
  type ForcedBypass, type PendingTarget, type SkipRecord,
} from "../src/core/figma-sync-state.js";

let dir: string;
let statePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-sync-state-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  statePath = syncStatePath(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function pendingTarget(over: Partial<PendingTarget> = {}): PendingTarget {
  return { nodeId: "n1", name: "Comp/A", firstFrameIndex: 0, attempts: 1, lastReason: "failed", firstSeenTs: 1000, ...over };
}

describe("readSyncState / writeSyncState — round trip", () => {
  it("absent file → {cursor: 0}", () => {
    expect(readSyncState(statePath)).toEqual({ cursor: 0 });
  });

  it("round-trips cursor + pending + forced + skipHistory", () => {
    const forced: ForcedBypass[] = [{ at: 100, since: 5 }];
    const skipHistory: SkipRecord[] = [{ nodeId: "n9", name: "Comp/Z", at: 200 }];
    const state = { cursor: 10, pending: [pendingTarget()], forced, skipHistory };
    writeSyncState(statePath, state);
    expect(readSyncState(statePath)).toEqual(state);
  });

  it("a pre-existing {cursor}-only file loads unchanged (migration)", () => {
    writeFileSync(statePath, JSON.stringify({ cursor: 3 }));
    expect(readSyncState(statePath)).toEqual({ cursor: 3 });
  });

  it("empty pending/forced/skipHistory arrays normalize away on write — round-trips to the bare {cursor} shape", () => {
    writeSyncState(statePath, { cursor: 7, pending: [], forced: [], skipHistory: [] });
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    expect(raw).toEqual({ cursor: 7 });
    expect(readSyncState(statePath)).toEqual({ cursor: 7 });
  });

  // Registry-integrity phase 03 (5.2), §2 — per-file cursor.
  it("byFile round-trips and an empty object normalizes away like the other collections", () => {
    writeSyncState(statePath, { cursor: 5, byFile: { keyA: { line: 10, byte: 500 }, keyB: { line: 3, byte: 120 } } });
    expect(readSyncState(statePath)).toEqual({ cursor: 5, byFile: { keyA: { line: 10, byte: 500 }, keyB: { line: 3, byte: 120 } } });

    writeSyncState(statePath, { cursor: 5, byFile: {} });
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({ cursor: 5 });
    expect(readSyncState(statePath)).toEqual({ cursor: 5 });
  });

  it("byFile rejects a negative/non-integer entry individually, keeping the valid ones", () => {
    writeFileSync(statePath, JSON.stringify({
      cursor: 0,
      byFile: { good: { line: 5, byte: 10 }, bad: { line: -1, byte: 0 }, alsoBad: { line: 1.5, byte: 0 }, badByte: { line: 1, byte: -1 } },
    }));
    expect(readSyncState(statePath).byFile).toEqual({ good: { line: 5, byte: 10 } });
  });

  it("byFile is undefined (never {}) when absent or malformed at the root", () => {
    writeFileSync(statePath, JSON.stringify({ cursor: 0, byFile: "nope" }));
    expect(readSyncState(statePath).byFile).toBeUndefined();
    writeFileSync(statePath, JSON.stringify({ cursor: 0, byFile: [1, 2] }));
    expect(readSyncState(statePath).byFile).toBeUndefined();
  });

  // Registry-integrity phase 04 (5.4), §1 — cursorByte + byFile shape migration.
  it("cursorByte round-trips and is absent (never 0) when never set", () => {
    writeSyncState(statePath, { cursor: 5, cursorByte: 12345 });
    expect(readSyncState(statePath)).toEqual({ cursor: 5, cursorByte: 12345 });
    writeSyncState(statePath, { cursor: 5 });
    expect(readSyncState(statePath).cursorByte).toBeUndefined();
  });

  it("cursorByte rejects a negative/non-integer value", () => {
    writeFileSync(statePath, JSON.stringify({ cursor: 0, cursorByte: -1 }));
    expect(readSyncState(statePath).cursorByte).toBeUndefined();
    writeFileSync(statePath, JSON.stringify({ cursor: 0, cursorByte: 1.5 }));
    expect(readSyncState(statePath).cursorByte).toBeUndefined();
  });

  it("a legacy P3 bare-number byFile entry migrates to {line, byte: 0} on read", () => {
    writeFileSync(statePath, JSON.stringify({ cursor: 0, byFile: { keyA: 42 } }));
    expect(readSyncState(statePath).byFile).toEqual({ keyA: { line: 42, byte: 0 } });
  });

  it("a legacy entry and a current-shape entry can coexist — each migrates/validates independently", () => {
    writeFileSync(statePath, JSON.stringify({ cursor: 0, byFile: { legacy: 7, current: { line: 3, byte: 99 } } }));
    expect(readSyncState(statePath).byFile).toEqual({ legacy: { line: 7, byte: 0 }, current: { line: 3, byte: 99 } });
  });

  it("`lastAttemptedAt` is optional and round-trips when present", () => {
    const state = { cursor: 0, pending: [pendingTarget({ lastAttemptedAt: 555 })] };
    writeSyncState(statePath, state);
    expect(readSyncState(statePath).pending![0]!.lastAttemptedAt).toBe(555);
  });

  // Stage-4 MINOR14 — `forced`/`skipHistory` are append-only audit trails with no prior
  // cap, unlike the other append-only stores this wave already retention-caps. Growth is
  // bounded by keeping only the MOST RECENT entries.
  it("skipHistory beyond the cap keeps only the MOST RECENT entries, oldest dropped first", () => {
    const skipHistory: SkipRecord[] = Array.from({ length: 520 }, (_, i) => ({ nodeId: `n${i}`, name: "Comp/A", at: i }));
    writeSyncState(statePath, { cursor: 0, skipHistory });
    const stored = readSyncState(statePath).skipHistory!;
    expect(stored).toHaveLength(500);
    expect(stored[0]!.nodeId).toBe("n20"); // the oldest 20 were dropped
    expect(stored[stored.length - 1]!.nodeId).toBe("n519"); // the newest survives
  });

  it("forced beyond the cap keeps only the MOST RECENT entries, oldest dropped first", () => {
    const forced: ForcedBypass[] = Array.from({ length: 510 }, (_, i) => ({ at: i, since: i }));
    writeSyncState(statePath, { cursor: 0, forced });
    const stored = readSyncState(statePath).forced!;
    expect(stored).toHaveLength(500);
    expect(stored[0]!.since).toBe(10);
    expect(stored[stored.length - 1]!.since).toBe(509);
  });

  it("under the cap, forced/skipHistory round-trip completely untouched", () => {
    const skipHistory: SkipRecord[] = [{ nodeId: "n1", name: "Comp/A", at: 1 }];
    const forced: ForcedBypass[] = [{ at: 1, since: 0 }];
    writeSyncState(statePath, { cursor: 0, skipHistory, forced });
    expect(readSyncState(statePath).skipHistory).toEqual(skipHistory);
    expect(readSyncState(statePath).forced).toEqual(forced);
  });

  // Stage-4 N4 — the cap can silently drop the very "legacy-untagged-pruned" audit
  // records option-b added; a running, cumulative count must survive even though the
  // actual dropped records do not.
  it("N4: a skipHistory eviction records a running skipHistoryTruncated count", () => {
    const skipHistory: SkipRecord[] = Array.from({ length: 520 }, (_, i) => ({ nodeId: `n${i}`, name: "Comp/A", at: i }));
    const result = writeSyncState(statePath, { cursor: 0, skipHistory });
    expect(result.skipHistoryTruncated).toBe(20);
    expect(readSyncState(statePath).skipHistoryTruncated).toBe(20);
  });

  it("N4: the count is CUMULATIVE across multiple writes, never reset — even when the prior value isn't threaded through explicitly it must be read back and re-supplied by the caller", () => {
    const firstBatch: SkipRecord[] = Array.from({ length: 520 }, (_, i) => ({ nodeId: `n${i}`, name: "Comp/A", at: i }));
    const first = writeSyncState(statePath, { cursor: 0, skipHistory: firstBatch });
    expect(first.skipHistoryTruncated).toBe(20);

    // A second write must carry the PRIOR total forward (the caller's job — see
    // figma-reconcile-run.ts threading `priorState.skipHistoryTruncated` through).
    const priorTotal = readSyncState(statePath).skipHistoryTruncated;
    const secondBatch: SkipRecord[] = Array.from({ length: 515 }, (_, i) => ({ nodeId: `m${i}`, name: "Comp/A", at: i }));
    const second = writeSyncState(statePath, { cursor: 0, skipHistory: secondBatch, skipHistoryTruncated: priorTotal });
    expect(second.skipHistoryTruncated).toBe(20 + 15); // 20 (prior) + 15 (this write's own overflow)
    expect(readSyncState(statePath).skipHistoryTruncated).toBe(35);
  });

  it("N4: no eviction this write leaves the count exactly at the prior total (0 when never truncated)", () => {
    const result = writeSyncState(statePath, { cursor: 0, skipHistory: [{ nodeId: "n1", name: "Comp/A", at: 1 }] });
    expect(result.skipHistoryTruncated).toBe(0);
    expect(readSyncState(statePath).skipHistoryTruncated).toBeUndefined(); // 0 omitted, same convention as other counters
  });
});

// Fix round, finding 5: strict validation — an out-of-range value is malformed too, and
// must be REJECTED (filtered out), never silently clamped into looking valid.
describe("validation — malformed/out-of-range entries are rejected, not clamped", () => {
  it("negative firstFrameIndex is rejected", () => {
    writeFileSync(statePath, JSON.stringify({ cursor: 0, pending: [pendingTarget({ firstFrameIndex: -1 })] }));
    expect(readSyncState(statePath).pending).toBeUndefined();
  });

  it("attempts < 1 is rejected (an entry always has at least one attempt to exist at all)", () => {
    writeFileSync(statePath, JSON.stringify({ cursor: 0, pending: [pendingTarget({ attempts: 0 })] }));
    expect(readSyncState(statePath).pending).toBeUndefined();
  });

  it("a non-integer attempts/firstFrameIndex is rejected", () => {
    writeFileSync(statePath, JSON.stringify({ cursor: 0, pending: [pendingTarget({ attempts: 1.5 })] }));
    expect(readSyncState(statePath).pending).toBeUndefined();
  });

  it("a non-finite firstSeenTs (NaN/Infinity survive JSON as null, but a hand-edited file could carry them via other means) is rejected", () => {
    // JSON.stringify(NaN) → "null", so simulate the malformed on-disk value directly.
    writeFileSync(statePath, '{"cursor":0,"pending":[{"nodeId":"n1","name":"A/B","firstFrameIndex":0,"attempts":1,"lastReason":"x","firstSeenTs":"not-a-number"}]}');
    expect(readSyncState(statePath).pending).toBeUndefined();
  });

  it("a non-finite lastAttemptedAt is rejected even though the rest of the entry is valid", () => {
    writeFileSync(statePath, '{"cursor":0,"pending":[{"nodeId":"n1","name":"A/B","firstFrameIndex":0,"attempts":1,"lastReason":"x","firstSeenTs":1,"lastAttemptedAt":"nope"}]}');
    expect(readSyncState(statePath).pending).toBeUndefined();
  });

  it("valid entries survive alongside a rejected malformed one — one bad entry never wedges the rest", () => {
    writeFileSync(statePath, JSON.stringify({
      cursor: 0,
      pending: [pendingTarget({ nodeId: "good" }), pendingTarget({ nodeId: "bad", firstFrameIndex: -5 })],
    }));
    const pending = readSyncState(statePath).pending!;
    expect(pending).toHaveLength(1);
    expect(pending[0]!.nodeId).toBe("good");
  });

  it("a negative `since` on a forced-bypass entry is rejected", () => {
    writeFileSync(statePath, JSON.stringify({ cursor: 0, forced: [{ at: 1, since: -1 }] }));
    expect(readSyncState(statePath).forced).toBeUndefined();
  });

  it("a non-finite `at` on a forced-bypass or skip-history entry is rejected", () => {
    writeFileSync(statePath, '{"cursor":0,"forced":[{"at":"nope","since":1}],"skipHistory":[{"nodeId":"n1","name":"A/B","at":"nope"}]}');
    const state = readSyncState(statePath);
    expect(state.forced).toBeUndefined();
    expect(state.skipHistory).toBeUndefined();
  });

  // Registry-integrity phase 03 fix round (F3 follow-up, option B) — the additive
  // reason/firstFrameIndex/prunedByFileSlug fields round-trip, and a plain (pre-fix)
  // record with none of them stays valid — additive, never a breaking schema change.
  it("round-trips a skip-history entry carrying the legacy-untagged-pruned reason + position", () => {
    const skipHistory: SkipRecord[] = [
      { nodeId: "n9", name: "Comp/Z", at: 200 },
      { nodeId: "legacy1", name: "Comp/Legacy", at: 300, reason: "legacy-untagged-pruned", firstFrameIndex: 4, prunedByFileSlug: "fileB" },
    ];
    writeSyncState(statePath, { cursor: 10, skipHistory });
    expect(readSyncState(statePath).skipHistory).toEqual(skipHistory);
  });

  it("rejects a malformed reason/firstFrameIndex/prunedByFileSlug on a skip-history entry, keeps the rest", () => {
    writeFileSync(statePath, JSON.stringify({
      cursor: 0,
      skipHistory: [
        { nodeId: "good", name: "A/B", at: 1 },
        { nodeId: "bad1", name: "A/B", at: 1, reason: 5 },
        { nodeId: "bad2", name: "A/B", at: 1, firstFrameIndex: -1 },
        { nodeId: "bad3", name: "A/B", at: 1, prunedByFileSlug: "" },
      ],
    }));
    const skipHistory = readSyncState(statePath).skipHistory!;
    expect(skipHistory).toHaveLength(1);
    expect(skipHistory[0]!.nodeId).toBe("good");
  });
});
