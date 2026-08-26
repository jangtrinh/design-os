/**
 * WCAG contrast, computed from resolved facts.
 *
 * design:os has had contrast math since the DS token work — `contrastRatio` and
 * `relativeLuminance` live in `color-scale.ts` and `ds-a11y` checks declared
 * TOKEN PAIRS with them. What it has never had is contrast on a rendered
 * surface: `ui a11y-lint` printed "0 static findings … rendered criteria need a
 * browser" and left it there.
 *
 * With a resolved cascade that excuse is gone. The value a text node is painted
 * on is computable without a browser — upstream proved it on the same fixture,
 * reporting 2.2:1 for #9ca3af on #7c3aed from static analysis alone.
 *
 * Two refusals keep it honest:
 *  - `resolved` confidence is REQUIRED. A ratio computed from literals no
 *    cascade ever resolved is a number that means nothing, so on a line-scanner
 *    tier this check is NOT-EVALUATED rather than wrong.
 *  - A background that is a gradient, an image, or an unresolvable var is NOT
 *    COMPUTABLE. The check self-silences and the document is reported partially
 *    evaluated — never passed.
 */
import { contrastRatio } from "./color-scale.js";
import { AA_NORMAL } from "./ds-a11y.js";
import type { DesignFact } from "./design-facts/index.js";
import { atLeast } from "./design-facts/index.js";
import type { FloorFindingBase } from "./finding-schema.js";

/** AA for large text: >= 24px, or >= 18.66px when bold. */
export const AA_LARGE = 3;

/**
 * A type alias, not an `interface extends`: FloorFindingBase intersects a
 * DISCRIMINATED UNION (RepairTarget), and an interface cannot extend one — the
 * members silently vanish and every field read fails to compile. Every other
 * family declares its finding the same way.
 */
export type ContrastFinding = FloorFindingBase & {
  /** WCAG success criterion. */
  sc: "1.4.3";
  ratio: number;
  required: number;
};

export interface ContrastResult {
  findings: ContrastFinding[];
  /** Text nodes whose background could not be resolved — a partial evaluation. */
  notComputable: Array<{ nodeRef?: string; line: number; reason: string }>;
}

/** WCAG's large-text threshold, from the COMPUTED size and weight. */
function isLargeText(sizePx: number | undefined, weight: number | undefined): boolean {
  if (sizePx === undefined) return false;
  if (sizePx >= 24) return true;
  return sizePx >= 18.66 && (weight ?? 400) >= 700;
}

/**
 * Walk up the structure chain for the nearest painted background.
 *
 * A text node rarely carries its own background; it inherits the one an ancestor
 * paints. Pairing only same-element colours would silence the check on almost
 * every real document.
 */
function nearestBackground(
  startRef: string | undefined,
  parentOf: Map<string, string>,
  bgByRef: Map<string, { hex: string; alpha?: number }>,
  fallback: { hex: string; alpha?: number } | undefined,
): { hex: string; alpha?: number } | undefined {
  let ref = startRef;
  const seen = new Set<string>();
  while (ref !== undefined && !seen.has(ref)) {
    seen.add(ref);
    const bg = bgByRef.get(ref);
    // A translucent paint does not establish the background on its own: what is
    // behind it still shows through, and guessing the blend would be a made-up
    // colour. Keep walking.
    if (bg !== undefined && (bg.alpha ?? 1) >= 0.95) return bg;
    ref = parentOf.get(ref);
  }
  return fallback;
}

/**
 * Compute contrast for every text-bearing node the facts describe.
 *
 * `resolvedConfidence` is the extractor's confidence for colour; anything weaker
 * than `resolved` returns no findings and no partial report, because the caller
 * will already have reported the rule NOT-EVALUATED.
 */
export function checkComputedContrast(
  facts: readonly DesignFact[],
  colorConfidence: "rendered" | "resolved" | "literal" | "heuristic" | undefined,
): ContrastResult {
  if (colorConfidence === undefined || !atLeast(colorConfidence, "resolved")) {
    return { findings: [], notComputable: [] };
  }

  const parentOf = new Map<string, string>();
  const bgByRef = new Map<string, { hex: string; alpha?: number }>();
  let documentBg: { hex: string; alpha?: number } | undefined;

  for (const f of facts) {
    if (f.kind === "structure") {
      if (f.parentRef !== undefined) parentOf.set(f.ref, f.parentRef);
      continue;
    }
    if (f.kind === "color" && f.role === "bg") {
      const ref = f.at.nodeRef;
      if (ref !== undefined) bgByRef.set(ref, { hex: f.hex, alpha: f.alpha });
      // The outermost opaque background stands in when no ancestor paints one.
      if ((f.alpha ?? 1) >= 0.95 && documentBg === undefined) documentBg = { hex: f.hex, alpha: f.alpha };
    }
  }

  // Lines carrying a gradient background: a ratio against a gradient is not one
  // number, so any text over one is reported not-computable rather than judged.
  const gradientLines = new Set(facts.filter((f) => f.kind === "gradient").map((f) => f.at.line));

  const typography = facts.filter((f): f is Extract<DesignFact, { kind: "typography" }> => f.kind === "typography");
  const findings: ContrastFinding[] = [];
  const notComputable: ContrastResult["notComputable"] = [];

  for (const f of facts) {
    if (f.kind !== "color" || f.role !== "fg") continue;
    if ((f.alpha ?? 1) < 0.95) continue; // translucent text: the blend is not knowable here

    const ref = f.at.nodeRef;
    if (ref !== undefined && gradientLines.has(f.at.line)) {
      notComputable.push({ nodeRef: ref, line: f.at.line, reason: "background is a gradient" });
      continue;
    }

    const bg = nearestBackground(ref, parentOf, bgByRef, documentBg);
    if (bg === undefined) {
      notComputable.push({ nodeRef: ref, line: f.at.line, reason: "no opaque background resolved" });
      continue;
    }

    const type = typography.find((t) => t.at.nodeRef === ref) ?? typography.find((t) => t.at.line === f.at.line);
    const required = isLargeText(type?.sizePx, type?.weight) ? AA_LARGE : AA_NORMAL;
    const ratio = Math.round(contrastRatio(`#${f.hex}`, `#${bg.hex}`) * 100) / 100;
    if (ratio >= required) continue;

    // Built as two shapes, not one spread: RepairTarget's union REQUIRES a
    // nodeRef alongside a "nodes" scope, and a conditional spread erases that
    // guarantee — the same construction the tell rules use.
    const base = {
      checkId: "low-contrast",
      severity: "error" as const,
      sc: "1.4.3" as const,
      ratio,
      required,
      message: `text #${f.hex} on #${bg.hex} is ${ratio}:1, below the ${required}:1 WCAG AA floor`,
      line: f.at.line,
      expected: `>= ${required}:1`,
      actual: `${ratio}:1`,
      fixHint: "darken the text toward the background hue, or lighten the surface",
    };
    findings.push(ref !== undefined ? { ...base, repairScope: "nodes", nodeRef: ref } : base);
  }

  // Collapsing repeated findings is NOT done here. One declared pair can paint
  // hundreds of elements, but so can any rule — a real page produced 210
  // identical contrast lines and 54 identical padding ones. That is one blind
  // spot with two symptoms, so it is fixed once in lintTell rather than in each
  // family that happens to notice it.
  findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.message.localeCompare(b.message));
  notComputable.sort((a, b) => a.line - b.line);
  return { findings, notComputable };
}
