/** Shared, fs-free helpers over one ruling record for the promotion commands. */

export type RulingRecord = Record<string, unknown>;
export type EffectiveStatus = "draft" | "active" | "superseded" | "retired";

export const isRecord = (v: unknown): v is RulingRecord => v !== null && typeof v === "object" && !Array.isArray(v);
export const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(isNonEmptyString) : [];
}

/** Rulings that lack `id`, `category` or `text` cannot be reasoned about; callers count them, never drop them silently. */
export function usableRulings(doc: unknown): { usable: RulingRecord[]; unusable: number } {
  const all = isRecord(doc) && Array.isArray(doc["rulings"]) ? doc["rulings"] : [];
  const usable = all.filter((r): r is RulingRecord => isRecord(r) && isNonEmptyString(r["id"]) && isNonEmptyString(r["category"]) && isNonEmptyString(r["text"]));
  return { usable, unusable: all.length - usable.length };
}

/**
 * A ruling with no `status` is live unless it names a `superseded_by` successor —
 * real project files predate the `status` field and mark supersession only that way.
 */
export function effectiveStatus(r: RulingRecord): EffectiveStatus {
  const s = r["status"];
  if (s === "draft" || s === "active" || s === "superseded" || s === "retired") return s;
  return isNonEmptyString(r["superseded_by"]) ? "superseded" : "active";
}

/** Distinct source documents: `a.md#x` and `a.md#y` are one document, so they corroborate nothing. */
export function distinctSourceDocuments(r: RulingRecord): string[] {
  return [...new Set(stringArray(r["source"]).map((s) => (s.split("#")[0] ?? s).trim()).filter((s) => s.length > 0))];
}

export const byCategoryThenId = (a: RulingRecord, b: RulingRecord): number => {
  const ca = String(a["category"]); const cb = String(b["category"]);
  if (ca !== cb) return ca < cb ? -1 : 1;
  const ia = String(a["id"]); const ib = String(b["id"]);
  return ia < ib ? -1 : ia > ib ? 1 : 0;
};
