/**
 * Figma design-system scan → DESIGN.md knowledge doc (deterministic, zero-network).
 *
 * The human+AI-readable spec of an ingested Figma design system: a tokens
 * overview (primitive tier = literals, semantic tier = aliases), the component
 * inventory (name · category · variants/props), and the local styles. This is
 * the portable, runtime-neutral artifact the host model reads to "understand"
 * the DS (F0: portable files ARE the durable memory).
 *
 * Pure string builder — no filesystem, no clock.
 */
import type { DtcgTree, DtcgLeaf } from "./figma-ds-tokens.js";
import type { Registry } from "./registry-store.js";
import type { IconSummary } from "./figma-ds-registry.js";
import { ledgerLines } from "./figma-ds-ledger.js";
import type { Ledger } from "./figma-ds-ledger.js";
import type { BindingReport, ComponentFinal } from "./figma-ds-ingest-components.js";

export interface DsStyle {
  id: string;
  name: string;
  type: string; // PAINT | TEXT | EFFECT
}

/** Render one token leaf's value cell, incl. any dark-mode override from $extensions. */
function valueCell(leaf: DtcgLeaf): string {
  let cell = String(leaf.$value);
  const ext = leaf.$extensions;
  if (ext !== undefined) {
    const dark = Object.entries(ext)
      .filter(([k]) => k.startsWith("mode."))
      .map(([k, v]) => {
        const val = (v as { $value?: unknown }).$value;
        return `${k.slice("mode.".length)}: ${String(val)}`;
      });
    if (dark.length > 0) cell += ` · ${dark.join(" · ")}`;
  }
  return cell;
}

/** True when a leaf is a semantic token (its $value is a `{alias}`). */
function isAliasLeaf(leaf: DtcgLeaf): boolean {
  return typeof leaf.$value === "string" && /^\{.+\}$/.test(leaf.$value);
}

function tokenSection(title: string, rows: string[]): string[] {
  if (rows.length === 0) return [];
  return [`### ${title}`, "", "| Token | Type | Value (· mode overrides) |", "|---|---|---|", ...rows, ""];
}

function tokensBlock(tree: DtcgTree): string[] {
  const primitives: string[] = [];
  const semantics: string[] = [];
  for (const cat of Object.keys(tree)) {
    const group = tree[cat] as Record<string, DtcgLeaf>;
    for (const tok of Object.keys(group)) {
      const leaf = group[tok] as DtcgLeaf;
      const row = `| \`${cat}.${tok}\` | ${leaf.$type} | ${valueCell(leaf)} |`;
      (isAliasLeaf(leaf) ? semantics : primitives).push(row);
    }
  }
  const out: string[] = ["## Tokens", ""];
  if (primitives.length === 0 && semantics.length === 0) {
    out.push("_No mappable Variables were found in the scan._", "");
    return out;
  }
  out.push(
    "Two tiers (see knowledge/token-taxonomy.md): **primitives** are literal values;",
    "**semantic** tokens alias a primitive and are what UI should consume.",
    "",
  );
  out.push(...tokenSection("Primitives", primitives));
  out.push(...tokenSection("Semantic tokens", semantics));
  return out;
}

function componentsBlock(registry: Registry): string[] {
  const out: string[] = ["## Components", ""];
  if (registry.components.length === 0) {
    out.push("_No components were found in the scan._", "");
    return out;
  }
  out.push("| Name | Category | Variants / props |", "|---|---|---|");
  for (const c of registry.components) {
    const props = c.variants !== undefined && c.variants.length > 0 ? c.variants.join(", ") : "—";
    out.push(`| \`${c.name}\` | ${c.category} | ${props} |`);
  }
  out.push("", "_Resolve components by their exact name (ids renumber on sync)._", "");
  return out;
}

/** Icons rolled up into a single bulk note (count + a representative sample), never one row each. */
function iconsBlock(icons: IconSummary): string[] {
  if (icons.count === 0) return [];
  const out: string[] = [
    "## Icons",
    "",
    `_${icons.count} icons (icon-set) — represented in bulk, not as individual components._`,
    "",
  ];
  if (icons.sample.length > 0) {
    const shown = icons.sample.map((n) => `\`${n}\``).join(", ");
    const more = icons.count > icons.sample.length ? `, … (+${icons.count - icons.sample.length} more)` : "";
    out.push(`Sample: ${shown}${more}`, "");
  }
  return out;
}

/** Screen-frames listed separately and flagged — they are full designs, NOT DS components. */
function screensBlock(screens: string[]): string[] {
  if (screens.length === 0) return [];
  return [
    "## Screens",
    "",
    `_${screens.length} screen-frames — full designs, NOT design-system components (excluded from the registry)._`,
    "",
    ...screens.map((n) => `- \`${n}\``),
    "",
  ];
}

