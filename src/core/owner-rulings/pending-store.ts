/**
 * The pending store: `<project>/.design-os/onboard/pending.json` (CD-2). Transient — safe to delete, never read as a
 * ruling. Written by a blocked command and by `ui onboard questions`; nothing else writes it (FR-002).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Cluster } from "./cluster.js";
import { isClusterKind } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";

export const PENDING_REL = ".design-os/onboard/pending.json";

export interface PendingDoc { version: 1; round: number; clusters: Cluster[] }

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** An unreadable or malformed file is treated as no pending state: it is transient and the next detection rebuilds it. */
export function readPending(projectDir: string): PendingDoc {
  const empty: PendingDoc = { version: 1, round: 1, clusters: [] };
  const path = join(projectDir, PENDING_REL);
  if (!existsSync(path)) return empty;
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(raw) || !Array.isArray(raw["clusters"])) return empty;
    const clusters = raw["clusters"].filter((c): c is Cluster =>
      isRecord(c) && isClusterKind(c["kind"]) && typeof c["fingerprint"] === "string" && Array.isArray(c["members"]) && Array.isArray(c["options"]));
    return { version: 1, round: typeof raw["round"] === "number" ? raw["round"] : 1, clusters };
  } catch { return empty; }
}

export function writePending(projectDir: string, clusters: readonly Cluster[], round = 1): string {
  const path = join(projectDir, PENDING_REL);
  mkdirSync(dirname(path), { recursive: true });
  const doc: PendingDoc = { version: 1, round, clusters: [...clusters] };
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`);
  renameSync(tmp, path);
  return path;
}

/**
 * Merges freshly computed clusters into the stored ones. For the kinds in `replaceKinds` the caller computed the
 * complete current picture, so the stored clusters of those kinds are dropped; other stored clusters stay.
 */
export function mergePending(existing: readonly Cluster[], incoming: readonly Cluster[], replaceKinds: readonly ClusterKind[]): Cluster[] {
  const kept = existing.filter((c) => !replaceKinds.includes(c.kind) && !incoming.some((i) => i.fingerprint === c.fingerprint));
  return [...kept, ...incoming];
}
