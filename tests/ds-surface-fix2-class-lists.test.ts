/**
 * Fix round 2, section M: a class list is read only where markup holds one. A `class=` inside a string or template
 * literal resolves nothing; an attribute that merely ends in `class` is no class attribute; an arbitrary property is
 * counted with the arbitrary values; a utility two tokens answer is counted under a key that is true for it. Each case
 * also goes through the register preview, because `--apply` writes these links into `tokensUsed`.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTokenLookup, readStyleReferences } from "../src/core/ds-surface/style-references.js";
import { envelope, sealedFixture, surface } from "./ds-surface-helpers.js";

const lookup = buildTokenLookup({
  color: { primary: { $type: "color", $value: "#111" }, ink: { $type: "color", $value: "#000" }, brand: { $type: "color", $value: "#222" }, "color-brand": { $type: "color", $value: "#333" } },
});
const read = (src: string) => readStyleReferences("x/A.tsx", src, lookup);
const comp = (body: string): string => `export const A = () => ${body};`;

/** The tokens the register preview links to a component written into the sealed fixture (its store holds color.primary, color.ink, color.surface). */
const previewTokens = (source: string): string[] => {
  const p = sealedFixture();
  writeFileSync(join(p, "src", "components", "ui", "Zed.tsx"), source.replace(/\bA\b/g, "Zed"));
  const rec = (envelope(surface(p, "--register").out).data!["register"]["records"] as { name: string; tokensUsed: string[] }[]).find((r) => r.name === "Zed");
  return rec?.tokensUsed ?? ["<no record>"];
};

describe("a class attribute inside a string resolves nothing", () => {
  const cases: [string, string][] = [
    ["a single-quoted string holding a class attribute", `const doc = 'use className="bg-primary"';\nexport const A = () => <i />;`],
    ["a template literal holding a class attribute", "const doc = `<div className=\"bg-ink\">`;\nexport const A = () => <i />;"],
    ["a data-class attribute", comp('<div data-class="bg-primary" />')],
    ["an aria-class-like attribute whose name ends in class", comp('<div my-class="bg-primary" />')],
  ];
  it.each(cases)("%s: no token, no count", (_n, src) => {
    const r = read(src);
    expect(r.tokens).toEqual([]);
    expect(r.utilitiesNamingNoToken).toBe(0);
  });
  it.each(cases)("%s: the register preview links no token", (_n, src) => {
    expect(previewTokens(src)).toEqual([]);
  });
  it("a real class attribute next to a string still resolves", () => {
    expect(read(`const doc = 'use className="bg-ink"';\nexport const A = () => <i className="bg-primary" />;`).tokens).toEqual(["color.primary"]);
    expect(previewTokens(`const doc = 'x';\nexport const A = () => <i className="bg-primary" />;`)).toEqual(["color.primary"]);
  });
});

describe("an arbitrary property is counted with the arbitrary values", () => {
  it.each(["[color:red]", "[mask-type:luminance]", "hover:[color:red]"])("%s", (cls) => {
    const r = read(comp(`<i className="${cls}" />`));
    expect(r.unresolved.arbitraryValue).toBe(1);
    expect(r.unresolvedStyles).toBe(1);
  });
});

describe("a utility that two tokens answer is counted under a key true for it", () => {
  it("bg-brand names --color-brand, which color.brand and color.color-brand both carry", () => {
    const r = read(comp('<i className="bg-brand" />'));
    expect(r.tokens).toEqual([]);
    expect(r.unresolved.ambiguousToken).toBe(1);
    expect(r.utilitiesNamingNoToken).toBe(0);
    expect(r.unresolvedStyles).toBe(1);
  });
  it("a utility that no token answers is still counted apart as naming no token", () => {
    const r = read(comp('<i className="bg-nothing" />'));
    expect(r.utilitiesNamingNoToken).toBe(1);
    expect(r.unresolved.ambiguousToken).toBe(0);
  });
  it("the lookup tells none, one and several apart", () => {
    expect([lookup.answers("color-nothing"), lookup.answers("color-primary"), lookup.answers("color-brand")]).toEqual([0, 1, 2]);
  });
});
