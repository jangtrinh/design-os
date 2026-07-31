// Figma live-sync change log — fs layer for the broker (spec 004 P1, Tier 2).
// Append-only JSONL, one ChangeFrame per line; cursor = line count. Mirrors the
// design-memory ledger pattern (src/core/memory-store.ts: appendFileSync +
// line-count cursor) so reconcile (P2/P4) can walk `--since <cursor>` deterministically.
//
// The broker is a GLOBAL long-lived daemon with no project binding, so the log
// path is resolved from its spawn cwd (or an env override). Each frame carries
// `fileKey`, so a future multi-project reconcile can still partition one shared log.
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync,
  statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

import {
  buildChangeFrame,
  type ChangeBatchMeta,
  type ChangeFrame,
  type ComponentChange,
} from '../../../shared/figma-changes.ts';
import { rotateIfNeeded } from './log-rotate.ts';

export const CHANGE_LOG_FILENAME = 'figma.changes.jsonl';

/**
 * Directory holding the change log. `FIGMA_AGENT_CHANGES_DIR` overrides (tests MUST
 * set it to a tmp dir); default is `<cwd>/design` — the broker inherits the spawning
 * CLI's cwd, which is normally the project root.
 */
export function changeLogDir(): string {
  const env = process.env['FIGMA_AGENT_CHANGES_DIR'];
  if (env !== undefined && env.length > 0) return resolve(env);
  return join(process.cwd(), 'design');
}

/** Absolute path to `design/figma.changes.jsonl`, rooted at the broker's own cwd/env-override
 *  base — no longer read by the DOC_CHANGE handler (an unbound batch stages instead, see
 *  `unboundStagingPath`), kept for its own test + as a general utility. */
export function changeLogPath(): string {
  return join(changeLogDir(), CHANGE_LOG_FILENAME);
}

/**
 * The SAME filename, rooted at an explicit project dir instead of the broker's cwd
 * (registry-integrity phase 01, §2 — the direction-conflict ruling: the change log must
 * be routed by the same binding as the apply target, or reconcile reads an empty log from
 * the bound project).
 */
export function changeLogPathFor(projectDir: string): string {
  return join(projectDir, 'design', CHANGE_LOG_FILENAME);
}

// ── Unbound staging (registry-integrity phase 01 fix round, finding 1 — BLOCKER) ────
// A DOC_CHANGE batch for a file with no resolved binding used to fall into the broker's
// own cwd-derived `changeLogPath()` — a location the bound project's reconcile NEVER
// reads, so that history was stranded forever the moment a bind eventually happened.
// Instead it stages here, ONE file per file-name slug, NEVER inside any project's own
// design/ (staging is by construction pre-commitment: nobody has said which project this
// is yet) — and `migrateStagedChanges` copies it into the bound log the moment a bind
// resolves this file's identity.
export const UNBOUND_STAGING_DIRNAME = 'unbound';

/** `<changeLogDir()>/unbound/<slug>.jsonl` — beside the broker's own default change log,
 *  never a project's design/. Keyed by the SAME name-slug `figma-agent bind --file <name>`
 *  addresses (not fileKey — a file connecting mid-way through its unbound life must not
 *  split its staged history across two paths).
 *
 *  Known limitation, DEFERRED not fixed here (backlog 5.6): this root is `changeLogDir()`
 *  — the broker's own spawn cwd — so a restart with a different cwd orphans whatever was
 *  staged under the old one. Shared by BOTH feed types (this one and edit-feed-log.ts's
 *  `unboundEditStagingPath`, backlog 5.7's fold-in) since both resolve through the same
 *  `changeLogDir()`. Closing it means moving this root to a cwd-independent location — a
 *  change to this already-shipped, review-verified mechanism (RI-P1 fix#1), not a rider on
 *  whichever wave happens to touch this file next. */
export function unboundStagingPath(slug: string): string {
  return join(changeLogDir(), UNBOUND_STAGING_DIRNAME, `${slug}.jsonl`);
}

/** `<staging>.migrated.json` — records that a migrate's append (step b) already landed,
 *  so a crash before cleanup (steps d/e) finishes) never re-appends on retry. Exported so
 *  a crash-simulation test can construct the exact post-crash on-disk state directly. */
export function migratedMarkerPath(stagingPath: string): string {
  return `${stagingPath.replace(/\.jsonl$/, '')}.migrated.json`;
}

interface MigratedMarker { hash: string; at: number }

function readMigratedMarker(path: string): MigratedMarker | null {
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed && typeof parsed === 'object' && typeof (parsed as MigratedMarker).hash === 'string') {
      return parsed as MigratedMarker;
    }
    return null;
  } catch {
    return null; // corrupt marker — the belt-check (tail comparison) still catches an already-landed append
  }
}

