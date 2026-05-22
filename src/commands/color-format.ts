/**
 * Text rendering helpers for `ui color` subcommand output.
 *
 * Pure string transforms — no I/O, no color math. Kept separate from
 * color.ts to respect the ~200-line file guideline.
 */
import { STOPS } from "../core/color-scale.js";
import type { ColorScale, ContrastLevel } from "../core/color-scale.js";
import type { OKLCH } from "../core/color-convert.js";
import type { SemanticPalette } from "../core/color-roles.js";

// ─── convert ─────────────────────────────────────────────────────────────────

export function formatConvert(hex: string, oklch: OKLCH): string {
  const l = oklch.l.toFixed(2);
  const c = oklch.c.toFixed(2);
  const h = oklch.h.toFixed(1);
  return `${hex}  →  oklch(${l} ${c} ${h})\n`;
}

// ─── scale ───────────────────────────────────────────────────────────────────

const WCAG_LABEL: Record<ContrastLevel, string> = {
  AAA: "AAA      ",
  AA: "AA       ",
  "AA-large": "AA-large ",
  fail: "fail     ",
};

export function formatScale(scale: ColorScale): string {
  const lines: string[] = [
    `Color scale for ${scale.baseHex}`,
    `${"stop".padEnd(6)} ${"hex".padEnd(10)} ${"contrast".padEnd(10)} wcag`,
    "─".repeat(38),
  ];
  for (const stop of STOPS) {
    const key = String(stop);
    const hex = scale.shades[key] ?? "?";
    const ratio = scale.contrast[key] ?? 0;
    const level = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA-large" : "fail";
    const anchor = stop === scale.anchorStop ? " ◀ anchor" : "";
    lines.push(
      `${String(stop).padEnd(6)} ${hex.padEnd(10)} ${ratio.toFixed(2).padEnd(10)} ${WCAG_LABEL[level]}${anchor}`,
    );
  }
  return lines.join("\n") + "\n";
}

// ─── contrast ────────────────────────────────────────────────────────────────

export function formatContrast(
  fg: string,
  bg: string,
  ratio: number,
  level: ContrastLevel,
): string {
  return `${fg} on ${bg} → ${ratio.toFixed(2)}:1  (${level})\n`;
}

// ─── semantic ────────────────────────────────────────────────────────────────

export function formatSemantic(palette: SemanticPalette): string {
  const lines: string[] = [];
  for (const entry of palette.entries) {
    lines.push(`\n[${entry.role}]  ${entry.baseName}  ${entry.baseHex}`);
    lines.push(`${"stop".padEnd(6)} ${"hex".padEnd(10)} contrast`);
    lines.push("─".repeat(28));
    for (const stop of STOPS) {
      const key = String(stop);
      const hex = entry.scale.shades[key] ?? "?";
      const ratio = entry.scale.contrast[key] ?? 0;
      lines.push(`${String(stop).padEnd(6)} ${hex.padEnd(10)} ${ratio.toFixed(2)}`);
    }
  }
  return lines.join("\n") + "\n";
}
