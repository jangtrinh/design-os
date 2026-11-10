/**
 * The block contract (FR-002, owner decision D3). A command that can meet anomalies computes ALL of them first and
 * calls `blockOnOpenClusters` before it writes anything. When one of its own clusters has no ruling the command
 * writes nothing to its output, exits 1 with ONBOARD_BLOCKED_NEEDS_OWNER_RULING, and the only file touched is the
 * transient pending.json under `<project>/.design-os/onboard/`.
 *
 * "Nothing written" is a statement about the command's output. When the output directory is the project root, the
 * pending file lands inside it, so the tree under test excludes `.design-os/`.
 *
 * A command blocks only on its own questions: the kinds in `ownKinds`, plus the project-level kinds when it is one
 * of the doors that run the project-level detectors. A cluster another command left in pending.json is kept in the
 * file but does not block. This function never throws: a store error becomes an exit-1 envelope.
 */
import { errJsonWithData, errText } from "../output.js";
import type { CommandResult } from "../output.js";
import { PROJECT_LEVEL_KINDS } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";
import { PENDING_REL, PendingStoreError, writePending } from "./pending-store.js";
import { orderClusters } from "./questions-format.js";
import { computeRulingState } from "./ruling-state.js";
import { RulingStoreError } from "./ruling-store.js";

export const BLOCKED_CODE = "ONBOARD_BLOCKED_NEEDS_OWNER_RULING";

export interface BlockInput {
  /** Command label for the envelope, e.g. "ingest-figma-ds". */
  command: string;
  projectDir: string;
  /** Every detection the command met, in full (never stop at the first). */
  detections: readonly KindDetection[];
  /** The kinds this command computes completely. */
  ownKinds: readonly ClusterKind[];
  /** True for the two doors that run the project-level detectors themselves. Default false. */
  runsProjectDetectors?: boolean;
  emitters?: readonly KindEmitter[];
  json: boolean;
}

/** Returns the refusal result when an own cluster is open, or null when the command may go on and write. */
export function blockOnOpenClusters(input: BlockInput): CommandResult | null {
  const fail = (code: string, message: string): CommandResult =>
    input.json ? errJsonWithData(input.command, code, message, {}) : errText(`ui: ${code}: ${message}\n`);
  try {
    const projectLevel = input.runsProjectDetectors === true;
    const state = computeRulingState(input.projectDir, { detections: input.detections, ownKinds: input.ownKinds, projectLevel, ...(input.emitters === undefined ? {} : { emitters: input.emitters }) });
    const blocking = orderClusters(state.pending.filter((c) => input.ownKinds.includes(c.kind) || (projectLevel && PROJECT_LEVEL_KINDS.includes(c.kind))));
    if (blocking.length === 0) return null;

    writePending(input.projectDir, orderClusters(state.pending), 1);
    const next = "ui onboard questions --format claude   (or --format markdown for a sheet a team can answer)";
    const message = `${blocking.length} cluster(s) need an owner ruling; nothing was written to the output. Next: ${next}`;
    if (input.json) {
      return errJsonWithData(input.command, BLOCKED_CODE, message, { blocked: { round: 1, clusters: blocking, pendingPath: PENDING_REL } });
    }
    const lines = blocking.map((c) => `  ${c.kind}: ${c.count} affected — ${c.question}`);
    return errText(`ui: ${BLOCKED_CODE}\n${lines.join("\n")}\nui: ${message}\n`);
  } catch (e) {
    if (e instanceof RulingStoreError || e instanceof PendingStoreError) return fail(e.code, e.message);
    return fail("WRITE_ERROR", e instanceof Error ? e.message : "cannot write .design-os/onboard/pending.json");
  }
}
