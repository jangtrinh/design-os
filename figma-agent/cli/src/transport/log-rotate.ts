// Registry-integrity phase 04 (5.4), §2 — byte-based retention/rotation for the
// broker's three append-only feeds (`figma.changes.jsonl`, the per-file edit feed
// `changes/<slug>.jsonl`, and `figma-errors.jsonl`). ONE policy module: rotation happens
// ON APPEND (the broker already owns every write — no daemon timer needed), byte-based
// (not time-based, so an idle project never loses history to the calendar).
//
// Rotation is the one part of this phase that can destroy data if done carelessly: a
// rotated file resets both byte AND line numbering to 0 for the fresh live file, so a
// persisted cursor pointing into the OLD (now-archived) numbering would otherwise either
// silently re-derive nothing (stuck forever) or misinterpret the new file's own line 0 as
// wherever the old cursor thought it was. The marker this module writes
// (`<path>.rotated.json`) is what lets the READER side (the kernel's
// `change-log-rotation.ts`, a separate, read-only duplicate — this module cannot be
// imported by the kernel, same cross-package boundary as everywhere else in this wave)
// recognize "history rotated away" and reset explicitly rather than guess.
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';

export interface RotatePolicy {
  maxBytes: number;
  keep: number;
}

/** 8 MiB, keep 3 rotated generations (p.1 newest archived … p.keep oldest archived), per
 *  the phase's own defaults. */
export const DEFAULT_ROTATE_POLICY: RotatePolicy = { maxBytes: 8 * 1024 * 1024, keep: 3 };

/**
 * Written the moment a file rotates, recording how many lines/bytes existed in it AT THAT
 * INSTANT (i.e., what became `<path>.1`) — the reader's ONLY way to recognize that a
 * persisted cursor's absolute numbering no longer corresponds to anything in the fresh
 * live file.
 */
export interface RotateMarker {
  atLine: number;
  atByte: number;
  ts: number;
}

export interface RotateResult {
  rotated: boolean;
}

function markerPath(path: string): string {
  return `${path}.rotated.json`;
}

/** Count non-blank lines — the SAME convention `changeLogLineCount`/`ledgerLineCount`
 *  already use. Only runs AT rotation time (a rare, size-triggered event), never on every
 *  append — this is not the O(E)-per-append cost this wave otherwise removes. */
function countLines(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0).length;
}

/**
 * Rotate `path` → `path.1` → `path.2` … when it exceeds `policy.maxBytes`, keeping at most
 * `policy.keep` archived generations (the oldest beyond that is deleted — byte-based
 * retention, never time-based). Writes the `.rotated.json` marker BEFORE the live file is
 * reset to empty, capturing the pre-rotation line/byte totals. A no-op (never throws) when
 * the file is absent or still under the size threshold.
 */
export function rotateIfNeeded(path: string, policy: RotatePolicy = DEFAULT_ROTATE_POLICY): RotateResult {
  if (!existsSync(path)) return { rotated: false };
  const size = statSync(path).size;
  if (size < policy.maxBytes) return { rotated: false };

  // Stage-4 MINOR18 — a REPEATED rotation (the live file rotates again before anything
  // ever consumed the PRIOR marker) must not silently overwrite that prior marker with
  // just this generation's own count: `rotatedAwayLines` is computed downstream as
  // `marker.atLine - <stale persisted cursor>`, so losing the prior rotation's own
  // atLine would UNDERSTATE the true gap by however many lines that earlier rotation
  // itself represented. Fold the prior marker's `atLine` into this rotation's own count —
  // cumulative across however many un-consumed rotations have chained together.
  //
  // Known, accepted trade-off: nothing here (or on the reader side) DELETES the marker
  // file once a reconcile run has actually consumed it, so a marker can also be "stale
  // but already accounted for." Folding it in unconditionally therefore risks a rare
  // OVER-count (double-attributing an already-reported gap) rather than an UNDER-count —
  // a deliberate choice: `rotated_away_lines` is purely informational (the reset logic
  // itself never depends on its exact value), and overstating a data-loss gap is a far
  // safer failure mode than silently understating one.
  const priorMarker = readRotateMarker(path);
  const atLine = (priorMarker?.atLine ?? 0) + countLines(path);
  const atByte = size;

  // Age out the generation about to fall past the retention window.
  const oldest = `${path}.${policy.keep}`;
  if (existsSync(oldest)) rmSync(oldest, { force: true });
  // Shift the rest up by one, DESCENDING so an earlier rename never clobbers a
  // not-yet-moved file (p.(keep-1) → p.keep, …, p.1 → p.2).
  for (let i = policy.keep - 1; i >= 1; i--) {
    const src = `${path}.${i}`;
    if (existsSync(src)) renameSync(src, `${path}.${i + 1}`);
  }
  // Stage-4 MAJOR3 — write the marker BEFORE the rename+truncate (matching this
  // function's own doc comment, which the code previously contradicted): a crash right
  // after `renameSync` (or the truncating `writeFileSync`) must never leave the live file
  // already rotated away with no marker — the reader would then have no way to tell a
  // real rotation from ordinary staleness/corruption.
  const marker: RotateMarker = { atLine, atByte, ts: Date.now() };
  writeFileSync(markerPath(path), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  renameSync(path, `${path}.1`);
  writeFileSync(path, '', 'utf8');
  return { rotated: true };
}

/** Read the rotation marker for `path`, or `undefined` when none exists (never rotated,
 *  or the marker file is malformed — a corrupt marker must not crash the append path;
 *  the reader side degrades to "no rotation known", the same as if none had happened). */
export function readRotateMarker(path: string): RotateMarker | undefined {
  const p = markerPath(path);
  if (!existsSync(p)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as Partial<RotateMarker>;
    if (
      typeof parsed.atLine === 'number' && Number.isInteger(parsed.atLine) && parsed.atLine >= 0
      && typeof parsed.atByte === 'number' && Number.isInteger(parsed.atByte) && parsed.atByte >= 0
      && typeof parsed.ts === 'number' && Number.isFinite(parsed.ts)
    ) {
      return { atLine: parsed.atLine, atByte: parsed.atByte, ts: parsed.ts };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
