/**
 * Fix round 3, section R: an `export` keyword is read as a declaration only at statement position (bracket depth 0, and
 * the first token of its line or directly after `;` or `}`). Any other keyword is listed under `unread` and never
 * becomes a component, a re-export or a collision member; the count stays claimed + listed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readComponentExports } from "../src/core/ds-surface/source-export-reader.js";
import { answerKind, envelope, sealedFixture, surface } from "./ds-surface-helpers.js";
import { cleanButtons } from "./ds-surface-questions-helpers.js";

const COLLISION = "component-name-collision";

const NOT_AT_STATEMENT = /not at the start of a top-level statement/;
const read = (src: string) => readComponentExports("src/components/P.tsx", src);
const names = (r: ReturnType<typeof read>): string[] => r.components.map((c) => c.name);
const USAGE = (inner: string): string => ["export function Usage() {", "  return (", "    <pre>", `      ${inner}`, "    </pre>", "  );", "}", ""].join("\n");

describe("the reviewer's three probes", () => {
  it("an export inside a regular-expression literal is listed, not read", () => {
    const r = read("const re = / export function Fake() { return <div/> }/;\n");
    expect(names(r)).toEqual([]);
    expect(r.unread).toEqual([expect.objectContaining({ name: "Fake", line: 1, reason: expect.stringMatching(NOT_AT_STATEMENT) })]);
    expect(r.accounting.keywords).toBe(1);
    expect(r.accounting.claimed + r.accounting.listed).toBe(1);
  });
  it("an export in JSX text is listed, not read", () => {
    const r = read(USAGE("export const Card = () => null;"));
    expect(names(r)).toEqual(["Usage"]);
    expect(r.unread).toEqual([expect.objectContaining({ name: "Card", line: 4, reason: expect.stringMatching(NOT_AT_STATEMENT) })]);
    expect(r.accounting.keywords).toBe(2);
    expect(r.accounting.claimed + r.accounting.listed).toBe(2);
  });
  it("an export inside a template nested in a template is masked: no component, nothing counted", () => {
    const r = read("const t = `outer ${`export function Ghost() { return <div/> }`} end`;\nexport function Real() { return <i />; }\n");
    expect(names(r)).toEqual(["Real"]);
    expect(r.accounting).toEqual({ keywords: 1, claimed: 1, listed: 0 });
  });
});

describe("the keywords of a file = claimed + listed, with the position rule", () => {
  const src = [
    "export function Top() { return <i />; }", // statement position
    "const a = 1; export function AfterSemicolon() { return <i />; }", // after `;`
    "function G() { return <b>x</b>; } export function AfterBrace() { return <i />; }", // after `}`
    "const re = / export function InRegex() { return <i /> }/;", // not first token
    "export function Holder() {",
    "  return (",
    "    <p>",
    "      export function InText() { return <i />; }", // depth 2
    "    </p>",
    "  );",
    "}",
    "",
  ].join("\n");
  const r = read(src);
  it("reads the top-level ones and lists the others by name and line", () => {
    expect(names(r).sort()).toEqual(["AfterBrace", "AfterSemicolon", "Holder", "Top"]);
    expect(r.unread.map((u) => [u.name, u.line])).toEqual([["InRegex", 4], ["InText", 8]]);
  });
  it("counts every keyword", () => {
    expect(r.accounting.keywords).toBe(6);
    expect(r.accounting.claimed + r.accounting.listed).toBe(6);
  });
});

describe("bracket depth never goes below zero", () => {
  it("a closer in markup text at the top level does not hide a later export", () => {
    const r = read("export const Alpha = () => <ul><li>1) first</li></ul>;\nexport const Beta = () => <b />;\n");
    expect(names(r)).toEqual(["Alpha", "Beta"]);
    expect(r.unread).toEqual([]);
  });
  it("a closing brace or bracket in text does the same", () => {
    const r = read("export const Alpha = () => <p>} ]</p>;\nexport const Beta = () => <b />;\n");
    expect(names(r)).toEqual(["Alpha", "Beta"]);
  });
});

describe("a namespace or an ambient module body is listed, not read", () => {
  it("export inside `namespace X { … }`", () => {
    const r = read("namespace X {\n  export function Inner() { return <i />; }\n}\nexport function After() { return <i />; }\n");
    expect(names(r)).toEqual(["After"]);
    expect(r.unread).toEqual([expect.objectContaining({ name: "Inner", line: 2, reason: expect.stringMatching(NOT_AT_STATEMENT) })]);
  });
  it('export inside `declare module "x" { … }`', () => {
    const r = read('declare module "x" {\n  export const Y: () => JSX.Element;\n}\nexport function After() { return <i />; }\n');
    expect(names(r)).toEqual(["After"]);
    expect(r.unread.map((u) => u.name)).toEqual(["Y"]);
  });
});

describe("the whole-text reader of `export { … }` follows the same rule", () => {
  it("a braced export in JSX text is not read, and is listed", () => {
    const r = read("function Inner() { return <i />; }\nexport function Usage() {\n  return (\n    <pre>\n      export { Inner };\n    </pre>\n  );\n}\n");
    expect(names(r)).toEqual(["Usage"]);
    expect(r.accounting.claimed + r.accounting.listed).toBe(r.accounting.keywords);
    expect(r.unread.map((u) => u.reason)).toEqual([expect.stringMatching(NOT_AT_STATEMENT)]);
  });
  it("a braced re-export in JSX text is no re-export", () => {
    const r = read('export function Usage() {\n  return (\n    <pre>\n      export { X } from "./x";\n    </pre>\n  );\n}\n');
    expect(r.reExports).toEqual([]);
  });
  it("a top-level one is still read", () => {
    const r = read('function Inner() { return <i />; }\nexport { Inner as default };\nexport { Y } from "./y";\n');
    expect(names(r)).toEqual(["Inner"]);
    expect(r.reExports).toHaveLength(1);
  });
});

describe("a template literal that never closes", () => {
  const r = read("const a = `never closes;\nexport function Hidden() { return <i />; }\n");
  it("lists the file once, with the reason", () => {
    expect(names(r)).toEqual([]);
    expect(r.unread).toHaveLength(1);
    expect(r.unread[0]!.reason).toMatch(/template literal never closes/);
    expect(r.unread[0]!.line).toBe(1);
  });
});

describe("through the command: the file of the controller's reproduction", () => {
  const withUsage = (inner: string): string => {
    const p = sealedFixture();
    writeFileSync(join(p, "src/components/ui/Usage.tsx"), USAGE(inner));
    return p;
  };
  it("a Tooltip in a <pre> is no component, and is listed under unread", () => {
    const d = envelope(surface(withUsage("export const Tooltip = () => null;")).out).data!;
    const comps = (d["components"] as { name: string }[]).map((c) => c.name);
    expect(comps).toContain("Usage");
    expect(comps).not.toContain("Tooltip");
    expect(d["unread"].exports).toEqual([expect.objectContaining({ name: "Tooltip", file: "src/components/ui/Usage.tsx", line: 4 })]);
  });
  it("--register --apply writes no Tooltip record", () => {
    const p = withUsage("export const Tooltip = () => null;");
    surface(p);
    expect(answerKind(p, COLLISION, (k) => ({ choice: k.options[0]!.id })).code).toBe(0);
    cleanButtons(p);
    const done = surface(p, "--register", "--apply");
    expect(done.code, done.out).toBe(0);
    const registry = JSON.parse(readFileSync(join(p, "design", "component-registry.json"), "utf8")) as { components: { name: string }[] };
    expect(registry.components.map((c) => c.name)).toContain("Usage");
    expect(registry.components.map((c) => c.name)).not.toContain("Tooltip");
  });
  it("a Card in the same <pre> raises no collision with the real Card", () => {
    const base = envelope(surface(sealedFixture()).out).data!;
    const d = envelope(surface(withUsage("export const Card = () => null;")).out).data!;
    expect((d["collisions"] as { name: string }[]).map((c) => c.name)).toEqual(["Button"]);
    expect(d["pending"].count).toBe(base["pending"].count);
  });
});
