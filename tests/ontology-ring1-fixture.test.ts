/**
 * Ring 1 is enough to meet the goal on its own: on a project built only by running the kernel's own commands plus the
 * owner-ratified soul (a sealed store, a sealed registry with `tokensUsed`, a scan with frames and bindings or a code
 * surface, none of the ring-2 files, no hand-placed promoted rule), `ui ontology build` yields `token`, `component`,
 * `screen`, `rule` and `gate` nodes and `uses-component`, `consumes-token`, `constrains` and `checked-by` links.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { build, codeProject, ontologyOf, read, ring1Project } from "./ontology-helpers.js";

const kinds = (o: ReturnType<typeof ontologyOf>): string[] => [...new Set(o.nodes.map((n) => n.kind))].sort();
const linkKinds = (o: ReturnType<typeof ontologyOf>): string[] => [...new Set(o.links.map((l) => l.kind))].sort();
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

describe("the scan fixture is a scan: it conforms to the one scan contract", () => {
  it("validates against schemas/figma-ds-scan.schema.json", () => {
    const validate = new Ajv({ allErrors: true }).compile(JSON.parse(readFileSync(join(process.cwd(), "schemas", "figma-ds-scan.schema.json"), "utf8")));
    expect(validate(JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "ontology", "ring1", "ds.json"), "utf8"))), JSON.stringify(validate.errors)).toBe(true);
  });
});

describe("the Figma door: a scan with frames and bindings, built by commands", () => {
  const project = ring1Project();
  it("is built by commands: sealed together, a registry with tokensUsed, and a promoted rule that came from the owner's accept", () => {
    expect(existsSync(join(project, "design", "ds.manifest.json"))).toBe(true);
    expect(JSON.parse(read(project, "design/component-registry.json")).components.find((c: { name: string }) => c.name === "Card").tokensUsed).toEqual(["color.paper", "space.gap"]);
    expect(read(project, "design/rules/_adherence.rules.json")).toContain("NS-10");
  });
  it("no ring-1 fixture file is a store, a registry, a promoted rule or a ring-2 file: they all come from commands", () => {
    const names = ["ring1", "code"].flatMap((d) => walk(join(process.cwd(), "tests", "fixtures", "ontology", d))).map((f) => basename(f));
    for (const banned of ["component-registry.json", "design.tokens.json", "ds.manifest.json", "_adherence.rules.json", "rulings.json", "principles.json", "CONTEXT.md", "screens.meta.json", "conventions.json"]) expect(names, banned).not.toContain(banned);
  });
  it("yields token, component, screen, rule and gate nodes and the four ring-1 links, and none of the ring-2 kinds", () => {
    expect(build(project).code).toBe(0);
    const o = ontologyOf(project);
    expect(kinds(o)).toEqual(["component", "gate", "project", "rule", "screen", "token"]);
    expect(linkKinds(o)).toEqual(["checked-by", "constrains", "consumes-token", "uses-component"]);
    expect(o.nodes.filter((n) => n.kind === "screen").map((n) => n.name)).toEqual(["Sign in", "Dashboard"]);
  });
  it("the screen question of the ingest decided the screens: the frame on the page ruled out is not a node", () => {
    expect(ontologyOf(project).nodes.some((n) => n.id === "screen:5:3")).toBe(false);
  });
});

describe("the code door: the surface fixture registered by ui ds surface --register --apply", () => {
  const project = codeProject();
  it("takes screens from the page files and uses-component from their imports", () => {
    expect(build(project).code).toBe(0);
    const o = ontologyOf(project);
    expect(o.nodes.filter((n) => n.kind === "screen").map((n) => n.id)).toEqual(["screen:src/pages/empty.tsx", "screen:src/pages/home.tsx", "screen:src/pages/pricing.tsx"]);
    expect(o.links.filter((l) => l.kind === "uses-component").map((l) => `${l.from}>${l.to}`).sort()).toEqual([
      "screen:src/pages/home.tsx>component:Button", "screen:src/pages/home.tsx>component:Card", "screen:src/pages/pricing.tsx>component:Card",
    ]);
  });
  it("consumes-token comes from the source references the surface registered", () => {
    const pairs = ontologyOf(project).links.filter((l) => l.kind === "consumes-token").map((l) => `${l.from}>${l.to}`).sort();
    expect(pairs).toContain("component:Button>token:color.primary");
    expect(pairs).toContain("component:Card>token:color.ink");
  });
  it("writes no surface file: the surface is built in memory", () => {
    expect(walk(project).some((f) => /surface\.json$/.test(f))).toBe(false);
  });
});

describe("a project with no source of rules at all", () => {
  it("reports rules as not sensed and writes no rule node, and says which sources it looked for", () => {
    const project = ring1Project({ soul: false });
    expect(build(project).code).toBe(0);
    const o = ontologyOf(project);
    expect(o.nodes.some((n) => n.kind === "rule")).toBe(false);
    expect(o.sources.find((s) => s.kind === "rule")).toMatchObject({ status: "not-sensed", nodes: 0 });
    expect(o.sources.find((s) => s.kind === "rule")!.note).toMatch(/soul.*adherence.*conventions/);
  });
});
