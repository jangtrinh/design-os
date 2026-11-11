/**
 * The owner's scan rulings, in the form the walk reads them (spec 033 FR-014). One source: the owner rulings
 * (`onboard.rulings`) of the `scan-budget` kind (a directory ruled `skip` is not entered) and of the `app-roots` kind
 * (a root ruled `drop` is not walked; a root ruled `keep` is walked and prunes nothing). Both are read by member id, so
 * a renamed directory is a new member that no ruling covers and is walked. With no ruling the walk is the walk it
 * always was.
 *
 * Paths are project-relative and POSIX, the form the walk reports them in.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { governedOutcomes, indexRulings } from "./owner-rulings/resolve-detections.js";
import { readRulingStore, RulingStoreError } from "./owner-rulings/ruling-store.js";

export interface ScanRulings {
  /** Project-relative directories the walk does not enter (the directory entry itself is still counted). */
  skip: readonly string[];
  /** App roots the owner ruled `keep`: walked, and never pruned by a `drop` above them. */
  keepRoots: readonly string[];
  /** App roots the owner ruled `drop`: not walked. */
  dropRoots: readonly string[];
  /** Why the rulings could not be read; the walk then runs with none and says so. */
  unreadable?: string;
}

export const NO_SCAN_RULINGS: ScanRulings = { skip: [], keepRoots: [], dropRoots: [] };

const clean = (p: string): string => p.normalize("NFC").replace(/^\.\//, "").replace(/\/+$/, "");
const sorted = (list: Iterable<string>): string[] => [...new Set([...list].map(clean))].filter((p) => p !== "").sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Throws RulingStoreError when the manifest cannot be read: a ruling that cannot be read cannot be honoured. */
export function scanRulingsOf(projectDir: string): ScanRulings {
  const index = indexRulings(readRulingStore(projectDir).rulings);
  const ofKind = (kind: "scan-budget" | "app-roots", outcome: string): string[] =>
    Object.entries(governedOutcomes(index, kind)).filter(([, o]) => o === outcome).map(([m]) => m);
  return { skip: sorted(ofKind("scan-budget", "skip")), keepRoots: sorted(ofKind("app-roots", "keep")), dropRoots: sorted(ofKind("app-roots", "drop")) };
}

/** The rulings for a read-only reader: an unreadable manifest is reported, never thrown (`ui scan` stays exit 0). */
export function scanRulingsOrUnreadable(projectDir: string): ScanRulings {
  try { return scanRulingsOf(projectDir); }
  catch (e) {
    if (e instanceof RulingStoreError) return { ...NO_SCAN_RULINGS, unreadable: e.message };
    throw e;
  }
}

const within = (rel: string, root: string): boolean => rel === root || rel.startsWith(`${root}/`);

export type WalkDecision = "walk" | "corridor" | "prune";

/**
 * The one rule for the walk: of the owner's ruled paths (`skip`, `keep`, `drop`) that are this directory or contain it,
 * the deepest decides. `keep` (or no ruling) walks it; `skip` and `drop` do not, except that a pruned directory with a
 * root ruled `keep` somewhere below it is a corridor: only what leads to that root is entered, and nothing else of the
 * directory is counted. On the same path `keep` wins.
 */
export function walkDecision(rulings: ScanRulings, rel: string): WalkDecision {
  const ruled = [
    ...rulings.skip.map((path) => ({ path, keep: false })),
    ...rulings.dropRoots.map((path) => ({ path, keep: false })),
    ...rulings.keepRoots.map((path) => ({ path, keep: true })),
  ].filter((r) => within(rel, r.path));
  if (ruled.length === 0) return "walk";
  const deepest = ruled.reduce((a, b) => (b.path.length > a.path.length || (b.path.length === a.path.length && b.keep) ? b : a));
  if (deepest.keep) return "walk";
  return rulings.keepRoots.some((k) => k.startsWith(`${rel}/`)) ? "corridor" : "prune";
}

/** True when `rel` is a kept root or lies on the way to one: the only thing entered inside a corridor. */
export function onWayToKeptRoot(rulings: ScanRulings, rel: string): boolean {
  return rulings.keepRoots.some((k) => within(k, rel));
}

export interface Honoured {
  /** Skipped directories that exist. */
  skip: string[];
  /** Kept app roots that exist and were walked. */
  roots: string[];
  /** Kept roots that lie inside a skipped directory (walked all the same). */
  keptInsideSkipped?: string[];
  /** App roots ruled `drop` that exist: not walked, so not in `apps[]`. */
  dropped: string[];
  /** Ruled roots (keep or drop) that are no longer an app root on disk. */
  notFound?: string[];
  /** Kept roots that exist but the walk did not reach (the entry or depth cap). */
  notReached?: string[];
  /** App roots the walk found that no `app-roots` ruling covers; shown only when at least one ruling exists. */
  unruled: string[];
  unreadable?: string;
}

/** What `ui scan` says it honoured, from what the walk found and the disk holds: only what happened. Absent when there was no ruling. */
export function honouredOf(rulings: ScanRulings, appPaths: readonly string[], root: string): Honoured | undefined {
  if (rulings.unreadable !== undefined) return { skip: [], roots: [], dropped: [], unruled: [], unreadable: rulings.unreadable };
  if (rulings.skip.length === 0 && rulings.keepRoots.length === 0 && rulings.dropRoots.length === 0) return undefined;
  const dirExists = (rel: string): boolean => { try { return statSync(join(root, rel)).isDirectory(); } catch { return false; } };
  const isAppRoot = (rel: string): boolean => existsSync(join(root, rel, "package.json"));
  const walked = new Set(appPaths);
  const ruled = new Set([...rulings.keepRoots, ...rulings.dropRoots]);
  const kept = rulings.keepRoots.filter((k) => walked.has(k));
  const insideSkipped = kept.filter((k) => rulings.skip.some((p) => k.startsWith(`${p}/`)));
  const notFound = [...ruled].filter((p) => !isAppRoot(p)).sort();
  const notReached = rulings.keepRoots.filter((k) => isAppRoot(k) && !walked.has(k));
  const out: Honoured = {
    skip: rulings.skip.filter(dirExists), roots: kept,
    dropped: rulings.dropRoots.filter(isAppRoot),
    unruled: ruled.size > 0 ? appPaths.filter((p) => !ruled.has(p)) : [],
  };
  if (insideSkipped.length > 0) out.keptInsideSkipped = insideSkipped;
  if (notFound.length > 0) out.notFound = notFound;
  if (notReached.length > 0) out.notReached = notReached;
  return out;
}
