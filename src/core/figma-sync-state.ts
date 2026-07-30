/**
 * Figma live-sync apply cursor (spec 004 P4, Tier 3 — the applied-so-far marker).
 *
 * `ui figma reconcile --apply` walks the append-only change-log from a line-count
 * cursor. That cursor is persisted HERE — `design/figma-sync.state.json` — so the
 * NEXT apply starts where the last one stopped, and a replay can rewind it. The log
 * is the source of truth (audit + undo); this file is just "how far have we applied".
 *
 * Deliberately separate from the log and the registry: the log is append-only
 * (never rewritten), the registry is the materialized view, and this is the single
 * mutable integer between them. Absent file → cursor 0 (apply the whole log).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Path of the apply-cursor state file, relative to a project dir. */
export const SYNC_STATE_RELPATH = ["design", "figma-sync.state.json"] as const;

/** Absolute path to `<dir>/design/figma-sync.state.json`. */
export function syncStatePath(dir: string): string {
  return join(dir, ...SYNC_STATE_RELPATH);
}

/**
 * Read the persisted apply cursor. Absent file → 0. A malformed / non-integer
 * value is treated as 0 (a corrupt marker must not wedge the loop — the log is
 * still the truth and a full re-apply is deterministic).
 */
export function readCursor(path: string): number {
  if (!existsSync(path)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { cursor?: unknown };
    const c = parsed?.cursor;
    return typeof c === "number" && Number.isInteger(c) && c >= 0 ? c : 0;
  } catch {
    return 0;
  }
}

/** Write the apply cursor (deterministic, trailing newline; mirrors saveRegistry). */
export function writeCursor(path: string, cursor: number): void {
  mkdirSync(dirname(path), { recursive: true }); // design/ may not exist yet on a fresh project
  writeFileSync(path, JSON.stringify({ cursor }, null, 2) + "\n", "utf8");
}

// ── Registry-integrity phase 02 (5.3) — the cursor cannot skip a dropped target ─────
//
// The state file grows ADDITIVELY: `pending` is optional, so a pre-existing `{cursor}`-
// only file loads unchanged (readSyncState below never fails on its absence).

/**
 * One target the apply cursor may not pass yet — dropped by the mirror-capture batch
 * cap, failed a scan, left `pending` by `applyDelta` (captured-but-unregistrable, or no
 * capture at all), or unresolved by reconcile itself (a DELETE that lost its identity).
 * Persisted across runs so a retry survives a broker restart.
 */
export interface PendingTarget {
  nodeId: string;
  name: string;
  /** Absolute frame index (CoalescedComponent.firstFrameIndex) the cursor must not pass. */
  firstFrameIndex: number;
  /** Incremented once per apply run this target is STILL unfinished. */
  attempts: number;
  lastReason: string;
  firstSeenTs: number;
  /**
   * Fix round (finding 1) — epoch ms of the last run this target was ACTUALLY handed to
   * a capture attempt (present in the mirror's `failed`, or captured-but-unregistrable in
   * `report.pending`) — distinct from merely being dropped by the batch cap again, which
   * does NOT update this. Undefined = never attempted yet. figma-agent's
   * `pendingTargetsFromEnvelope` sorts the queue by this (ascending, never-attempted
   * first) so a chronically-failing target rotates BEHIND one that hasn't had a turn —
   * without this, the same first `MAX_SCANS` names would starve everything after them.
   */
  lastAttemptedAt?: number;
  /** Set by an explicit acknowledged skip (`ui figma reconcile --skip <nodeId>`) — the
   *  ONLY way past a failing target. No timeout ever sets this. */
  skipped?: true;
}

/** One recorded `--force` bypass of the `--since`-vs-pending-queue refusal — auditable,
 *  never silent (§4's "a bypass is auditable rather than invisible"). */
export interface ForcedBypass {
  at: number;
  since: number;
}

/**
 * Fix round (finding 4) — a durable record of an acknowledged skip, written the moment
 * `pending`'s self-pruning invariant (`firstFrameIndex >= cursor`) is about to drop a
 * `skipped:true` entry. Without this, the ONLY evidence a target was ever explicitly
 * skipped (rather than simply resolved) vanishes the instant the cursor passes it — the
 * exact audit trail an acknowledged skip exists to keep. Never itself pruned.
 */
