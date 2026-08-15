/**
 * Pure parsing half of the Canvas UI effect-catalog pair (spec 028 §8.2), split
 * out of knowledge-effect-catalog-check.ts under Art IX (D2d — the row-drift
 * check pushed the combined file over 200 lines). FS-FREE: parses already-read
 * strings only. knowledge-effect-catalog-check.ts owns the checks; this module
 * owns catalog.json shape-validation and the 6-column matrix row parser.
 */

const FAMILIES = new Set(["live-html", "object"]);

export interface CatalogEffect {
  readonly slug: string;
  readonly name: string;
  readonly family: string;
}

export interface Catalog {
  readonly revision: string;
  readonly captured: string;
  readonly effects: readonly CatalogEffect[];
}

/** Parse + shape-validate catalog.json. Returns null on any violation (including a missing/non-boolean overlayFallback). */
export function parseCatalog(json: string): Catalog | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.revision !== "string" || typeof obj.captured !== "string") return null;
  if (!Array.isArray(obj.effects)) return null;
  const effects: CatalogEffect[] = [];
  for (const raw of obj.effects) {
    if (typeof raw !== "object" || raw === null) return null;
    const e = raw as Record<string, unknown>;
    if (typeof e.slug !== "string" || typeof e.name !== "string" || typeof e.family !== "string") return null;
    if (!FAMILIES.has(e.family)) return null;
    if (typeof e.overlayFallback !== "boolean") return null;
    effects.push({ slug: e.slug, name: e.name, family: e.family });
  }
  return { revision: obj.revision, captured: obj.captured, effects };
}

export interface MatrixRow {
  readonly slug: string;
  readonly name: string;
  readonly family: string;
  readonly narrativeJob: string;
  readonly antiUse: string;
  readonly requiredFallback: string;
}

/** Parse the 6-column `| Effect | slug | family | ... |` matrix rows out of the knowledge file. */
export function parseMatrixRows(content: string): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
    if (cells.length !== 6) continue;
    if (cells[0] === "Effect" && cells[1] === "slug") continue; // header row
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator row
    const slug = (cells[1] ?? "").replace(/`/g, "");
    if (slug === "") continue;
    rows.push({
      slug,
      name: cells[0] ?? "",
      family: cells[2] ?? "",
      narrativeJob: cells[3] ?? "",
      antiUse: cells[4] ?? "",
      requiredFallback: cells[5] ?? "",
    });
  }
  return rows;
}

// extractRevisionToken / monthsBetween moved to knowledge-ledger-provenance.ts when the
// ShaderGradient ledger arrived and needed the identical two helpers. Re-exported here so
// this module's public surface is unchanged for every existing importer.
export { extractRevisionToken, monthsBetween } from "./knowledge-ledger-provenance.js";
