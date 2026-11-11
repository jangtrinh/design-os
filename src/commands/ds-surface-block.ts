/**
 * The block contract for `ui ds surface` (spec 033 FR-002, FR-003, FR-027). The command always runs the project-level
 * detectors and its own `component-name-collision` detection through `blockOnOpenClusters`, which syncs
 * `pending.json`. What blocks depends on whether the call writes:
 *  - a call that writes (`--out`, `--register --apply`) is blocked by every open cluster it asks about, a collision
 *    included, and writes nothing;
 *  - a read-only call is blocked by the project-level clusters (`scan-budget`, `source-authority`, and `app-roots` when
 *    no app root can be chosen) but not by a collision or by `app-roots` once an app root is chosen: it reports the
 *    surface, the question stays in `pending.json`, and the report names it. An answered or unanswered question never
 *    changes what the surface reads.
 * The kernel function is called as it is; a tolerated cluster is recognised from the refusal it returns, which is
 * computed in JSON form and re-rendered in the caller's form only when it really blocks.
 */
import { blockOnOpenClusters } from "../core/owner-rulings/block-contract.js";
import type { BlockInput } from "../core/owner-rulings/block-contract.js";
import type { ClusterKind } from "../core/owner-rulings/cluster-kinds.js";
import type { CommandResult } from "../core/output.js";

const OWN_KINDS: readonly ClusterKind[] = ["component-name-collision"];

export interface SurfaceBlockInput {
  command: string;
  projectDir: string;
  detections: BlockInput["detections"];
  /** True when the call writes the project (`--out`, `--register --apply`). */
  writes: boolean;
  /** True once an app root is chosen: an unanswered `app-roots` question then does not stop the read. */
  appChosen: boolean;
  json: boolean;
}

function blockedKinds(result: CommandResult): string[] {
  try {
    const parsed = JSON.parse(result.stdout ?? "") as { error?: { code?: string }; data?: { blocked?: { clusters?: { kind: string }[] } } };
    if (parsed.error?.code !== "ONBOARD_BLOCKED_NEEDS_OWNER_RULING") return [];
    return (parsed.data?.blocked?.clusters ?? []).map((c) => c.kind);
  } catch { return []; }
}

/** The refusal to return, or null when the command may go on. */
export function surfaceBlock(input: SurfaceBlockInput): CommandResult | null {
  const base = { command: input.command, projectDir: input.projectDir, detections: input.detections, ownKinds: OWN_KINDS, runsProjectDetectors: true };
  const probe = blockOnOpenClusters({ ...base, json: true });
  if (probe === null) return null;
  const kinds = blockedKinds(probe);
  const tolerated = [...(input.writes ? [] : OWN_KINDS), ...(input.appChosen ? ["app-roots"] : [])];
  if (kinds.length > 0 && kinds.every((k) => tolerated.includes(k))) return null;
  return input.json ? probe : blockOnOpenClusters({ ...base, json: false });
}
