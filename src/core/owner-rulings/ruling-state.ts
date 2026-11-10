/**
 * The current ruling state of a project, computed in memory: the detections (project-level ones sensed here, plus a
 * calling command's own), resolved against the stored rulings, plus the stored pending clusters of other commands.
 * Read-only — `ui onboard`, `ui onboard questions` and a blocked command all start from this one function.
 */
import type { Cluster } from "./cluster.js";
import { PROJECT_LEVEL_KINDS } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";
import { runEmitter } from "./emitter-failure.js";
import { EMITTERS } from "./emitters.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";
import { readPending } from "./pending-store.js";
import { indexRulings, resolveDetections } from "./resolve-detections.js";
import { readRulingStore } from "./ruling-store.js";
import type { Ruling } from "./ruling-store.js";

export interface RulingStateOptions {
  /** Defaults to the registry; a test passes its own list in-process. */
  emitters?: readonly KindEmitter[];
  /** A calling command's own detections. */
  detections?: readonly KindDetection[];
  /** The kinds the calling command computed completely: the stored clusters of these kinds that it raised are replaced. */
  ownKinds?: readonly ClusterKind[];
  /** The calling command's label, stamped on the questions it raises. Default "ui onboard". */
  command?: string;
  /** Run the project-level emitters (sense + detect). Default true. */
  projectLevel?: boolean;
}

export interface RulingState {
  /** Every cluster still open: from the detections, plus stored ones no ruling fully governs. */
  pending: Cluster[];
  /** Rulings recorded in the store. */
  recorded: number;
  stale: Ruling[];
  /** Per kind, member -> outcome, from the detections that ran. */
  outcomes: Record<string, Record<string, string>>;
}

/** Throws RulingStoreError or PendingStoreError when a store cannot be read. */
export function computeRulingState(projectDir: string, options: RulingStateOptions = {}): RulingState {
  const emitters = options.emitters ?? EMITTERS;
  const store = readRulingStore(projectDir);
  const stored = readPending(projectDir).clusters;

  const command = options.command ?? "ui onboard";
  const detections: KindDetection[] = [];
  const sensed = new Set<ClusterKind>();
  if (options.projectLevel !== false) {
    for (const e of emitters) {
      if (!PROJECT_LEVEL_KINDS.includes(e.kind) || e.sense === undefined) continue;
      sensed.add(e.kind); // the detector ran: its answer, even "nothing", replaces what was stored for the kind
      const found = runEmitter(e.kind, () => e.detect(e.sense?.(projectDir)));
      if (found !== null) detections.push(found);
    }
  }
  detections.push(...(options.detections ?? []));

  // A stored question is replaced by this call when a project-level detector ran for its kind (or the command computed
  // the kind itself), or when it is one of the command's own kinds and the command raised it. Another command's
  // question of a shared kind stays.
  const own = new Set<ClusterKind>([...(options.ownKinds ?? []), ...(options.detections ?? []).map((d) => d.kind)]);
  const replaced = (c: Cluster): boolean => sensed.has(c.kind) || (own.has(c.kind) && (PROJECT_LEVEL_KINDS.includes(c.kind) || c.raisedBy === command));
  const resolution = resolveDetections(detections, store.rulings, command);
  const index = indexRulings(store.rulings);
  const asked = new Set(resolution.open.map((c) => c.fingerprint));
  const kept = stored.filter((c) => !replaced(c) && !asked.has(c.fingerprint) && c.members.some((m) => index.get(c.kind)?.has(m) !== true));
  return {
    pending: [...kept, ...resolution.open],
    recorded: store.rulings.length,
    stale: resolution.stale,
    outcomes: resolution.outcomes as Record<string, Record<string, string>>,
  };
}
