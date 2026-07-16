// Figma live-sync change log — fs layer for the broker (spec 004 P1, Tier 2).
// Append-only JSONL, one ChangeFrame per line; cursor = line count. Mirrors the
// design-memory ledger pattern (src/core/memory-store.ts: appendFileSync +
// line-count cursor) so reconcile (P2/P4) can walk `--since <cursor>` deterministically.
//
// The broker is a GLOBAL long-lived daemon with no project binding, so the log
// path is resolved from its spawn cwd (or an env override). Each frame carries
// `fileKey`, so a future multi-project reconcile can still partition one shared log.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  buildChangeFrame,
  type ChangeBatchMeta,
  type ChangeFrame,
  type ComponentChange,
} from '../../../shared/figma-changes.ts';

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

/** Absolute path to `design/figma.changes.jsonl`. */
export function changeLogPath(): string {
  return join(changeLogDir(), CHANGE_LOG_FILENAME);
}

/** Count non-blank lines (→ next reconcile cursor). 0 when the log is absent. */
export function changeLogLineCount(path: string): number {
  if (!existsSync(path)) return 0;
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0).length;
}

/**
 * Append one ChangeFrame line, creating the design/ dir if needed. Kept separate
 * from the batch helper so a caller can stream frames without re-resolving paths.
 */
export function appendChangeFrame(path: string, frame: ChangeFrame): void {
  mkdirSync(resolveDir(path), { recursive: true });
  appendFileSync(path, JSON.stringify(frame) + '\n', 'utf8');
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
