/**
 * Dual-dialect detection and section specifications for DESIGN.md.
 *
 * Supports the Google Labs `alpha` dialect (8 sections, nested tokens) and
 * the Stitch v1.0 `stitch` dialect (6 numbered/unnumbered sections or 7-section
 * classic `examples/DESIGN.md` layout, flat Material 3 roles).
 */
import type { DesignMdDocument, YamlNode } from "./designmd-parser.js";

export type DesignMdDialect = "alpha" | "stitch";

export interface SectionSpecEntry {
  canonical: string;
  synonyms: string[];
}

export const ALPHA_SECTIONS: readonly SectionSpecEntry[] = [
  { canonical: "Overview",          synonyms: ["Overview", "Brand & Style"] },
  { canonical: "Colors",            synonyms: ["Colors"] },
  { canonical: "Typography",        synonyms: ["Typography"] },
  { canonical: "Layout",            synonyms: ["Layout", "Layout & Spacing"] },
  { canonical: "Elevation & Depth", synonyms: ["Elevation & Depth", "Elevation"] },
  { canonical: "Shapes",            synonyms: ["Shapes"] },
  { canonical: "Components",        synonyms: ["Components"] },
  { canonical: "Do's and Don'ts",   synonyms: ["Do's and Don'ts"] },
];

export const STITCH_V1_SECTIONS: readonly SectionSpecEntry[] = [
  { canonical: "Visual Theme & Atmosphere",             synonyms: ["Visual Theme & Atmosphere", "Overview", "Brand & Style"] },
  { canonical: "Color Palette & Roles",                 synonyms: ["Color Palette & Roles", "Colors"] },
  { canonical: "Typography Rules",                      synonyms: ["Typography Rules", "Typography"] },
  { canonical: "Component Stylings",                    synonyms: ["Component Stylings", "Components"] },
  { canonical: "Layout Principles",                     synonyms: ["Layout Principles", "Layout", "Layout & Spacing"] },
  { canonical: "Design System Notes for Stitch Generation", synonyms: ["Design System Notes for Stitch Generation", "Design System Notes", "Do's and Don'ts"] },
];

export const STITCH_CLASSIC_SECTIONS: readonly SectionSpecEntry[] = [
  { canonical: "Brand & Style",    synonyms: ["Brand & Style", "Overview"] },
  { canonical: "Colors",           synonyms: ["Colors", "Color Palette & Roles"] },
  { canonical: "Typography",       synonyms: ["Typography", "Typography Rules"] },
  { canonical: "Layout & Spacing", synonyms: ["Layout & Spacing", "Layout", "Layout Principles"] },
  { canonical: "Elevation & Depth", synonyms: ["Elevation & Depth", "Elevation"] },
  { canonical: "Shapes",           synonyms: ["Shapes"] },
  { canonical: "Components",       synonyms: ["Components", "Component Stylings"] },
];

const STITCH_ONLY_HEADINGS = new Set<string>([
  "Visual Theme & Atmosphere",
  "Color Palette & Roles",
  "Typography Rules",
  "Component Stylings",
  "Layout Principles",
  "Design System Notes for Stitch Generation",
  "Design System Notes",
]);

/** Strip optional Stitch section numbering (`## 1. Visual Theme...`) when in stitch dialect. */
export function normalizeSectionHeading(heading: string, dialect: DesignMdDialect): string {
  const trimmed = heading.trim();
  if (dialect === "alpha") return trimmed;
  return trimmed.replace(/^\d+\.\s+/, "").trim();
}

function isObjectNode(node: YamlNode | string | undefined): node is YamlNode {
  return node !== undefined && typeof node !== "string";
}

function hasFlatColorLeaf(colorsNode: YamlNode | string | undefined): boolean {
  if (!isObjectNode(colorsNode)) return false;
  for (const key of Object.keys(colorsNode)) {
    if (typeof colorsNode[key] === "string") return true;
  }
  return false;
}

function hasFlatTypographySlot(typoNode: YamlNode | string | undefined): boolean {
  if (!isObjectNode(typoNode)) return false;
  for (const key of Object.keys(typoNode)) {
    const child = typoNode[key];
    if (isObjectNode(child) && typeof child["fontSize"] === "string") {
      return true;
    }
  }
  return false;
}

/**
 * Determine whether a parsed DESIGN.md follows the `alpha` or `stitch` dialect.
 * Explicit `version` takes precedence, then `.stitch/DESIGN.md` path, then
 * Stitch-exclusive headings, then flat M3 token shapes.
 */
export function detectDesignMdDialect(doc: DesignMdDocument, filePath?: string): DesignMdDialect {
  const version = doc.yamlTree["version"];
  if (version === "alpha") return "alpha";
  if (version === "stitch" || version === "1.0") return "stitch";

  if (filePath !== undefined) {
    const normPath = filePath.replace(/\\/g, "/");
    if (normPath.endsWith("/.stitch/DESIGN.md") || normPath === ".stitch/DESIGN.md") {
      return "stitch";
    }
  }

  for (const rawHeading of doc.sectionHeadings) {
    const stripped = rawHeading.trim().replace(/^\d+\.\s+/, "").trim();
    if (STITCH_ONLY_HEADINGS.has(stripped)) {
      return "stitch";
    }
  }

  const hasDosAndDonts = doc.sectionHeadings.some(
    h => h.trim().replace(/^\d+\.\s+/, "").trim() === "Do's and Don'ts",
  );
  if (
    !hasDosAndDonts &&
    (hasFlatColorLeaf(doc.yamlTree["colors"]) || hasFlatTypographySlot(doc.yamlTree["typography"]))
  ) {
    return "stitch";
  }

  return "alpha";
}

/**
 * Choose between the 6-section Stitch v1.0 layout and the 7-section
 * Google Labs classic `examples/DESIGN.md` layout (without `Do's and Don'ts`).
 */
export function selectStitchSectionSpec(headings: readonly string[]): readonly SectionSpecEntry[] {
  const normalized = headings.map(h => normalizeSectionHeading(h, "stitch"));
  const hasStitch6Exclusive = normalized.some(h => STITCH_ONLY_HEADINGS.has(h));
  if (hasStitch6Exclusive) return STITCH_V1_SECTIONS;

  const hasClassicSections = normalized.some(
    h => h === "Elevation & Depth" || h === "Elevation" || h === "Shapes",
  );
  if (hasClassicSections) return STITCH_CLASSIC_SECTIONS;

  return STITCH_V1_SECTIONS;
}
