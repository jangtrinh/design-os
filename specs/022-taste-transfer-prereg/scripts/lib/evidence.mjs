// scripts/lib/evidence.mjs
//
// F2 — byte-level evidence verification primitives shared by every post-render
// check. Codex Stage-5 BLOCKER #4: commit and evidence integrity were *asserted*
// (schema shape + a `tree_clean: true` field) rather than *verified*. Everything
// here verifies: containment, regular-file-ness, and recomputed SHA-256.
//
// Every path that arrives from data (a run manifest, a freeze envelope, a
// randomization map) goes through `verifyEvidenceFile` before it is trusted, read,
// or hashed. Traversal, absolute paths, symlinks, directories, and devices all fail
// closed.
import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { sha256File } from "./hash.mjs";
import { git } from "./git.mjs";

/** True iff `childAbs` is `parentAbs` itself or lives beneath it. */
export function isContained(parentAbs, childAbs) {
  const parent = resolve(parentAbs);
  const child = resolve(childAbs);
  return child === parent || child.startsWith(parent + sep);
}

/** Canonicalized absolute path, or the input unchanged when it cannot be resolved. */
function realOrSelf(absPath) {
  try {
    return realpathSync(absPath);
  } catch {
    return absPath;
  }
}

/** git call that answers true/false instead of throwing. */
export function gitOk(args, cwd) {
  try {
    git(args, cwd);
    return true;
  } catch {
    return false;
  }
}

/** git call that returns null instead of throwing. */
export function gitOrNull(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

/** Commits that touched `repoRelPath`, newest first. Empty array if none/unreadable. */
export function commitsTouching(ctx, repoRelPath) {
  const out = gitOrNull(["-C", ctx.repoRoot, "log", "--format=%H", "--", repoRelPath], ctx.repoRoot);
  if (out === null) return [];
  return out.split("\n").filter(Boolean);
}

/** The commit that first ADDED `repoRelPath` (oldest revision), or null. */
export function commitAdding(ctx, repoRelPath) {
  const commits = commitsTouching(ctx, repoRelPath);
  return commits.length > 0 ? commits[commits.length - 1] : null;
}

/** Strict ancestry: `a` is an ancestor of `b` AND is not `b` itself. */
export function isStrictAncestor(ctx, a, b) {
  if (!a || !b || a === b) return false;
  return gitOk(["-C", ctx.repoRoot, "merge-base", "--is-ancestor", a, b], ctx.repoRoot);
}

/** Non-strict ancestry (`a === b` counts). */
export function isAncestor(ctx, a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return gitOk(["-C", ctx.repoRoot, "merge-base", "--is-ancestor", a, b], ctx.repoRoot);
}

/**
 * Verify one evidence file referenced by data.
 *
 * @param ctx            validator context
 * @param containerRel   spec-relative directory the file MUST live inside
 * @param rel            spec-relative path as recorded in the data
 * @param expectedSha    recorded SHA-256, or null to skip the hash comparison
 * @returns {{ok: true, sha256: string} | {ok: false, error: string}}
 */
export function verifyEvidenceFile(ctx, containerRel, rel, expectedSha) {
  if (typeof rel !== "string" || rel.length === 0) return { ok: false, error: "path is missing or not a string" };
  if (isAbsolute(rel)) return { ok: false, error: `path is absolute (${rel})` };
  if (rel.split(/[\\/]/).includes("..")) return { ok: false, error: `path contains a ".." segment (${rel})` };

  const containerAbs = resolve(ctx.abs(containerRel));
  const fileAbs = resolve(ctx.abs(rel));
  if (!isContained(containerAbs, fileAbs)) return { ok: false, error: `path escapes ${containerRel} (${rel})` };
  if (!isContained(resolve(ctx.specDir), fileAbs)) return { ok: false, error: `path escapes the spec directory (${rel})` };

  let stat;
  try {
    stat = lstatSync(fileAbs);
  } catch (err) {
    return { ok: false, error: `cannot stat ${rel}: ${err.message}` };
  }
  if (stat.isSymbolicLink()) return { ok: false, error: `${rel} is a symlink` };
  if (!stat.isFile()) return { ok: false, error: `${rel} is not a regular file` };

  // A symlinked ANCESTOR directory would let a contained-looking path resolve
  // elsewhere on disk. Re-check containment after canonicalizing the parent.
  if (!isContained(realOrSelf(containerAbs), realOrSelf(dirname(fileAbs)))) {
    return { ok: false, error: `${rel} resolves outside ${containerRel} through a symlinked directory` };
  }

  let actual;
  try {
    actual = sha256File(fileAbs);
  } catch (err) {
    return { ok: false, error: `cannot hash ${rel}: ${err.message}` };
  }
  if (expectedSha !== null && expectedSha !== undefined && actual !== expectedSha) {
    return { ok: false, error: `${rel} sha256 ${actual} does not match the recorded ${expectedSha}` };
  }
  return { ok: true, sha256: actual };
}

/** Directory entries, or null when the directory is missing/unreadable. */
export function safeReaddir(ctx, rel) {
  try {
    return readdirSync(ctx.abs(rel), { withFileTypes: true });
  } catch {
    return null;
  }
}

/** True iff `rel` is a real directory (not a symlink to one). */
export function isRealDir(ctx, rel) {
  try {
    return lstatSync(ctx.abs(rel)).isDirectory();
  } catch {
    return false;
  }
}

/** True iff `rel` exists at all (following links — used only for "is it there"). */
export function pathExists(ctx, rel) {
  try {
    statSync(ctx.abs(rel));
    return true;
  } catch {
    return false;
  }
}

export const PHASE_DIR = { A: "runs/phase-a", B: "runs/phase-b" };

/**
 * Enumerate every arm directory actually present under runs/phase-*.
 *
 * Returns raw observations — including malformed entries — so the caller can turn
 * each into a specific finding rather than silently skipping it. `phases` limits
 * the walk (the post-phase-a mode scopes to Phase A only).
 */
export function enumerateArmDirs(ctx, phases = ["A", "B"]) {
  const out = [];
  for (const phase of phases) {
    const base = PHASE_DIR[phase];
    const pairEntries = safeReaddir(ctx, base);
    if (pairEntries === null) continue;
    for (const pairEntry of pairEntries) {
      const pairRel = `${base}/${pairEntry.name}`;
      if (!pairEntry.isDirectory() || pairEntry.isSymbolicLink()) {
        out.push({ phase, base, pairId: pairEntry.name, arm: null, dirRel: pairRel, malformed: "pair entry is not a regular directory" });
        continue;
      }
      const armEntries = safeReaddir(ctx, pairRel) || [];
      for (const armEntry of armEntries) {
        const dirRel = `${pairRel}/${armEntry.name}`;
        if (!armEntry.isDirectory() || armEntry.isSymbolicLink()) {
          out.push({ phase, base, pairId: pairEntry.name, arm: armEntry.name, dirRel, malformed: "arm entry is not a regular directory" });
          continue;
        }
        out.push({
          phase,
          base,
          pairId: pairEntry.name,
          arm: armEntry.name,
          dirRel,
          manifestRel: `${dirRel}/run-manifest.json`,
          malformed: null,
        });
      }
    }
  }
  return out;
}

/** The phases a given validator mode is allowed to see evidence for. */
export function phasesInScope(ctx) {
  return ctx.phaseScope === "A" ? ["A"] : ["A", "B"];
}
