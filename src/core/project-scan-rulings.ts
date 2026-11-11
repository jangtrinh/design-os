/**
 * The owner's scan rulings, in the form the walk reads them (spec 033 FR-014). One source: the owner rulings
 * (`onboard.rulings`) of the `scan-budget` kind (a directory ruled `skip` is not entered) and of the `app-roots` kind
 * (a root ruled `drop` is not walked; a root ruled `keep` is walked and prunes nothing). Both are read by member id, so
 * a renamed directory is a new member that no ruling covers and is walked. With no ruling the walk is the walk it
 * always was.
 *
 * Paths are project-relative and POSIX, the form the walk reports them in.
 */
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

/** True when this directory is an app root the owner ruled out: ruled `drop` or inside one, and not itself ruled `keep` (or inside a kept root). */
export function prunesAppRoot(rulings: ScanRulings, rel: string): boolean {
  if (rulings.keepRoots.some((k) => within(rel, k))) return false;
  return rulings.dropRoots.some((d) => within(rel, d));
}

/** True when `rel` is a kept root or lies on the way to one: the only thing walked inside a pruned directory. */
export function onWayToKeptRoot(rulings: ScanRulings, rel: string): boolean {
  return rulings.keepRoots.some((k) => within(k, rel));
}

export interface Honoured {
  skip: string[];
  roots: string[];
  /** App roots left out of the walk by the owner's ruling. */
  dropped: string[];
  /** App roots the walk found that no `app-roots` ruling covers; shown only when at least one ruling exists. */
  unruled: string[];
  unreadable?: string;
}

/** What `ui scan` says it honoured; absent when there was no ruling, so the output of a ruling-free scan is unchanged. */
export function honouredOf(rulings: ScanRulings, appPaths: readonly string[]): Honoured | undefined {
  if (rulings.unreadable !== undefined) return { skip: [], roots: [], dropped: [], unruled: [], unreadable: rulings.unreadable };
  if (rulings.skip.length === 0 && rulings.keepRoots.length === 0 && rulings.dropRoots.length === 0) return undefined;
  const ruled = new Set([...rulings.keepRoots, ...rulings.dropRoots]);
  const rootRulingExists = ruled.size > 0;
  return {
    skip: [...rulings.skip], roots: [...rulings.keepRoots], dropped: [...rulings.dropRoots],
    unruled: rootRulingExists ? appPaths.filter((p) => !ruled.has(p)) : [],
  };
}
