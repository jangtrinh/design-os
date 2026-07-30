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

  it("`lastAttemptedAt` is optional and round-trips when present", () => {
    const state = { cursor: 0, pending: [pendingTarget({ lastAttemptedAt: 555 })] };
    writeSyncState(statePath, state);
    expect(readSyncState(statePath).pending![0]!.lastAttemptedAt).toBe(555);
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
});
