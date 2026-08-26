/**
 * FloorFinding schema v1 — the ONE finding shape every gate family speaks
 * (advisory: plans/reports/advisory-260819-1536-ui-gate-unification.md;
 * brainstorm: plans/reports/brainstorm-260819-1656-tractability-triage-meta-skill.md §5.1).
 *
 * The retry ladder, stuck detector, patch validator, taste-veto channel and
 * telemetry all key off this shape, so it is ratified BEFORE any of them are
 * built — hard-coding them around a weaker shape was the failure the advisory
 * named. All v1 additions are OPTIONAL: existing checks keep working untouched
 * and adopt fields as they are upgraded (reference implementations first).
 *
 * Field semantics:
 * - `nodeRef` — a stable, human-readable locator for the offending node
 *   (e.g. "hero > cta_group > button[1]" or "<input> line 42"). Stability
 *   matters more than precision: the stuck detector keys error identity on
 *   (checkId, nodeRef, expected), so a locator that renumbers on unrelated
 *   edits makes churn look like progress.
 * - `expected` / `actual` — the contract and the observed value, as short
 *   strings ("one of [8,12,16,24,32]" / "margin-left: 13px"). What turns a
 *   finding from a verdict into a repair instruction.
 * - `fixHint` — one imperative clause, authored per-rule by the rule's author
 *   (never model-generated): "snap to the nearest scale step".
 * - `repairScope` — the finding's DECLARED blast radius, the Q-b ruling:
 *   a patch is valid iff its diff touches only the declared scope. Widening
 *   is authored where the rule is authored, same commit — never silently at
 *   patch-apply time.
 */

/** The declared blast radius of a repair for this finding. */
export type RepairScope =
  /** Only the nodes named in nodeRef (default for element-local findings). */
  | "nodes"
  /** The offending node's subtree (layout/structural rearrangements). */
  | "subtree"
  /** Anywhere the rule's SUBJECT appears (the catalog's `subject` column names
   *  it machine-readably) — document-wide mechanical fixes; these should
   *  graduate to deterministic autofixers, not model patches. */
  | "global";

/**
 * Three tiers, not two.
 *
 * `advisory` is for signs, not defects — a `cream-palette` surface is a smell
 * worth printing and never worth failing a build over. It is detected, listed
 * separately, and EXCLUDED from the failure count, so the exit code keeps its
 * exact current meaning.
 *
 * The trap this tier introduces is arithmetic, not typing: thirteen call sites
 * computed `warningCount` as `findings.length - errorCount`, which silently
 * buckets advisory into warnings without any type error. Use `countBySeverity`
 * below rather than subtracting — that is the shared-layer fix, and it makes a
 * fourth tier a one-place change instead of a fourteen-place hunt.
 */
export type FloorSeverity = "error" | "warning" | "advisory";

/** Findings split by severity. Never derive one count by subtracting another. */
export interface SeverityCounts {
  errorCount: number;
  warningCount: number;
  advisoryCount: number;
}

/** The ONE way to count findings by severity. */
export function countBySeverity(
  findings: readonly { severity: FloorSeverity }[],
): SeverityCounts {
  let errorCount = 0;
  let warningCount = 0;
  let advisoryCount = 0;
  for (const f of findings) {
    if (f.severity === "error") errorCount++;
    else if (f.severity === "warning") warningCount++;
    else advisoryCount++;
  }
  return { errorCount, warningCount, advisoryCount };
}

/** Findings that count toward failure. The exit code keys off this, nothing else. */
export function failing(
  findings: readonly { severity: FloorSeverity }[],
): readonly { severity: FloorSeverity }[] {
  return findings.filter((f) => f.severity === "error");
}

/**
 * Node-scoped repairs REQUIRE a nodeRef by construction — a "nodes" scope with
 * nothing named is a blast radius a validator can neither honor nor bound.
 * Global repairs carry no nodeRef; their region comes from the rule's catalog
 * `subject`. A finding with no repair story declares neither field.
 */
export type RepairTarget =
  | { repairScope: "nodes" | "subtree"; nodeRef: string }
  | { repairScope: "global"; nodeRef?: undefined }
  | { repairScope?: undefined; nodeRef?: string };

/** The base shape every gate family's findings normalize to. */
export type FloorFindingBase = {
  checkId: string;
  severity: FloorSeverity;
  message: string;
  /** 1-based line number when locatable; omitted for whole-document findings. */
  line?: number;
  /** The contract the artifact violated, as a short string. */
  expected?: string;
  /** The observed value, as a short string. */
  actual?: string;
  /** One imperative repair clause, authored per-rule. */
  fixHint?: string;
} & RepairTarget;
