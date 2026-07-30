/**
 * `ui figma reconcile` runner (spec 004 P2 dry-run + P4 apply, spec 005 P4 mirror) —
 * the IO layer. Owns ALL fs IO; the transforms are pure (figma-reconcile.ts preview,
 * figma-apply.ts apply). Zero network, zero LLM. Split from figma.ts to keep it a shell.
 *   --dry-run (default)  → preview the delta; write nothing; cursor untouched.
 *   --apply              → commit (soft-deprecate deletes, refresh scope / un-deprecate
 *                          re-touches) and advance the apply cursor.
 *   --mirror-file <path> → (with --apply) node specs captured from the live plugin by the
 *                          broker's sync-apply orchestration; apply replaces each
 *                          component's sidecar 1:1 and points the record at it. Absent =
 *                          no capture ran → the log-only commit still lands, every
 *                          un-mirrored component named in the report. The live scan never
 *                          happens here: the kernel stays pure (Art I.2).
 *   --file-slug <slug>   → (registry-integrity phase 03, §2) narrow the delta/apply/cursor
 *                          to one Figma file's identity in a change-log that may carry more
 *                          than one file's frames — a foreign frame is FILTERED and counted
 *                          (skipped_foreign_frames), never rejected. The cursor becomes
 *                          per-file (SyncState.byFile); the global `cursor` field is left
 *                          untouched by a filtered run. Absent = the whole-log escape hatch
 *                          for a manual, unfiltered run.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import {
  RegistryError,
  createEmptyRegistry,
  loadRegistry,
  saveRegistry,
  type Registry,
} from "../core/registry-store.js";
import {
  ReconcileError,
  coalesceFrames,
  computePreviewDelta,
  fileSlugOf,
  parseChangeLog,
  scopeSummary,
  type CoalescedComponent,
} from "../core/figma-reconcile.js";
import type { RegistryView } from "../core/figma-reconcile.js";
import { applyDelta, type SidecarWrite } from "../core/figma-apply.js";
import { indexCaptures, parseMirrorCapture, type MirrorIndex } from "../core/figma-mirror-capture.js";
import { writeFigmaNode } from "../core/figma-node-reader.js";
import {
  readSyncState, syncStatePath, writeSyncState, type PendingTarget, type SkipRecord,
} from "../core/figma-sync-state.js";
import { renderApply, renderDryRun } from "./figma-reconcile-render.js";
import { withOutcome } from "../core/memory-autorecord.js";
import { pathsForDir } from "../core/design-system.js";
import { reseal, loadDesignSystemForReseal } from "../core/ds-reseal.js";

const CHANGE_LOG_RELPATH = ["design", "figma.changes.jsonl"] as const;
const REGISTRY_RELPATH = ["design", "component-registry.json"] as const;
const DESIGN_DIR = "design";
const SUB = "figma reconcile";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flagString(parsed: ParsedArgs, key: string): string | undefined {
  const v = parsed.flags[key];
  return typeof v === "string" ? v : undefined;
}

function projectDir(parsed: ParsedArgs): string {
  const dir = flagString(parsed, "dir");
  return dir !== undefined ? resolve(dir) : process.cwd();
}

/** Parse --since into a non-negative integer, or null if malformed. undefined → null (not given). */
function parseSince(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (!/^\d+$/.test(raw.trim())) return null;
  return Number.parseInt(raw.trim(), 10);
}

// ─── Runner ─────────────────────────────────────────────────────────────────

