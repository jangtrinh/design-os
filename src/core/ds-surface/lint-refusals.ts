/**
 * The records a registration would write that the design-system lint refuses, and what the owner ruled for them (spec 033
 * D17, `component-lint-refused`). The askable set is the lint family of `resolveRegisterProvenance` (the markup lint and the
 * owner-promoted token-ban rules): one refusal code, `REGISTRY_MARKUP_DRIFT`. A bad name, a bad source reference, a missing
 * token or a name already held is a refusal by name and is never asked.
 *
 * A record is a candidate only when the current rulings would write it: the plan holds no name that still awaits another
 * question (collision, source match, source changed), so no question rests on a provisional answer. `leave-out` removes the
 * record from the write and lists it with its refusal code; `stop` removes it and makes `--apply` refuse; no answer removes it
 * and lists it as awaiting.
 */
import { sha256OfText } from "../../commands/registry-provenance-refs.js";
import { LEAVE_OUT_OUTCOME, STOP_OUTCOME, lintRefusedMemberOf } from "../owner-rulings/kind-component-lint-refused.js";
import type { LintRefusedCandidate } from "../owner-rulings/kind-component-lint-refused.js";
import { governingRuling } from "../owner-rulings/resolve-detections.js";
import { outcomeOf } from "../owner-rulings/ruling-store.js";
import type { Ruling } from "../owner-rulings/ruling-store.js";
import { registerLedger } from "./register-ledger.js";
import type { RegisterPlan } from "./register-plan.js";

/** The refusal codes of the design-system lint family of the registration path (`registry-provenance.ts`, `lintMarkup`). */
export const LINT_REFUSAL_CODES: readonly string[] = ["REGISTRY_MARKUP_DRIFT"];

const fileOf = (sourceRef: string): string => sourceRef.replace(/:\d+(?:-\d+)?$/, "");

/** The planned records and refreshes the lint refused, with the file and slice hash that identify each member. */
export function lintRefusedCandidates(plan: RegisterPlan, refused: readonly { name: string; code: string }[]): LintRefusedCandidate[] {
  const codeOf = new Map(refused.filter((r) => LINT_REFUSAL_CODES.includes(r.code)).map((r) => [r.name, r.code]));
  const out: LintRefusedCandidate[] = [];
  for (const b of plan.batch) { const code = codeOf.get(b.name); if (code !== undefined) out.push({ name: b.name, file: fileOf(b.sourceRef), sha: sha256OfText(b.markup), code }); }
  for (const r of plan.refreshes) { const code = r.linked ? undefined : codeOf.get(r.name); if (code !== undefined) out.push({ name: r.name, file: fileOf(r.sourceRef), sha: sha256OfText(r.markup), code }); }
  return out;
}

/** The plan without the records the lint refused: each is listed where the owner's answer puts it, and none is written. */
export function withoutLintRefused(plan: RegisterPlan, candidates: readonly LintRefusedCandidate[], rulings: readonly Ruling[]): RegisterPlan {
  if (candidates.length === 0) return plan;
  const preview = { ...plan.preview, leftOutByRuling: [] as typeof plan.preview.leftOutByRuling, awaitingLintRuling: [] as typeof plan.preview.awaitingLintRuling, lintStopped: [] as typeof plan.preview.lintStopped };
  for (const c of candidates) {
    const member = lintRefusedMemberOf(c);
    const ruling = governingRuling(rulings, "component-lint-refused", member);
    const outcome = ruling === undefined ? undefined : outcomeOf(ruling, member);
    const item = { name: c.name, code: c.code, file: c.file };
    if (outcome === LEAVE_OUT_OUTCOME) preview.leftOutByRuling.push(item);
    else if (outcome === STOP_OUTCOME) preview.lintStopped.push(item);
    else preview.awaitingLintRuling.push(item);
  }
  const dropped = new Set(candidates.map((c) => c.name));
  const batch = plan.batch.filter((b) => !dropped.has(b.name));
  const refreshes = plan.refreshes.filter((r) => !dropped.has(r.name));
  preview.records = preview.records.filter((r) => !dropped.has(r.name));
  preview.refreshes = preview.refreshes.filter((r) => !dropped.has(r.name));
  preview.ledger = registerLedger(preview, plan.planned);
  return { ...plan, batch, refreshes, preview };
}
