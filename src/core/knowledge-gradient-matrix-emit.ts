/**
 * `ui knowledge gradient-matrix` core — the Art II EMITTER half of the
 * ShaderGradient pair (the linter half is knowledge-gradient-catalog-check.ts).
 *
 * Pure, FS-free, deterministic (Art I.2): same `catalogJson` + `captured` in ->
 * same markdown bytes out. No clock, no fs, no network — `captured` is a
 * caller-supplied parameter (read from the parsed ledger by the command layer),
 * never `Date.now()`.
 *
 * Emits, in order: the `ease:source` provenance marker · the matrix header +
 * separator · one row per ledger preset, in ledger order. `Preset`/`slug`/`mesh`
 * are filled from the ledger; `Narrative job`, `Anti-use`, and `Required fallback`
 * are emitted EMPTY on purpose — a human writes those three cells, and
 * `gradient-catalog-field-empty` fails until they do. An emitter that invented
 * prose for `Anti-use` would defeat the one field whose job is honest refusal,
 * and an emitter that invented a `Required fallback` would be worse: it would
 * manufacture the exact accessibility claim the linter exists to keep honest.
 */
import { parseGradientCatalog } from "./knowledge-gradient-catalog-parse.js";

export type EmitGradientMatrixResult =
  | { ok: true; markdown: string }
  | { ok: false; code: string; message: string };

/**
 * Emit the preset matrix's machine columns from a ledger `catalog.json`.
 * `opts.captured` stamps the provenance marker — supplied by the caller, never
 * read from the system clock (Art I.2).
 */
export function emitGradientMatrix(
  catalogJson: string,
  opts: { captured: string },
): EmitGradientMatrixResult {
  const catalog = parseGradientCatalog(catalogJson);
  if (catalog === null) {
    return {
      ok: false,
      code: "BAD_LEDGER",
      message:
        "catalog.json is unparseable or violates the gradient-ledger shape (missing 'presets'/'surfaces' arrays, a preset missing slug/name/mesh/light/grain, a mesh outside plane|sphere|waterPlane, a light outside 3d|env, a non-boolean grain, or a duplicate preset slug / surface pair)",
    };
  }

  const lines: string[] = [];
  lines.push(
    `<!-- ease:source ref="knowledge/shader-gradient/catalog.json" captured="${opts.captured}" url="https://github.com/ruucm/shadergradient" -->`,
  );
  lines.push("");
  lines.push("| Preset | slug | mesh | Narrative job | Anti-use | Required fallback |");
  lines.push("|---|---|---|---|---|---|");
  for (const p of catalog.presets) {
    lines.push(`| ${p.name} | \`${p.slug}\` | ${p.mesh} |  |  |  |`);
  }

  return { ok: true, markdown: lines.join("\n") + "\n" };
}
