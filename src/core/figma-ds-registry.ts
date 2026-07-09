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
import type { Registry, ComponentRecord } from "./registry-store.js";

export interface DsComponent {
  id: string;
  key?: string;
  name: string;
  type: string; // COMPONENT | COMPONENT_SET
  /** variant axis name → its options, e.g. { Size: ["Small","Large"], Tone: ["Primary"] }. */
  variantAxes?: Record<string, string[]>;
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

/** Build a registry (registry-store shape) from ds.json components. Sorted by name. */
export function buildRegistry(components: DsComponent[]): Registry {
  const records: ComponentRecord[] = components.map((c) => {
    const axes = c.variantAxes ?? {};
    const hasAxes = Object.keys(axes).length > 0;
    const descParts = [`Figma ${c.type}`];
    if (hasAxes) descParts.push(propSummary(axes));
    const rec: ComponentRecord = {
      name: c.name,
      category: categoryOf(c),
      markup: "", // no HTML from a Figma scan; instances are authored on-canvas later
      tokensUsed: [],
      description: descParts.join(" · "),
    };
    if (hasAxes) rec.variants = variantList(axes);
    return rec;
  });
  records.sort((a, b) => a.name.localeCompare(b.name));
  return { version: "0.1.0", components: records };
}
