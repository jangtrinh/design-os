/**
 * The block contract (FR-002, owner decision D3). A command that can meet anomalies computes ALL of them first,
 * applies the stored rulings, and calls `blockOnOpenClusters` before it writes anything. When a cluster has no
 * ruling the command writes nothing to its output directory, exits 1 with ONBOARD_BLOCKED_NEEDS_OWNER_RULING,
 * and the only file touched is the transient pending.json under `<project>/.design-os/onboard/`.
 */
import { errJsonWithData, errText } from "../output.js";
import type { CommandResult } from "../output.js";
import type { Cluster } from "./cluster.js";
import type { ClusterKind } from "./cluster-kinds.js";
import { PENDING_REL, writePending } from "./pending-store.js";
import { computeRulingState } from "./ruling-state.js";
import { orderClusters } from "./questions-format.js";

export const BLOCKED_CODE = "ONBOARD_BLOCKED_NEEDS_OWNER_RULING";

export interface BlockInput {
  /** Command label for the envelope, e.g. "ingest-figma-ds". */
  command: string;
  projectDir: string;
  /** Every cluster the command met, in full (never stop at the first). */
  clusters: readonly Cluster[];
  /** The kinds this command computes completely; its stored pending clusters of these kinds are replaced. */
  ownKinds: readonly ClusterKind[];
  json: boolean;
}

/** Returns the refusal result when a cluster is open, or null when the command may go on and write. */
export function blockOnOpenClusters(input: BlockInput): CommandResult | null {
  const state = computeRulingState(input.projectDir, input.clusters, input.ownKinds);
  if (state.pending.length === 0) return null;

  const ordered = orderClusters(state.pending);
  writePending(input.projectDir, ordered, 1);
  const next = "ui onboard questions --format claude   (or --format markdown for a sheet a team can answer)";
  const message = `${ordered.length} cluster(s) need an owner ruling; nothing was written to the output. Next: ${next}`;
  if (input.json) {
    return errJsonWithData(input.command, BLOCKED_CODE, message, { blocked: { round: 1, clusters: ordered, pendingPath: PENDING_REL } });
  }
  const lines = ordered.map((c) => `  ${c.kind}: ${c.count} affected — ${c.question}`);
  return errText(`ui: ${BLOCKED_CODE}\n${lines.join("\n")}\nui: ${message}\n`);
}
