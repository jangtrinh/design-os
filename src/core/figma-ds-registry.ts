/**
 * Figma design-system scan → component registry (deterministic, zero-network).
 *
 * Input: the `components` array from `figma-agent scan-design-system` (ds.json).
 * Each entry: { id, key?, name, type: COMPONENT|COMPONENT_SET, variantAxes? }.
 * Output: a Registry object in the on-disk shape of src/core/registry-store.ts,
 * so `ui registry list|lookup --file <ingested>` reads it directly.
 *
 * The EXACT Figma component name is preserved (never PascalCase-normalised): the
 * "resolve by NAME, never id" rule (knowledge/figma-craft, F2) makes the name the
 * stable key against the live file, so mangling it would break later reconcile /
 * real-instance authoring. These records are therefore authored directly here,
 * not pushed through `ui registry register` (whose Category/Variant name pattern
 * exists for code-authored components, not scanned Figma inventory).
 */
import type { Registry, ComponentRecord, ComponentStatus } from "./registry-store.js";

export interface DsComponent {
  id: string;
  key?: string;
  name: string;
  type: string; // COMPONENT | COMPONENT_SET
  /** variant axis name → its options, e.g. { Size: ["Small","Large"], Tone: ["Primary"] }. */
  variantAxes?: Record<string, string[]>;
  /** Optional (forward-compat): frame width in px, if the scan carries it. */
  width?: number;
  /** Optional (forward-compat): the enclosing section/page name, if the scan carries it. */
  section?: string;
}

/** How a scanned node is bucketed: a real DS component, an icon, or a full-screen frame. */
export type DsComponentKind = "icon" | "screen" | "component";

/** Bulk representation of the icon inventory — one summary row, never one row per icon. */
export interface IconSummary {
  kind: "icon-set";
  count: number;
  /** First ~20 icon names (sorted), a representative peek — not the full list. */
  sample: string[];
}

/** The outcome of classifying a scan: a clean component registry + bulked icons + separated screens. */
export interface ClassifiedRegistry {
  /** Real DS components only (icons/screens excluded), registry-store shape. */
  registry: Registry;
  /** Icons rolled up into a single summary instead of flooding the registry. */
  icons: IconSummary;
  /** Screen-frame names (sorted) — full designs, NOT design-system components. */
  screens: string[];
}

/** How many icon names to keep as a representative sample in the bulk summary. */
const ICON_SAMPLE_LIMIT = 20;
/** A very wide frame is a full screen design, not a component (only if width is known). */
const SCREEN_MIN_WIDTH = 1024;
/** Name looks like an icon: starts with "Icon"/"Icon /"/"Icon/" (as a whole token), or mentions lucide. */
const ICON_NAME = /(^icon(\s|\/|$)|lucide)/i;
/** Section/page looks like the icon library (a "00"/Lucide/Icons section). */
const ICON_SECTION = /^(00\b|lucide|icons?\b)/i;
/** Name looks like a screen: leading section/screen number (e.g. "01 · Login", "10 - Bar"). */
const SCREEN_NAME = /^\d/;

/**
 * Bucket one scanned node into icon | screen | component (deterministic, name-first).
 * Icons are checked before screens so an "Icon" library entry never reads as a screen.
 * width/section are used only when the scan actually carries them (it currently does not).
 */
export function classifyComponent(c: DsComponent): DsComponentKind {
  const name = c.name.trim();
  if (ICON_NAME.test(name)) return "icon";
  if (c.section !== undefined && ICON_SECTION.test(c.section.trim())) return "icon";
  if (SCREEN_NAME.test(name)) return "screen";
  if (typeof c.width === "number" && c.width >= SCREEN_MIN_WIDTH) return "screen";
  return "component";
}

/**
 * Classify a whole scan: real components become a registry, icons roll up into one
 * summary, and screen-frames are separated out (names only). This is the C0.1 default —
 * it keeps the registry to the real DS components instead of drowning it in icon rows.
 */
export function classifyRegistry(components: DsComponent[]): ClassifiedRegistry {
  const real: DsComponent[] = [];
  const iconNames: string[] = [];
  const screenNames: string[] = [];
  for (const c of components) {
    switch (classifyComponent(c)) {
      case "icon":
        iconNames.push(c.name);
        break;
      case "screen":
        screenNames.push(c.name);
        break;
      default:
        real.push(c);
    }
  }
  iconNames.sort((a, b) => a.localeCompare(b));
  screenNames.sort((a, b) => a.localeCompare(b));
  return {
    registry: buildRegistry(real),
    icons: { kind: "icon-set", count: iconNames.length, sample: iconNames.slice(0, ICON_SAMPLE_LIMIT) },
    screens: screenNames,
  };
}

/** Category for a scanned component: the first "/" segment of its name, else its Figma node type. */
function categoryOf(c: DsComponent): string {
  const slash = c.name.indexOf("/");
  if (slash > 0) return c.name.slice(0, slash).trim();
  return c.type;
}

/** Flatten variant axes to a sorted "Axis=Option" list for ComponentRecord.variants. */
function variantList(axes: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const [axis, options] of Object.entries(axes)) {
    for (const opt of options) out.push(`${axis}=${opt}`);
  }
  return out.sort();
}

/** A compact human/AI-readable prop summary, e.g. "props: Size(Small,Large), Tone(Primary)". */
function propSummary(axes: Record<string, string[]>): string {
  const parts = Object.entries(axes).map(([axis, opts]) => `${axis}(${opts.join(",")})`);
  return parts.length > 0 ? `props: ${parts.join(", ")}` : "";
}

/** shadcn lifecycle markers: 🟢 = stable, 🔵/🟡 = beta. Read from the component or its page name. */
function statusFromMarker(...names: (string | undefined)[]): ComponentStatus | undefined {
  const hay = names.filter((s): s is string => s !== undefined).join(" ");
  if (/🟢/u.test(hay)) return "stable";
  if (/🔵|🟡/u.test(hay)) return "beta";
  return undefined;
}
/** Drop lifecycle-marker emoji from a name so the stored name stays clean/aliasable. */
function stripMarkers(s: string): string {
  return s.replace(/[🟢🔵🟡]/gu, "").replace(/\s+/g, " ").trim();
}

/** Build a registry (registry-store shape) from ds.json components. Sorted by name. */
export function buildRegistry(components: DsComponent[]): Registry {
  const records: ComponentRecord[] = components.map((c) => {
    const axes = c.variantAxes ?? {};
    const hasAxes = Object.keys(axes).length > 0;
    const descParts = [`Figma ${c.type}`];
    if (hasAxes) descParts.push(propSummary(axes));
    const cleanName = stripMarkers(c.name);
    const status = statusFromMarker(c.name, c.section);
    const rec: ComponentRecord = {
      name: cleanName,
      category: categoryOf({ ...c, name: cleanName }),
      markup: "", // no HTML from a Figma scan; instances are authored on-canvas later
      tokensUsed: [],
      description: descParts.join(" · "),
    };
    if (hasAxes) rec.variants = variantList(axes);
    if (status !== undefined) rec.status = status;
    return rec;
  });
  records.sort((a, b) => a.name.localeCompare(b.name));
  return { version: "0.1.0", components: records };
}
