/**
 * A token written from CSS answers under the custom property it came from, and under no other name: the name the kernel
 * derives from its path exists nowhere in that project's CSS. A token without the extension answers as it always did.
 * A name two tokens would answer stays ambiguous and is counted, never guessed.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CUSTOM_PROPERTY_EXTENSION } from "../src/core/token-model.js";
import type { TokenTree } from "../src/core/token-model.js";
import { buildTokenLookup, readStyleReferences } from "../src/core/ds-surface/style-references.js";
import { capture } from "./owner-rulings-helpers.js";
import { build, ontologyOf } from "./ontology-helpers.js";
import { envelope, pkg, projectFrom, surface } from "./ds-surface-helpers.js";

const from = (property: string) => ({ [CUSTOM_PROPERTY_EXTENSION]: property });
const color = (value: string, property?: string) => ({ $type: "color" as const, $value: value, ...(property === undefined ? {} : { $extensions: from(property) }) });

// The packaged-theme shape: the project's own `--mu-surface`, and the Tailwind alias `--color-mu-surface: var(--mu-surface)`.
const THEME: TokenTree = {
  color: {
    "mu-surface": color("#fafafa", "--mu-surface"),
    "color-mu-surface": color("#fafafa", "--color-mu-surface"),
    "color-mu-ink": color("#111111", "--color-mu-ink"),
  },
};
const comp = (body: string): string => `export const A = () => ${body};`;

describe("a token with the extension answers under its source name only", () => {
  const lookup = buildTokenLookup(THEME);
  it("--mu-surface is color.mu-surface; the path-derived name color-mu-surface is the alias's, not the token's", () => {
    expect(lookup.resolve("mu-surface")).toBe("color.mu-surface");
    expect(lookup.resolve("color-mu-surface")).toBe("color.color-mu-surface");
    expect(lookup.answers("color-mu-surface")).toBe(1);
  });
  it("a name that only the path would give is no answer: color.mu-surface does not answer color-mu-surface by itself", () => {
    const only = buildTokenLookup({ color: { "mu-surface": color("#fff", "--mu-surface") } });
    expect(only.resolve("color-mu-surface")).toBeNull();
    expect(only.answers("color-mu-surface")).toBe(0);
    expect(only.resolve("mu-surface")).toBe("color.mu-surface");
  });
  it("bg-mu-surface resolves to the token read from --color-mu-surface, and var(--mu-surface) to the one read from --mu-surface", () => {
    const r = readStyleReferences("x/A.tsx", comp('<i className="bg-mu-surface" style={{ color: "var(--mu-surface)" }} />'), lookup);
    expect(r.tokens).toEqual(["color.color-mu-surface", "color.mu-surface"]);
    expect(r.unresolved.ambiguousToken).toBe(0);
  });
});

describe("a token without the extension answers exactly as before", () => {
  const plain = buildTokenLookup({
    color: { primary: color("#111"), "color-brand": color("#222") },
    space: { md: { $type: "dimension", $value: "4px" } },
  });
  it("by the name its path gives, and by the leaf that starts with its group", () => {
    expect(plain.resolve("color-primary")).toBe("color.primary");
    expect(plain.resolve("space-md")).toBe("space.md");
    expect(plain.resolve("color-brand")).toBe("color.color-brand");
    expect(plain.resolve("primary")).toBeNull();
  });
  it("a token with a malformed extension value is a token without it", () => {
    const bad = buildTokenLookup({ color: { primary: { $type: "color", $value: "#111", $extensions: { [CUSTOM_PROPERTY_EXTENSION]: "primary" } } } });
    expect(bad.resolve("color-primary")).toBe("color.primary");
  });
});

describe("a store that mixes both", () => {
  const mixed = buildTokenLookup({
    color: { "mu-surface": color("#fafafa", "--mu-surface"), ink: color("#111"), "color-line": color("#ccc") },
  });
  it("answers each kind by its own rule", () => {
    expect(mixed.resolve("mu-surface")).toBe("color.mu-surface");
    expect(mixed.resolve("color-mu-surface")).toBeNull();
    expect(mixed.resolve("color-ink")).toBe("color.ink");
    expect(mixed.resolve("color-line")).toBe("color.color-line");
  });
});

describe("two tokens that still share a name stay ambiguous and are counted", () => {
  it("two tokens read from the same property: nothing resolves, and the utility is counted as ambiguous", () => {
    const twice = buildTokenLookup({ color: { a: color("#111", "--color-x"), b: color("#222", "--color-x") } });
    expect(twice.resolve("color-x")).toBeNull();
    expect(twice.answers("color-x")).toBe(2);
    const r = readStyleReferences("x/A.tsx", comp('<i className="bg-x" />'), twice);
    expect(r.tokens).toEqual([]);
    expect(r.unresolved.ambiguousToken).toBe(1);
    expect(r.utilitiesNamingNoToken).toBe(0);
  });
  it("a token read from --color-x and a token without the extension whose path gives color-x", () => {
    const clash = buildTokenLookup({ color: { a: color("#111", "--color-x"), x: color("#222") } });
    expect(clash.resolve("color-x")).toBeNull();
    expect(clash.answers("color-x")).toBe(2);
  });
});

describe("through the command: a store ingested from CSS resolves the properties the project's own source writes", () => {
  const dtcg = {
    color: {
      "x": { $type: "color", $value: "#111111", $extensions: from("--x") },
      "color-x": { $type: "color", $value: "#111111", $extensions: from("--color-x") },
      "color-y": { $type: "color", $value: "#222222", $extensions: from("--color-y") },
    },
  };
  const swatch = [
    'import React from "react";',
    "export const Swatch = () => (",
    '  <div className="bg-x text-y" style={{ borderColor: "var(--x)" }}>swatch</div>',
    ");",
    "",
  ].join("\n");
  const app = (): string => {
    const files: Record<string, string> = { "package.json": pkg({ react: "18" }), "src/components/Swatch.tsx": swatch };
    for (const n of ["A", "B"]) files[`src/components/${n}.tsx`] = `export function ${n}Thing() { return <div className="x" />; }\n`;
    const project = projectFrom(files);
    const tokens = join(mkdtempSync(join(tmpdir(), "ds-source-names-")), "tokens.json");
    writeFileSync(tokens, JSON.stringify(dtcg));
    const done = capture(["ds", "import", tokens, "--dir", project, "--json"]);
    if (done.code !== 0) throw new Error(`import failed: ${done.out}${done.err}`);
    return project;
  };

  it("bg-x is the token read from --color-x, var(--x) the one read from --x, and neither is ambiguous", () => {
    const d = envelope(surface(app()).out).data!;
    const swatchRecord = d["components"].find((c: { name: string }) => c.name === "Swatch");
    expect(swatchRecord.tokens).toEqual(["color.color-x", "color.color-y", "color.x"]);
    expect(swatchRecord.unresolved.ambiguousToken).toBe(0);
    expect(swatchRecord.utilitiesNamingNoToken).toBe(0); // text-y names --color-y, a token: it resolves too
  });
  it("the registry record the preview carries has them in tokensUsed", () => {
    const d = envelope(surface(app(), "--register").out).data!["register"];
    const rec = d["records"].find((r: { name: string }) => r.name.startsWith("Swatch")) ?? { tokensUsed: JSON.stringify(d) };
    expect(rec.tokensUsed).toEqual(["color.color-x", "color.color-y", "color.x"]);
  });
  it("ui ontology build links the registered component to the tokens it references", () => {
    const p = app();
    const applied = surface(p, "--register", "--apply");
    expect(applied.code, `${applied.out}${applied.err}`).toBe(0);
    const built = build(p);
    expect(built.code, `${built.out}${built.err}`).toBe(0);
    const consumed = ontologyOf(p).links.filter((l) => l.kind === "consumes-token" && l.from.includes("Swatch")).map((l) => l.to).sort();
    expect(consumed).toEqual(["token:color.color-x", "token:color.color-y", "token:color.x"]);
  });
  it("the same input twice gives the same bytes", () => {
    const p = app();
    surface(p, "--register"); // a read leaves pending.json in the project, which the next read counts as a file it visited
    expect(surface(p, "--register").out).toBe(surface(p, "--register").out);
  });
});
