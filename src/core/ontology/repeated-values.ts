/**
 * A value that names a target already linked (`apps: ["web", "web"]`, two scope names that resolve to one screen, one
 * mention written twice in a text) is one link and a count. The link layer finds the repeats; this adds them to the
 * source line of the ruling or the principle under the reason "repeated value", so no value is dropped without a number.
 */
import type { Repeats } from "./link-ring2.js";
import { leftOutRecord } from "./left-out.js";
import type { SourceReport } from "./ontology-types.js";

const REASONS: Record<"ruling" | "principle", [keyof Repeats, string][]> = {
  ruling: [["rulingScope", "scope: repeated value"], ["rulingSuperseded", "superseded_by: repeated value"], ["rulingMention", "mention: repeated value"]],
  principle: [["principleMention", "mention: repeated value"]],
};

export function withRepeats(reports: readonly SourceReport[], repeats: Repeats): SourceReport[] {
  return reports.map((r) => {
    if (r.status !== "read" || (r.kind !== "ruling" && r.kind !== "principle")) return r;
    const left = new Map(Object.entries(r.leftOut ?? {}));
    let total = 0;
    for (const [field, reason] of REASONS[r.kind]) if (repeats[field] > 0) { left.set(reason, (left.get(reason) ?? 0) + repeats[field]); total += repeats[field]; }
    if (total === 0) return r;
    return { ...r, note: `${r.note}; ${total} repeated value(s) linked once and counted`, leftOut: leftOutRecord(left) as Record<string, number> };
  });
}
