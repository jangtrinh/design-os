/**
 * Fix round 2, section L: exports are complete by construction. After strings, templates and comments are masked, every
 * `export` keyword is claimed by a reader or listed under `unread`; nothing is dropped by a missing shape.
 */
import { describe, expect, it } from "vitest";
import { readComponentExports } from "../src/core/ds-surface/source-export-reader.js";
import { envelope, pkg, projectFrom, surface } from "./ds-surface-helpers.js";

const MIXED = [
  "﻿export function Bom() { return <i />; }",
  "function Inner() { return <i />; }",
  "export { Inner as default };",
  "export const { Alpha, Beta } = Parts;",
  "export enum Size { S, M }",
  'const u = "http://x"; export function AfterUrl() { return <i />; }',
  'export * as Forms from "./forms";',
  "export type T = string;",
  "export interface P { a: 1 }",
  "export declare const D: number;",
  "export namespace NS { export const Inside = 1; }",
  "export function Plain() { return <b />; }",
  'const s = "export function InString() { return <i />; }";',
  "// export function InComment() { return <i />; }",
  "",
].join("\n");
// The `export` keywords outside strings and comments: Bom, { Inner as default }, { Alpha, Beta }, enum, AfterUrl, * as Forms, type, interface, declare, namespace, Inside, Plain.
const KEYWORDS = 12;

describe("the invariant: masked export keywords = claimed + listed", () => {
  const r = readComponentExports("src/components/Mixed.tsx", MIXED);
  it("counts every export keyword outside strings and comments", () => {
    expect(r.accounting.keywords).toBe(KEYWORDS);
  });
  it("claims or lists every one of them", () => {
    expect(r.accounting.claimed + r.accounting.listed).toBe(r.accounting.keywords);
  });
  it("lists a destructured export, an export-star namespace and a namespace declaration, each with its reason", () => {
    const listed = r.unread.filter((u) => u.reason.startsWith("export form not read") || u.reason.includes("export * as"));
    expect(listed.map((u) => u.name).sort()).toEqual(["Alpha", "Forms", "NS"]);
    expect(r.accounting.listed).toBe(3);
  });
  it("claims type-only and enum exports silently", () => {
    expect(r.unread.map((u) => u.name)).not.toContain("Size");
    expect(r.unread.map((u) => u.name)).not.toContain("T");
    expect(r.unread.map((u) => u.name)).not.toContain("P");
  });
  it("reads the BOM export, the export after a statement, and the default binding export", () => {
    expect(r.components.map((c) => c.name).sort()).toEqual(["AfterUrl", "Bom", "Inner", "Plain"]);
    expect(r.components.find((c) => c.name === "Inner")?.isDefault).toBe(true);
  });
  it("reads nothing out of a string or a comment", () => {
    expect(r.components.map((c) => c.name)).not.toContain("InString");
    expect(r.components.map((c) => c.name)).not.toContain("InComment");
  });
  it("a script file holds no component and claims its exports", () => {
    const ts = readComponentExports("src/lib/x.ts", 'export const A = 1;\nexport * from "./y";\nexport function F() {}\n');
    expect(ts.accounting).toEqual({ keywords: 3, claimed: 3, listed: 0 });
    expect(ts.reExports).toHaveLength(1);
  });
  it("`export * as X from` is not read as `export *`", () => {
    expect(readComponentExports("src/components/b.tsx", 'export * as Forms from "./forms";\n').reExports).toEqual([]);
  });
});

describe("through the command: the four shapes the review found are read or counted", () => {
  const p = projectFrom({
    "package.json": pkg({ react: "18" }),
    "src/components/Bom.tsx": "﻿export function Bom() { return <i />; }\n",
    "src/components/Inner.tsx": "function Inner() { return <i />; }\nexport { Inner as default };\n",
    "src/components/Parts.tsx": "export const { Alpha, Beta } = Parts;\nexport enum Size { S }\n",
    "src/components/Plain.tsx": 'const u = "http://x"; export function AfterUrl() { return <i />; }\n',
  });
  const d = envelope(surface(p).out).data!;
  it("reads the BOM, the default binding and the export after a statement as components", () => {
    expect((d["components"] as { name: string }[]).map((c) => c.name).sort()).toEqual(["AfterUrl", "Bom", "Inner"]);
  });
  it("lists the destructured export and claims the enum", () => {
    const names = (d["unread"].exports as { name: string; reason: string }[]).map((e) => e.name);
    expect(names).toContain("Alpha");
    expect(names).not.toContain("Size");
  });
});
