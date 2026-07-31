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
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
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
  scopeSummary,
  type CoalescedComponent,
} from "../core/figma-reconcile.js";
import type { RegistryView } from "../core/figma-reconcile.js";
import { streamChangeLog, type StreamedFrame } from "../core/change-log-stream.js";
import { readRotateMarker } from "../core/change-log-rotation.js";
import { applyDelta, type SidecarWrite } from "../core/figma-apply.js";
import { indexCaptures, parseMirrorCapture, type MirrorIndex } from "../core/figma-mirror-capture.js";
import { writeFigmaNode } from "../core/figma-node-reader.js";
import {
  readSyncState, syncStatePath, writeSyncState, type CursorPosition, type PendingTarget, type SkipRecord,
} from "../core/figma-sync-state.js";
import { renderApply, renderDryRun } from "./figma-reconcile-render.js";
import { withOutcome } from "../core/memory-autorecord.js";
import { pathsForDir } from "../core/design-system.js";
import { reseal, loadDesignSystemForReseal } from "../core/ds-reseal.js";

const CHANGE_LOG_RELPATH = ["design", "figma.changes.jsonl"] as const;
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
    // Stage-4 MAJOR10 — the old explicit-field rebuild OMITTED `byFile`/`cursorByte`
    // entirely, silently wiping every per-file cursor (and the unfiltered byte hint) on
    // every `--skip` call. Spread the WHOLE prior state first, then override only
    // `pending` — the one field this command actually changes.
    writeSyncState(statePath, { ...state, pending: nextPending });
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
  // block this file's cursor nor get pruned by a threshold that isn't its own.
  //
  // Registry-integrity phase 03 fix round (F3, team-lead ruling) — ASYMMETRIC on purpose:
  // BLOCKING (does this entry gate the cursor / refuse a --since bypass) requires a
  // STRICT match. An untagged (pre-P3) entry is never known to belong to THIS specific
  // filtered run, so it can no longer permanently wedge every OTHER file's cursor just
  // because its own true file happens to never be the one reopened — the earlier
  // "lenient blocks everyone" behavior (and a considered migration-stamp alternative)
  // were both rejected: the stamp rests on an unproven "byFile empty ⇒ single-file
  // project" assumption; strict blocking needs no such assumption at all.
  const isStrictlyBoundToRun = (t: { fileSlug?: string }): boolean =>
    fileSlug === undefined || t.fileSlug === fileSlug;
  // PRUNING (is this entry still eligible to be carried/aged-out by today's threshold)
  // stays LENIENT, unchanged: an untagged entry is still a candidate to leave the queue
  // via the existing retry-first + positive-evidence-only-removal machinery once
  // whichever cursor it is actually tied to passes it — lenient pruning just means it is
  // never PERMANENTLY exempt from ever being reconsidered, the same as before this fix.
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
  // Stage-4 N6 — resolved ONCE, here, and reused for every registry read/write AND the
  // later reseal (never a second, independent `pathsForDir` call): the same project dir
  // must never resolve to two different registry files within one run. Respects a
  // foreign artifact already occupying `component-registry.json` (e.g. a project's own
  // generated component registry, unrelated to this kernel) by falling back to
  // `figma-component-registry.json` — see `registryFileForDir`'s own doc for the 4 branches.
  const dsPaths = pathsForDir(join(dir, DESIGN_DIR));
  const registryPath = dsPaths.registry;
  const statePath = syncStatePath(dir);
  const priorState = readSyncState(statePath);
  const priorPending = priorState.pending ?? [];
  const blockingPrior = priorPending.filter((t) => t.skipped !== true && isStrictlyBoundToRun(t));

  // `--since` must not be a back door around an un-acknowledged queue (§4): it would let
  // `--apply --since <later>` skip the queue without acknowledging anything.
  if (apply && sinceGiven && blockingPrior.length > 0 && !force) {
    const msg =
      `--since is refused while ${blockingPrior.length} target(s) are pending — run ` +
      "`ui figma reconcile --skip <nodeId>` to acknowledge each one, or pass --force to " +
      "bypass (recorded in the state file)";
    return useJson ? errJson(SUB, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  // dry-run defaults the cursor to 0 (preview whole log); apply defaults it to the
  // persisted apply cursor — the per-file one (SyncState.byFile) when --file-slug is given
  // (resume where THIS file's last filtered commit stopped), else the global one. --since
  // overrides both.
  let cursorFrom0 = sinceGiven
    ? (since as number)
    : apply
      ? (fileSlug !== undefined ? (priorState.byFile?.[fileSlug]?.line ?? priorState.cursor) : priorState.cursor)
      : 0;
  // Registry-integrity phase 04 (5.4), §1 — the byte seek hint is trusted ONLY when
  // resuming the PERSISTED cursor with no override: an explicit --since or a dry-run's
  // whole-log preview has no corresponding byte hint to trust, so both read from byte 0
  // (the same cost as today's full parse — no regression, no speedup for those two paths;
  // this phase's measured target is the repeated-apply hot path).
  const usingPersistedCursor = apply && !sinceGiven;
  const fromByte = usingPersistedCursor
    ? (fileSlug !== undefined ? (priorState.byFile?.[fileSlug]?.byte ?? 0) : (priorState.cursorByte ?? 0))
    : 0;

  // Read the change-log tail from the byte/line cursor (absent file → empty). A corrupt
  // line inside the range actually read still fails hard, exactly like a whole-file parse.
  let streamResult;
  try {
    streamResult = streamChangeLog(logPath, fromByte, cursorFrom0);
  } catch (e) {
    if (e instanceof ReconcileError) {
      return useJson ? errJson(SUB, e.code, e.message) : errText(`ui: ${e.message}\n`);
    }
    throw e;
  }

  // Registry-integrity phase 04 (5.4), §2 — ANY fallback on the PERSISTED cursor means the
  // old absolute numbering no longer verifiably corresponds to the live file — the stale
  // `fromLine` filter a fallback's own full-scan applied would otherwise exclude every
  // frame in a now-shorter/different file, silently dropping real content with zero trace
  // (the exact failure this whole phase exists to remove). Stage-4 MAJOR4 — this used to
  // gate on `fallbackKind === "byte-past-size"` alone (rotation's specific signature), but
  // ANY fallback kind on this path needs the SAME reset, not just that one: a
  // `.rotated.json` marker CONFIRMS a real rotation (`rotated_away_lines`, a precise count
  // from the marker's own recorded pre-rotation total); its ABSENCE — a hand-truncated
  // file, corruption, or a rotation whose marker write itself failed — still gets the
  // SAME reset (never a hard error, never a silent stale-filter skip), just named
  // separately (`history_gap_lines`, the best available measure: how far the old cursor
  // had already claimed to be, now unverifiable against this different file).
  let rotatedAwayLines = 0;
  let historyGapLines = 0;
  // Stage-4 BLOCKER1 — a confirmed rotation (or an unconfirmed gap) invalidates every
  // PENDING entry's own recorded `firstFrameIndex` too: it was indexed against a file that
  // is no longer verifiably the live one. Left alone, a stale absolute index (e.g. 4, from
  // a log that has since changed) can exceed the fresh file's own (much smaller) total,
  // and unclamped `safeCursorTo` math below would then report a cursor PAST the live
  // file's actual end. Team-lead ruling: REBASE to 0, never retire the entry — the
  // component still needs capture, and pending-first capture + positive-evidence removal
  // resolve it exactly as before, just renumbered.
  //
  // Stage-4 N3 — scoped to `isBoundToRun(t)` (this run's own file, or an untagged legacy
  // entry), NOT every entry: a different real file's entry is invisible to THIS run's
  // `blocking`/`safeCursorTo` math either way (strict match), so rebasing it here is pure
  // waste — worse, doing so PINS that other file's own future `safeCursorTo` at 0 forever
  // (every run after this one sees a strictly-bound, firstFrameIndex:0 blocker), forcing a
  // full reprocess on EVERY subsequent run for that file instead of just once. That file's
  // OWN future run independently detects the SAME rotation (its own byte hint goes stale
  // too) and rebases its OWN entries at the correct time, scoped to itself.
  let rotatedPending = priorPending;
  if (usingPersistedCursor && streamResult.fellBackToFullScan) {
    const marker = readRotateMarker(logPath);
    const staleCursorFrom0 = cursorFrom0;
    if (marker !== undefined) {
      rotatedAwayLines = Math.max(0, marker.atLine - staleCursorFrom0);
    } else {
      historyGapLines = staleCursorFrom0;
    }
    cursorFrom0 = 0;
    rotatedPending = priorPending.map((t) => (isBoundToRun(t) ? { ...t, firstFrameIndex: 0 } : t));
    try {
      streamResult = streamChangeLog(logPath, 0, 0);
    } catch (e) {
      if (e instanceof ReconcileError) {
        return useJson ? errJson(SUB, e.code, e.message) : errText(`ui: ${e.message}\n`);
      }
      throw e;
    }
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

  // `cursorFrom` is clamped ONLY when the total is actually known (a full scan ran); the
  // trusted-hint fast path's `cursorFrom0` is already guaranteed valid by
  // `streamChangeLog`'s own byte-hint verification (size + newline boundary).
  const cursorFrom = streamResult.totalFrames !== undefined
    ? Math.min(cursorFrom0, streamResult.totalFrames)
    : cursorFrom0;
  // The trusted-hint path always reads through EOF, so cursorFrom0 + (frames read) IS the
  // log's current total frame count — mathematically exact, not an approximation.
  const cursorTo = streamResult.totalFrames ?? (cursorFrom0 + streamResult.frames.length);
  const slice = streamResult.frames.map((s) => s.frame);
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
  const foreignFrames = fileSlug === undefined
    ? []
    : slice.filter((f) => fileSlugOf(f.fileKey, f.fileName) !== fileSlug);
  const skippedForeignFrames = foreignFrames.length;
  // Registry-integrity phase 03 fix round (MAJOR 2) — the 'unknown' bucket (a Figma-Free
  // file with no fileName recorded, or a pre-P3 log line with neither fileKey nor
  // fileName) is unreachable by any --file-slug except the literal string "unknown": once
  // a REAL bound file's filtered cursor advances past one of these frames, it is filtered
  // out as foreign FOREVER, by every other real slug too — silently dropped, never
  // reachable again through the normal per-project flow. Counted SEPARATELY (a subset of
  // skippedForeignFrames, not in addition to it) so the operator can see it is happening
  // and drain it deliberately (`--file-slug unknown`) — never auto-adopted into whichever
  // project happens to run next.
  const skippedLegacyFrames = fileSlug === undefined
    ? 0
    : foreignFrames.filter((f) => fileSlugOf(f.fileKey, f.fileName) === "unknown").length;
  const delta = computePreviewDelta(scoped, existing);
  const scope = scopeSummary(delta);

  const base = {
    cursor_from: cursorFrom,
    cursor_to: cursorTo,
    ...(fileSlug !== undefined && { file_slug: fileSlug, skipped_foreign_frames: skippedForeignFrames }),
    ...(skippedLegacyFrames > 0 && { skipped_legacy_frames: skippedLegacyFrames }),
    // Registry-integrity phase 04 (5.4), §2 — how many frames' worth of history became
    // unreachable through the normal resume path because the log rotated past this
    // cursor (still archived in `<path>.N`, never destroyed — just no longer auto-applied).
    ...(rotatedAwayLines > 0 && { rotated_away_lines: rotatedAwayLines }),
    // Stage-4 MAJOR4 — a fallback with NO rotation marker: the persisted cursor's old
    // numbering could not be verified against the live file at all (hand-truncated,
    // corrupted, or a rotation whose marker write itself failed) — named separately from
    // `rotated_away_lines` because, unlike a confirmed rotation, there is no authoritative
    // record of what actually happened; this is the best available measure (how far the
    // stale cursor had claimed to be) so the operator can see it happened, never a hard
    // error and never a silent stale-filter skip of real content.
    ...(historyGapLines > 0 && { history_gap_lines: historyGapLines }),
    // Stage-4 N6 — a FOREIGN artifact (e.g. a project's own generated component registry,
    // unrelated to this kernel) occupies the conventional `component-registry.json` name;
    // the kernel is using the alternate `figma-component-registry.json` instead, never
    // touching the foreign file. Named explicitly (never just a boolean) so the divergence
    // is visible, not silent.
    ...(dsPaths.foreignRegistryAtDefaultPath && {
      foreign_registry_at_default_path: true,
      registry_path: registryPath,
    }),
    delta: { added: delta.added, updated: delta.updated, deprecated: delta.deprecated },
    scope_summary: scope,
    ...(delta.unresolved.length > 0 && { caps: { unresolved: delta.unresolved } }),
    // Informational passthrough of the PERSISTED queue — a dry-run runs no capture, so it
    // cannot discover anything new; the apply branch below overrides this with the freshly
    // recomputed queue. `rotatedPending` (== `priorPending` unless a rotation was just
    // confirmed) keeps this consistent with whatever numbering is actually live.
    pending: rotatedPending,
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

  const { registry: next, report, sidecarWrites, orphanedSidecarPaths, changed, touched } =
    applyDelta(registry, delta, mirror, fileSlug);

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
  for (const p of rotatedPending) {
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
  // Registry-integrity phase 03 (5.2), §2 + fix round F3 — the BLOCKING set uses the
  // STRICT predicate: a foreign file's stuck target must not gate THIS file's cursor, and
  // (F3) neither may an UNTAGGED legacy entry that isn't known to be this run's own. The
  // PRUNE below stays lenient (an entry irrelevant to this run is left untouched — its
  // own file's cursor didn't move, whether or not it happens to be tagged yet).
  const blocking = [...merged.values()].filter((t) => t.skipped !== true && isStrictlyBoundToRun(t));
  // Stage-4 BLOCKER1 — clamp to `cursorTo`: a blocking entry's OWN recorded index can never
  // legitimately exceed the log's actual current end (rebased-to-0 above on a confirmed
  // rotation closes the usual way it could; this clamp is the hard floor regardless of
  // cause, so the cursor can never leap past a real EOF and misreport progress that never
  // happened).
  const safeCursorTo = blocking.length === 0 ? cursorTo : Math.min(cursorTo, ...blocking.map((t) => t.firstFrameIndex));
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
  // Fix round (F3 follow-up, team-lead ruling option B) — an untagged legacy pending entry
  // no longer gates any file's cursor (F3's asymmetric predicate), but pruning stays
  // lenient: the first time ANY filtered run's cursor passes its recorded position it
  // silently drops out of `pending`. Unlike an acknowledged skip (durably recorded just
  // above), this entry was never resolved or skipped — just outrun — so without this it
  // vanishes with zero trace, the exact failure class this whole wave exists to close
  // (F2 counts it, §3 archives it, F6 logs a delete failure — same floor, last exit).
  // Only possible when `isBoundToRun` (lenient) held but `isStrictlyBoundToRun` did not —
  // i.e. exactly an untagged entry under a `--file-slug`-filtered run.
  const newlyPrunedUntagged: SkipRecord[] = [...merged.values()]
    .filter((t) => t.skipped !== true && isBoundToRun(t) && !isStrictlyBoundToRun(t) && t.firstFrameIndex < safeCursorTo)
    .map((t) => ({
      nodeId: t.nodeId, name: t.name, at: now, reason: "legacy-untagged-pruned",
      firstFrameIndex: t.firstFrameIndex, prunedByFileSlug: fileSlug,
    }));
  const skipHistory = newlyPrunedSkips.length > 0 || newlyPrunedUntagged.length > 0
    ? [...(priorState.skipHistory ?? []), ...newlyPrunedSkips, ...newlyPrunedUntagged]
    : priorState.skipHistory;

  // Snapshot the DS *before* any write this apply might make (spec 009 P1, Art IV) —
  // reseal needs the pre-mutation manifest to bump generation from, and a DS_TAMPERED
  // load must refuse before anything (sidecars included) is written — never heal on top
  // of an already-tampered store (D4). No manifest present → nothing to reseal.
  // `dsPaths` is the SAME one resolved once, above — never re-resolved here.
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

  let sidecarsWritten: boolean;
  // Stage-4 N2 — `writeShards`' orphan-shard detection (MAJOR9's recovery path) was
  // computed and then discarded by `saveRegistry`'s old `void` return; surfaced here so
  // the detection this call already pays for actually reaches someone.
  let orphanShards: string[] = [];
  // Stage-4 N4 — the running total AFTER this write, surfaced in the envelope.
  let skipHistoryTruncated: number;
  try {
    sidecarsWritten = writeSidecars(join(dir, DESIGN_DIR), sidecarWrites, fileSlug);
    // Registry-integrity phase 04 (5.4), §5 — `touched` (this apply's own Map-based delta)
    // lets saveRegistry's shard writer skip diffing every OTHER component, not just
    // avoid rewriting them (§4 already did that) — O(touched), not O(N), per apply.
    if (changed) ({ orphanShards } = saveRegistry(registryPath, next, touched));
    // Stage-4 MAJOR6 — F6's cleanup must run AFTER `saveRegistry` succeeds, not before.
    // The old order deleted the flat file BEFORE the registry's NEW nested pointer was
    // durably persisted: a `saveRegistry` failure right after would leave the ON-DISK
    // registry still holding the OLD (now-deleted) flat pointer — a pointer outliving the
    // file it names, the exact invariant this whole phase exists to protect. Deleting only
    // once the nested pointer is committed means a save failure instead leaves the flat
    // file harmlessly in place, matching the registry that (unchanged) still points to it.
    for (const { oldPath, newPath } of orphanedSidecarPaths) {
      const oldAbs = resolve(join(dir, DESIGN_DIR, oldPath));
      const newAbs = resolve(join(dir, DESIGN_DIR, newPath));
      // Stage-4 N1 (BLOCKING regression) — MINOR12 generalized this delete to ANY pointer
      // move, but on a case-INSENSITIVE filesystem (macOS's default) two DIFFERENT-looking
      // paths (a pre-F5 lowercased dir vs F5's new case-preserving one) can be the SAME
      // physical file: the new sidecar write already landed there, so deleting "the old
      // path" would delete the file just written, leaving the registry pointing at
      // nothing. Guard with inode+device equality (the OS-level "same file" answer);
      // fall back to a case-insensitive path compare only if either stat throws (e.g. a
      // transient race) — never skip the safety check just because stat failed.
      if (isSameFileOnDisk(oldAbs, newAbs)) continue;
      try {
        rmSync(oldAbs, { force: true });
      } catch (e) {
        report.cleanupFailed.push({ path: oldPath, reason: e instanceof Error ? e.message : String(e) });
      }
    }
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
    // per-file concept) is left exactly as it was.
    // Registry-integrity phase 04 (5.4), §1 — the byte hint paired with whichever cursor
    // actually advanced this run; `byteAtFrameIndex` derives it from this run's own
    // streamed frames (or `sliceStartByte` when nothing advanced past where we started).
    const nextCursorByte = byteAtFrameIndex(streamResult, cursorFrom0, safeCursorTo);
    const nextCursor = fileSlug === undefined ? safeCursorTo : priorState.cursor;
    const nextCursorByteField = fileSlug === undefined ? nextCursorByte : priorState.cursorByte;
    // Registry-integrity phase 03 fix round (MAJOR 1) — an UNFILTERED apply processes the
    // WHOLE log through `safeCursorTo`, which means EVERY file's own frames up to that
    // point are already fully applied — not just the unfiltered global cursor's. Leaving
    // `byFile` untouched (P3's original design) let a stale per-file cursor "rewind" the
    // next `--file-slug` run and re-apply an overlap the unfiltered run already committed.
    // Bump every existing entry to at least `safeCursorTo` (never rewind one that is
    // already further ahead — e.g. from a filtered run racing past this one).
    const nextByFile = fileSlug === undefined
      ? bumpByFileToUnfilteredCursor(priorState.byFile, safeCursorTo, nextCursorByte)
      : { ...priorState.byFile, [fileSlug]: { line: safeCursorTo, byte: nextCursorByte } };
    ({ skipHistoryTruncated } = writeSyncState(statePath, {
      cursor: nextCursor, cursorByte: nextCursorByteField, byFile: nextByFile,
      pending: nextPending, forced, skipHistory,
      // Stage-4 N4 — thread the PRIOR running total through so `writeSyncState`'s own
      // accumulation (prior + this write's own overflow) is a true cumulative count,
      // never reset to just this write's contribution.
      skipHistoryTruncated: priorState.skipHistoryTruncated,
    }));
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
    // Stage-4 N2 — report-only: shard files a corrupt-index recovery could not safely
    // remove (MAJOR9), never auto-deleted, surfaced so the detection reaches an operator.
    ...(orphanShards.length > 0 && { orphan_shards: orphanShards }),
    // Stage-4 N4 — a running total of skipHistory entries the 500-cap has ever evicted;
    // some of those may have been the legacy-untagged-pruned audit records option-b
    // added, so this count is the honest floor once they are gone.
    ...(skipHistoryTruncated > 0 && { skip_history_truncated: skipHistoryTruncated }),
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

/**
 * Stage-4 N1 — true when two ABSOLUTE paths refer to the SAME file on disk right now,
 * checked via inode + device number (the OS's own "same file" answer, immune to how many
 * different-looking path strings a case-insensitive filesystem folds onto one inode).
 * Falls back to a case-insensitive string compare ONLY when either `statSync` throws
 * (e.g. a path that no longer exists, or a transient race) — never silently treats a
 * stat failure as "different" without at least this best-effort check, since skipping
 * the guard entirely on a stat error is exactly the failure mode this function exists
 * to close.
 */
function isSameFileOnDisk(pathA: string, pathB: string): boolean {
  try {
    const a = statSync(pathA);
    const b = statSync(pathB);
    return a.ino === b.ino && a.dev === b.dev;
  } catch {
    return pathA.toLowerCase() === pathB.toLowerCase();
  }
}

/**
 * Registry-integrity phase 04 (5.4), §1 — the byte offset to persist as the NEXT run's
 * seek hint for frame index `target`, derived from THIS run's own streamed frames (never
 * guessed).
 *
 * Stage-4 BLOCKER2 — the original `target <= from` single branch conflated two DIFFERENT
 * cases: `target === from` (nothing new landed — `sliceStartByte`, where this run's own
 * read began, is exactly right) and `target < from` (a REWIND, e.g. a stale blocking
 * target clamps `safeCursorTo` back down below where this run's `--since`/persisted read
 * even started). `sliceStartByte` is a byte position for `from`, not `target` — using it
 * for a strictly earlier `target` persists a byte hint for the WRONG line. The next run
 * would then trust it (a valid newline boundary, just at the wrong place) and read from
 * there while numbering frames starting at `target` — silently mislabeling real content
 * and permanently skipping every actual frame between `target` and `from`. Reproduced
 * (tests/figma-reconcile-cursor.test.ts, BLOCKER2): frames genuinely between the two
 * become unreachable forever. Safe fix: a rewind persists 0 — an honest "next run must
 * full-scan", never a wrong non-zero guess. Advancing forward (`target > from`) keeps the
 * `byteEnd` of the frame immediately before `target` (guaranteed present whenever
 * `from <= target - 1 <` the log's current total, which every caller here satisfies) —
 * but the fallback when that frame is somehow absent is ALSO 0 now, not `sliceStartByte`
 * (the same "never guess a wrong non-zero hint" reasoning applies there too).
 */
function byteAtFrameIndex(
  streamResult: { frames: readonly StreamedFrame[]; sliceStartByte: number },
  from: number,
  target: number,
): number {
  if (target === from) return streamResult.sliceStartByte;
  if (target < from) return 0;
  const found = streamResult.frames.find((f) => f.lineIndex === target - 1);
  return found?.byteEnd ?? 0;
}

/**
 * Registry-integrity phase 03 fix round (MAJOR 1) — an unfiltered apply just processed
 * the WHOLE log through `safeCursorTo`, so every per-file cursor is bumped to AT LEAST
 * that point (never rewound below where it already was — a filtered run could plausibly
 * have raced further ahead for its own file). Absent `byFile` stays absent (nothing to
 * bump); an empty result is impossible here since the caller only invokes this when
 * `priorState.byFile` is checked for entries.
 */
function bumpByFileToUnfilteredCursor(
  byFile: Record<string, CursorPosition> | undefined,
  safeCursorTo: number,
  byteAtSafeCursorTo: number,
): Record<string, CursorPosition> | undefined {
  if (byFile === undefined) return undefined;
  const next: Record<string, CursorPosition> = {};
  for (const [slug, pos] of Object.entries(byFile)) {
    next[slug] = pos.line >= safeCursorTo ? pos : { line: safeCursorTo, byte: byteAtSafeCursorTo };
  }
  return next;
}
