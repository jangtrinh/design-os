#!/usr/bin/env node
/**
 * Hold every example artifact to one palette.
 *
 * The corpus was authored in batches and drifted into three different skins — two warm
 * ones a shade apart, and a third that used a blue accent and defined `--color-*`
 * outright instead of consuming it. A gallery of 28 artifacts only reads as one system if
 * they share a ground, so this normalises the base palette across all of them.
 *
 * It rewrites values only. Grammar-specific roles (`--diagram-band`, `--diagram-hub`,
 * `--diagram-level-*`, chart series fills) are all derived from these base tokens through
 * `color-mix`, so correcting the base propagates without touching per-grammar craft.
 *
 * The `var(--color-x, <fallback>)` shape is preserved deliberately: a project design
 * system still wins when one is compiled in, and the fallback only applies standalone —
 * which is the contract `diagram-craft.md` states.
 *
 *   node scripts/normalize-example-theme.mjs          # rewrite
 *   node scripts/normalize-example-theme.mjs --check  # exit 1 if any artifact has drifted
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = [join(ROOT, "examples", "diagrams"), join(ROOT, "examples", "charts")];

/**
 * The canonical skin: a warm achromatic ramp with the DESIGN:OS orange as the single
 * accent, matching the mark and the published gallery. Series hues are reserved for
 * charts and stay clear of the accent so a focal series still reads as focal.
 */
const LIGHT = {
  "background": "#fbfaf8",
  "card": "#ffffff",
  "foreground": "#1a1a17",
  "muted-foreground": "#6f6f66",
  "border": "#e6e3dd",
  "input": "#d6d2c9",
  "accent": "#b4531f",
  "primary": "#2f5d73",
  "chart-1": "oklch(0.58 0.09 250)",
  "chart-2": "oklch(0.62 0.08 195)",
  "chart-3": "oklch(0.60 0.09 150)",
  "chart-4": "oklch(0.66 0.09 95)",
  "chart-5": "oklch(0.55 0.09 300)",
};

const DARK = {
  "background": "#14140f",
  "card": "#1c1c17",
  "foreground": "#f2efe9",
  "muted-foreground": "#a3a096",
  "border": "#2e2e26",
  "input": "#3d3d33",
  "accent": "#e08c4a",
  "primary": "#7fb4cc",
  "chart-1": "oklch(0.70 0.10 250)",
  "chart-2": "oklch(0.74 0.09 195)",
  "chart-3": "oklch(0.72 0.10 150)",
  "chart-4": "oklch(0.78 0.10 95)",
  "chart-5": "oklch(0.68 0.10 300)",
};

const NAMES = Object.keys(LIGHT).join("|");

/**
 * Split the stylesheet into light and dark regions so the same token name can take a
 * different value in each. Everything from the first dark selector onward is dark; the
 * two dark blocks are contiguous in every artifact, which the structure check confirms.
 */
function splitAtDark(source) {
  const match = /:root\[data-theme="dark"\]/.exec(source);
  if (match === null) return [source, ""];
  return [source.slice(0, match.index), source.slice(match.index)];
}

/**
 * Rewrite `var(--color-x, <fallback>)` fallbacks, scanning to the *balanced* close paren.
 *
 * A `[^)]*?\)` pattern looks right and is wrong: chart series fall back to `oklch(...)`,
 * so it stops at the inner paren and leaves a stray one behind. That is why this walks
 * the nesting depth instead.
 */
function replaceVarFallbacks(region, palette) {
  const opener = new RegExp(`var\\(\\s*--color-(${NAMES})\\s*,`, "g");
  let out = "";
  let cursor = 0;
  let match;

  while ((match = opener.exec(region)) !== null) {
    const name = match[1];
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < region.length && depth > 0) {
      if (region[i] === "(") depth += 1;
      else if (region[i] === ")") depth -= 1;
      i += 1;
    }
    if (depth !== 0) break; // unbalanced source; leave the rest untouched
    out += region.slice(cursor, match.index) + `var(--color-${name}, ${palette[name]})`;
    cursor = i;
    opener.lastIndex = i;
  }
  return out + region.slice(cursor);
}

function applyPalette(region, palette) {
  return replaceVarFallbacks(region, palette)
    // Direct declarations: --color-x: <value>;  (the batch that defined tokens outright)
    .replace(
      new RegExp(`(--color-(${NAMES})\\s*:\\s*)[^;]+;`, "g"),
      (_m, prefix, name) => `${prefix}${palette[name]};`,
    );
}

function normalize(source) {
  const [light, dark] = splitAtDark(source);
  return applyPalette(light, LIGHT) + applyPalette(dark, DARK);
}

const files = DIRS.flatMap((dir) =>
  (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith(".html")).map((f) => join(dir, f)),
);

const check = process.argv.includes("--check");
const drifted = [];
let changed = 0;

for (const file of files) {
  const before = readFileSync(file, "utf8");
  const after = normalize(before);
  if (before === after) continue;
  if (check) drifted.push(file.replace(`${ROOT}/`, ""));
  else {
    writeFileSync(file, after);
    changed += 1;
  }
}

if (check) {
  if (drifted.length > 0) {
    console.error(`${drifted.length} artifact(s) off the canonical palette — run 'node scripts/normalize-example-theme.mjs'`);
    for (const f of drifted.slice(0, 5)) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`example theme: ${files.length} artifacts on the canonical palette`);
} else {
  console.log(`example theme: normalised ${changed} of ${files.length} artifacts`);
}
