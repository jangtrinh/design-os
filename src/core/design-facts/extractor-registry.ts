/**
 * The roster of extractors and what each one can honestly supply.
 *
 * An extractor declares, per fact kind, the STRONGEST confidence it can reach.
 * That declaration is the input to rule-requirements.ts, which decides whether
 * a rule can run at all against a given source language. A kind absent from the
 * map is a kind this extractor cannot see — and a rule needing it is reported
 * NOT-EVALUATED, never silently passed.
 *
 * PAIRED with its test: tests/design-facts-contract.test.ts asserts every
 * registered id is unique and every declared kind is a real FactKind, and that
 * a supplier of nothing makes every rule not-evaluated.
 */
import type { FactKind, Confidence } from "./fact-model.js";
import type { SupplyMap } from "./fact-collector.js";

export interface ExtractorProfile {
  id: string;
  /** File extensions this extractor claims, lower-case, with the dot. */
  extensions: readonly string[];
  /** Human label for the tier, printed next to findings. */
  tier: string;
  /**
   * True when this extractor's output is an acknowledged undercount — the
   * line-scanner tier. Printed as UNDERCOUNT so a low count never reads as a
   * clean bill of health.
   */
  undercount: boolean;
  supplies: SupplyMap;
}

/**
 * v1 roster. Extractors land in later phases; the registry ships now because
 * the requirement contract (and its probes) needs something to resolve against.
 * Entries whose module does not exist yet are declared but unreachable — the
 * target resolver only routes to ids whose extractor is registered at runtime.
 */
export const EXTRACTOR_PROFILES: readonly ExtractorProfile[] = [
  {
    id: "html-cascade",
    extensions: [".html", ".htm"],
    tier: "resolved cascade",
    undercount: false,
    supplies: {
      color: "resolved", gradient: "resolved", typography: "resolved",
      spacing: "resolved", radius: "resolved", border: "resolved",
      shadow: "resolved", motion: "resolved", text: "resolved",
      structure: "resolved",
    },
  },
  {
    id: "css-only",
    extensions: [".css", ".scss"],
    tier: "declarations only (no DOM)",
    undercount: true,
    supplies: {
      // A bare stylesheet states values but not which elements receive them, so
      // there is no structure and no text — and every rule needing those is
      // NOT-EVALUATED rather than guessed at from selector names.
      color: "resolved", gradient: "resolved", typography: "resolved",
      spacing: "resolved", radius: "resolved", border: "resolved",
      shadow: "resolved", motion: "resolved",
    },
  },
  {
    id: "jsx-tailwind",
    extensions: [".jsx", ".tsx"],
    tier: "line-scanner + Tailwind resolver",
    undercount: true,
    supplies: {
      color: "literal", gradient: "literal", typography: "literal",
      spacing: "literal", radius: "literal", border: "literal",
      shadow: "literal", motion: "literal", text: "literal",
      structure: "heuristic",
    },
  },
  {
    id: "sfc",
    extensions: [".vue", ".svelte", ".astro"],
    tier: "SFC split (style block resolved, template scanned)",
    undercount: true,
    supplies: {
      color: "resolved", gradient: "resolved", typography: "resolved",
      spacing: "resolved", radius: "resolved", border: "resolved",
      shadow: "resolved", motion: "resolved", text: "literal",
      structure: "heuristic",
    },
  },
  {
    id: "swiftui",
    extensions: [".swift"],
    tier: "line-scanner",
    undercount: true,
    supplies: {
      color: "literal", gradient: "literal", typography: "literal",
      spacing: "literal", radius: "literal", border: "literal",
      shadow: "literal", motion: "literal", text: "literal",
    },
  },
  {
    id: "flutter",
    extensions: [".dart"],
    tier: "line-scanner",
    undercount: true,
    supplies: {
      color: "literal", gradient: "literal", typography: "literal",
      spacing: "literal", radius: "literal", border: "literal",
      shadow: "literal", motion: "literal", text: "literal",
    },
  },
  {
    id: "figma-nodes",
    extensions: [".json"],
    tier: "Figma node export",
    undercount: false,
    supplies: {
      color: "resolved", spacing: "resolved", radius: "resolved",
      text: "resolved", structure: "resolved",
    },
  },
  {
    id: "rendered-cdp",
    extensions: [],
    tier: "rendered capture",
    undercount: false,
    supplies: {
      color: "rendered", gradient: "rendered", typography: "rendered",
      spacing: "rendered", radius: "rendered", border: "rendered",
      shadow: "rendered", motion: "rendered", text: "rendered",
      structure: "rendered",
    },
  },
] as const;

const BY_ID = new Map(EXTRACTOR_PROFILES.map((p) => [p.id, p]));

export function extractorById(id: string): ExtractorProfile | undefined {
  return BY_ID.get(id);
}

/** The extractor claiming this extension, or undefined when none does. */
export function extractorForExtension(ext: string): ExtractorProfile | undefined {
  const lower = ext.toLowerCase();
  return EXTRACTOR_PROFILES.find((p) => p.extensions.includes(lower));
}

/** Confidence this extractor reaches for a kind, or undefined if it cannot see it. */
export function supplyOf(profile: ExtractorProfile, kind: FactKind): Confidence | undefined {
  return profile.supplies[kind];
}
