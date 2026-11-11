/**
 * The open questions that block `ui ontology build`: its own `inferred-links` clusters and every project-level kind
 * (`app-roots`, `scan-budget`, `source-authority`, ...), because the sources the build reads depend on their answers.
 * Read-only (the lint uses it and never writes): the same state the build's block contract computes, without the sync.
 */
import { PROJECT_LEVEL_KINDS } from "../owner-rulings/cluster-kinds.js";
import type { Cluster } from "../owner-rulings/cluster.js";
import type { KindDetection } from "../owner-rulings/kind-emitter.js";
import { readPending } from "../owner-rulings/pending-store.js";
import { computeRulingState } from "../owner-rulings/ruling-state.js";

/** The label the build stamps on the questions it raises. */
export const BUILD_LABEL = "ontology build";

export function blockingClusters(projectDir: string, detections: readonly KindDetection[]): Cluster[] {
  const state = computeRulingState(projectDir, { detections, ownKinds: ["inferred-links"], command: BUILD_LABEL, projectLevel: true });
  const projectLevel = (c: Cluster): boolean => PROJECT_LEVEL_KINDS.includes(c.kind);
  return state.pending.filter((c) => (c.kind === "inferred-links" || projectLevel(c)) && (projectLevel(c) || c.raisedBy === BUILD_LABEL));
}

/** "3 cluster(s) await an owner ruling (app-roots, scan-budget)": what the lint says when a fresh emit is blocked. */
export function blockingSummary(clusters: readonly Cluster[]): string {
  const kinds = [...new Set(clusters.map((c) => c.kind))].sort();
  return `${clusters.length} cluster(s) await an owner ruling (${kinds.join(", ")})`;
}

/**
 * The action that works for these questions. `ui onboard questions` runs the project-level detectors itself and lists
 * what `pending.json` holds; a question only `ui ontology build` raises (`inferred-links`) is listed after a build has
 * stored it, so until then the build is the action.
 */
export function blockingAction(projectDir: string, clusters: readonly Cluster[]): string {
  const stored = new Set(readPending(projectDir).clusters.map((c) => c.fingerprint));
  const needsBuild = clusters.some((c) => !PROJECT_LEVEL_KINDS.includes(c.kind) && !stored.has(c.fingerprint));
  return needsBuild
    ? "run ui ontology build: it raises the questions and writes nothing until they are answered, then ui onboard questions --format claude lists them"
    : "ui onboard questions --format claude";
}
