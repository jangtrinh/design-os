/**
 * One round of `ui ds surface --register` (spec 033 FR-027): the plan the current rulings give, what a write of it would
 * refuse (the same checks the write runs), and the questions the registration raises together, because none of them depends
 * on another open answer (FR-001): `component-source-match` and `component-source-changed` from the tree and the registry,
 * and `component-lint-refused` from the records the current rulings would write. A name that still awaits another question is
 * not in the plan, so it is not a lint member yet: it is asked in the next round if it still fails.
 */
import { lintRefusedCandidates, withoutLintRefused } from "../core/ds-surface/lint-refusals.js";
import { planRegistration } from "../core/ds-surface/register-plan.js";
import type { RegisterPlan } from "../core/ds-surface/register-plan.js";
import type { CollisionRulingResult } from "../core/ds-surface/collision-rulings.js";
import { sourceMatchCandidates } from "../core/ds-surface/source-match-candidates.js";
import type { SurfaceModel } from "../core/ds-surface/surface-types.js";
import { lintRefusedDetection } from "../core/owner-rulings/kind-component-lint-refused.js";
import { sourceChangedDetection } from "../core/owner-rulings/kind-component-source-changed.js";
import { sourceMatchDetection } from "../core/owner-rulings/kind-component-source-match.js";
import type { KindDetection } from "../core/owner-rulings/kind-emitter.js";
import type { Ruling } from "../core/owner-rulings/ruling-store.js";
import type { Registry } from "../core/registry-store.js";
import { BatchRegisterError, predictBatchRefusals } from "./registry-register-batch.js";

export interface RegisterRound { plan: RegisterPlan; detections: KindDetection[] }

type Predicted = RegisterPlan["preview"]["wouldRefuse"];

/** What a write of `plan` would refuse; a store that cannot be checked says why, and no question is raised from it. */
function predict(cwd: string, plan: RegisterPlan): Predicted {
  try {
    return predictBatchRefusals(cwd, plan.batch, plan.links.map((l) => ({ name: l.name, sourceRef: l.sourceRef, tokens: l.tokens })), plan.refreshes);
  } catch (e) {
    if (!(e instanceof BatchRegisterError)) throw e;
    return { count: 0, byCode: {}, items: [], notChecked: `${e.code}: ${e.message}` };
  }
}

export function registerRound(cwd: string, model: SurfaceModel, ruled: CollisionRulingResult, existing: Registry | null, rulings: readonly Ruling[]): RegisterRound {
  const planned = planRegistration(model, ruled, existing, rulings);
  const first = predict(cwd, planned);
  const candidates = first.notChecked === undefined ? lintRefusedCandidates(planned, first.items) : [];
  const plan = withoutLintRefused(planned, candidates, rulings);
  // The refusals left after the lint-refused records are out of the write are the ones that are not askable: they stay refusals by name.
  plan.preview.wouldRefuse = candidates.length === 0 ? first : predict(cwd, plan);
  return {
    plan,
    detections: [
      sourceMatchDetection({ candidates: sourceMatchCandidates(model, ruled, existing) }),
      sourceChangedDetection({ candidates: plan.sourceChanged }),
      lintRefusedDetection({ candidates, planned: plan.planned }),
    ],
  };
}
