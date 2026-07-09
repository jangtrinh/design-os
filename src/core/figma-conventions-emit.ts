/**
 * Convention synthesis → CONVENTIONS.md + memory insights (deterministic).
 *
 * The pure string/insight builder behind `ui synthesize-conventions`. Emits the
 * documented section shape — Layout · Color-token-binding · Spacing(grid) ·
 * Radius(scale) · Typography · Component-grammar · Per-section summary ·
 * Provenance — as measured DO/DON'T with counts. When a DsScale is supplied it
 * splits valid on-scale values from REAL deviations; without it, it reports the
 * observed house style and says so. No filesystem, no clock — byte-stable.
 */
import type { DsScale } from "./figma-conventions-synth.js";

/** Aggregated section rollup (shared with figma-conventions-synth.ts). */
export interface Totals {
  sections: number;
  walkedSections: number;
  screens: number;
  nodesWalked: number;
  autoFrames: number;
  rawFrames: number;
  boundFills: number;
  rawFills: number;
  spacing: Map<number, number>;
  radius: Map<number, number>;
  fonts: Map<string, number>;
  components: Map<string, number>;
  truncated: string[];
  missing: string[];
  perSection: Array<{ name: string; screens: number; nodesWalked: number; truncated: boolean; tokenizedPct: number; autoPct: number }>;
}

/** Running deviation tally, so insights + provenance can quantify house drift. */
export interface Deviations {
  spacing: number; // off-scale spacing instances
  radius: number; // off-scale radius instances
  fonts: number; // stray-font instances
  rawFills: number; // raw/unbound fills (a deviation when a DS exists)
  total: number;
}

function pct(part: number, whole: number): number {
  return Math.round((100 * part) / (whole || 1));
}

