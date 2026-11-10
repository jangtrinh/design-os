/**
 * The current ruling state of a project, computed in memory: the detections (project-level ones sensed here, plus a
 * calling command's own), resolved against the stored rulings, plus the stored pending clusters of other commands.
 * Read-only — `ui onboard`, `ui onboard questions` and a blocked command all start from this one function.
 */
import type { Cluster } from "./cluster.js";
import { PROJECT_LEVEL_KINDS } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";
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
  /** The kinds the calling command computed completely: its stored clusters of these kinds are replaced. */
  ownKinds?: readonly ClusterKind[];
  /** Run the project-level emitters (sense + detect). Default true. */
  projectLevel?: boolean;
}

export interface RulingState {
  /** Every cluster still open: from the detections, plus stored ones no ruling fully governs. */
  pending: Cluster[];
  /** Rulings recorded in the store. */
  recorded: number;
  stale: Ruling[];
  /** The kinds whose detectors ran in this call: their stored clusters are replaced by `pending`'s own. */
  recomputed: ClusterKind[];
  /** Per kind, member -> outcome, from the detections that ran. */
  outcomes: Record<string, Record<string, string>>;
}

/** Throws RulingStoreError or PendingStoreError when a store cannot be read. */
export function computeRulingState(projectDir: string, options: RulingStateOptions = {}): RulingState {
  const emitters = options.emitters ?? EMITTERS;
  const store = readRulingStore(projectDir);
  const stored = readPending(projectDir).clusters;

  const detections: KindDetection[] = [];
  const ran = new Set<ClusterKind>(options.ownKinds ?? []);
  if (options.projectLevel !== false) {
    for (const e of emitters) {
      if (!PROJECT_LEVEL_KINDS.includes(e.kind) || e.sense === undefined) continue;
      ran.add(e.kind); // the detector ran: its answer, even "nothing", replaces what was stored for the kind
      const found = e.detect(e.sense(projectDir));
      if (found !== null) detections.push(found);
    }
  }
  detections.push(...(options.detections ?? []));

  const recomputed = new Set<ClusterKind>([...ran, ...detections.map((d) => d.kind)]);
  const resolution = resolveDetections(detections, store.rulings);
  const index = indexRulings(store.rulings);
  const kept = stored.filter((c) => !recomputed.has(c.kind) && c.members.some((m) => index.get(c.kind)?.has(m) !== true));
  return {
    pending: [...kept, ...resolution.open],
    recorded: store.rulings.length,
    stale: resolution.stale,
    recomputed: [...recomputed],
    outcomes: resolution.outcomes as Record<string, Record<string, string>>,
  };
}
