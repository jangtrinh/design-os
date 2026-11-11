/**
 * The options of a multi-select question (FR-001, owner decision D15), built once for every set-valued kind.
 *
 * There are at most four option slots. With a computed recommendation, the first option is the whole recommended set
 * as one option; then the remaining members one per option, largest first; when the slots run out the last option
 * groups the rest with its count. A kind without a recommendation fills every slot largest first. The options are
 * disjoint and together cover every member; the per-member sheet is never an option. A question with a single option
 * gets a "keep none" option beside it, because a question needs two.
 */
import { MAX_OPTIONS } from "./cluster.js";
import type { ClusterOption } from "./cluster.js";

export interface SetOptionsSpec {
  /** The members being asked about, in scan order (an earlier answer may have removed some). */
  members: readonly string[];
  /** The kind's computed recommended set; only the members being asked about count. Empty or absent: no recommendation. */
  recommended?: readonly string[];
  /** How big a member is: "largest first" orders by it; ties keep the order of `members` (first appearance in the scan). */
  weight(member: string): number;
  /** The words of one option; `role` says which slot it is. */
  describe(members: readonly string[], role: "recommended" | "single" | "rest"): { label: string; consequence: string };
}

export const KEEP_NONE = "keep:none";

export function setValuedOptions(spec: SetOptionsSpec): ClusterOption[] {
  const scanOrder = [...new Set(spec.members)];
  const asked = new Set(scanOrder);
  const position = new Map(scanOrder.map((m, i) => [m, i]));
  const recommended = scanOrder.filter((m) => new Set(spec.recommended ?? []).has(m));
  // Never a string comparison of the members: a tie is broken by where the scan listed them.
  const compare = (a: string, b: string): number => spec.weight(b) - spec.weight(a) || (position.get(a) ?? 0) - (position.get(b) ?? 0);
  const options: ClusterOption[] = [];
  if (recommended.length > 0) {
    const { label, consequence } = spec.describe(recommended, "recommended");
    options.push({ id: "keep:recommended", label, consequence, recommended: true, selects: recommended });
  }
  const inRecommended = new Set(recommended);
  const rest = scanOrder.filter((m) => !inRecommended.has(m)).sort(compare);
  const slots = MAX_OPTIONS - options.length;
  const singles = rest.length <= slots ? rest : rest.slice(0, slots - 1);
  for (const m of singles) {
    const { label, consequence } = spec.describe([m], "single");
    options.push({ id: `member:${m}`, label, consequence, selects: [m] });
  }
  const grouped = rest.slice(singles.length);
  if (grouped.length > 0) {
    const { label, consequence } = spec.describe(grouped, "rest");
    options.push({ id: "keep:rest", label, consequence, selects: grouped });
  }
  if (options.length < 2) options.push({ id: KEEP_NONE, label: "Keep none of them", consequence: `${asked.size} left out, counted and named`, selects: [] });
  return options;
}