/** Numeric histogram → rows sorted by count desc, value asc on ties. */
function sortedNum(m: Map<number, number>): Array<[number, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
}
function sortedStr(m: Map<string, number>): Array<[string, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const DEPRECATED_RE = /deprecat|legacy|do-?not-?use|\bold\b|⚠/i;

// ─── Section builders ─────────────────────────────────────────────────────────

function layoutSection(t: Totals): string[] {
  const p = pct(t.autoFrames, t.autoFrames + t.rawFrames);
  return [
    "## Layout",
    "",
    `- **DO** — auto-layout frames: **${t.autoFrames}** (${p}%). Auto-layout is the house default.`,
    `- **DON'T** — raw / absolute (NONE-layout) frames: **${t.rawFrames}** (${100 - p}%). Prefer auto-layout unless a deliberate overlay.`,
    "",
  ];
}

function colorSection(t: Totals, hasDs: boolean): string[] {
  const p = pct(t.boundFills, t.boundFills + t.rawFills);
  const devNote = hasDs && t.rawFills > 0 ? " — real deviation: bind to a color token" : "";
  return [
    "## Color token binding",
    "",
    `- **DO** — token-bound solid fills: **${t.boundFills}** (${p}%).`,
    `- **DON'T** — raw / unbound solid fills: **${t.rawFills}** (${100 - p}%)${devNote}.`,
    "",
  ];
}

/** Shared DO/DON'T table builder for a numeric scale (spacing / radius). */
function scaleSection(
  title: string,
  unit: string,
  hist: Map<number, number>,
  dsSet: Set<number> | undefined,
): { lines: string[]; deviations: number } {
  const rows = sortedNum(hist);
  if (rows.length === 0) return { lines: [`## ${title}`, "", "_No values observed._", ""], deviations: 0 };
  const hasDs = dsSet !== undefined && dsSet.size > 0;
  const valid = hasDs ? rows.filter(([v]) => dsSet.has(v)) : rows;
  const off = hasDs ? rows.filter(([v]) => !dsSet.has(v)) : [];
  const deviations = off.reduce((s, [, c]) => s + c, 0);

  const doLabel = hasDs ? "DO — on-scale values (match the DS)" : "DO — observed house values (no --ds to validate against)";
  const lines: string[] = [`## ${title}`, ""];
  lines.push(`**${doLabel}:**`, "");
  lines.push("| Value | Uses |", "|---|---|");
  for (const [v, c] of valid) lines.push(`| ${v}${unit} | ${c} |`);
  lines.push("");
  if (hasDs) {
    if (off.length > 0) {
      lines.push("**DON'T — off-scale values (real deviations):**", "");
      lines.push("| Value | Uses |", "|---|---|");
      for (const [v, c] of off) lines.push(`| ${v}${unit} | ${c} |`);
    } else {
      lines.push("**DON'T** — none: every observed value is on the DS scale.");
    }
    lines.push("");
  }
  return { lines, deviations };
}

function typographySection(t: Totals, ds: DsScale | undefined): { lines: string[]; stray: number } {
  const rows = sortedStr(t.fonts);
  if (rows.length === 0) return { lines: ["## Typography", "", "_No text fonts observed._", ""], stray: 0 };
  const hasDs = ds !== undefined && ds.fonts.size > 0;
  const kept = hasDs ? rows.filter(([f]) => ds.fonts.has(f.toLowerCase())) : rows;
  const stray = hasDs ? rows.filter(([f]) => !ds.fonts.has(f.toLowerCase())) : [];
  const strayCount = stray.reduce((s, [, c]) => s + c, 0);
  const lines: string[] = ["## Typography", ""];
  lines.push(hasDs ? "**DO — DS font families in use:**" : "**DO — observed font families (dominant first):**", "");
  lines.push("| Family | Uses |", "|---|---|");
  for (const [f, c] of kept) lines.push(`| ${f} | ${c} |`);
  lines.push("");
  if (hasDs) {
    if (stray.length > 0) {
      lines.push("**DON'T — stray fonts (not a DS token):**", "");
      lines.push("| Family | Uses |", "|---|---|");
      for (const [f, c] of stray) lines.push(`| ${f} | ${c} |`);
    } else {
      lines.push("**DON'T** — none: every font maps to a DS family token.");
    }
    lines.push("");
  } else if (rows.length > 1) {
    lines.push(`_${rows.length} families observed — watch for typographic drift; supply --ds to validate against the DS._`, "");
  }
  return { lines, stray: strayCount };
}

function componentSection(t: Totals): string[] {
  const rows = sortedStr(t.components);
  const lines: string[] = ["## Component grammar", ""];
  if (rows.length === 0) {
    lines.push("_No component instances observed._", "");
    return lines;
  }
  lines.push("**DO — the house component vocabulary (most-used first):**", "");
  lines.push("| Component | Instances |", "|---|---|");
  for (const [name, c] of rows) lines.push(`| ${name} | ${c} |`);
  lines.push("");
  const deprecated = rows.filter(([name]) => DEPRECATED_RE.test(name));
  if (deprecated.length > 0) {
    lines.push("**DON'T — deprecated / legacy components still in use:**", "");
    lines.push("| Component | Instances |", "|---|---|");
    for (const [name, c] of deprecated) lines.push(`| ${name} | ${c} |`);
    lines.push("");
  }
  return lines;
}

function perSectionSection(t: Totals): string[] {
  const lines: string[] = ["## Per-section summary", ""];
  lines.push("| Section | Screens | Nodes walked | Truncated | Token-bound fills | Auto-layout |", "|---|---|---|---|---|---|");
  for (const s of t.perSection) {
    lines.push(`| ${s.name} | ${s.screens} | ${s.nodesWalked} | ${s.truncated ? "yes" : "no"} | ${s.tokenizedPct}% | ${s.autoPct}% |`);
  }
  lines.push("");
  return lines;
}

function provenanceSection(t: Totals, source: string, dsNote: string, deviations: number): string[] {
  return [
    "## Provenance",
    "",
    `- **Source:** ${source} (\`figma-agent scan-conventions\` usage-dna)`,
    `- **Design system:** ${dsNote}`,
    `- **Sections:** ${t.walkedSections} walked · ${t.missing.length} missing (${t.missing.join(", ") || "none"})`,
    `- **Screens:** ${t.screens} · **nodes walked:** ${t.nodesWalked}`,
    `- **Truncated sections:** ${t.truncated.join(", ") || "none"} (a truncated walk hit the node budget — re-scan with a higher --budget for full coverage)`,
    `- **Real deviations:** ${deviations} (off-scale values + raw fills, counted only when --ds is given)`,
    "",
    "_Generated deterministically by `ui synthesize-conventions` — no model, no network._",
  ];
}

// ─── Public builders ──────────────────────────────────────────────────────────

/** Build the full CONVENTIONS.md string + the total deviation count. */
export function buildConventionsDoc(
  t: Totals,
  ds: DsScale | undefined,
  source: string,
): { md: string; deviations: number } {
  const hasDs = ds !== undefined;
  const spacing = scaleSection("Spacing (grid)", "px", t.spacing, ds?.spacing);
  const radius = scaleSection("Radius (scale)", "px", t.radius, ds?.radius);
  const typography = typographySection(t, ds);
  const rawFillDev = hasDs ? t.rawFills : 0;
  const deviations = spacing.deviations + radius.deviations + typography.stray + rawFillDev;
  const dsNote = hasDs
    ? `cross-referenced (spacing ${ds.spacing.size} · radius ${ds.radius.size} · fonts ${ds.fonts.size} token values)`
    : "none supplied — values reported as observed house style, not validated (pass --ds tokens.json to split deviations)";

  const lines: string[] = [
    "# Applied Conventions — learned from real screens",
    "",
    "The applied *grammar* of this product: how its screens actually use the design",
    "system (measured DO/DON'T with counts). Companion to `DESIGN.md` (the DS",
    "*vocabulary* from `ui ingest-figma-ds`). The DON'Ts below feed `/ui:audit` as",
    "convention rules and ground new generation in the product's house style.",
    "",
    ...layoutSection(t),
    ...colorSection(t, hasDs),
    ...spacing.lines,
    ...radius.lines,
    ...typography.lines,
    ...componentSection(t),
    ...perSectionSection(t),
    ...provenanceSection(t, source, dsNote, deviations),
  ];
  return { md: lines.join("\n") + "\n", deviations };
}

/** Derive deterministic "prefers / avoids" memory insights from the rollup. */
export function deriveInsights(t: Totals, ds: DsScale | undefined, deviations: number): string[] {
  const insights: string[] = [];
  const autoPct = pct(t.autoFrames, t.autoFrames + t.rawFrames);
  const tokPct = pct(t.boundFills, t.boundFills + t.rawFills);
  if (autoPct >= 60) insights.push(`prefers auto-layout (${autoPct}% of frames)`);
  if (tokPct >= 60) insights.push(`prefers token-bound fills (${tokPct}% bound)`);

  const spacings = sortedNum(t.spacing).slice(0, 3).map(([v]) => `${v}px`);
  if (spacings.length > 0) insights.push(`prefers spacing steps ${spacings.join(", ")}`);

  const font = sortedStr(t.fonts)[0];
  if (font !== undefined) insights.push(`prefers ${font[0]} for text`);

  const comp = sortedStr(t.components)[0];
  if (comp !== undefined) insights.push(`builds with ${comp[0]} (${comp[1]} instances)`);

  if (ds !== undefined && deviations > 0) {
    insights.push(`avoids off-scale values (${deviations} deviation instances found against the DS)`);
  }
  return insights;
}
