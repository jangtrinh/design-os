/**
 * Agreement between the shadow pick and the human decision, per decision point.
 * Below MIN_SAMPLE resolved judgments there is no rate: the number is printed, never a verdict without it.
 */
import { DECISION_POINTS } from "./judge-validate.js";
import type { DecisionPoint, Judgment, PersonaFamilies } from "./judge-validate.js";

export const MIN_SAMPLE = 5;

export interface PointStats {
  decisionPoint: DecisionPoint;
  /** Distinct judgments recorded. */
  total: number;
  /** Judgments with a human decision. */
  resolved: number;
  pending: number;
  accepted: number;
  changed: number;
  rejected: number;
  /** accepted / resolved, or null when resolved < MIN_SAMPLE. */
  agreementRate: number | null;
  status: "rate" | "not-enough-data";
}

export function buildStats(latest: readonly Judgment[]): PointStats[] {
  return DECISION_POINTS.map((point) => {
    const rows = latest.filter((j) => j.decisionPoint === point);
    const resolved = rows.filter((j) => j.human !== undefined);
    const accepted = resolved.filter((j) => j.human?.decision === "accepted").length;
    const changed = resolved.filter((j) => j.human?.decision === "changed-to").length;
    const enough = resolved.length >= MIN_SAMPLE;
    return {
      decisionPoint: point,
      total: rows.length,
      resolved: resolved.length,
      pending: rows.length - resolved.length,
      accepted,
      changed,
      rejected: resolved.length - accepted - changed,
      agreementRate: enough ? accepted / resolved.length : null,
      status: enough ? "rate" : "not-enough-data",
    };
  });
}

/** persona-family judgments that name a family the table does not contain. */
export function unknownFamilyRefs(latest: readonly Judgment[], families: PersonaFamilies): { id: string; ref: string }[] {
  const known = new Set(families.families.map((f) => f.slug));
  const out: { id: string; ref: string }[] = [];
  for (const j of latest) {
    if (j.decisionPoint !== "persona-family") continue;
    const refs = [...j.candidates, ...j.pick.evidenceRefs.filter((e) => e.type === "persona-dossier").map((e) => e.ref)];
    for (const ref of new Set(refs)) if (!known.has(ref)) out.push({ id: j.id, ref });
  }
  return out;
}
