/**
 * Staged writes for `ui ds guidelines build` and `export` (fs only).
 *
 * A pack holds answers a person or a host wrote; a write that fails halfway must never lose one.
 * So the parked answers (guidelines.orphans.md) are written FIRST, every other file is written into
 * a staging folder next to the destination, and only when all of them are written is each moved into
 * place. A failure therefore leaves each answer either in the old file or in the new one, never in
 * memory only. Cleanup of the staging folder never replaces the error that caused it: it is best
 * effort, and a leftover is reported as a note instead of masking a result.
 */
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { ORPHANS_FILE } from "../core/ds-guidelines-slots.js";

export interface OutFile {
  path: string;
  content: string;
}

/** Remove a staging folder; returns a note when that fails, never throws. */
function discard(dir: string): string | undefined {
  try {
    rmSync(dir, { recursive: true, force: true });
    return undefined;
  } catch (e) {
    return `could not remove the staging folder '${dir}': ${e instanceof Error ? e.message : String(e)}`;
  }
}

function writeInto(root: string, files: readonly OutFile[]): void {
  for (const f of files) {
    const target = join(root, f.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.content, "utf8");
  }
}

/** Write a pack. Returns notes (e.g. a staging folder that could not be removed); throws on a write failure. */
export function writePackStaged(packDir: string, files: readonly OutFile[]): string[] {
  mkdirSync(packDir, { recursive: true });
  const orphans = files.find((f) => f.path === ORPHANS_FILE);
  const rest = files.filter((f) => f.path !== ORPHANS_FILE);
  if (orphans !== undefined) {
    // Parked answers first: this file may hold the only copy of an answer whose slot is gone.
    const tmp = join(packDir, `${ORPHANS_FILE}.tmp-${process.pid}`);
    try {
      writeFileSync(tmp, orphans.content, "utf8");
      renameSync(tmp, join(packDir, ORPHANS_FILE));
    } catch (e) {
      discard(tmp);
      throw e;
    }
  }
  const stage = mkdtempSync(join(dirname(packDir), `.${basename(packDir)}-staging-`));
  try {
    writeInto(stage, rest);
    for (const f of rest) {
      const target = join(packDir, f.path);
      mkdirSync(dirname(target), { recursive: true });
      renameSync(join(stage, f.path), target);
    }
  } catch (e) {
    discard(stage);
    throw e;
  }
  const note = discard(stage);
  return note !== undefined ? [note] : [];
}

/**
 * Write `<out>/<folder>/…` and `<out>/<uploadName>` together or not at all. The previous bundle
 * folder (re-export) is set aside and put back if anything fails. Returns notes; throws on failure.
 */
export function writeBundleStaged(out: string, folder: string, files: readonly OutFile[], uploadName: string, upload: string): string[] {
  mkdirSync(out, { recursive: true });
  const stage = mkdtempSync(join(out, ".figma-staging-"));
  try {
    writeInto(join(stage, folder), files);
    writeFileSync(join(stage, uploadName), upload, "utf8");
    const bundleDir = join(out, folder);
    const previous = join(stage, "previous");
    const hadPrevious = existsSync(bundleDir);
    if (hadPrevious) renameSync(bundleDir, previous);
    try {
      renameSync(join(stage, folder), bundleDir);
      renameSync(join(stage, uploadName), join(out, uploadName));
    } catch (e) {
      try {
        rmSync(bundleDir, { recursive: true, force: true });
        if (hadPrevious) renameSync(previous, bundleDir);
      } catch {
        /* the original error is the one worth reporting */
      }
      throw e;
    }
  } catch (e) {
    discard(stage);
    throw e;
  }
  const note = discard(stage);
  return note !== undefined ? [note] : [];
}
