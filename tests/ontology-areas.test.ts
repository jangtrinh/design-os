/**
 * An area is a field the build writes on a node, with a key that says where the grouping comes from: the Figma page of a
 * component tied to a scan component, the directory of a component registered from code, the first segment of a token
 * path and the category of a ruling. A node with no source for an area carries none and is counted, with the reason.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { keyOf, submit } from "./project-kinds-helpers.js";
import { build, codeProject, editRegistry, fullProject, lint, ontologyOf, read, ring1Project } from "./ontology-helpers.js";
import type { Scan } from "./ontology-helpers.js";

const validate = new Ajv({ allErrors: true }).compile(JSON.parse(readFileSync(join(process.cwd(), "schemas", "ontology.schema.json"), "utf8")));
const areaOf = (project: string, id: string): unknown => ontologyOf(project).nodes.find((n) => n.id === id)?.["area"];
/** Changes the scan the ontology reads (design/ds.json), after the project was built by commands. */
function editScan(project: string, change: (scan: Scan) => void): void {
  const file = join(project, "design", "ds.json");
  const scan = JSON.parse(readFileSync(file, "utf8")) as Scan;
  change(scan);
  writeFileSync(file, JSON.stringify(scan, null, 2));
}
const text = (project: string): string => { const done = capture(["ontology", "build", "--dir", project]); expect(done.code).toBe(0); return done.out; };

describe("where an area comes from", () => {
  it("a Figma component takes the page of the scan component it is tied to, a token the first segment of its path", () => {
    const p = ring1Project();
    expect(build(p).code).toBe(0);
    expect(["Badge", "Button", "Card"].map((n) => areaOf(p, `component:${n}`))).toEqual(["page:Library", "page:Library", "page:Library"]);
    expect(["color.ink", "color.paper", "space.gap"].map((t) => areaOf(p, `token:${t}`))).toEqual(["tokens:color", "tokens:color", "tokens:space"]);
    expect(areaOf(p, "screen:5:1")).toBeUndefined();
    expect(validate(ontologyOf(p)), JSON.stringify(validate.errors)).toBe(true);
  });
  it("a component registered from code takes the directory of its category", () => {
    const p = codeProject();
    expect(build(p).code).toBe(0);
    expect(areaOf(p, "component:Card")).toBe("dir:src/components");
  });
  it("a ruling that carries a category takes it", () => {
    const p = fullProject();
    build(p);
    const answers = keyOf(p).filter((k) => k.kind === "inferred-links").map((k) => ({ fingerprint: k.fingerprint, choice: "standalone" }));
    expect(submit(p, answers).code).toBe(0);
    expect(build(p).code).toBe(0);
    const rulings = ontologyOf(p).nodes.filter((n) => n.kind === "ruling");
    expect(rulings.length).toBeGreaterThan(0);
    expect(rulings.map((n) => n["area"])).toContain("rulings:component-reuse");
    for (const n of rulings) expect(n["area"], n.id).toBe(`rulings:${String(n["category"])}`);
  });
  it("two pages that share a name are never merged: each key carries the page id", () => {
    const p = ring1Project();
    editScan(p, (scan) => { scan.components.find((c) => c["name"] === "Badge")!["page"] = { id: "0:9", name: "Library" }; });
    expect(build(p).code).toBe(0);
    expect(areaOf(p, "component:Badge")).toBe("page:Library (0:9)");
    expect(areaOf(p, "component:Card")).toBe("page:Library (0:1)");
    expect(areaOf(p, "component:Button")).toBe("page:Library (0:1)");
  });
});

describe("a node with no source for an area carries none and is counted with the reason", () => {
  it("a Figma record is never given an area from its name: a record no scan component ties to has none", () => {
    const p = ring1Project();
    editRegistry(p, (r) => { r.components.find((c) => c["name"] === "Badge")!["name"] = "Badge renamed"; });
    expect(build(p).code).toBe(0);
    expect(areaOf(p, "component:Badge renamed")).toBeUndefined();
    const out = text(p);
    expect(out).toMatch(/1 component\(s\) without an area/);
    expect(out).toContain("not tied to a scan component");
  });
  it("a scan component that carries no page has none, and the line says the scan carries no page", () => {
    const p = ring1Project();
    editScan(p, (scan) => { delete scan.components.find((c) => c["name"] === "Card")!["page"]; });
    expect(build(p).code).toBe(0);
    expect(areaOf(p, "component:Card")).toBeUndefined();
    expect(areaOf(p, "component:Button")).toBe("page:Library");
    const out = text(p);
    expect(out).toMatch(/1 component\(s\) without an area/);
    expect(out).toContain("the scan carries no page");
    const o = ontologyOf(p);
    expect((o.sources.find((s) => s.kind === "component") as Record<string, unknown>)["withoutArea"]).toEqual({ "the scan carries no page": 1 });
    expect(validate(o), JSON.stringify(validate.errors)).toBe(true);
  });
  it("the lint prints the same count", () => {
    const p = ring1Project();
    editScan(p, (scan) => { delete scan.components.find((c) => c["name"] === "Card")!["page"]; });
    expect(build(p).code).toBe(0);
    const done = capture(["ontology", "lint", "--dir", p]);
    expect(done.out).toMatch(/1 component\(s\) without an area/);
  });
});

describe("the file stays deterministic and the staleness check by re-emit covers the field", () => {
  it("the same bytes on a second build", () => {
    const p = ring1Project();
    build(p);
    const first = read(p, "design/knowledge/ontology.json");
    build(p);
    expect(read(p, "design/knowledge/ontology.json")).toBe(first);
  });
  it("a page renamed in the scan after the build makes the file stale, and a rebuild heals it", () => {
    const p = ring1Project();
    expect(build(p).code).toBe(0);
    expect(lint(p).code).toBe(0);
    const scanFile = join(p, "design", "ds.json");
    writeFileSync(scanFile, readFileSync(scanFile, "utf8").replaceAll('"name": "Library"', '"name": "Kit"'));
    const stale = lint(p);
    expect(stale.code).toBe(1);
    expect(JSON.stringify(JSON.parse(stale.out).data.findings)).toContain("ONTOLOGY_STALE");
    expect(build(p).code).toBe(0);
    expect(areaOf(p, "component:Card")).toBe("page:Kit");
    expect(lint(p).code).toBe(0);
  });
});
