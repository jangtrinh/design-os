/**
 * Name resolution for the reuse-plan checker: exact registry membership, the folded form
 * used to spot a "new" component that is really a registered one, pattern files, and a
 * bounded did-you-mean. Names only — a registry may be Figma-road (hundreds of components,
 * no markup), so nothing here ever looks at a component body.
 *
 * Folding and the near-identical test are the design-system guidelines' own
 * (`ds-guidelines-components.ts`), so "confusable" means one thing across the CLI.
 */
import { levenshtein } from "./flag-guard.js";
import { NEAR_IDENTICAL_REASON, confusableReason, normalise as foldName } from "./ds-guidelines-components.js";

const SUGGESTION_LIMIT = 3;

export interface RegistryNameEntry { name: string; variants: readonly string[] }

export type PatternSource = "design/patterns" | "registry";

export interface NameIndex {
  /** Exact, case-sensitive membership — the only thing `ui registry lookup` accepts. */
  has(name: string): boolean;
  /** The registered name that equals `name` once separators and case are folded, if any. */
  foldedMatch(name: string): string | undefined;
  /** Registered names a couple of edits away from `name` after folding (never the name itself). */
  nearIdentical(name: string): string[];
  /** Up to three registered names or pattern files closest to `name`, nearest first, ties by name. */
  suggest(name: string, among?: "all" | "templates"): string[];
  /** Union of the variant strings declared by the records named `name`; empty when none declare any. */
  variantsOf(name: string): string[];
  /** Pattern-file stems from `design/patterns/*.md`. */
  patternFiles: ReadonlySet<string>;
  /** Registered `Pattern/*` names. */
  registryPatterns: readonly string[];
  /** True when the project declares any template: a `Pattern/*` name or a pattern file. */
  hasTemplates: boolean;
  /** Where `name` counts as a template, or null when it is not one. */
  templateSource(name: string): PatternSource | null;
  size: number;
}

/** Same folding the kit registry uses for display comparison: NFKC, collapsed spaces, lowercase. */
export function normaliseName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildNameIndex(entries: readonly RegistryNameEntry[], patternFileStems: readonly string[] = []): NameIndex {
  const sorted = [...new Set(entries.map((e) => e.name))].sort();
  const exact = new Set(sorted);
  const variants = new Map<string, Set<string>>();
  for (const e of entries) {
    const set = variants.get(e.name) ?? new Set<string>();
    for (const v of e.variants) set.add(v);
    variants.set(e.name, set);
  }
  const folded = new Map<string, string>();
  const foldKey = (name: string): string => foldName(name.normalize("NFKC"));
  for (const n of sorted) if (!folded.has(foldKey(n))) folded.set(foldKey(n), n);
  const files = new Set([...patternFileStems].sort());
  const registryPatterns = sorted.filter((n) => n.startsWith("Pattern/"));

  const rank = (target: string, pool: readonly string[]): string[] => {
    const limit = Math.max(3, Math.floor(target.length / 6));
    return pool
      .map((candidate) => ({ candidate, d: levenshtein(target, normaliseName(candidate)) }))
      .filter((x) => x.d <= limit)
      .sort((a, b) => a.d - b.d || (a.candidate < b.candidate ? -1 : 1))
      .slice(0, SUGGESTION_LIMIT)
      .map((x) => x.candidate);
  };
  return {
    has: (name) => exact.has(name),
    foldedMatch: (name) => folded.get(foldKey(name)),
    nearIdentical: (name) => sorted.filter((c) => c !== name && foldName(c) !== foldName(name) && confusableReason(name, c) === NEAR_IDENTICAL_REASON),
    suggest(name, among = "all") {
      const target = normaliseName(name);
      if (target.length === 0) return [];
      const templates = [...files, ...registryPatterns];
      return rank(target, among === "templates" ? templates : [...new Set([...files, ...sorted])].sort());
    },
    variantsOf: (name) => [...(variants.get(name) ?? [])].sort(),
    patternFiles: files,
    registryPatterns,
    hasTemplates: files.size > 0 || registryPatterns.length > 0,
    templateSource: (name) => (files.has(name) ? "design/patterns" : registryPatterns.includes(name) ? "registry" : null),
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

/** `Axis=Value, Axis=Value` → ["Axis=Value", …]. */
export function splitVariantPairs(variant: string): string[] {
  return variant.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
}

/** `did you mean 'A', 'B'?` or "" when there is nothing close. */
export function didYouMean(suggestions: readonly string[]): string {
  return suggestions.length === 0 ? "" : ` — did you mean ${suggestions.map((s) => `'${s}'`).join(", ")}?`;
}