export interface SkipRecord {
  nodeId: string;
  name: string;
  at: number;
}

export interface SyncState {
  cursor: number;
  /** Present only when non-empty (an empty/absent array mean the same thing — no queue). */
  pending?: PendingTarget[];
  forced?: ForcedBypass[];
  skipHistory?: SkipRecord[];
}

/** Non-negative, finite, integer. Guards `firstFrameIndex`/`attempts` — a negative index
 *  or a fractional/NaN/Infinity value is exactly as malformed as a wrong type, and must
 *  be REJECTED (filtered out), never silently clamped into looking valid. */
function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/** Finite epoch timestamp — rejects NaN/Infinity, which `typeof x === "number"` alone
 *  would let through. */
function isFiniteTimestamp(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isValidPendingTarget(v: unknown): v is PendingTarget {
  if (v === null || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p["nodeId"] === "string" && p["nodeId"].length > 0 &&
    typeof p["name"] === "string" &&
    isNonNegativeInt(p["firstFrameIndex"]) &&
    typeof p["attempts"] === "number" && Number.isInteger(p["attempts"]) && p["attempts"] >= 1 &&
    typeof p["lastReason"] === "string" &&
    isFiniteTimestamp(p["firstSeenTs"]) &&
    (p["lastAttemptedAt"] === undefined || isFiniteTimestamp(p["lastAttemptedAt"])) &&
    (p["skipped"] === undefined || p["skipped"] === true)
  );
}

function isValidForcedBypass(v: unknown): v is ForcedBypass {
  if (v === null || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return isFiniteTimestamp(f["at"]) && isNonNegativeInt(f["since"]);
}

function isValidSkipRecord(v: unknown): v is SkipRecord {
  if (v === null || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s["nodeId"] === "string" && s["nodeId"].length > 0 &&
    typeof s["name"] === "string" &&
    isFiniteTimestamp(s["at"])
  );
}

/**
 * Read the FULL persisted state (cursor + pending queue + force log + skip history).
 * Absent file → `{cursor: 0}`. Malformed entries — including an out-of-range value
 * (a negative index, `attempts < 1`, a non-finite timestamp) — are REJECTED individually
 * (dropped, never clamped into looking valid) rather than failing the whole read: a
 * corrupt queue entry must not wedge the retry loop for every OTHER target, and the log
 * is still the source of truth for what is actually unfinished.
 */
export function readSyncState(path: string): SyncState {
  if (!existsSync(path)) return { cursor: 0 };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as
      { cursor?: unknown; pending?: unknown; forced?: unknown; skipHistory?: unknown };
    const cursor = typeof parsed?.cursor === "number" && Number.isInteger(parsed.cursor) && parsed.cursor >= 0
      ? parsed.cursor : 0;
    const pending = Array.isArray(parsed?.pending)
      ? (parsed.pending as unknown[]).filter(isValidPendingTarget)
      : [];
    const forced = Array.isArray(parsed?.forced)
      ? (parsed.forced as unknown[]).filter(isValidForcedBypass)
      : [];
    const skipHistory = Array.isArray(parsed?.skipHistory)
      ? (parsed.skipHistory as unknown[]).filter(isValidSkipRecord)
      : [];
    return {
      cursor,
      ...(pending.length > 0 && { pending }),
      ...(forced.length > 0 && { forced }),
      ...(skipHistory.length > 0 && { skipHistory }),
    };
  } catch {
    return { cursor: 0 };
  }
}

/**
 * Write the full state (cursor + pending + forced + skipHistory), deterministic (mirrors
 * `writeCursor`/`saveRegistry`). An empty array is normalized away (omitted, not stored
 * as `[]`) so a fully-resolved queue round-trips back to the exact `{cursor}`-only shape
 * a pre-existing project's state file already has.
 */
export function writeSyncState(path: string, state: SyncState): void {
  mkdirSync(dirname(path), { recursive: true });
  const payload: SyncState = {
    cursor: state.cursor,
    ...(state.pending && state.pending.length > 0 && { pending: state.pending }),
    ...(state.forced && state.forced.length > 0 && { forced: state.forced }),
    ...(state.skipHistory && state.skipHistory.length > 0 && { skipHistory: state.skipHistory }),
  };
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
}
