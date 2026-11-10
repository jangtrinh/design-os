/**
 * What a cluster kind contributes to the kernel. An emitter returns a detection over plain data; it never builds a
 * cluster. The kernel turns a detection into a question (resolve-detections.ts), so the options of a question always
 * describe the members actually asked about.
 */
import type { Cluster, ClusterOption } from "./cluster.js";
import type { ClusterKind } from "./cluster-kinds.js";

export interface KindDetection {
  kind: ClusterKind;
  /** Identities that need a ruling. */
  members: string[];
  /** Every identity of this kind that exists in the input now, ruled or not: a superset of `members`. */
  domain: string[];
  /** Builds the question for exactly these members: called with all of them, or with the unruled rest. */
  ask(members: readonly string[]): { question: string; options: ClusterOption[]; evidence?: unknown };
}

export interface KindEmitter {
  kind: ClusterKind;
  /**
   * Pure over plain data: no file, clock or network access. Null means the kind does not apply to this input; a
   * detection with no members means it applies and nothing needs a ruling.
   */
  detect(input: unknown): KindDetection | null;
  /** Project-level kinds only: gathers the plain data `detect` reads. The only part that may touch the disk. */
  sense?(projectDir: string): unknown;
  /** Refuses an answer the data cannot honour; returns the refusal message (raised as DANGLING_AFTER_SELECTION). */
  checkAnswer?(cluster: Cluster, outcomes: Record<string, string>): string | null;
}
