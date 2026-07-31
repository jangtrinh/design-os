// Owner-edit change feed — fs layer for the broker (wave 4.4, phase 01). Append-only
// JSONL, one EditFrame per line, ONE FILE PER PROJECT FILE (fileKey|fileName slug).
// A deliberate near-copy of change-log.ts, kept SEPARATE so the two logs can never
// converge: figma.changes.jsonl stays component-only (the kernel's parseChangeLog
// reads it, spec A6); this feed carries every widened edit and is read by
// `figma-agent changes` (phase 02), never by the kernel.
//
// Path routing — a limitation inherited, not introduced (spec §5 / unresolved q5): the
// broker is a global long-lived daemon with no project binding, so this path is resolved
// from its spawn cwd, same as changeLogDir(). A CLI run from project B can therefore read
// a feed the broker wrote under project A. `FIGMA_AGENT_CHANGES_DIR` overrides both logs'
// base directory together, so they always move as one unit — never independently.
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { changeLogDir } from './change-log.ts';
import { fileIdentity, safeSlug } from './file-identity.ts';
import { rotateIfNeeded } from './log-rotate.ts';
import {
  buildEditFrame, isValidEditInput,
  type EditBatchMeta, type EditFrame, type EditInput,
} from '../../../shared/edit-feed.ts';

/** Sub-directory of the shared changes base dir: `<changeLogDir()>/changes/`. */
export const EDIT_FEED_DIRNAME = 'changes';

/** `<changeLogDir()>/changes` — shares changeLogDir()'s FIGMA_AGENT_CHANGES_DIR override
 *  so both logs move together under one env var, never independently. */
export function editFeedDir(): string {
  return join(changeLogDir(), EDIT_FEED_DIRNAME);
}

/** Re-exported from `file-identity.ts` (fix round, finding 1) — kept as a named export
 *  here too so every existing `import { safeSlug } from './edit-feed-log.ts'` call site
 *  (broker-daemon.ts, this module's own tests) stays valid unchanged. */
export { safeSlug };

/**
 * Per-file feed path: `design/changes/<identity>.jsonl`, identity = `fileIdentity(fileKey,
 * fileName)` — the ONE canonical chain (`file-identity.ts`), also used by
 * `project-bind.ts`. Fix round, finding 1: this used to derive its OWN slug — including
 * running the fileKey itself through `safeSlug` (lowercasing it) — which silently drifted
 * from `fileIdentity`'s raw-fileKey chain for any uppercase-bearing key. Legacy fallback:
 * if a feed already exists on disk at the OLD (fileKey-slugged) path but nothing exists yet
 * at the new canonical path, keep appending to the legacy file — a rename here would
 * orphan real history for a project whose fileKey happens to contain uppercase. Cheap
 * insurance: on this machine feeds are fileName-keyed (no real fileKey reaches this path
 * yet), so the fallback is expected to be a no-op in practice.
 */
export function editFeedPath(fileKey: string | null, fileName: string | null): string {
  const identity = fileIdentity(fileKey, fileName);
  const canonicalPath = join(editFeedDir(), `${identity}.jsonl`);
  if (typeof fileKey === 'string' && fileKey.trim() !== '') {
    const legacySlug = safeSlug(fileKey);
    if (legacySlug !== identity) {
      const legacyPath = join(editFeedDir(), `${legacySlug}.jsonl`);
      if (!existsSync(canonicalPath) && existsSync(legacyPath)) return legacyPath;
    }
  }
  return canonicalPath;
}

/** Parent dir of a file path (avoids importing dirname just for one call — mirrors
 *  change-log.ts's private helper; kept separate per the "near-copy, deliberately
 *  separate" contract rather than sharing a util that would couple the two log layers). */
function resolveDir(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx <= 0 ? filePath : filePath.slice(0, idx);
}

/** Append one EditFrame line, creating the design/changes/ dir if needed. */
/** Registry-integrity phase 04 (5.4), §2 — rotation runs AFTER the append, on the
 *  broker's own write path, same as change-log.ts's appendChangeFrame. */
export function appendEditFrame(path: string, frame: EditFrame): void {
  mkdirSync(resolveDir(path), { recursive: true });
  appendFileSync(path, JSON.stringify(frame) + '\n', 'utf8');
  rotateIfNeeded(path);
}

/** Outcome of one `appendEditFrames` call — `droppedInvalid` makes a silently-skipped
 *  malformed entry VISIBLE to the caller (post-review, Codex P1) instead of the batch
 *  just quietly writing fewer lines than it received. */
export interface AppendEditFramesResult {
  written: number;
  droppedInvalid: number;
}

/**
 * Stamp + append every coalesced EditInput from one EDIT_FEED batch. Skips malformed
 * entries (untrusted wire input) — a bad edit never aborts the batch, but is counted
 * rather than silently disappearing.
 */
export function appendEditFrames(
  path: string,
  edits: readonly EditInput[],
  meta: EditBatchMeta,
  ts: number,
): AppendEditFramesResult {
  let written = 0;
  let droppedInvalid = 0;
  for (const edit of edits) {
    if (!isValidEditInput(edit)) { droppedInvalid += 1; continue; }
    appendEditFrame(path, buildEditFrame(edit, meta, ts));
    written++;
  }
  return { written, droppedInvalid };
}
