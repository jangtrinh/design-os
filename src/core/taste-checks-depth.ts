/**
 * Depth/Surface-axis check for the deterministic taste linter — the machine floor
 * under knowledge/taste-rubric.md Axis 6 ("Rules of depth"). Catches the
 * all-nines z-index escalation that betrays an un-designed stacking scale.
 *
 * Split into its own module to keep taste-checks.ts under the 200-line guideline.
 * Pure string/regex — no DOM, no deps.
 */
import type { TasteFinding } from "./taste-lint.js";
import { cssRegions } from "./taste-checks-shared.js";

// ─── Depth/Surface: stacking order is a designed scale, not an arms race ─────────

/** All-nines z-index (≥ 999: 999 / 9999 / 99999 …) or the 32-bit max int. */
const Z_INDEX_INFLATION = /z-index\s*:\s*(9{3,}|2147483647)\b/gi;

/**
 * z-index-inflation: a `z-index` of all-nines (999, 9999, …) or the 32-bit max
 * (2147483647) — the signature of an un-designed stacking scale. A deliberate
 * scale value like `z-index: 1000` (Bootstrap-style) is NOT flagged; only the
 * all-nines / max-int "just make it win" values are. Scoped to CSS regions so the
 * digits never match body copy.
 */
export function checkZIndexInflation(html: string): TasteFinding[] {
  const findings: TasteFinding[] = [];
  const css = cssRegions(html);
  Z_INDEX_INFLATION.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = Z_INDEX_INFLATION.exec(css)) !== null) {
    const val = m[1] ?? "";
    findings.push({
      checkId: "z-index-inflation", axis: "Depth/Surface", severity: "error",
      message: `z-index: ${val} — all-nines stacking escalation (rubric Depth/Surface: "stacking order is a designed scale, not an arms race") — define a small named z-scale (e.g. 1/10/100) and use the next tier`,
    });
  }
  return findings;
}
