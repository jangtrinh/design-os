/**
 * The `scope` of a ruling as `schemas/rulings.schema.json` defines it: `"global"`, or an object with the lists `apps`,
 * `features` and `screens` of non-empty strings. Whatever is not understood is left out of the lists and counted under a
 * plain reason, so the source line can say how many values were skipped and why: nothing is skipped silently.
 */

export interface RulingScope { apps: string[]; features: string[]; screens: string[] }
export interface ScopeRead {
  scope: "global" | RulingScope | null;
  /** Reason -> how many values were left out, in the order they were met. */
  skipped: Map<string, number>;
}

const LISTS = ["apps", "features", "screens"] as const;
const typeName = (v: unknown): string => (v === null ? "null" : typeof v);

export function parseScope(raw: unknown): ScopeRead {
  const skipped = new Map<string, number>();
  const skip = (why: string): void => { skipped.set(why, (skipped.get(why) ?? 0) + 1); };
  if (raw === "global") return { scope: "global", skipped };
  if (raw === undefined) { skip("ruling with no scope"); return { scope: null, skipped }; }
  if (typeof raw === "string") { skip("string other than 'global'"); return { scope: null, skipped }; }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) { skip(`scope given as ${Array.isArray(raw) ? "a list" : `a ${typeName(raw)}`}, not 'global' or an object`); return { scope: null, skipped }; }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj).sort()) if (!(LISTS as readonly string[]).includes(key)) skip(`key the kernel does not read: ${key}`);
  const scope: RulingScope = { apps: [], features: [], screens: [] };
  for (const key of LISTS) {
    const value = obj[key];
    if (value === undefined) continue;
    if (!Array.isArray(value)) { skip(`list given as a ${typeName(value)}`); continue; }
    for (const item of value) {
      if (typeof item === "string" && item !== "") scope[key].push(item); else skip("non-string or empty value in a list");
    }
  }
  return { scope, skipped };
}

/** "2 scope value(s) not understood and counted: 1 string other than 'global', 1 list given as a string", or "" when none. */
export function skippedText(total: ReadonlyMap<string, number>): string {
  const count = [...total.values()].reduce((a, b) => a + b, 0);
  return count === 0 ? "" : `${count} scope value(s) not understood and counted: ${[...total].map(([why, n]) => `${n} ${why}`).join(", ")}`;
}
