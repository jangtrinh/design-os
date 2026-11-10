/**
 * The project-level detectors (FR-003, FR-004): the in-memory checks behind the three kinds that `ui onboard
 * questions` writes (`scan-budget`, `app-roots`, `source-authority`), and that `ui ds import` and `ui ds surface`
 * run before they write. A detector is a pure function of the project directory; this module is only the registry,
 * so the command code never changes when a kind's detector lands.
 */
import type { Cluster } from "./cluster.js";
import { CLUSTER_KIND_TABLE, CLUSTER_KINDS } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";

export type ProjectDetector = (projectDir: string) => Cluster | Cluster[] | null;

const PROJECT_WRITER = "ui onboard questions";
const detectors = new Map<ClusterKind, ProjectDetector>();

/** The kinds that are detected from the project itself rather than raised by a command's own input. */
export const PROJECT_LEVEL_KINDS: readonly ClusterKind[] = CLUSTER_KINDS.filter((k) => CLUSTER_KIND_TABLE[k].raisedBy.includes(PROJECT_WRITER));

export function registerProjectDetector(kind: ClusterKind, detector: ProjectDetector): void {
  if (!PROJECT_LEVEL_KINDS.includes(kind)) throw new Error(`'${kind}' is not a project-level kind; only ${PROJECT_LEVEL_KINDS.join(", ")} are detected from the project`);
  detectors.set(kind, detector);
}

/** Test seam: drops every registered detector. */
export function clearProjectDetectors(): void {
  detectors.clear();
}

export interface ProjectDetection {
  clusters: Cluster[];
  /** The kinds a detector ran for, whether or not it found anything. */
  checkedKinds: ClusterKind[];
}

export function detectProjectClusters(projectDir: string): ProjectDetection {
  const clusters: Cluster[] = [];
  const checkedKinds: ClusterKind[] = [];
  for (const kind of PROJECT_LEVEL_KINDS) {
    const detector = detectors.get(kind);
    if (detector === undefined) continue;
    checkedKinds.push(kind);
    const found = detector(projectDir);
    if (found === null) continue;
    clusters.push(...(Array.isArray(found) ? found : [found]));
  }
  return { clusters, checkedKinds };
}
