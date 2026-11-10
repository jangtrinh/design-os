/**
 * The pending store: `<project>/.design-os/onboard/pending.json` (CD-2). Transient, safe to delete, never read as a
 * ruling. A command replaces the questions it raised itself on every run, and the file goes when none is left.
 *
 * Writers, and only these: a command that can block (`blockOnOpenClusters`), `ui onboard questions` and
 * `ui onboard answer`. `ui onboard` and every other command only read it.
 *
 * Threat model: the file sits in the user's own project next to the manifest and is as trusted as the manifest. The
 * validation below exists against corruption and accidental hand edits; option ids are not signed. A file that
 * fails validation is never filtered: reading it throws BAD_PENDING so the owner is told, not silently re-asked.
 */
import { existsSync, readFileSync, rmSync, rmdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { isRecord } from "../knowledge-promotion-ruling.js";
import { writeJsonAtomic } from "./atomic-write.js";
import { parseStoredCluster } from "./cluster.js";
import type { Cluster } from "./cluster.js";
import type { ClusterKind } from "./cluster-kinds.js";

export const PENDING_REL = ".design-os/onboard/pending.json";

export interface PendingDoc { version: 1; round: number; clusters: Cluster[] }

export class PendingStoreError extends Error {
  readonly code = "BAD_PENDING";
  constructor(why: string) {
    super(`${PENDING_REL} is unreadable (${why}). It is transient and safe to delete: delete it, then rebuild it with: ui onboard questions`);
  }
}

export function readPending(projectDir: string): PendingDoc {
  const path = join(projectDir, PENDING_REL);
  if (!existsSync(path)) return { version: 1, round: 1, clusters: [] };
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new PendingStoreError("not valid JSON"); }
  if (!isRecord(raw) || !Array.isArray(raw["clusters"])) throw new PendingStoreError("it has no clusters list");
  const clusters: Cluster[] = [];
  for (const c of raw["clusters"]) {
    const parsed = parseStoredCluster(c);
    if (typeof parsed === "string") throw new PendingStoreError(parsed);
    clusters.push(parsed);
  }
  return { version: 1, round: typeof raw["round"] === "number" ? raw["round"] : 1, clusters };
}

export function writePending(projectDir: string, clusters: readonly Cluster[], round = 1): string {
  const doc: PendingDoc = { version: 1, round, clusters: [...clusters] };
  writeJsonAtomic(join(projectDir, PENDING_REL), doc);
  return join(projectDir, PENDING_REL);
}

/**
 * Removes the pending file, and the `onboard/` directory when that leaves it empty; a file that is not there is
 * already the wanted state. `.design-os/` itself is never removed.
 */
export function removePending(projectDir: string): void {
  const file = join(projectDir, PENDING_REL);
  rmSync(file, { force: true });
  try { rmdirSync(dirname(file)); }
  catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "ENOTEMPTY" && code !== "EEXIST" && code !== "ENOENT") throw e;
  }
}

/** Makes the stored questions equal to `next`: no write when nothing changed, the file removed when `next` is empty. */
export function syncPending(projectDir: string, next: readonly Cluster[]): void {
  if (JSON.stringify(next) === JSON.stringify(readPending(projectDir).clusters)) return;
  if (next.length === 0) removePending(projectDir);
  else writePending(projectDir, next, 1);
}

/**
 * Merges freshly computed clusters into the stored ones. For the kinds in `replaceKinds` the caller computed the
 * complete current picture, so the stored clusters of those kinds are dropped; other stored clusters stay as stored.
 */
export function mergePending(existing: readonly Cluster[], incoming: readonly Cluster[], replaceKinds: readonly ClusterKind[]): Cluster[] {
  const kept = existing.filter((c) => !replaceKinds.includes(c.kind) && !incoming.some((i) => i.fingerprint === c.fingerprint));
  return [...kept, ...incoming];
}
