/**
 * Name resolution for the reuse-plan checker: exact registry membership, the normalised
 * form used to spot a "new" component that is really a registered one, and a bounded
 * did-you-mean. Names only — a registry may be Figma-road (hundreds of components, no
 * markup), so nothing here ever looks at a component body.
 */
import { levenshtein } from "./flag-guard.js";

const SUGGESTION_LIMIT = 3;

/** Same folding the kit registry uses for its collision check: NFKC, collapsed spaces, lowercase. */
export function normaliseName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export interface NameIndex {
  /** Exact, case-sensitive membership — the only thing `ui registry lookup` accepts. */
  has(name: string): boolean;
  /** The registered name that equals `name` after normalisation, if any. */
  normalisedMatch(name: string): string | undefined;
  /** Up to three registered names closest to `name`, nearest first, ties by name. */
  suggest(name: string): string[];
  /** True when the registry declares any `Pattern/*` template. */
  hasPatternNamespace: boolean;
  size: number;
}

export function buildNameIndex(names: readonly string[]): NameIndex {
  const sorted = [...new Set(names)].sort();
  const exact = new Set(sorted);
  const byNormal = new Map<string, string>();
  for (const n of sorted) if (!byNormal.has(normaliseName(n))) byNormal.set(normaliseName(n), n);
  return {
    has: (name) => exact.has(name),
    normalisedMatch: (name) => byNormal.get(normaliseName(name)),
    suggest(name) {
      const target = normaliseName(name);
      if (target.length === 0) return [];
      const limit = Math.max(3, Math.floor(target.length / 6));
      return sorted
        .map((candidate) => ({ candidate, d: levenshtein(target, normaliseName(candidate)) }))
        .filter((x) => x.d <= limit)
        .sort((a, b) => a.d - b.d || (a.candidate < b.candidate ? -1 : 1))
        .slice(0, SUGGESTION_LIMIT)
        .map((x) => x.candidate);
    },
    hasPatternNamespace: sorted.some((n) => n.startsWith("Pattern/")),
    size: sorted.length,
  };
}

/** Drop one pair of surrounding backticks and trim: `Name` → Name. */
export function stripTicks(raw: string): string {
  const t = raw.trim();
  return t.length >= 2 && t.startsWith("`") && t.endsWith("`") ? t.slice(1, -1).trim() : t;
}

/** `Name (Axis=Value, Axis=Value)` → { name, variant }; null when there is no `(…=…)` tail. */
export function splitVariantUse(use: string): { name: string; variant: string } | null {
  const m = /^(.*?)\s*\(([^()]*=[^()]*)\)\s*$/.exec(use.trim());
  if (m === null) return null;
  const name = stripTicks(m[1] ?? "");
  return name.length === 0 ? null : { name, variant: (m[2] ?? "").trim() };
}

/** `A + B + C` → ["A", "B", "C"] (ticks stripped, empty members kept so the caller can flag them). */
export function splitComposition(use: string): string[] {
  return use.split("+").map(stripTicks);
}

/** `a.b, c.d` → ["a.b", "c.d"], empties dropped. */
export function splitTokenPaths(use: string): string[] {
  return use.split(",").map(stripTicks).filter((p) => p.length > 0);
}

/** `did you mean 'A', 'B'?` or "" when there is nothing close. */
export function didYouMean(suggestions: readonly string[]): string {
  return suggestions.length === 0 ? "" : ` — did you mean ${suggestions.map((s) => `'${s}'`).join(", ")}?`;
}
