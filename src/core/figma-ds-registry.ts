/**
 * Figma design-system scan → component registry (deterministic, zero-network).
 *
 * Input: the `components` array from `figma-agent scan-design-system` (ds.json).
 * Each entry: { id, key?, name, type: COMPONENT|COMPONENT_SET, variantAxes?, page? }.
 * Output: a Registry object in the on-disk shape of src/core/registry-store.ts,
 * so `ui registry list|lookup --file <ingested>` reads it directly.
 *
 * The EXACT Figma component name is preserved (never PascalCase-normalised) apart from lifecycle and archive markers:
 * the "resolve by NAME, never id" rule (knowledge/figma-craft, F2) makes the name the stable key against the live
 * file. These records are authored directly here, not pushed through `ui registry register` (whose Category/Variant
 * name pattern exists for code-authored components, not scanned Figma inventory).
 *
 * The registry never holds a name twice (FR-010): `classifyRegistry` withholds every record of a duplicated name and
 * reports it, so a duplicate is a question for the owner, never a written record.
 */
import { HEURISTICS, classifyHeuristic, recordHeuristics, statusMarkerOf, stripArchiveMarkers, stripMarkers } from "./figma-ds-heuristics.js";
import type { DsComponentKind, Heuristic } from "./figma-ds-heuristics.js";
import type { Registry, ComponentRecord } from "./registry-store.js";

export type { DsComponentKind } from "./figma-ds-heuristics.js";
export { SCREEN_MIN_WIDTH } from "./figma-ds-heuristics.js";

export interface DsComponent {
  id: string;
  key?: string;
  name: string;
  type: string; // COMPONENT | COMPONENT_SET
  /** variant axis name → its options, e.g. { Size: ["Small","Large"], Tone: ["Primary"] }. */
  variantAxes?: Record<string, string[]>;
  /** Optional: frame width in px, if the scan carries it. */
  width?: number;
  /** The page (the scan's `page`) or section the node sits in; the section heuristics read it. */
  section?: string;
  /** Sensed (optional): sorted variable ids bound inside the component. */
  boundVariables?: string[];
  /** Sensed (optional): the components used directly inside this one. */
  instances?: { component: string; count: number }[];
}

/** Bulk representation of the icon inventory — one summary row, never one row per icon. */
export interface IconSummary {
  kind: "icon-set";
  count: number;
  /** First ~20 icon names (sorted), a representative peek — not the full list. */
  sample: string[];
}

export interface ClassifyOptions {
  /** Nodes the owner ruled to be components although a heuristic put them elsewhere. */
  asComponent?: ReadonlySet<string>;
  /** Nodes the owner ruled to be screens although no heuristic said so. */
  asScreen?: ReadonlySet<string>;
  /** Nodes kept although they carry an archive marker: the marker leaves the name and the record is deprecated. */
  deprecatedIds?: ReadonlySet<string>;
  /** Stored name per node id, for a duplicate the owner kept under a distinct name. */
  renames?: ReadonlyMap<string, string>;
  /** Sensed `tokensUsed` per node id: sorted token paths of the variables bound inside the component. */
  tokensUsed?: ReadonlyMap<string, string[]>;
}

/** The outcome of classifying a scan: a clean component registry + bulked icons + separated screens. */
export interface ClassifiedRegistry {
  /** Real DS components only (icons/screens excluded), registry-store shape, no name twice. */
  registry: Registry;
  icons: IconSummary;
  /** Screen-frame names (sorted) — full designs, NOT design-system components. */
  screens: string[];
  /** How many nodes each declared heuristic applied to (class heuristics: every node; record heuristics: every record). */
  classifiedByHeuristic: Record<Heuristic, number>;
  /** Records withheld because their stored name occurs more than once: the node ids of each such name. */
  duplicates: { name: string; ids: string[] }[];
}

/** How many icon names to keep as a representative sample in the bulk summary. */
const ICON_SAMPLE_LIMIT = 20;

/** Bucket one scanned node into icon | screen | component (deterministic, name-first). */
export function classifyComponent(c: DsComponent): DsComponentKind {
  return classifyHeuristic(c).kind;
}

