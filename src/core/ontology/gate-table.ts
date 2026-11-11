/**
 * The kernel's own table of which gate family evaluates which rule: the exact source of `checked-by`. A row exists only
 * for a rule source a gate really reads (a test proves each row against the code). A rule no gate evaluates gets no
 * link and is counted as not checked; no row is invented for it.
 */
import { CHECK_CATALOG } from "../check-catalog.js";
import { GATE_FAMILIES } from "../gate.js";
import type { GateFamily } from "../gate.js";
import { nodeId } from "./node-ids.js";
import { byText } from "./ontology-types.js";
import type { OntNode } from "./ontology-types.js";

export type RuleOrigin = "soul" | "adherence" | "convention";
export interface CheckedByRow { origin: RuleOrigin; kind: string; family: GateFamily }

/** `token-ban` rules promoted to `design/rules/_adherence.rules.json` are run by the `ds-usage` family (`ui gate`). */
export const CHECKED_BY: readonly CheckedByRow[] = [{ origin: "adherence", kind: "token-ban", family: "ds-usage" }];

export const gateFamilyFor = (origin: RuleOrigin, kind: string): GateFamily | undefined =>
  CHECKED_BY.find((r) => r.origin === origin && r.kind === kind)?.family;

/** One gate node per family, carrying the sorted ids of the catalog checks it runs. */
export function gateNodes(): OntNode[] {
  return GATE_FAMILIES.map((family): OntNode => ({
    id: nodeId("gate", family), kind: "gate", name: family,
    checks: CHECK_CATALOG.filter((c) => c.family === family).map((c) => c.id).sort(byText),
  }));
}
