/**
 * Token links are exact and every style reference is either resolved or counted (review fix round, section C): a custom
 * property resolves only by the name the kernel emits, the bare leaf never resolves, a modifier form resolves the token
 * it names, and each kind that is not resolved is counted under its own key (the sum is `unresolvedStyles`).
 */
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { envelope, pkg, projectFrom, surface } from "./ds-surface-helpers.js";
import { blankHelperCalls, buildTokenLookup, readStyleReferences, sumBreakdown } from "../src/core/ds-surface/style-references.js";

const lookup = buildTokenLookup({
  color: { primary: { $type: "color", $value: "#111" }, surface: { $type: "color", $value: "#fff" }, "color-brand": { $type: "color", $value: "#222" } },
  space: { md: { $type: "dimension", $value: "4px" } },
});
const read = (src: string, file = "x/A.tsx") => readStyleReferences(file, src, lookup);
const comp = (body: string): string => `export const A = () => ${body};`;

describe("a custom property resolves by the name the kernel emits, never by the bare leaf", () => {
  it("--color-primary is color.primary and --space-md is space.md", () => {
    expect(read(comp('<i style={{ color: "var(--color-primary)", margin: "var(--space-md)" }} />')).tokens).toEqual(["color.primary", "space.md"]);
  });
  it("--primary and --md are no token: they are counted as unresolved custom properties", () => {
    const r = read(comp('<i style={{ color: "var(--primary)", margin: "var(--md)" }} />'));
    expect(r.tokens).toEqual([]);
    expect(r.unresolved.customProperty).toBe(2);
  });
  it("the property a CSS-ingested token came from resolves (color.color-brand was --color-brand)", () => {
    expect(read(comp('<i style={{ color: "var(--color-brand)" }} />')).tokens).toEqual(["color.color-brand"]);
  });
  it("the lookup itself has no bare-leaf entry", () => {
    expect(lookup.resolve("primary")).toBeNull();
    expect(lookup.resolve("md")).toBeNull();
    expect(lookup.resolve("color-primary")).toBe("color.primary");
  });
});

describe("a theme-key utility resolves by --color-<key>, the bare leaf never", () => {
  it("bg-primary resolves; bg-md (the leaf of space.md) does not; bg-brand is --color-brand, the property color.color-brand came from", () => {
    expect(read(comp('<i className="bg-primary" />')).tokens).toEqual(["color.primary"]);
    expect(read(comp('<i className="bg-md" />')).tokens).toEqual([]);
    expect(read(comp('<i className="bg-brand" />')).tokens).toEqual(["color.color-brand"]);
  });
  it("a modifier form resolves the token it names: opacity, arbitrary opacity, variants and important", () => {
    for (const cls of ["bg-primary/50", "bg-primary/[.5]", "hover:bg-primary", "dark:md:!bg-primary/[.25]"]) {
      expect(read(comp(`<i className="${cls}" />`)).tokens, cls).toEqual(["color.primary"]);
    }
  });
  it("a utility that names no token is counted apart and is not in the unresolved sum", () => {
    const r = read(comp('<i className="text-sm bg-nope px-4" />'));
    expect(r.utilitiesNamingNoToken).toBe(2);
    expect(r.unresolvedStyles).toBe(0);
  });
});

describe("nothing is invisible: each kind is counted under its own key and the keys add up", () => {
  const kinds: [string, string, keyof ReturnType<typeof read>["unresolved"]][] = [
    ["an arbitrary value", comp('<i className="bg-[#fff]" />'), "arbitraryValue"],
    ["a theme() call in a style", comp('<i style={{ color: "theme(colors.primary)" }} />'), "themeCall"],
    ["a theme() call in an arbitrary class", comp('<i className="bg-[theme(colors.primary)]" />'), "themeCall"],
    ["a class taken from a CSS module", `import styles from "./a.module.css";\n${comp("<i className={styles.primary} />")}`, "cssModuleClass"],
    ["an inline literal colour", comp('<i style={{ color: "#ff0000" }} />'), "literalColor"],
    ["a literal colour function", comp('<i style={{ color: "rgb(1 2 3)" }} />'), "literalColor"],
    ["a helper call", comp('<i className={cn("a", b)} />'), "helperCall"],
    ["an unresolved custom property", comp('<i className="bg-[var(--nope)]" />'), "customProperty"],
  ];
  for (const [name, src, key] of kinds) {
    it(`${name} is counted under ${key}`, () => {
      const r = read(src);
      expect(r.unresolved[key], JSON.stringify(r)).toBe(1);
      expect(r.unresolvedStyles).toBe(1);
      expect(sumBreakdown(r.unresolved)).toBe(r.unresolvedStyles);
    });
  }
  it("a resolved arbitrary custom property is a token, not an arbitrary value", () => {
    const r = read(comp('<i className="bg-[var(--color-primary)]" />'));
    expect(r.tokens).toEqual(["color.primary"]);
    expect(r.unresolvedStyles).toBe(0);
  });
});

describe("classes are read only where a class list can be", () => {
  it("a plain string constant resolves nothing", () => {
    const r = read("const label = 'bg-primary';\n" + comp("<i />"));
    expect(r.tokens).toEqual([]);
  });
  it("a helper name inside a string or a comment counts nothing", () => {
    expect(read(comp('<i title="cn(a)" />')).unresolvedStyles).toBe(0);
    expect(read("// cn(a)\n/* clsx(b) */\n" + comp("<i />")).unresolvedStyles).toBe(0);
    expect(blankHelperCalls('const s = "cn(a)"; const t = cn("x");').calls).toBe(1);
  });
  it("a class attribute resolves, in a template literal too", () => {
    expect(read(comp("<i className={`bg-surface p-2`} />")).tokens).toEqual(["color.surface"]);
  });
});

describe("the surface output carries the breakdown", () => {
  it("per component in JSON, and as one line in the text", () => {
    const p = projectFrom({
      "package.json": pkg({ react: "18" }),
      "src/components/A.tsx": 'export const Aaa = () => <i className="bg-[#fff] text-sm" style={{ color: "#f00" }} />;\n',
      "src/components/B.tsx": "export const Bbb = () => <i />;\n", "src/components/C.tsx": "export const Ccc = () => <i />;\n",
    });
    const a = envelope(surface(p).out).data!["components"][0];
    expect(a).toMatchObject({ name: "Aaa", unresolvedStyles: 2, unresolved: { arbitraryValue: 1, literalColor: 1 }, utilitiesNamingNoToken: 1 });
    expect(capture(["ds", "surface", "--cwd", p]).out).toContain("unresolved by kind: arbitraryValue 1, literalColor 1; 1 theme-key utility name no token");
  });
});
