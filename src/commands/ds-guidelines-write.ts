/**
 * Staged writes for `ui ds guidelines build` and `export` (fs only).
 *
 * A pack holds answers a person or a host wrote; a write that fails halfway must never lose one.
 * So the answers store (guidelines.answers.json) is written FIRST, then the parked answers
 * (guidelines.orphans.md), each through a temp file + rename; every other file is written into a
 * staging folder next to the destination, and only when all of them are written is each moved into
 * place. A failure at any later rename therefore cannot lose an answer: each one is already in the
 * durable store. Cleanup of the staging folder never replaces the error that caused it: it is best
 * effort, and a leftover is reported as a note instead of masking a result.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { ANSWERS_FILE } from "../core/ds-guidelines-answers.js";
import { ORPHANS_FILE } from "../core/ds-guidelines-slots.js";

export interface OutFile {
  path: string;
  content: string;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Remove a staging folder; returns a note when that fails, never throws. */
function discard(dir: string): string | undefined {
  try {
    rmSync(dir, { recursive: true, force: true });
    return undefined;
  } catch (e) {
    return `could not remove the staging folder '${dir}': ${errText(e)}`;
  }
}

function writeInto(root: string, files: readonly OutFile[]): void {
  for (const f of files) {
    const target = join(root, f.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.content, "utf8");
  }
}

/** Make one file durable: write a temp file next to it, then rename over it. */
function putDurably(dir: string, file: OutFile): void {
  const tmp = join(dir, `${file.path}.tmp-${process.pid}`);
  try {
    writeFileSync(tmp, file.content, "utf8");
    renameSync(tmp, join(dir, file.path));
  } catch (e) {
    discard(tmp);
    throw e;
  }
}

/** Write a pack. Returns notes (e.g. a staging folder that could not be removed); throws on a write failure. */
export function writePackStaged(packDir: string, files: readonly OutFile[]): string[] {
  mkdirSync(packDir, { recursive: true });
  const first = [ANSWERS_FILE, ORPHANS_FILE];
  // The store first: it is the durable copy of every answer. Then the parked answers.
  for (const name of first) {
    const file = files.find((f) => f.path === name);
    if (file !== undefined) putDurably(packDir, file);
  }
  const rest = files.filter((f) => !first.includes(f.path));
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

/** path → sha256 of every file under `path` (directories as "<dir>"), keyed by `key`; unreadable entries are marked, never skipped. */
function digest(path: string, key: string, into: Map<string, string>): void {
  let isDir: boolean;
  try {
    isDir = lstatSync(path).isDirectory();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") into.set(key, "<unreadable>");
    return;
  }
  try {
    if (!isDir) { into.set(key, createHash("sha256").update(readFileSync(path)).digest("hex")); return; }
    into.set(`${key}/`, "<dir>");
    for (const name of readdirSync(path).sort()) digest(join(path, name), `${key}/${name}`, into);
  } catch {
    into.set(key, "<unreadable>");
  }
}

/** What an export may touch: the bundle folder and the UPLOAD file beside it. */
function snapshot(out: string, folder: string, uploadName: string): Map<string, string> {
  const m = new Map<string, string>();
  digest(join(out, folder), folder, m);
  digest(join(out, uploadName), uploadName, m);
  return m;
}

/** A sentence on the state of the output folder after a failed export, checked against `before` — never assumed. */
function describeState(now: Map<string, string>, before: Map<string, string>, hadBundle: boolean): string {
  const changed = [...new Set([...now.keys(), ...before.keys()])].filter((k) => now.get(k) !== before.get(k)).sort();
  if (changed.length === 0) {
    return hadBundle
      ? `the previous bundle is intact (verified: its ${before.size} entries, UPLOAD.md included, match their content before this export)`
      : "the output folder is as it was before this export (verified)";
  }
  const shown = changed.slice(0, 5).join(", ") + (changed.length > 5 ? `, … (${changed.length} in all)` : "");
  return `the output folder differs from before this export (${shown}) — check it before relying on it`;
}

/**
 * Write `<out>/<folder>/…` and `<out>/<uploadName>` together or not at all. The previous bundle folder
 * (re-export) is moved to `<out>/.<folder>.previous` — a sibling of the staging folder, so cleaning up
 * the staging folder can never delete it — and put back if anything fails; it is deleted only after the
 * new bundle is fully in place. A backup left by an earlier interrupted export is never overwritten.
 * Returns notes; throws on failure, with the state of the output folder in the message.
 */
export function writeBundleStaged(out: string, folder: string, files: readonly OutFile[], uploadName: string, upload: string): string[] {
  const backup = join(out, `.${folder}.previous`);
  const bundleDir = join(out, folder);
  const before = snapshot(out, folder, uploadName);
  const hadBundle = existsSync(bundleDir);
  if (existsSync(backup)) {
    throw new Error(`a backup of an earlier bundle is still at '${backup}' (a previous export was interrupted) — it may be the only copy: move it back to '${bundleDir}' or delete it, then export again; nothing was written by this export`);
  }
  let stage: string | undefined;
  let moved = false;
  let placed = false;
  try {
    mkdirSync(out, { recursive: true });
    stage = mkdtempSync(join(out, ".figma-staging-"));
    writeInto(join(stage, folder), files);
    writeFileSync(join(stage, uploadName), upload, "utf8");
    if (hadBundle) { renameSync(bundleDir, backup); moved = true; }
    renameSync(join(stage, folder), bundleDir);
    placed = true;
    renameSync(join(stage, uploadName), join(out, uploadName));
  } catch (e) {
    let restoreError: unknown;
    try {
      if (placed) rmSync(bundleDir, { recursive: true, force: true }); // the new bundle goes; UPLOAD.md was not replaced
      if (moved) renameSync(backup, bundleDir);
    } catch (e2) {
      restoreError = e2;
    }
    if (stage !== undefined) discard(stage);
    if (restoreError !== undefined) {
      const keep = moved ? `; the previous bundle is kept at '${backup}': move it to '${bundleDir}' by hand` : `; '${bundleDir}' may hold a partly placed bundle: check it`;
      throw new Error(`${errText(e)} — AND the output could not be put back as it was (${errText(restoreError)})${keep}`, { cause: e });
    }
    throw new Error(`${errText(e)} — ${describeState(snapshot(out, folder, uploadName), before, hadBundle)}`, { cause: e });
  }
  const notes: string[] = [];
  const stageNote = stage !== undefined ? discard(stage) : undefined;
  if (stageNote !== undefined) notes.push(stageNote);
  if (moved) {
    try {
      rmSync(backup, { recursive: true, force: true });
    } catch (e) {
      notes.push(`the new bundle is in place, but the backup of the previous one could not be removed from '${backup}' (${errText(e)}); delete it before the next export`);
    }
  }
  return notes;
}