export function runReconcile(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const apply = parsed.flags["apply"] === true;
  const dryRunFlag = parsed.flags["dry-run"] === true;
  const force = parsed.flags["force"] === true;
  const skipNodeId = flagString(parsed, "skip");

  // ── --skip: an operator's acknowledged skip (registry-integrity phase 02, §4) ────────
  // RULED CLI-only (lead): a skip is a decision that must leave an audit trail, never a
  // panel button, and no timeout ever sets it — an unattended skip would be exactly the
  // silent loss this phase removes. Standalone: it only touches the state file, never the
  // change log or the registry, so it cannot be combined with --apply/--dry-run.
  if (skipNodeId !== undefined) {
    if (apply || dryRunFlag) {
      const msg = "--skip cannot be combined with --apply or --dry-run";
      return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    const dir = projectDir(parsed);
    const statePath = syncStatePath(dir);
    const state = readSyncState(statePath);
    const pending = state.pending ?? [];
    const idx = pending.findIndex((t) => t.nodeId === skipNodeId);
    if (idx < 0) {
      const msg = `no pending target with nodeId "${skipNodeId}" — nothing to skip`;
      return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    const nextPending = pending.map((t, i) => (i === idx ? { ...t, skipped: true as const } : t));
    writeSyncState(statePath, {
      cursor: state.cursor, pending: nextPending, forced: state.forced, skipHistory: state.skipHistory,
    });
    const data = { skipped: skipNodeId, pending: nextPending };
    return useJson
      ? okJson(SUB, data)
      : { exitCode: 0, stdout: `ui: acknowledged skip for ${skipNodeId} — the cursor may now pass it\n` };
  }

  if (apply && dryRunFlag) {
    const msg = "--apply cannot be combined with --dry-run";
    return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const mirrorPath = flagString(parsed, "mirror-file");
  if (mirrorPath !== undefined && !apply) {
    const msg = "--mirror-file only applies with --apply (a dry-run writes no sidecars)";
    return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const fileSlug = flagString(parsed, "file-slug");
  if (fileSlug !== undefined && fileSlug.trim().length === 0) {
    const msg = "--file-slug must be a non-empty string";
    return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }
  // A pending entry not known to belong to THIS run's bound file cannot be gated on it: a
  // different real fileSlug belongs to a file this run never touched, so it must neither
  // block this file's cursor nor get pruned by a threshold that isn't its own. An untagged
  // legacy entry (pre-dating this field) is conservatively treated as relevant to every
  // file until it is itself resolved or explicitly skipped — "never silently lose track."
  const isBoundToRun = (t: { fileSlug?: string }): boolean =>
    fileSlug === undefined || t.fileSlug === undefined || t.fileSlug === fileSlug;

  const sinceRaw = flagString(parsed, "since");
  const sinceGiven = sinceRaw !== undefined;
  const since = parseSince(sinceRaw);
  if (sinceGiven && since === null) {
    const msg = "--since must be a non-negative integer (a line-count cursor)";
    return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  const dir = projectDir(parsed);
  const logPath = join(dir, ...CHANGE_LOG_RELPATH);
  const registryPath = join(dir, ...REGISTRY_RELPATH);
  const statePath = syncStatePath(dir);
  const priorState = readSyncState(statePath);
  const priorPending = priorState.pending ?? [];
  const blockingPrior = priorPending.filter((t) => t.skipped !== true && isBoundToRun(t));

  // `--since` must not be a back door around an un-acknowledged queue (§4): it would let
  // `--apply --since <later>` skip the queue without acknowledging anything.
  if (apply && sinceGiven && blockingPrior.length > 0 && !force) {
    const msg =
      `--since is refused while ${blockingPrior.length} target(s) are pending — run ` +
      "`ui figma reconcile --skip <nodeId>` to acknowledge each one, or pass --force to " +
      "bypass (recorded in the state file)";
    return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  // Parse the whole change-log (absent → empty). A corrupt line fails hard.
  let frames;
  try {
    const raw = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    frames = parseChangeLog(raw);
  } catch (e) {
    if (e instanceof ReconcileError) {
      return useJson ? errJson(SUB, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }

  // Load the full registry (absent → empty). A malformed registry fails hard.
  let registry: Registry;
  try {
    registry = existsSync(registryPath) ? loadRegistry(registryPath) : createEmptyRegistry();
  } catch (e) {
    if (e instanceof RegistryError) {
      return useJson ? errJson(SUB, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }
  const existing: ReadonlyMap<string, RegistryView> = new Map(
    registry.components.map((c) => [c.name, { name: c.name, scope: c.scope, deprecated: c.deprecated }]),
  );

  const cursorTo = frames.length;
  // dry-run defaults the cursor to 0 (preview whole log); apply defaults it to the
  // persisted apply cursor — the per-file one (SyncState.byFile) when --file-slug is given
  // (resume where THIS file's last filtered commit stopped), else the global one. --since
  // overrides both.
  const cursorFrom0 = sinceGiven
    ? (since as number)
    : apply
      ? (fileSlug !== undefined ? (priorState.byFile?.[fileSlug] ?? priorState.cursor) : priorState.cursor)
      : 0;
  const cursorFrom = Math.min(cursorFrom0, cursorTo);
  const slice = frames.slice(cursorFrom);
  // ABSOLUTE indices (registry-integrity phase 02): `slice` is resumed from `cursorFrom`,
  // so `coalesceFrames` must be told the offset — otherwise firstFrameIndex/lastFrameIndex
  // would number a resumed run from 0 while the persisted cursor indexes the whole log.
  const coalesced = coalesceFrames(slice, cursorFrom);
  // Registry-integrity phase 03 (5.2), §2 — filter POST-coalesce (on the resolved
  // fileSlug), never pre-coalesce on raw frames: `coalesceFrames`'s absolute-index math
  // (`baseIndex + i`) depends on every frame in `slice` keeping its true array position,
  // so filtering frames out BEFORE coalescing would corrupt the very index math phase 02
  // relies on for cursor safety.
  const scoped = fileSlug === undefined ? coalesced : coalesced.filter((c) => c.fileSlug === fileSlug);
  // Frame-level count of what got filtered out, independent of the coalesce-and-filter
  // mechanism above (a foreign frame may coalesce into a target already excluded above,
  // but this counts the raw frames themselves — what the phase asked to be reported).
  const skippedForeignFrames = fileSlug === undefined
    ? 0
    : slice.filter((f) => fileSlugOf(f.fileKey, f.fileName) !== fileSlug).length;
  const delta = computePreviewDelta(scoped, existing);
  const scope = scopeSummary(delta);

  const base = {
    cursor_from: cursorFrom,
    cursor_to: cursorTo,
    ...(fileSlug !== undefined && { file_slug: fileSlug, skipped_foreign_frames: skippedForeignFrames }),
    delta: { added: delta.added, updated: delta.updated, deprecated: delta.deprecated },
    scope_summary: scope,
    ...(delta.unresolved.length > 0 && { caps: { unresolved: delta.unresolved } }),
    // Informational passthrough of the PERSISTED queue — a dry-run runs no capture, so it
    // cannot discover anything new; the apply branch below overrides this with the freshly
    // recomputed queue.
    pending: priorPending,
  };

  if (!apply) {
    const data = { ...base, dry_run: true as const };
    return useJson ? okJson(SUB, data) : { exitCode: 0, stdout: renderDryRun(data) };
  }

  // ── APPLY: sidecars first, then the registry, then the cursor ───────────────
  // A pointer must never outlive the file it points at, so the sidecars land BEFORE the
  // registry: a failed write aborts with nothing committed and the cursor unmoved, and
  // the next apply retries the same slice.
  let mirror: MirrorIndex | undefined;
  if (mirrorPath !== undefined) {
    try {
      const raw = readFileSync(resolve(mirrorPath), "utf8");
      mirror = indexCaptures(parseMirrorCapture(raw, mirrorPath));
    } catch (e) {
      if (e instanceof ReconcileError) {
        return useJson ? errJson(SUB, e.code, e.message) : errText(`ui: ${e.message}\n`);
      }
      const msg = `cannot read mirror capture '${mirrorPath}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(SUB, "READ_ERROR", msg) : errText(`ui: ${msg}\n`);
    }
  }

  const { registry: next, report, sidecarWrites, changed } = applyDelta(registry, delta, mirror, fileSlug);

  // ── Registry-integrity phase 02 (5.3), §4: the safe cursor + retry queue ────────────
  // "Unfinished" is wider than dropped-or-failed: an ADD `applyDelta` could not
  // materialize (`report.pending` — captured-but-unregistrable, or no capture at all) and
  // a DELETE that lost its identity (`delta.unresolved`) are both work that did not land,
  // so both join the blocking set alongside a mirror drop/failure.
  // Registry-integrity phase 03 (5.2), §2 — built from `scoped`, NOT `coalesced`: a
  // foreign file's dropped/failed target must never enter THIS project's pending retry
  // queue, or the cross-file contamination this whole phase removes would re-enter
  // through the P2 unfinished-tracking mechanism's back door.
  const byNodeId = new Map(scoped.map((c) => [c.nodeId, c]));
  const byName = new Map<string, CoalescedComponent>();
  for (const c of scoped) if (c.nodeName !== null) byName.set(c.nodeName, c);

  interface UnfinishedThisRun { nodeId: string; name: string; firstFrameIndex: number; fileSlug: string; reason: string; attempted: boolean }
  const thisRun = new Map<string, UnfinishedThisRun>();
  const noteUnfinished = (
    nodeId: string, name: string, c: CoalescedComponent | undefined, reason: string, attempted: boolean,
  ): void => {
    if (c === undefined || thisRun.has(nodeId)) return; // first reason wins; a target only needs ONE
    thisRun.set(nodeId, { nodeId, name, firstFrameIndex: c.firstFrameIndex, fileSlug: c.fileSlug, reason, attempted });
  };
  if (mirror) {
    for (const c of scoped) {
      // Dropped by the cap: never reached the scanner — NOT an attempt (fix round finding 1).
      if (mirror.dropped.has(c.nodeId)) {
        noteUnfinished(c.nodeId, c.nodeName ?? c.nodeId, c, "dropped by the batch cap (MAX_SCANS) — not attempted this run", false);
      }
      // Scanned and failed — a REAL attempt.
      const failReason = mirror.failures.get(c.nodeId);
      if (failReason !== undefined) noteUnfinished(c.nodeId, c.nodeName ?? c.nodeId, c, failReason, true);
    }
  }
  // By the time a nodeId reaches here, the mirror loop above has already claimed anything
  // that was genuinely scanned-and-failed (`mirror.failures`) — so a `report.pending` entry
  // reaching this point never had a real attempt this run (no mirror at all, or the target
  // simply was not in this batch): NOT an attempt.
  for (const p of report.pending) {
    const c = byName.get(p.name);
    noteUnfinished(c?.nodeId ?? p.name, p.name, c, p.reason, false);
  }
  // A DELETE that lost its identity never goes through mirror capture at all — never an attempt.
  for (const u of delta.unresolved) noteUnfinished(u.nodeId, u.nodeId, byNodeId.get(u.nodeId), u.reason, false);

  // Fix round (finding 3 precursor is below; this is findings 1+2): positive evidence that
  // a target's OWN content actually landed this run — a record was added/updated, or its
  // sidecar/mirror was replaced (an unchanged record can still get a fresh sidecar; see
  // figma-apply.ts's "an unchanged record still re-writes the sidecar" case).
  const landedNames = new Set<string>([...report.added, ...report.updated, ...report.mirrored]);

  // Merge with the PRIOR run's queue: a skipped entry is carried as-is (no re-evaluation —
  // an acknowledged skip is final); a still-unfinished entry gets its attempt count bumped,
  // its reason refreshed, and `lastAttemptedAt` stamped ONLY when actually attempted this
  // run (fix round finding 1 — a merely-dropped-again entry must not look "just tried").
  // Fix round (finding 2): absence from `thisRun` is NOT positive evidence of resolution —
  // it can simply mean this run ran no mirror at all, or never re-touched this specific
  // target for an unrelated reason. An entry leaves pending ONLY on `landedNames` evidence
  // or an explicit skip; otherwise it carries forward completely unchanged (attempts too).
  const now = Date.now();
  const merged = new Map<string, PendingTarget>();
  for (const p of priorPending) {
    if (p.skipped === true) { merged.set(p.nodeId, p); continue; }
    const u = thisRun.get(p.nodeId);
    if (u !== undefined) {
      // `fileSlug` is stamped opportunistically here even for a legacy (undefined) prior
      // entry — `u.fileSlug` comes straight from the coalesced component's own real
      // identity, never from whether `--file-slug` filtering happened to be active.
      merged.set(p.nodeId, {
        ...p, fileSlug: p.fileSlug ?? u.fileSlug, attempts: p.attempts + 1, lastReason: u.reason,
        lastAttemptedAt: u.attempted ? now : p.lastAttemptedAt,
      });
    } else if (!landedNames.has(p.name)) {
      merged.set(p.nodeId, p); // no evidence either way — carried forward completely unchanged
    }
    // else: landedNames has it → genuinely resolved this run — drop it (do not re-add)
  }
  for (const [nodeId, u] of thisRun) {
    if (merged.has(nodeId)) continue; // already carried forward above with an incremented count
    merged.set(nodeId, {
      nodeId, name: u.name, firstFrameIndex: u.firstFrameIndex, fileSlug: u.fileSlug, attempts: 1,
      lastReason: u.reason, firstSeenTs: now, ...(u.attempted ? { lastAttemptedAt: now } : {}),
    });
  }

  // The cursor may advance only to the earliest frame that produced a still-blocking
  // (non-skipped) target — records AFTER a blocked one still applied above (the whole
  // slice already ran through `applyDelta`); only the CURSOR stops early, so the next run
  // re-derives the blocked target from the log (a small re-processed overlap, not a skip).
  // Re-application is idempotent: `registerComponent` upserts by name.
  // Registry-integrity phase 03 (5.2), §2 — `isBoundToRun` scopes both the blocking set
  // (a foreign file's stuck target must not gate THIS file's cursor) and the prune (an
  // entry irrelevant to this run is left untouched — its own file's cursor didn't move).
  const blocking = [...merged.values()].filter((t) => t.skipped !== true && isBoundToRun(t));
  const safeCursorTo = blocking.length === 0 ? frames.length : Math.min(...blocking.map((t) => t.firstFrameIndex));
  // Invariant: `pending` only ever holds entries the cursor has NOT yet passed — a skip or
  // a resolution behind the new cursor is pruned here, not carried forever. An entry
  // irrelevant to this run's bound file always survives the prune untouched (`safeCursorTo`
  // does not apply to it).
  const nextPending = [...merged.values()].filter((t) => !isBoundToRun(t) || t.firstFrameIndex >= safeCursorTo);
  // Fix round (finding 4): a PRUNED skipped entry loses its only trace the instant it drops
  // out of `pending` — durably record it (never itself pruned) before it's gone.
  const newlyPrunedSkips: SkipRecord[] = [...merged.values()]
    .filter((t) => t.skipped === true && isBoundToRun(t) && t.firstFrameIndex < safeCursorTo)
    .map((t) => ({ nodeId: t.nodeId, name: t.name, at: now }));
  const skipHistory = newlyPrunedSkips.length > 0
    ? [...(priorState.skipHistory ?? []), ...newlyPrunedSkips]
    : priorState.skipHistory;

  // Snapshot the DS *before* any write this apply might make (spec 009 P1, Art IV) —
  // reseal needs the pre-mutation manifest to bump generation from, and a DS_TAMPERED
  // load must refuse before anything (sidecars included) is written — never heal on top
  // of an already-tampered store (D4). No manifest present → nothing to reseal.
  const dsPaths = pathsForDir(join(dir, DESIGN_DIR));
  let ds;
  if (changed) {
    try {
      ds = loadDesignSystemForReseal(dsPaths);
    } catch (e) {
      const code = e !== null && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "WRITE_ERROR";
      const msg = e instanceof Error ? e.message : String(e);
      return useJson ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`);
    }
  }

  let sidecarsWritten = false;
  try {
    sidecarsWritten = writeSidecars(join(dir, DESIGN_DIR), sidecarWrites, fileSlug);
    if (changed) saveRegistry(registryPath, next);
    if (changed && ds !== undefined) {
      reseal({
        ds, paths: dsPaths, registry: next, nowIso: new Date().toISOString(),
        entry: {
          kind: "register", by: "ui figma reconcile",
          note: `added ${report.added.length}, updated ${report.updated.length}, deprecated ${report.deprecated.length}`,
        },
      });
    }
    // A REAL --force bypass (one that actually skipped a non-empty blocking queue) is
    // recorded so it is auditable rather than invisible — never silently dropped.
    const forced = sinceGiven && force && blockingPrior.length > 0
      ? [...(priorState.forced ?? []), { at: now, since: since as number }]
      : priorState.forced;
    // Registry-integrity phase 03 (5.2), §2 — a `--file-slug`-filtered run advances ONLY
    // its own entry in `byFile`; the global `cursor` (a shared, project-wide field with no
    // per-file concept) is left exactly as it was. An unfiltered run keeps advancing
    // `cursor` as before and leaves `byFile` untouched (it never resolved per-file work).
    const nextCursor = fileSlug === undefined ? safeCursorTo : priorState.cursor;
    const nextByFile = fileSlug === undefined ? priorState.byFile : { ...priorState.byFile, [fileSlug]: safeCursorTo };
    writeSyncState(statePath, { cursor: nextCursor, byFile: nextByFile, pending: nextPending, forced, skipHistory });
  } catch (e) {
    if (e instanceof RegistryError) {
      return useJson ? errJson(SUB, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return useJson ? errJson(SUB, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  const data = {
    ...base, cursor_to: safeCursorTo, dry_run: false as const, applied: true as const,
    apply: report, pending: nextPending,
  };
  const out = useJson ? okJson(SUB, data) : { exitCode: 0, stdout: renderApply(data, report) };
  // Fix round (finding 3): `sidecarWrites.length > 0` counted CANDIDATE writes, not actual
  // ones — a content-guarded rewrite of byte-identical sidecar content (re-applying the
  // overlap behind a blocked target, e.g.) still "candidates" every run, so this recorded a
  // duplicate `reconcile_applied` memory event every single re-apply even when nothing on
  // disk changed. `sidecarsWritten` reflects `writeFigmaNode`'s own `written` flag instead.
  const recordable = changed || sidecarsWritten;
  if (!recordable) return out;
  return withOutcome(out, parsed, {
    type: "reconcile_applied",
    actor: "ui figma reconcile",
    projectDir: dir,
    data: {
      added: report.added, updated: report.updated, deprecated: report.deprecated,
      mirrored: report.mirrored.length, cursorFrom, cursorTo: safeCursorTo,
    },
  });
}

/** Write every captured sidecar (content-guarded by writeFigmaNode). Throws RegistryError.
 *  Returns whether ANY sidecar was actually written — a content-guarded skip (byte-identical
 *  rewrite) does not count (fix round, finding 3). `fileSlug` (registry-integrity phase 03,
 *  §3) partitions the path exactly as `applyDelta` already partitioned the pointer stored on
 *  the record — the two must always agree, or a pointer would outlive the file it names. */
function writeSidecars(designDir: string, writes: readonly SidecarWrite[], fileSlug?: string): boolean {
  let anyWritten = false;
  for (const w of writes) {
    if (writeFigmaNode(designDir, w.name, w.node, fileSlug).written) anyWritten = true;
  }
  return anyWritten;
}
