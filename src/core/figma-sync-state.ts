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
  /**
   * Registry-integrity phase 03 (5.2), additive — the file (CoalescedComponent.fileSlug)
   * this target actually belongs to, stamped from the coalesced component whether or not
   * the run that created/touched it passed `--file-slug`. Undefined = a legacy entry from
   * before this field existed. A `--file-slug`-filtered run's cursor/blocking computation
   * treats an entry as relevant only when its own `fileSlug` matches (or is undefined,
   * conservatively still-blocking until it resolves) — without this, a different file's
   * stuck target would wrongly gate THIS file's per-file cursor advancement.
   */
  fileSlug?: string;
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
  /**
   * Registry-integrity phase 03 fix round (F3 follow-up, team-lead ruling option B) —
   * set only when this record documents a LEGACY UNTAGGED pending entry that left
   * `pending` via the lenient prune without ever matching a run's STRICT bound-file
   * check (the asymmetric predicate's own side effect: it stopped gating every OTHER
   * file's cursor, but a filtered run can still silently outrun it). Absent = today's
   * ordinary meaning, an acknowledged (`skipped:true`) prune.
   */
  reason?: string;
  /** The entry's own recorded position (CoalescedComponent.firstFrameIndex) at prune time. */
  firstFrameIndex?: number;
  /** The `--file-slug` of the run whose cursor passed it (always defined for a
   *  `reason: "legacy-untagged-pruned"` record — see figma-reconcile-run.ts). */
  prunedByFileSlug?: string;
}

/**
 * Registry-integrity phase 04 (5.4), §1 — a per-file cursor position: `line` (the
 * absolute FRAME index, same numbering `coalesceFrames`'s `firstFrameIndex` uses — this
 * stays the AUTHORITATIVE value for the contract) plus `byte` (a seek hint into the raw
 * change-log file, letting `streamChangeLog` skip straight to the unread tail instead of
 * re-reading everything). The byte is NEVER trusted blindly — `change-log-stream.ts`
 * verifies it sits on a real newline boundary and within the file's current size before
 * using it, falling back to a full scan (still correct, just not optimized) otherwise.
 */
export interface CursorPosition {
  line: number;
  byte: number;
}

export interface SyncState {
  cursor: number;
  /**
   * Registry-integrity phase 04 (5.4), §1, additive — the seek hint paired with `cursor`
   * for an UNFILTERED run (no `--file-slug`). Absent = no hint yet (a pre-phase-04 file,
   * or a project that has never completed an unfiltered apply) — `streamChangeLog` then
   * reads from byte 0, exactly like today, and establishes a hint on the next successful
   * write.
   */
  cursorByte?: number;
  /**
   * Registry-integrity phase 03 (5.2), additive — one cursor PER FILE SLUG, used only by
   * a `--file-slug`-filtered run. `cursor` stays authoritative for an unfiltered run (a
   * shared broker cwd has no per-file concept); `byFile[slug]` is what a filtered run
   * reads/advances instead, so filtering one file's frames out of a shared log can never
   * strand another file's earlier, still-unapplied frames behind a single project-wide
   * cursor. A legacy `{cursor}`-only file migrates by seeding `byFile[slug]` FROM `cursor`
   * the first time that slug is filtered (see `figma-reconcile-run.ts`).
   *
   * Registry-integrity phase 04 (5.4), §1 CHANGED this value's shape from a bare line
   * number (P3) to `CursorPosition` (line + a byte seek hint) — the line number alone
   * cannot express "where in the file to resume reading from" without a full re-scan. A
   * legacy bare-number entry migrates on read to `{line: <that number>, byte: 0}` (byte 0
   * always falls back to a full scan for that one slug this one run — safe, just not
   * optimized yet — and establishes a real hint on the very next successful write).
   */
  byFile?: Record<string, CursorPosition>;
  /** Present only when non-empty (an empty/absent array mean the same thing — no queue). */
  pending?: PendingTarget[];
  forced?: ForcedBypass[];
  skipHistory?: SkipRecord[];
  /**
   * Stage-4 N4 — a running total of `skipHistory` entries the 500-entry cap (MINOR14) has
   * ever had to evict. The cap can silently drop the very "legacy-untagged-pruned" audit
   * records F3-follow-up (option B) exists to guarantee, so — same principle as MAJOR7's
   * `evictedUnresolved` — a durable COUNT survives even though the actual dropped records
   * do not (nowhere left to archive them to at this layer). Absent/0 = never truncated.
   */
  skipHistoryTruncated?: number;
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
    (p["fileSlug"] === undefined || (typeof p["fileSlug"] === "string" && p["fileSlug"].length > 0)) &&
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
    isFiniteTimestamp(s["at"]) &&
    (s["reason"] === undefined || typeof s["reason"] === "string") &&
    (s["firstFrameIndex"] === undefined || isNonNegativeInt(s["firstFrameIndex"])) &&
    (s["prunedByFileSlug"] === undefined || (typeof s["prunedByFileSlug"] === "string" && s["prunedByFileSlug"].length > 0))
  );
}

/**
 * One `byFile` entry, accepting EITHER the current `{line, byte}` shape or a legacy bare
 * number (P3-era data) — migrated to `{line: <that number>, byte: 0}` (registry-integrity
 * phase 04, §1: byte 0 always falls back to a full scan for that slug this one run, which
 * is correct, just not yet optimized). Any entry that fits neither shape is dropped
 * individually — same "reject, never clamp" doctrine as every other store here.
 */
