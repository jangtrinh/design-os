/**
 * The block contract for `ui ds surface` (spec 033 FR-002, FR-003, FR-027; review fix round, section A). The command
 * always runs the project-level detectors and its own `component-name-collision` detection (and, with `--register`,
 * `component-source-match`) through `blockOnOpenClusters`, which syncs `pending.json`. One rule decides what blocks:
 * a question blocks a read only when what the read shows depends on its answer, and every open question of the command
 * blocks a write (`--out`, `--register --apply`).
 *  - `scan-budget` and `source-authority` block reads and writes;
 *  - `app-roots` blocks a read only when no app root can be chosen without it, and blocks every write, `--app` or not;
 *  - a collision and a source match never block a read (it lists both files and both sources) and always block a write.
 * The kernel function is told which kinds the call tolerates, so nothing is parsed back out of its output.
 */
import { blockOnOpenClusters } from "../core/owner-rulings/block-contract.js";
import type { BlockInput } from "../core/owner-rulings/block-contract.js";
import type { ClusterKind } from "../core/owner-rulings/cluster-kinds.js";
import { PENDING_REL, readPending } from "../core/owner-rulings/pending-store.js";
import type { CommandResult } from "../core/output.js";

export interface SurfaceBlockInput {
  command: string;
  /** One label per app root read, so a run on one app replaces only the questions that app's run raised. */
  raisedBy: string;
  projectDir: string;
  detections: BlockInput["detections"];
  /**
   * The kinds this call computes completely: the collision always, `component-source-match` only with `--register`.
   * A kind listed without its detection having run would drop the question it stored.
   */
  ownKinds: readonly ClusterKind[];
  /** True when the call writes the project (`--out`, `--register --apply`). */
  writes: boolean;
  /** True once an app root is chosen: an unanswered `app-roots` question then does not stop a read. */
  appChosen: boolean;
  json: boolean;
}

/** The refusal to return, or null when the command may go on. */
export function surfaceBlock(input: SurfaceBlockInput): CommandResult | null {
  const tolerated: ClusterKind[] = input.writes ? [] : [...input.ownKinds, ...(input.appChosen ? (["app-roots"] as const) : [])];
  return blockOnOpenClusters({ command: input.command, raisedBy: input.raisedBy, projectDir: input.projectDir, detections: input.detections, ownKinds: input.ownKinds, runsProjectDetectors: true, tolerated, json: input.json });
}

/** The questions a read went through with: how many are open and where they are stored; undefined when none. */
export function openQuestionsOf(projectDir: string): { count: number; path: string } | undefined {
  const count = readPending(projectDir).clusters.length;
  return count === 0 ? undefined : { count, path: PENDING_REL };
}
