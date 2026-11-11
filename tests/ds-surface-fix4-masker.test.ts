/**
 * Fix round 4, sections Z1 and Z2: comments and strings are recognised in one pass (a `/*` or `//` inside a string or a
 * template is text, a quote inside a comment is text), and a quote glued to a JavaScript keyword opens a string.
 * Every case also goes through the register preview, because `--apply` writes these facts into the registry.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readComponentExports } from "../src/core/ds-surface/source-export-reader.js";
import { blankComments, stringMask } from "../src/core/ds-surface/source-text-masks.js";
import { buildTokenLookup, readStyleReferences } from "../src/core/ds-surface/style-references.js";
import { envelope, sealedFixture, surface } from "./ds-surface-helpers.js";

const lookup = buildTokenLookup({
  color: { primary: { $type: "color", $value: "#111" }, ink: { $type: "color", $value: "#000" }, surface: { $type: "color", $value: "#fff" } },
});
type Rec = { name: string; tokensUsed: string[] };
/** Writes `source` as Probe.tsx into the sealed fixture and returns the surface data and the register preview records. */
function through(source: string): { components: string[]; records: Rec[]; unread: { name: string; reason: string }[] } {
  const p = sealedFixture();
  writeFileSync(join(p, "src", "components", "ui", "Probe.tsx"), source);
  const d = envelope(surface(p, "--register").out).data!;
  const records = (d["register"]["records"] as (Rec & { sourceRef: string })[]).filter((r) => r.sourceRef.startsWith("src/components/ui/Probe.tsx"));
  return { components: (d["components"] as { name: string; file: string }[]).filter((c) => c.file.endsWith("Probe.tsx")).map((c) => c.name), records, unread: d["unread"].exports };
}
const read = (src: string) => readComponentExports("src/components/P.tsx", src);

describe("Z1: a comment opener inside a string is text", () => {
  const B1 = [
    "/** Icons by name. */",
    'const icons = import.meta.glob("./svg/*.svg", { eager: true });',
    'export function Icon({ name }: { name: string }) { return <span className="text-primary">{name}</span>; }',
    "/**",
    " * A large icon.",
    " */",
    'export function BigIcon() { return <span className="bg-ink">big</span>; }',
    "",
  ].join("\n");
  it("the review's glob file: Icon and BigIcon are read, with their tokens, and nothing is listed", () => {
    const r = read(B1);
    expect(r.components.map((c) => c.name)).toEqual(["Icon", "BigIcon"]);
    expect(r.unread).toEqual([]);
    const got = through(B1);
    expect(got.components).toEqual(["BigIcon", "Icon"]);
    expect(Object.fromEntries(got.records.map((x) => [x.name, x.tokensUsed]))).toEqual({ Icon: ["color.primary"], BigIcon: ["color.ink"] });
  });
  it("accept=\"image/*\" in markup followed by a later block comment hides no export", () => {
    const src = 'export function Upload() { return <input accept="image/*" className="p-2" />; }\n/** The next one. */\nexport function Next() { return <i />; }\n';
    expect(read(src).components.map((c) => c.name)).toEqual(["Upload", "Next"]);
    expect(through(src).components).toEqual(["Next", "Upload"]);
  });
  it("`a // b` and `a /* b` in templates, then an export and a later block comment: the file is decided and read", () => {
    const src = "const a = `a // b`;\nconst b = `a /* b`;\nexport function Real() { return <i />; }\n/* tail */\n";
    const r = read(src);
    expect(r.components.map((c) => c.name)).toEqual(["Real"]);
    expect(r.unread).toEqual([]);
  });
  it("a quote inside a line comment and inside a block comment opens no string", () => {
    const src = "// don't\n/* it's */\nexport function Real() { return <i className=\"bg-ink\" />; }\n";
    expect(read(src).components.map((c) => c.name)).toEqual(["Real"]);
    const style = readStyleReferences("x/Real.tsx", "// don't\nexport const Real = () => <i className=\"bg-primary\" />;\n/* it's */\n", lookup);
    expect(style.tokens).toEqual(["color.primary"]);
  });
  it("the style reader's comments are the one masker's: a `//` after `}` hides no class and reads none", () => {
    const style = readStyleReferences("x/Real.tsx", 'export const Real = () => { return <b className="text-primary" />;}// was <i className="bg-surface"/>\n', lookup);
    expect(style.tokens).toEqual(["color.primary"]);
  });
  it("a helper call whose argument holds a closing parenthesis in a string is still one call", () => {
    expect(readStyleReferences("x/A.tsx", 'export const A = () => <i className={cn("a)", /* ) */ "b")} />;\n', lookup).unresolved.helperCall).toBe(1);
  });
  it("blankComments keeps length and lines, and leaves a glob string alone", () => {
    const s = 'const g = "./a/*.svg"; // c\n/* x\ny */ const z = 1;';
    const out = blankComments(s);
    expect(out).toHaveLength(s.length);
    expect(out.split("\n")).toHaveLength(3);
    expect(out).toContain('"./a/*.svg"');
    expect(out).not.toContain("// c");
  });
});

describe("Z2: a quote glued to a keyword opens a string", () => {
  const masked = (s: string): string => [...stringMask(s)].map((b) => (b === 1 ? "#" : ".")).join("");
  it("return, typeof, case and friends", () => {
    expect(masked('return"x"')).toBe("......###");
    expect(masked('typeof"`"')).toBe("......###");
    expect(masked('case"a":')).toBe("....###.");
    expect(masked("else'x'")).toBe("....###");
  });
  it("Don't, it's and 5\" stay text, and so does a property named like a keyword", () => {
    expect(masked("Don't it's 5\" a.in'")).toBe(".".repeat("Don't it's 5\" a.in'".length));
  });
  it("the review's file A: a backtick in a keyword-glued string does not flip the template phase", () => {
    const src = 'const a = typeof"`";\nconst t = `\nexport function Ghost() { return <b/>; }\n`;\nconst b = typeof"`";\nexport function Real() { return <i className="text-primary"/>; }\n';
    const r = read(src);
    expect(r.components.map((c) => c.name)).toEqual(["Real"]);
    expect(r.unread).toEqual([]);
    const got = through(src);
    expect(got.components).toEqual(["Real"]);
    expect(got.records.map((x) => x.name)).toEqual(["Real"]);
  });
  it("the review's file B: a class written inside a keyword-glued string is no token", () => {
    const src = "export function Pick({ k }: { k: string }) {\n  switch (k) { case\"<b className='bg-surface'>\": break; }\n  return <i className=\"text-primary\" />;\n}\n";
    expect(through(src).records.find((x) => x.name === "Pick")!.tokensUsed).toEqual(["color.primary"]);
  });
});
