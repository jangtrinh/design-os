/**
 * Pure parsing half of the ShaderGradient gradient-catalog pair, split out of
 * knowledge-gradient-catalog-check.ts under Art IX exactly as the Canvas UI
 * pair is split. FS-FREE: parses already-read strings only.
 * knowledge-gradient-catalog-check.ts owns the checks; this module owns
 * catalog.json shape-validation and the 6-column matrix row parser.
 *
 * Two arrays, not one. `presets` is the named-look roster; `surfaces` is the
 * shader x mesh product a hand-configured field selects from. They are
 * orthogonal axes — every named preset at the pin uses the same shader family,
 * so folding shader choice into the preset rows would hide most of the
 * vocabulary behind a field that never varies. See knowledge/shader-gradient/README.md.
 */

const MESHES = new Set(["plane", "sphere", "waterPlane"]);
const LIGHTS = new Set(["3d", "env"]);

export interface CatalogPreset {
  readonly slug: string;
  readonly name: string;
  readonly mesh: string;
  readonly light: string;
  readonly grain: boolean;
}

export interface CatalogSurface {
  readonly shader: string;
  readonly mesh: string;
}

export interface GradientCatalog {
  readonly revision: string;
  readonly captured: string;
  readonly presets: readonly CatalogPreset[];
  readonly surfaces: readonly CatalogSurface[];
}

/**
 * Parse + shape-validate the gradient catalog.json. Returns null on ANY
 * violation — a partially-valid ledger is treated as no ledger, because a
 * caller that got half a roster would silently check half the matrix.
 */
export function parseGradientCatalog(json: string): GradientCatalog | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.revision !== "string" || typeof obj.captured !== "string") return null;
  if (!Array.isArray(obj.presets) || !Array.isArray(obj.surfaces)) return null;

  const presets: CatalogPreset[] = [];
  const seenSlugs = new Set<string>();
  for (const raw of obj.presets) {
    if (typeof raw !== "object" || raw === null) return null;
    const p = raw as Record<string, unknown>;
    if (typeof p.slug !== "string" || typeof p.name !== "string") return null;
    if (typeof p.mesh !== "string" || !MESHES.has(p.mesh)) return null;
    if (typeof p.light !== "string" || !LIGHTS.has(p.light)) return null;
    if (typeof p.grain !== "boolean") return null;
    // A duplicate slug would make the matrix cross-check ambiguous: two ledger
    // rows claiming one matrix row, with no rule for which wins.
    if (seenSlugs.has(p.slug)) return null;
    seenSlugs.add(p.slug);
    presets.push({ slug: p.slug, name: p.name, mesh: p.mesh, light: p.light, grain: p.grain });
  }

  const surfaces: CatalogSurface[] = [];
  const seenPairs = new Set<string>();
  for (const raw of obj.surfaces) {
    if (typeof raw !== "object" || raw === null) return null;
    const s = raw as Record<string, unknown>;
    if (typeof s.shader !== "string" || s.shader === "") return null;
    if (typeof s.mesh !== "string" || !MESHES.has(s.mesh)) return null;
    const key = `${s.shader}/${s.mesh}`;
    if (seenPairs.has(key)) return null;
    seenPairs.add(key);
    surfaces.push({ shader: s.shader, mesh: s.mesh });
  }

  return { revision: obj.revision, captured: obj.captured, presets, surfaces };
}

export interface GradientMatrixRow {
  readonly slug: string;
  readonly name: string;
  readonly mesh: string;
  readonly narrativeJob: string;
  readonly antiUse: string;
  readonly requiredFallback: string;
}

/** Parse the 6-column `| Preset | slug | mesh | ... |` matrix rows out of the knowledge file. */
export function parseGradientMatrixRows(content: string): GradientMatrixRow[] {
  const rows: GradientMatrixRow[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.length !== 6) continue;
    if (cells[0] === "Preset" && cells[1] === "slug") continue; // header row
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator row
    const slug = (cells[1] ?? "").replace(/`/g, "");
    // Only rows whose slug cell was fenced in backticks are matrix rows. Without
    // this the file's other 6-column tables would be parsed as drifted matrix rows.
    if (slug === "" || !(cells[1] ?? "").includes("`")) continue;
    rows.push({
      slug,
      name: cells[0] ?? "",
      mesh: cells[2] ?? "",
      narrativeJob: cells[3] ?? "",
      antiUse: cells[4] ?? "",
      requiredFallback: cells[5] ?? "",
    });
  }
  return rows;
}
