/**
 * Consistency-axis check for the deterministic taste linter. Split from
 * taste-checks.ts (which re-exports it) to keep the per-axis modules under
 * the 200-line guideline.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions, lineOf } from "./taste-checks-shared.js";

// ─── Consistency: no raw hex when a token exists (rubric lines 139–144) ─────────

/**
 * raw-hex-when-token-exists: a Tailwind arbitrary-hex utility (bg-[#…],
 * text-[#…], border-[#…]) OR an inline `color:`/`background:` hex literal, when
 * the project's design tokens are supplied via `knownHexes`. Rubric Consistency
 * axis: "every color … resolves to a DS token. Raw #3b82f6 … when the project
 * already defines color-primary [is] a violation. Tailwind arbitrary-value
 * utilities count as raw literals when an equivalent token exists."
 *
 * Requires the caller to pass the set of token hex values (lower-cased, no
 * alpha) — without it the check is skipped (no DS context → nothing to enforce
 * against, matching the rubric's "only applies when the project has a system").
 * A hex that equals a token value is NOT flagged (the model used the right
 * color, just spelled it as a literal — that's a separate, softer concern the
 * model handles); a hex NOT among the tokens is the violation (an invented
 * color that ignores the palette).
 */
export function checkRawHexWhenTokenExists(
  html: string,
  knownHexes: Set<string> | undefined,
): TasteFinding[] {
  if (knownHexes === undefined || knownHexes.size === 0) return [];
  const findings: TasteFinding[] = [];

  const norm = (hex: string): string => {
    let h = hex.toLowerCase().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join(""); // #abc → #aabbcc
    return `#${h}`;
  };

  // Tailwind arbitrary-hex color utilities.
  const twRe = /\b(?:bg|text|border|ring|fill|stroke|from|via|to|shadow|outline|decoration|divide|accent|caret)-\[(#[0-9a-fA-F]{3,8})\]/g;
  let m: RegExpExecArray | null;
  while ((m = twRe.exec(html)) !== null) {
    const hex = norm((m[1] ?? "").slice(0, 7)); // drop any 8-digit alpha for compare
    if (!knownHexes.has(hex)) {
      findings.push({
        checkId: "raw-hex-when-token-exists", axis: "Consistency", severity: "error",
        message: `arbitrary color ${m[1]} is not a design-system token (rubric Consistency: every color must resolve to a token) — use the nearest token utility or register the color`,
        line: lineOf(html, m.index),
      });
    }
  }

  // Inline CSS hex literals on color/background.
  const css = cssRegions(html);
  const cssRe = /(?:color|background(?:-color)?)\s*:\s*(#[0-9a-fA-F]{3,8})\b/gi;
  while ((m = cssRe.exec(css)) !== null) {
    const hex = norm((m[1] ?? "").slice(0, 7));
    if (!knownHexes.has(hex)) {
      findings.push({
        checkId: "raw-hex-when-token-exists", axis: "Consistency", severity: "error",
        message: `inline color ${m[1]} is not a design-system token (rubric Consistency: every color must resolve to a token) — use a token-backed utility`,
      });
    }
  }

  return findings;
}
