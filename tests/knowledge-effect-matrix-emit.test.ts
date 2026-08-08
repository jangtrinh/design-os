/**
 * emitEffectMatrix (knowledge-effect-matrix-emit.ts) — the Art II EMITTER half
 * of the Canvas UI adoption pair (spec 028 §8.1, §9). M1-M5 exercise the
 * emitter in isolation; M6 is the pair-coherence proof — splice the emitted
 * output into a knowledge-file fixture and run it through the real
 * `lintKnowledge` to show the emitter and effectCatalogChecks agree on row
 * shape.
 */
import { describe, expect, it } from "vitest";

import { emitEffectMatrix } from "../src/core/knowledge-effect-matrix-emit.js";
import { lintKnowledge } from "../src/core/knowledge-lint.js";

const REVISION = "728550d4523e1b8bef834b64b3e936c215cad630";

const FIXTURE_CATALOG = {
  upstream: "https://github.com/DavidHDev/canvas-ui",
  revision: REVISION,
  captured: "202607",
  license: "MIT + Commons Clause",
  effects: [
    { slug: "asciify", name: "Asciify", family: "live-html", overlayFallback: true },
    { slug: "dithered-object", name: "Dithered Object", family: "object", overlayFallback: false },
  ],
};

const FIXTURE_JSON = JSON.stringify(FIXTURE_CATALOG);

describe("emitEffectMatrix — M1 determinism", () => {
  it("two calls on the same input return identical bytes", () => {
    const a = emitEffectMatrix(FIXTURE_JSON, { captured: "202607" });
    const b = emitEffectMatrix(FIXTURE_JSON, { captured: "202607" });
    expect(a).toEqual(b);
  });
});

