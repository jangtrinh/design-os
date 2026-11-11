/**
 * Fix round 3, section S: one string masker for the export reader and the style reader. A quote closes on its own line or
 * it is not a string, and a quote directly after a letter, a digit or `_` opens nothing, so an apostrophe in markup text
 * (`Don't`, `it's`) hides no class attribute. `--apply` writes these links into `tokensUsed`, so every case goes through
 * the register preview too.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blankStrings, stringMask } from "../src/core/ds-surface/source-text-masks.js";
import { buildTokenLookup, readStyleReferences } from "../src/core/ds-surface/style-references.js";
import { envelope, sealedFixture, surface } from "./ds-surface-helpers.js";

const lookup = buildTokenLookup({
  color: { primary: { $type: "color", $value: "#111" }, ink: { $type: "color", $value: "#000" }, surface: { $type: "color", $value: "#fff" } },
});
const read = (src: string) => readStyleReferences("x/Zed.tsx", src, lookup);
const previewTokens = (source: string): string[] => {
  const p = sealedFixture();
  writeFileSync(join(p, "src", "components", "ui", "Zed.tsx"), source);
  const rec = (envelope(surface(p, "--register").out).data!["register"]["records"] as { name: string; tokensUsed: string[] }[]).find((r) => r.name === "Zed");
  return rec?.tokensUsed ?? ["<no record>"];
};

const cases: [string, string, string[]][] = [
  ["an apostrophe in text, a class attribute on a later line", "export const Zed = () => (\n  <div>\n    <p>Don't forget</p>\n    <b className=\"text-primary bg-surface\">x</b>\n  </div>\n);\n", ["color.primary", "color.surface"]],
  ["two apostrophes on one line, a class attribute on the next", "export const Zed = () => (\n  <div>\n    <p>Don't and it's</p>\n    <b className=\"bg-primary\">x</b>\n  </div>\n);\n", ["color.primary"]],
  ["two apostrophes on one line around a class attribute", "export const Zed = () => (\n  <p>Don't <b className=\"bg-primary\">x</b> it's</p>\n);\n", ["color.primary"]],
  ["a single-quoted class attribute after an apostrophe on one line", "export const Zed = () => <p>It's <b className='text-primary'>x</b></p>;\n", ["color.primary"]],
  ["a digit and a double quote in text", "export const Zed = () => (\n  <div>\n    <p>A 5\" pipe</p>\n    <b className=\"bg-ink\">x</b>\n  </div>\n);\n", ["color.ink"]],
  ["a quote after a space that never closes on its line", "export const Zed = () => (\n  <div>\n    <p>Go 'round</p>\n    <b className=\"bg-primary\">x</b>\n    <p>and 'round again</p>\n  </div>\n);\n", ["color.primary"]],
  ["several apostrophes in text before several class attributes", "export const Zed = () => (\n  <div>\n    <p>Don't</p>\n    <i className=\"bg-primary\" />\n    <p>you're</p>\n    <i className=\"bg-ink\" />\n  </div>\n);\n", ["color.ink", "color.primary"]],
];

describe("an apostrophe in markup text hides no class attribute", () => {
  it.each(cases)("%s: the style reader resolves it", (_n, src, tokens) => {
    const r = read(src);
    expect(r.tokens).toEqual(tokens);
    expect(r.unresolvedStyles).toBe(0);
  });
  it.each(cases)("%s: the register preview links it", (_n, src, tokens) => {
    expect(previewTokens(src)).toEqual(tokens);
  });
});

describe("a class attribute inside a real string is still not read", () => {
  it("a quoted and a templated string that hold one", () => {
    expect(read(`const doc = 'use className="bg-primary"';\nconst t = \`<i className="bg-ink">\`;\nexport const Zed = () => <i />;`).tokens).toEqual([]);
  });
  it("a real string after an apostrophe in text still masks its own content", () => {
    expect(read(`const Zed = () => <p>Don't</p>;\nconst doc = 'use className="bg-primary"';\n`).tokens).toEqual([]);
  });
});

describe("the one masker", () => {
  const masked = (s: string): string => [...stringMask(s)].map((b) => (b === 1 ? "#" : ".")).join("");
  it("an apostrophe after a letter, a digit or an underscore opens no string", () => {
    expect(masked("Don't it's 5\" a_'")).toBe(".".repeat("Don't it's 5\" a_'".length));
  });
  it("a quote closes on its own line or it is not a string", () => {
    expect(masked("'open\nclosed'")).toBe(".".repeat(13));
    expect(masked("x = 'a' + \"b\"")).toBe("....###...###");
  });
  it("a template literal with a nested template is one string", () => {
    expect(masked("a `x ${`y`} z` b")).toBe("..############..");
  });
  it("blanking keeps length and lines, and keeps a module specifier", () => {
    const s = "const a = 'ab';\nexport * from \"./x\";\nconst t = `l1\nl2`;";
    const out = blankStrings(s);
    expect(out).toHaveLength(s.length);
    expect(out.split("\n")).toHaveLength(s.split("\n").length);
    expect(out).toContain('from "./x"');
    expect(out).not.toContain("ab");
    expect(out).not.toContain("l1");
  });
});
