/**
 * `ui knowledge effect-matrix` core — the Art II EMITTER half of the Canvas UI
 * effect-catalog pair (the linter half is knowledge-effect-catalog-check.ts).
 *
 * Pure, FS-free, deterministic (Art I.2): same `catalogJson` + `captured` in →
 * same markdown bytes out. No clock, no fs, no network — `captured` is a caller
 * -supplied parameter (read from the parsed ledger by the command layer), never
 * `Date.now()`.
 *
 * Emits, in order: the `ease:source` provenance marker (spec §5.7 grammar) ·
 * the matrix header + separator · one row per ledger effect, in ledger order.
 * `Effect`/`slug`/`family` are filled from the ledger; `Narrative job`,
 * `Anti-use`, and `Required fallback` are emitted EMPTY on purpose — a human
 * writes those three cells, and `effect-catalog-field-empty`
 * (knowledge-effect-catalog-check.ts) fails until they do. An emitter that
 * invented prose for `Anti-use` would defeat the one field whose job is honest
 * refusal.
 */

const FAMILIES = new Set(["live-html", "object"]);

interface CatalogEffect {
  readonly slug: string;
  readonly name: string;
  readonly family: string;
}

interface Catalog {
  readonly effects: readonly CatalogEffect[];
}

/** Parse + shape-validate catalog.json. Returns null on any violation. */
function parseCatalog(json: string): Catalog | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
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
  return { effects };
}

export type EmitEffectMatrixResult =
  | { ok: true; markdown: string }
  | { ok: false; code: string; message: string };

/**
 * Emit the effect matrix's machine columns from a ledger `catalog.json`.
 * `opts.captured` stamps the provenance marker — supplied by the caller, never
 * read from the system clock (Art I.2).
 */
export function emitEffectMatrix(catalogJson: string, opts: { captured: string }): EmitEffectMatrixResult {
  const catalog = parseCatalog(catalogJson);
  if (catalog === null) {
    return {
      ok: false,
      code: "BAD_LEDGER",
      message:
        "catalog.json is unparseable or violates the ledger shape (missing 'effects' array, or an effect missing slug/name/family/overlayFallback, carrying a family outside live-html|object, or a non-boolean overlayFallback)",
    };
  }

  const lines: string[] = [];
  lines.push(
    `<!-- ease:source ref="knowledge/canvas-ui/catalog.json" captured="${opts.captured}" url="https://canvasui.dev/components" -->`,
  );
  lines.push("");
  lines.push("| Effect | slug | family | Narrative job | Anti-use | Required fallback |");
  lines.push("|---|---|---|---|---|---|");
  for (const e of catalog.effects) {
    lines.push(`| ${e.name} | \`${e.slug}\` | ${e.family} |  |  |  |`);
  }

  return { ok: true, markdown: lines.join("\n") + "\n" };
}