function writeMigratedMarker(path: string, hash: string): void {
  try { writeFileSync(path, JSON.stringify({ hash, at: Date.now() }), 'utf8'); }
  catch { /* best-effort — a missing marker just falls back to the belt-check on the next retry */ }
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Cheap crash-window belt check: does `boundPath` already end with EXACTLY `tail`? Reads
 * only the last `tail.length` bytes (openSync + a single positioned readSync) — never the
 * whole log — so this stays O(staged batch size), not O(log size).
 */
function boundLogEndsWith(boundPath: string, tail: string): boolean {
  if (!existsSync(boundPath)) return false;
  const tailBytes = Buffer.byteLength(tail, 'utf8');
  const size = statSync(boundPath).size;
  if (size < tailBytes) return false;
  const fd = openSync(boundPath, 'r');
  try {
    const buf = Buffer.alloc(tailBytes);
    readSync(fd, buf, 0, tailBytes, size - tailBytes);
    return buf.toString('utf8') === tail;
  } finally {
    closeSync(fd);
  }
}

/**
 * Copy every staged frame for one file into its now-bound component log, then remove the
 * staging file — idempotent (a second bind/migrate of the same file finds nothing staged,
 * returns 0).
 *
 * Crash-safety (fix round, closing defect #1 — "loss is worse than a duplicate, so the
 * marker follows the append"): a bare copy-then-delete leaves a window where a crash
 * between the append (b) and the cleanup (d/e) makes the NEXT migrate re-append the same
 * frames. The marker-file protocol closes it: (a) hash the staged content, (b) append,
 * (c) write `<staging>.migrated.json {hash, at}`, (d) unlink staging, (e) unlink marker.
 * On retry:
 *   - staging exists + a marker with a MATCHING hash → the append already landed (crashed
 *     somewhere in c/d/e) — just finish cleanup, report 0 (nothing NEW was migrated).
 *   - staging exists + marker missing/mismatched → belt check the bound log's own tail
 *     against the staged content (cheap — see `boundLogEndsWith`): a match means the
 *     append landed but the marker write (c) never did (crashed in the b→c window) —
 *     write the marker now, then finish cleanup, report 0. No match → genuinely fresh:
 *     append, write marker, clean up, report the real count.
 *
 * Still fully synchronous end to end, so a DOC_CHANGE arriving in a LATER event-loop tick
 * can never interleave mid-copy — Node's single-threaded event loop never runs another
 * 'message' handler between these statements, and by the time migration runs the identity
 * is already recorded as bound, so any subsequent batch goes straight to the bound path.
 */
export function migrateStagedChanges(stagingPath: string, boundPath: string): number {
  if (!existsSync(stagingPath)) return 0;
  const lines = readFileSync(stagingPath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const markerPath = migratedMarkerPath(stagingPath);
  const cleanup = (): void => {
    try { unlinkSync(stagingPath); } catch { /* already gone */ }
    try { unlinkSync(markerPath); } catch { /* already gone, or never written */ }
  };
  if (lines.length === 0) { cleanup(); return 0; }

  const normalized = `${lines.join('\n')}\n`;
  const hash = sha256(normalized);
  const marker = readMigratedMarker(markerPath);
  const alreadyAppended = marker?.hash === hash || boundLogEndsWith(boundPath, normalized);
  if (alreadyAppended) {
    if (!marker || marker.hash !== hash) writeMigratedMarker(markerPath, hash); // belt-check recovery
    cleanup();
    return 0;
  }

  // Copy BEFORE delete: if the append below throws (disk full, permissions), the staging
  // file survives untouched and a retry can still migrate it.
  mkdirSync(resolveDir(boundPath), { recursive: true });
  appendFileSync(boundPath, normalized, 'utf8');
  writeMigratedMarker(markerPath, hash);
  cleanup();
  return lines.length;
}

/** Count non-blank lines (→ next reconcile cursor). 0 when the log is absent. */
export function changeLogLineCount(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0).length;
}

/**
 * Append one ChangeFrame line, creating the design/ dir if needed. Kept separate
 * from the batch helper so a caller can stream frames without re-resolving paths.
 *
 * Registry-integrity phase 04 (5.4), §2 — rotation runs AFTER the append, on the broker's
 * own write path (no daemon timer): the freshly-appended line is what typically pushes
 * the file over `maxBytes`, so checking post-write catches it the moment it happens.
 */
export function appendChangeFrame(path: string, frame: ChangeFrame): void {
  mkdirSync(resolveDir(path), { recursive: true });
  appendFileSync(path, JSON.stringify(frame) + '\n', 'utf8');
  rotateIfNeeded(path);
}

/**
 * Stamp + append every coalesced ComponentChange from one DOC_CHANGE batch.
 * Skips malformed entries (untrusted wire input) — a bad change never aborts the
 * batch. Returns the number of frames actually written.
 */
export function appendChangeFrames(
  path: string,
  changes: readonly ComponentChange[],
  meta: ChangeBatchMeta,
  ts: number,
): number {
  let written = 0;
  for (const change of changes) {
    if (!isValidChange(change)) continue;
    appendChangeFrame(path, buildChangeFrame(change, meta, ts));
    written++;
  }
  return written;
}

/** Parent dir of a file path (avoids importing dirname just for one call). */
function resolveDir(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx <= 0 ? filePath : filePath.slice(0, idx);
}

/** Structural guard: a wire ComponentChange must at least carry an op + node id. */
function isValidChange(c: unknown): c is ComponentChange {
  if (c === null || typeof c !== 'object') return false;
  const v = c as Record<string, unknown>;
  return (
    (v.op === 'created' || v.op === 'updated' || v.op === 'deleted') &&
    typeof v.nodeId === 'string' &&
    v.nodeId.length > 0
  );
}