/** The class of a node: the owner's ruling when there is one, else the heuristics'. */
export function effectiveClass(c: DsComponent, opts: ClassifyOptions = {}): { kind: DsComponentKind; heuristic?: Heuristic } {
  if (opts.asComponent?.has(c.id) === true) return { kind: "component" };
  if (opts.asScreen?.has(c.id) === true) {
    const h = classifyHeuristic(c).heuristic;
    return h === undefined ? { kind: "screen" } : { kind: "screen", heuristic: h };
  }
  return classifyHeuristic(c);
}

/** The name a node is stored under before any owner rename. */
export function storedName(c: DsComponent, deprecated = false): string {
  const clean = stripMarkers(c.name);
  return deprecated ? stripArchiveMarkers(clean) : clean;
}

/**
 * Classify a whole scan: real components become a registry, icons roll up into one summary, and screen-frames are
 * separated out (names only). A duplicated stored name never reaches the registry (see `duplicates`).
 */
export function classifyRegistry(components: DsComponent[], opts: ClassifyOptions = {}): ClassifiedRegistry {
  const real: DsComponent[] = [];
  const iconNames: string[] = [];
  const screenNames: string[] = [];
  const counts = Object.fromEntries(HEURISTICS.map((h) => [h, 0])) as Record<Heuristic, number>;
  for (const c of components) {
    const { kind, heuristic } = effectiveClass(c, opts);
    if (heuristic !== undefined) counts[heuristic]++;
    if (kind === "icon") iconNames.push(c.name);
    else if (kind === "screen") screenNames.push(c.name);
    else real.push(c);
  }
  iconNames.sort((a, b) => a.localeCompare(b));
  screenNames.sort((a, b) => a.localeCompare(b));
  const byName = new Map<string, DsComponent[]>();
  for (const c of real) {
    const name = opts.renames?.get(c.id) ?? storedName(c, opts.deprecatedIds?.has(c.id) === true);
    (byName.get(name) ?? byName.set(name, []).get(name)!).push(c);
  }
  const duplicates = [...byName].filter(([, cs]) => cs.length > 1).map(([name, cs]) => ({ name, ids: cs.map((c) => c.id) }));
  const dupIds = new Set(duplicates.flatMap((d) => d.ids));
  const kept = real.filter((c) => !dupIds.has(c.id));
  for (const c of kept) for (const h of recordHeuristics(c)) counts[h]++;
  return {
    registry: buildRegistry(kept, opts),
    icons: { kind: "icon-set", count: iconNames.length, sample: iconNames.slice(0, ICON_SAMPLE_LIMIT) },
    screens: screenNames,
    classifiedByHeuristic: counts,
    duplicates,
  };
}

/** Category for a scanned component: the first "/" segment of its name, else its Figma node type. */
function categoryOf(name: string, type: string): string {
  const slash = name.indexOf("/");
  return slash > 0 ? name.slice(0, slash).trim() : type;
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

/** Build a registry (registry-store shape) from ds.json components. Sorted by name. */
export function buildRegistry(components: DsComponent[], opts: ClassifyOptions = {}): Registry {
  const records: ComponentRecord[] = components.map((c) => {
    const axes = c.variantAxes ?? {};
    const hasAxes = Object.keys(axes).length > 0;
    const descParts = [`Figma ${c.type}`];
    if (hasAxes) descParts.push(propSummary(axes));
    const deprecated = opts.deprecatedIds?.has(c.id) === true;
    const cleanName = storedName(c, deprecated);
    const status = statusMarkerOf(c.section === undefined ? c.name : `${c.name} ${c.section}`);
    const rec: ComponentRecord = {
      name: opts.renames?.get(c.id) ?? cleanName,
      category: categoryOf(cleanName, c.type),
      markup: "", // no HTML from a Figma scan; instances are authored on-canvas later
      tokensUsed: opts.tokensUsed?.get(c.id) ?? [],
      description: descParts.join(" · "),
      // TODO(spec 004 P1/P4): map scope from the Figma publish-status / `remote` signal once
      // the capture stream carries it. The current scan (DsComponent) exposes no publish
      // signal, so default every scanned record to "local" (spec 004 D3 default).
      scope: "local",
    };
    if (hasAxes) rec.variants = variantList(axes);
    if (status !== undefined) rec.status = status;
    if (deprecated) rec.deprecated = true;
    return rec;
  });
  records.sort((a, b) => a.name.localeCompare(b.name));
  return { version: "0.1.0", components: records };
}
