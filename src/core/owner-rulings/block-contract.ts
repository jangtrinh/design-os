/**
 * The block contract (FR-002, owner decision D3). A command that can meet anomalies computes ALL of them first and
 * calls `blockOnOpenClusters` before it writes anything. When one of its own clusters has no ruling the command
 * writes nothing to its output, exits 1 with ONBOARD_BLOCKED_NEEDS_OWNER_RULING, and the only file touched is the
 * transient pending.json under `<project>/.design-os/onboard/`.
 *
 * "Nothing written" is a statement about the command's output. When the output directory is the project root, the
 * pending file lands inside it, so the tree under test excludes `.design-os/`. On every run the command replaces its
 * own kinds' stored questions with what it finds now (none when nothing is open) and removes the file once it is
 * empty; other kinds are left as stored, and the file is not rewritten when nothing changed.
 *
 * A command blocks only on its own questions: the kinds in `ownKinds`, plus the project-level kinds when it is one
 * of the doors that run the project-level detectors. A cluster another command left in pending.json is kept in the
 * file but does not block. A store read failure keeps the store's code and a write failure is WRITE_ERROR, both as
 * an exit-1 envelope; anything else (an emitter's own bug) propagates unchanged.
 */
import { errJsonWithData, errText } from "../output.js";
import type { CommandResult } from "../output.js";
import { PROJECT_LEVEL_KINDS } from "./cluster-kinds.js";
import type { ClusterKind } from "./cluster-kinds.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";
import type { Cluster } from "./cluster.js";
import { PENDING_REL, PendingStoreError, syncPending } from "./pending-store.js";
import { orderClusters } from "./questions-format.js";
import { computeRulingState } from "./ruling-state.js";
import type { RulingState } from "./ruling-state.js";
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
  /**
   * Kinds that stay in pending.json but do not block this call (a read whose output does not depend on their answer).
   * Default none: a command that does not pass it behaves exactly as before.
   */
  tolerated?: readonly ClusterKind[];
  emitters?: readonly KindEmitter[];
  json: boolean;
}

/** Returns the refusal result when an own cluster is open, or null when the command may go on and write. */
export function blockOnOpenClusters(input: BlockInput): CommandResult | null {
  const fail = (code: string, message: string): CommandResult =>
    input.json ? errJsonWithData(input.command, code, message, {}) : errText(`ui: ${code}: ${message}\n`);
  const projectLevel = input.runsProjectDetectors === true;
  let state: RulingState;
  try {
    state = computeRulingState(input.projectDir, { detections: input.detections, ownKinds: input.ownKinds, command: input.command, projectLevel, ...(input.emitters === undefined ? {} : { emitters: input.emitters }) });
  } catch (e) {
    // Only the stores' own failures become an envelope; a bug in an emitter keeps its own message and stack.
    if (e instanceof RulingStoreError || e instanceof PendingStoreError) return fail(e.code, e.message);
    throw e;
  }
  // A question another command raised stays stored but is not this command's to block on (project-level kinds are everyone's).
  const foreign = (c: Cluster): boolean => !PROJECT_LEVEL_KINDS.includes(c.kind) && c.raisedBy !== input.command;
  const blocking = orderClusters(state.pending.filter((c) => (input.ownKinds.includes(c.kind) || (projectLevel && PROJECT_LEVEL_KINDS.includes(c.kind))) && !foreign(c) && !(input.tolerated ?? []).includes(c.kind)));

  // What this command raised is replaced by what it detects now: the open ones when it blocks, none when it does not.
  try { syncPending(input.projectDir, orderClusters(state.pending)); }
  catch (e) {
    return fail("WRITE_ERROR", e instanceof Error ? e.message : "cannot write .design-os/onboard/pending.json");
  }
  if (blocking.length === 0) return null;

  const how = "ui onboard questions --format claude   (or --format markdown for a sheet a team can answer)";
  const message = `${blocking.length} cluster(s) need an owner ruling; nothing was written to the output. Next: ${how}`;
  if (input.json) {
    return errJsonWithData(input.command, BLOCKED_CODE, message, { blocked: { round: 1, clusters: blocking, pendingPath: PENDING_REL } });
  }
  const lines = blocking.map((c) => `  ${c.kind}: ${c.count} affected — ${c.question}`);
  return errText(`ui: ${BLOCKED_CODE}\n${lines.join("\n")}\nui: ${message}\n`);
}
