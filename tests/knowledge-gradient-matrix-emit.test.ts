/**
 * emitGradientMatrix (knowledge-gradient-matrix-emit.ts) — the Art II EMITTER
 * half of the ShaderGradient pair. Pure, FS-free, deterministic.
 *
 * The round-trip case at the bottom is the one that matters: it proves the
 * emitter and the linter agree on row shape, so a matrix produced by the
 * emitter and then filled in by a human cannot fail the linter's machine-column
 * checks. A pair whose two halves disagree is worse than neither.
 */
import { describe, expect, it } from "vitest";

import { emitGradientMatrix } from "../src/core/knowledge-gradient-matrix-emit.js";
import { gradientCatalogChecks } from "../src/core/knowledge-gradient-catalog-check.js";

const REVISION = "974a230b1e6c3ec375fbe17a8ea1c89edbc48019";

const LEDGER = JSON.stringify({
  upstream: "https://github.com/ruucm/shadergradient",
  revision: REVISION,
  captured: "202606",
  license: "MIT",
  presets: [
    { slug: "halo", name: "Halo", mesh: "plane", light: "3d", grain: true },
    { slug: "nighty-night", name: "Nighty night", mesh: "waterPlane", light: "3d", grain: true },
  ],
  surfaces: [{ shader: "defaults", mesh: "plane" }],
});

describe("emitGradientMatrix — shape", () => {
  it("emits the provenance marker, header, separator, and one row per preset", () => {
    const r = emitGradientMatrix(LEDGER, { captured: "202606" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lines = r.markdown.trimEnd().split("\n");
    expect(lines[0]).toBe(
      '<!-- ease:source ref="knowledge/shader-gradient/catalog.json" captured="202606" url="https://github.com/ruucm/shadergradient" -->',
    );
    expect(lines[2]).toBe("| Preset | slug | mesh | Narrative job | Anti-use | Required fallback |");
    expect(lines[3]).toBe("|---|---|---|---|---|---|");
    expect(lines).toHaveLength(6); // marker, blank, header, separator, 2 rows
  });

  it("fills the machine columns and leaves the three prose columns empty", () => {
    const r = emitGradientMatrix(LEDGER, { captured: "202606" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.markdown).toContain("| Halo | `halo` | plane |  |  |  |");
    expect(r.markdown).toContain("| Nighty night | `nighty-night` | waterPlane |  |  |  |");
  });

  it("emits rows in ledger order, not sorted", () => {
    const r = emitGradientMatrix(LEDGER, { captured: "202606" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.markdown.indexOf("`halo`")).toBeLessThan(r.markdown.indexOf("`nighty-night`"));
  });

  it("is deterministic — same input, byte-identical output", () => {
    const a = emitGradientMatrix(LEDGER, { captured: "202606" });
    const b = emitGradientMatrix(LEDGER, { captured: "202606" });
    if (!a.ok || !b.ok) throw new Error("expected ok");
    expect(a.markdown).toBe(b.markdown);
  });

  it("stamps the caller's captured value, never a clock", () => {
    const r = emitGradientMatrix(LEDGER, { captured: "209901" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.markdown).toContain('captured="209901"');
  });
});

describe("emitGradientMatrix — refusals", () => {
  it("rejects an unparseable ledger with BAD_LEDGER", () => {
    const r = emitGradientMatrix("{not json", { captured: "202606" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("BAD_LEDGER");
  });

  it("rejects a ledger missing the surfaces array", () => {
    const bad = JSON.stringify({ revision: REVISION, captured: "202606", presets: [] });
    const r = emitGradientMatrix(bad, { captured: "202606" });
    expect(r.ok).toBe(false);
  });

  it("rejects a preset carrying a mesh outside the enum", () => {
    const bad = JSON.stringify({
      revision: REVISION,
      captured: "202606",
      presets: [{ slug: "x", name: "X", mesh: "torus", light: "3d", grain: false }],
      surfaces: [],
    });
    const r = emitGradientMatrix(bad, { captured: "202606" });
    expect(r.ok).toBe(false);
  });
});

describe("emitGradientMatrix — round-trip with the linter (the pair agrees)", () => {
  it("an emitted matrix fails ONLY on the empty prose cells, never on a machine column", () => {
    const r = emitGradientMatrix(LEDGER, { captured: "202606" });
    if (!r.ok) throw new Error("expected ok");
    const doc = `Pinned revision: \`${REVISION}\`.\n\n${r.markdown}`;
    const ids = gradientCatalogChecks({
      knowledgeFileContent: doc,
      catalogJson: LEDGER,
      asOf: "202608",
    }).map((f) => f.checkId);
    // Exactly one field-empty per emitted row, and nothing else. If a machine
    // column disagreed, slug-unknown / row-drift / slug-missing would appear here.
    expect(ids).toEqual(["gradient-catalog-field-empty", "gradient-catalog-field-empty"]);
  });

  it("filling the three prose cells clears the linter entirely", () => {
    const r = emitGradientMatrix(LEDGER, { captured: "202606" });
    if (!r.ok) throw new Error("expected ok");
    const filled = r.markdown.replace(
      /\|\s+\|\s+\|\s+\|$/gm,
      "| a job | an anti-use | Frozen field + a token-derived gradient |",
    );
    const doc = `Pinned revision: \`${REVISION}\`.\n\n${filled}`;
    const ids = gradientCatalogChecks({
      knowledgeFileContent: doc,
      catalogJson: LEDGER,
      asOf: "202608",
    }).map((f) => f.checkId);
    expect(ids).toEqual([]);
  });
});