function stylesBlock(styles: DsStyle[]): string[] {
  const out: string[] = ["## Styles", ""];
  const groups: Array<[string, string]> = [["TEXT", "Text styles"], ["EFFECT", "Effect styles"], ["PAINT", "Paint styles"]];
  let any = false;
  for (const [type, label] of groups) {
    const named = styles.filter((s) => s.type === type).map((s) => s.name).sort();
    if (named.length === 0) continue;
    any = true;
    out.push(`### ${label}`, "", ...named.map((n) => `- \`${n}\``), "");
  }
  if (!any) out.push("_No local styles were found in the scan._", "");
  return out;
}

/** What was left out because the owner did not keep it, named. */
export interface DesignExclusions {
  collections: { name: string; count: number }[];
  pages: { name: string; count: number }[];
}

/** The hosts that write the sensed fields; the row says which scan supplies what a scan lacks. */
export const SENSING_HOSTS = "the Figma plugin scan (figma-agent scan-design-system, field shape v1) or the DESIGN:OS Studio scan (version: not released)";

function bindingLines(b: BindingReport): string[] {
  const parts = [`${b.sensed} sensed, ${b.notSensed} not-sensed`];
  if (b.sensed > 0) parts.push(`${b.linked} bound variable(s) linked to tokens`);
  const ex = [
    ...b.excluded.collections.map((c) => `${c.count} into the left-out collection ${c.name}`),
    ...(b.excluded.notWritten > 0 ? [`${b.excluded.notWritten} into variables that are not tokens`] : []),
    ...(b.excluded.outsideScan > 0 ? [`${b.excluded.outsideScan} into variables outside the scan (remote)`] : []),
    ...(b.excluded.unsafePath > 0 ? [`${b.excluded.unsafePath} onto token paths the registry cannot hold`] : []),
  ];
  return [
    `- **Component → token links:** ${parts.join("; ")}`,
    ...(ex.length > 0 ? [`- **Bindings left out:** ${ex.join("; ")}`] : []),
    ...(b.notSensed > 0 ? [`- **Not sensed:** the scan carries no \`boundVariables\` for ${b.notSensed} component(s); they come from ${SENSING_HOSTS}.`] : []),
  ];
}

/** The closing section: the ledger and everything that was left out, by name. Appended after every existing section. */
function ledgerBlock(input: DesignDocInput): string[] {
  const { ledger, exclusions, frames, bindings } = input;
  if (ledger === undefined) return [];
  const out = ["## Ledger", "", ...ledgerLines(ledger).map((l) => `- ${l}`), ""];
  const left = [
    ...(exclusions?.collections ?? []).map((c) => `- Collection \`${c.name}\`: ${c.count} variable(s) left out`),
    ...(exclusions?.pages ?? []).map((p) => `- Page \`${p.name}\`: ${p.count} node(s) left out`),
  ];
  if (left.length > 0) out.push("### Left out, named", "", ...left, "");
  if (frames !== null && frames !== undefined) {
    out.push("### Existing screens (frames)", "", ...frames.pages.map((p) => `- \`${p.name}\`: ${p.frames} frame(s), ${p.instanceBuilt} built from instances${p.kept ? "" : " — left out"}`), "");
  }
  if (bindings !== undefined) out.push("### Component links", "", ...bindingLines(bindings), "");
  return out;
}

export interface DesignDocInput {
  name: string;
  source: string;
  tree: DtcgTree;
  registry: Registry;
  styles: DsStyle[];
  counts: { tokens: number; components: number; styles: number; icons: number; screens: number };
  icons: IconSummary;
  screens: string[];
  ledger?: Ledger;
  exclusions?: DesignExclusions;
  frames?: ComponentFinal["frames"];
  bindings?: BindingReport;
}

/** Build the full DESIGN.md markdown string. Deterministic given identical input. */
export function buildDesignDoc(input: DesignDocInput): string {
  const { name, source, tree, registry, styles, counts, icons, screens } = input;
  const inventory = [
    `${counts.tokens} variables`,
    `${counts.components} components`,
    ...(icons.count > 0 ? [`${icons.count} icons`] : []),
    ...(screens.length > 0 ? [`${screens.length} screens`] : []),
    `${counts.styles} styles`,
  ].join(" · ");
  const lines: string[] = [
    `# ${name} — Design System`,
    "",
    `Ingested from an existing Figma design system via \`ui ingest-figma-ds\`.`,
    `This is the portable, AI-readable spec — tokens compile with \`ui tokens compile\`,`,
    `components load with \`ui registry list --file component-registry.json\`.`,
    "",
    `- **Source:** ${source}`,
    `- **Inventory:** ${inventory}`,
    "",
    ...tokensBlock(tree),
    ...componentsBlock(registry),
    ...iconsBlock(icons),
    ...screensBlock(screens),
    ...stylesBlock(styles),
    ...ledgerBlock(input),
  ];
  return lines.join("\n") + "\n";
}