function sanitizeCursorPosition(v: unknown): CursorPosition | undefined {
  if (isNonNegativeInt(v)) return { line: v, byte: 0 }; // legacy P3 bare-number migration
  if (v === null || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  if (isNonNegativeInt(o["line"]) && isNonNegativeInt(o["byte"])) return { line: o["line"], byte: o["byte"] };
  return undefined;
}

/** A plain object mapping file slug → `CursorPosition`. Any entry whose value is out of
 *  range (or fits neither the current nor legacy shape) is dropped individually — same
 *  "reject, never clamp" doctrine as the other stores here. */
function sanitizeByFile(v: unknown): Record<string, CursorPosition> | undefined {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, CursorPosition> = {};
  for (const [slug, value] of Object.entries(v as Record<string, unknown>)) {
    const pos = sanitizeCursorPosition(value);
    if (pos !== undefined) out[slug] = pos;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Read the FULL persisted state (cursor + per-file cursors + pending queue + force log +
 * skip history). Absent file → `{cursor: 0}`. Malformed entries — including an
 * out-of-range value (a negative index, `attempts < 1`, a non-finite timestamp) — are
 * REJECTED individually (dropped, never clamped into looking valid) rather than failing
 * the whole read: a corrupt queue entry must not wedge the retry loop for every OTHER
 * target, and the log is still the source of truth for what is actually unfinished.
 */
export function readSyncState(path: string): SyncState {
  if (!existsSync(path)) return { cursor: 0 };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      cursor?: unknown; cursorByte?: unknown; byFile?: unknown;
      pending?: unknown; forced?: unknown; skipHistory?: unknown; skipHistoryTruncated?: unknown;
    };
    const cursor = typeof parsed?.cursor === "number" && Number.isInteger(parsed.cursor) && parsed.cursor >= 0
      ? parsed.cursor : 0;
    const cursorByte = isNonNegativeInt(parsed?.cursorByte) ? parsed.cursorByte : undefined;
    const byFile = sanitizeByFile(parsed?.byFile);
    const pending = Array.isArray(parsed?.pending)
      ? (parsed.pending as unknown[]).filter(isValidPendingTarget)
      : [];
    const forced = Array.isArray(parsed?.forced)
      ? (parsed.forced as unknown[]).filter(isValidForcedBypass)
      : [];
    const skipHistory = Array.isArray(parsed?.skipHistory)
      ? (parsed.skipHistory as unknown[]).filter(isValidSkipRecord)
      : [];
    const skipHistoryTruncated = isNonNegativeInt(parsed?.skipHistoryTruncated) ? parsed.skipHistoryTruncated : undefined;
    return {
      cursor,
      ...(cursorByte !== undefined && { cursorByte }),
      ...(byFile !== undefined && { byFile }),
      ...(pending.length > 0 && { pending }),
      ...(forced.length > 0 && { forced }),
      ...(skipHistory.length > 0 && { skipHistory }),
      ...(skipHistoryTruncated !== undefined && skipHistoryTruncated > 0 && { skipHistoryTruncated }),
    };
  } catch {
    return { cursor: 0 };
  }
}

/**
 * Stage-4 MINOR14 — `forced`/`skipHistory` are append-only audit trails with NO existing
 * cap, unlike the OTHER append-only stores this wave already retention-caps (§2's log
 * rotation, §3's correction-memory hard cap) — the same unbounded-growth theme, just not
 * yet closed for these two. Both are pure audit records (never read back for a blocking
 * or cursor decision — grepped every call site), so keeping only the MOST RECENT entries
 * is safe: an operator's `--skip`/`--force --since` history that matters is the recent
 * one, and this is a low-frequency, operator-driven store (nothing like the per-frame
 * volume §2/§3 cap), so a generous cap is enough to bound growth without ever mattering
 * in practice.
 */
const AUDIT_TRAIL_CAP = 500;

/**
 * Write the full state (cursor + byFile + pending + forced + skipHistory), deterministic
 * (mirrors `writeCursor`/`saveRegistry`). An empty array/object is normalized away
 * (omitted, not stored as `[]`/`{}`) so a project untouched by filtering round-trips back
 * to the exact `{cursor}`-only shape a pre-existing project's state file already has.
 */
export function writeSyncState(path: string, state: SyncState): { skipHistoryTruncated: number } {
  mkdirSync(dirname(path), { recursive: true });
  const forced = state.forced && state.forced.length > AUDIT_TRAIL_CAP
    ? state.forced.slice(state.forced.length - AUDIT_TRAIL_CAP)
    : state.forced;
  const skipHistoryOverflow = Math.max(0, (state.skipHistory?.length ?? 0) - AUDIT_TRAIL_CAP);
  const skipHistory = skipHistoryOverflow > 0
    ? state.skipHistory!.slice(state.skipHistory!.length - AUDIT_TRAIL_CAP)
    : state.skipHistory;
  // Stage-4 N4 — the cap can silently drop the very "legacy-untagged-pruned" audit records
  // F3-follow-up (option B) exists to guarantee; a running total (never reset, same
  // convention as MAJOR7's `evictedUnresolved`) survives even though the actual dropped
  // records do not — the honest floor when there is nowhere left to archive them to.
  const skipHistoryTruncated = (state.skipHistoryTruncated ?? 0) + skipHistoryOverflow;
  const payload: SyncState = {
    cursor: state.cursor,
    ...(state.cursorByte !== undefined && { cursorByte: state.cursorByte }),
    ...(state.byFile && Object.keys(state.byFile).length > 0 && { byFile: state.byFile }),
    ...(state.pending && state.pending.length > 0 && { pending: state.pending }),
    ...(forced && forced.length > 0 && { forced }),
    ...(skipHistory && skipHistory.length > 0 && { skipHistory }),
    ...(skipHistoryTruncated > 0 && { skipHistoryTruncated }),
  };
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return { skipHistoryTruncated };
}
