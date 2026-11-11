/**
 * The owner's scan rulings, in the form the walk reads them (spec 033 FR-014): the directories the owner told the scan
 * to skip (`onboard.scan.skip`, and every `scan-budget` ruling that says skip) and the app roots the owner kept
 * (`onboard.scan.roots`, and every `app-roots` ruling that says keep). Nothing else writes either list; with no
 * ruling both are empty and the walk is the walk it always was.
 *
 * Paths are project-relative and POSIX, the form the walk reports them in.
 */
import { governedOutcomes, indexRulings } from "./owner-rulings/resolve-detections.js";
import { readRulingStore } from "./owner-rulings/ruling-store.js";

export interface ScanRulings {
  /** Project-relative directories the walk does not enter (the directory entry itself is still counted). */
  skip: readonly string[];
  /** Project-relative app roots the owner kept. Empty: no app root is pruned. */
  keepRoots: readonly string[];
}

export const NO_SCAN_RULINGS: ScanRulings = { skip: [], keepRoots: [] };

const clean = (p: string): string => p.normalize("NFC").replace(/^\.\//, "").replace(/\/+$/, "");
const sorted = (list: Iterable<string>): string[] => [...new Set([...list].map(clean))].filter((p) => p !== "").sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** Throws RulingStoreError when the manifest cannot be read: a ruling that cannot be read cannot be honoured. */
export function scanRulingsOf(projectDir: string): ScanRulings {
  const store = readRulingStore(projectDir);
  const index = indexRulings(store.rulings);
  const skipped = Object.entries(governedOutcomes(index, "scan-budget")).filter(([, o]) => o === "skip").map(([m]) => m);
  const kept = Object.entries(governedOutcomes(index, "app-roots")).filter(([, o]) => o === "keep").map(([m]) => m);
  return { skip: sorted([...store.scan.skip, ...skipped]), keepRoots: sorted([...store.scan.roots, ...kept]) };
}

/** True when the owner kept some app roots and this app root is neither one of them, inside one, nor above one. */
export function prunesAppRoot(rulings: ScanRulings, rel: string): boolean {
  if (rulings.keepRoots.length === 0) return false;
  return !rulings.keepRoots.some((r) => rel === r || rel.startsWith(`${r}/`) || r.startsWith(`${rel}/`));
}

/** What `ui scan` says it honoured; absent when there was no ruling, so the output of a ruling-free scan is unchanged. */
export function honouredOf(rulings: ScanRulings): { skip: string[]; roots: string[] } | undefined {
  return rulings.skip.length === 0 && rulings.keepRoots.length === 0 ? undefined : { skip: [...rulings.skip], roots: [...rulings.keepRoots] };
}