describe("emitEffectMatrix — M2 roster fidelity", () => {
  it("emits one row per ledger effect, in ledger order, with matching Effect/slug/family", () => {
    const result = emitEffectMatrix(FIXTURE_JSON, { captured: "202607" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.markdown
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.includes("Effect") && !l.includes("---"));
    expect(rows.length).toBe(FIXTURE_CATALOG.effects.length);
    rows.forEach((row, i) => {
      const cells = row.slice(1, -1).split("|").map((c) => c.trim());
      const effect = FIXTURE_CATALOG.effects[i]!;
      expect(cells[0]).toBe(effect.name);
      expect(cells[1]).toBe(`\`${effect.slug}\``);
      expect(cells[2]).toBe(effect.family);
    });
  });

  it("emits no row the ledger does not carry", () => {
    const result = emitEffectMatrix(FIXTURE_JSON, { captured: "202607" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const slug of ["ghost", "unknown-effect"]) {
      expect(result.markdown.includes(`\`${slug}\``)).toBe(false);
    }
  });
});

describe("emitEffectMatrix — M3 empty prose cells", () => {
  it("emits Narrative job / Anti-use / Required fallback empty for every row", () => {
    const result = emitEffectMatrix(FIXTURE_JSON, { captured: "202607" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = result.markdown
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.includes("Effect") && !l.includes("---"));
    for (const row of rows) {
      const cells = row.slice(1, -1).split("|").map((c) => c.trim());
      expect(cells[3]).toBe("");
      expect(cells[4]).toBe("");
      expect(cells[5]).toBe("");
    }
  });
});

describe("emitEffectMatrix — M4 provenance marker", () => {
  it("emits exactly one ease:source marker carrying the ledger's captured stamp", () => {
    const result = emitEffectMatrix(FIXTURE_JSON, { captured: "202607" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const markers = result.markdown.match(/<!--\s*ease:source\b[^>]*-->/g) ?? [];
    expect(markers.length).toBe(1);
    expect(markers[0]).toContain('ref="knowledge/canvas-ui/catalog.json"');
    expect(markers[0]).toContain('captured="202607"');
    expect(result.markdown.indexOf(markers[0]!)).toBe(0);
  });
});

describe("emitEffectMatrix — M5 bad-ledger paths", () => {
  it("returns ok:false for unparseable JSON", () => {
    const result = emitEffectMatrix("{not json", { captured: "202607" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("BAD_LEDGER");
  });

  it("returns ok:false when effects is missing", () => {
    const result = emitEffectMatrix(JSON.stringify({ ...FIXTURE_CATALOG, effects: undefined }), { captured: "202607" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("BAD_LEDGER");
  });

  it("returns ok:false for a bad family value, never a partial matrix", () => {
    const bad = { ...FIXTURE_CATALOG, effects: [{ slug: "x", name: "X", family: "not-a-real-family", overlayFallback: false }] };
    const result = emitEffectMatrix(JSON.stringify(bad), { captured: "202607" });
    expect(result.ok).toBe(false);
  });

  it("[R] returns ok:false for the removed family:'overlay' value", () => {
    const bad = { ...FIXTURE_CATALOG, effects: [{ slug: "x", name: "X", family: "overlay", overlayFallback: true }] };
    const result = emitEffectMatrix(JSON.stringify(bad), { captured: "202607" });
    expect(result.ok).toBe(false);
  });

  it("[R] returns ok:false when overlayFallback is missing", () => {
    const bad = { ...FIXTURE_CATALOG, effects: [{ slug: "x", name: "X", family: "live-html" }] };
    const result = emitEffectMatrix(JSON.stringify(bad), { captured: "202607" });
    expect(result.ok).toBe(false);
  });

  it("[R] returns ok:false when overlayFallback is not a boolean", () => {
    const bad = { ...FIXTURE_CATALOG, effects: [{ slug: "x", name: "X", family: "live-html", overlayFallback: "yes" }] };
    const result = emitEffectMatrix(JSON.stringify(bad), { captured: "202607" });
    expect(result.ok).toBe(false);
  });
});

describe("emitEffectMatrix — M6 round-trip (pair-coherence proof)", () => {
  it("emit -> splice into a minimal knowledge fixture -> lintKnowledge -> only field-empty findings", () => {
    const emitted = emitEffectMatrix(FIXTURE_JSON, { captured: FIXTURE_CATALOG.captured });
    expect(emitted.ok).toBe(true);
    if (!emitted.ok) return;

    const canvasEffectDirection = [
      "# Canvas UI External-Effect Direction",
      "",
      `Pinned revision: \`${REVISION}\``,
      "",
      emitted.markdown,
    ].join("\n");

    const readme = [
      "# Knowledge",
      "",
      "## The files",
      "",
      "| File | Covers |",
      "|---|---|",
      "| `persona-index.md` | Persona lookup |",
      "| `canvas-effect-direction.md` | Canvas UI effect matrix |",
      "",
    ].join("\n");

    const personaIndex = ["# Persona Index", "", "## 1. Lookup Table", "", "| Slug | Family |", "|---|---|", ""].join(
      "\n",
    );

    const findings = lintKnowledge({
      files: ["README.md", "persona-index.md", "canvas-effect-direction.md"],
      mdContents: {
        "README.md": readme,
        "persona-index.md": personaIndex,
        "canvas-effect-direction.md": canvasEffectDirection,
      },
      personasJson: "[]",
      repoFiles: [
        "knowledge/README.md",
        "knowledge/persona-index.md",
        "knowledge/canvas-effect-direction.md",
        "knowledge/canvas-ui/catalog.json",
      ],
      asOf: FIXTURE_CATALOG.captured,
      canvasCatalogJson: FIXTURE_JSON,
    });

    const other = findings.filter((f) => f.checkId !== "effect-catalog-field-empty");
    expect(other).toEqual([]);

    const fieldEmpty = findings.filter((f) => f.checkId === "effect-catalog-field-empty");
    expect(fieldEmpty.length).toBe(FIXTURE_CATALOG.effects.length);
  });
});
