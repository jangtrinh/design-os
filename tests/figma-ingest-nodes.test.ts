/**
 * `ui ingest-figma-ds` and what it does with component-kind nodes: screens asked about per page, a name never present
 * twice in the registry, each declared heuristic counted, and a heuristic that contradicts a sensed fact asked about
 * instead of applied.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyRegistry } from "../src/core/figma-ds-registry.js";
import type { DsComponent } from "../src/core/figma-ds-registry.js";
import { planKit } from "../src/commands/ds-kit-plan-impl.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { aliasTo, comp, ingestArgs, ingestUntilReady, newProject, preferring, scanOf, takeRecommended, writeScan } from "./figma-ingest-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

const LIB = { id: "0:1", name: "Library" };
const blocked = (out: string): Cluster[] => JSON.parse(out).data.blocked.clusters as Cluster[];
const frame = (id: string, page: { id: string; name: string }, instances: number, w = 1440): Record<string, unknown> =>
  ({ id, name: `Screen ${id}`, page, w, h: 900, instances: instances === 0 ? [] : [{ component: "1:1", count: instances }] });
const ask = (scan: unknown): Cluster[] => {
  const project = newProject();
  const r = capture([...ingestArgs(writeScan(project, scan), project, newProject()), "--json"]);
  return r.code === 0 ? [] : blocked(r.out);
};

describe("AC-23: screen-pages", () => {
  const pages = Array.from({ length: 11 }, (_, i) => ({ id: `0:${i + 10}`, name: i === 0 ? "Flows" : i === 1 ? "More Flows" : `Sketch ${i}` }));
  const frames = pages.flatMap((p, i) => [frame(`${i}:1`, p, i < 2 ? 2 : 0), frame(`${i}:2`, p, 0)]);
  const scan = scanOf({ components: [comp("1:1", "Card", LIB)], frames, sensing: { status: "complete" } });

  it("is raised with the frame count and the instance-built count per page, and recommends the pages with an instance-built frame", () => {
    const q = ask(scan).find((c) => c.kind === "screen-pages")!;
    expect(q.count).toBe(11);
    expect(q.question).toContain("Flows (2 frames, 1 built from instances)");
    expect(q.question).toContain("Sketch 5 (2 frames, 0 built from instances)");
    expect(q.options[0]).toMatchObject({ recommended: true, selects: ["0:10", "0:11"] });
  });
  it("a single page of frames raises nothing", () => {
    expect(ask(scanOf({ components: [comp("1:1", "Card", LIB)], frames: [frame("5:1", pages[0]!, 1), frame("5:2", pages[0]!, 0)] }))).toEqual([]);
  });
  it("a scan without frames raises nothing and the envelope carries no frames", () => {
    const project = newProject();
    const r = capture([...ingestArgs(writeScan(project, scanOf({ components: [comp("1:1", "Card", LIB)] })), project, newProject()), "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).data.frames).toBeUndefined();
  });
  it("the answer is applied: frames of a left-out page are named in DESIGN.md", () => {
    const project = newProject();
    const out = newProject();
    ingestUntilReady(writeScan(project, scan), project, out, takeRecommended);
    const md = readFileSync(join(out, "DESIGN.md"), "utf8");
    expect(md).toContain("`Flows`: 2 frame(s), 1 built from instances");
    expect(md).toContain("`Sketch 5`: 2 frame(s), 0 built from instances — left out");
  });
});

describe("the registry never holds a name twice (AC-5, AC-23)", () => {
  const dupScan = scanOf({ components: [comp("1:1", "🟢 Button", LIB), comp("1:2", "Button", LIB), comp("1:3", "Chip", LIB), comp("1:4", "Chip", LIB, { page: { id: "0:2", name: "Other" } })] });

  it("two nodes that differ only by a status marker are duplicates; the question names them", () => {
    const dup = ask(scanOf({ components: [comp("1:1", "🟢 Button", LIB), comp("1:2", "Button", LIB)] })).find((c) => c.kind === "duplicate-component-names")!;
    expect(dup.members).toEqual(["Button#1:1,1:2"]);
    expect(dup.question).toContain("Button");
  });

  it("the duplicate question waits for the page question: a name repeated across pages is not asked until the pages are ruled", () => {
    expect(ask(dupScan).map((c) => c.kind)).toEqual(["figma-library-pages"]);
  });

  it("whichever way the owner answers, the written registry has zero repeated names and ds kit plan accepts it", () => {
    for (const answer of ["exclude-all", "rename-all"]) {
      const project = newProject();
      const out = newProject();
      const scan = scanOf({ components: [comp("1:1", "🟢 Button", LIB), comp("1:2", "Button", LIB), comp("1:3", "Button", LIB), comp("1:4", "Chip", LIB)], tokens: [] });
      ingestUntilReady(writeScan(project, scan), project, out, preferring(answer));
      const registry = JSON.parse(readFileSync(join(out, "component-registry.json"), "utf8")) as { components: { name: string }[] };
      const names = registry.components.map((c) => c.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names).toEqual(answer === "exclude-all" ? ["Chip"] : ["Button · Library", "Button · Library (2)", "Button · Library (3)", "Chip"]);
      const plan = planKit({ source: join(out, "component-registry.json"), kind: "registry", tokens: join(out, "tokens.json"), out: join(newProject(), "kit"), name: "Synthetic" });
      expect(plan.complete).toBe(false);
    }
  });

  it("the shared layer withholds a duplicated name and reports it, so a direct caller cannot write one", () => {
    const nodes: DsComponent[] = [{ id: "1:1", name: "🔵 Card", type: "COMPONENT" }, { id: "1:2", name: "Card", type: "COMPONENT" }, { id: "1:3", name: "Chip", type: "COMPONENT" }];
    const out = classifyRegistry(nodes);
    expect(out.registry.components.map((c) => c.name)).toEqual(["Chip"]);
    expect(out.duplicates).toEqual([{ name: "Card", ids: ["1:1", "1:2"] }]);
  });

  it("the BAD_KIT message for a duplicate names the next action", () => {
    const dir = newProject();
    const source = join(dir, "registry.json");
    const rec = (name: string): object => ({ name, category: "x", markup: "", tokensUsed: [] });
    writeFileSync(source, JSON.stringify({ version: "0.1.0", components: [rec("Card"), rec("Card")] }));
    writeFileSync(join(dir, "tokens.json"), JSON.stringify({ color: { a: { $value: "#000000", $type: "color" } } }));
    expect(() => planKit({ source, kind: "registry", tokens: join(dir, "tokens.json"), out: join(dir, "kit"), name: "Synthetic" })).toThrow(/ui ingest-figma-ds.*duplicate-component-names/s);
  });
});

describe("each declared heuristic has a test and a count (classifiedByHeuristic)", () => {
  const node = (name: string, extra: Partial<DsComponent> = {}): DsComponent => ({ id: `1:${Math.abs(hash(name + JSON.stringify(extra)))}`, name, type: "COMPONENT", ...extra });
  const count = (nodes: DsComponent[]): Record<string, number> => classifyRegistry(nodes).classifiedByHeuristic;
  const hash = (s: string): number => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

  it("lucide name -> icon, counted", () => { expect(count([node("lucide-menu")])["lucide-name"]).toBe(1); expect(classifyRegistry([node("lucide-menu")]).icons.count).toBe(1); });
  it("name starts with icon -> icon, counted", () => { expect(count([node("Icon / X")])["icon-name"]).toBe(1); });
  it("section 00 / lucide / icon(s) -> icon, counted", () => {
    expect(count([node("Arrow", { section: "00 Icons" }), node("Bell", { section: "Icons" })])["icon-section"]).toBe(2);
    expect(classifyRegistry([node("Arrow", { section: "Components" })]).icons.count).toBe(0);
  });
  it("name starts with a digit -> screen, counted", () => { expect(count([node("01 · Login")])["digit-name"]).toBe(1); expect(classifyRegistry([node("01 · Login")]).screens).toEqual(["01 · Login"]); });
  it("frame 1,024 px wide or wider -> screen, counted; 1,023 is not", () => {
    expect(count([node("Dashboard", { width: 1024 }), node("Narrow", { width: 1023 })])["width-1024"]).toBe(1);
  });
  it("a status emoji in the name -> status, counted; the marker leaves the stored name", () => {
    const r = classifyRegistry([node("🟢 Button")]);
    expect(r.classifiedByHeuristic["status-emoji"]).toBe(1);
    expect(r.classifiedByHeuristic["marker-stripped"]).toBe(1);
    expect(r.registry.components[0]).toMatchObject({ name: "Button", status: "stable" });
  });
  it("a status marker in the section name -> status, counted", () => {
    const r = classifyRegistry([node("Select", { section: "🔵 Forms" })]);
    expect(r.classifiedByHeuristic["section-status-marker"]).toBe(1);
    expect(r.registry.components[0]!.status).toBe("beta");
  });
  it("the first / segment of the name -> category, counted", () => {
    const r = classifyRegistry([node("Form / Input"), node("Plain")]);
    expect(r.classifiedByHeuristic["first-segment-category"]).toBe(1);
    expect(r.registry.components.find((c) => c.name === "Form / Input")!.category).toBe("Form");
  });
  it("the ingest reports the counts in the ledger", () => {
    const project = newProject();
    const r = capture([...ingestArgs(writeScan(project, scanOf({ components: [comp("1:1", "lucide-menu"), comp("1:2", "Form / Input")] })), project, newProject()), "--json"]);
    expect(JSON.parse(r.out).data.ledger.classifiedByHeuristic).toMatchObject({ "lucide-name": 1, "first-segment-category": 1 });
  });
});

describe("mapping the scan's page to the section switches the section heuristics on", () => {
  it("a node on a page named Icons is an icon with the page, a component without it", () => {
    const icons = { id: "0:5", name: "Icons" };
    const withPage = capture([...ingestArgs(writeScan(newProject(), scanOf({ components: [comp("1:1", "Arrow", icons)] })), newProject(), newProject()), "--json"]);
    const withoutPage = capture([...ingestArgs(writeScan(newProject(), scanOf({ components: [comp("1:1", "Arrow")] })), newProject(), newProject()), "--json"]);
    expect(JSON.parse(withPage.out).data).toMatchObject({ icons: 1, componentsRegistered: 0 });
    expect(JSON.parse(withoutPage.out).data).toMatchObject({ icons: 0, componentsRegistered: 1 });
  });
  it("a status marker on the page name becomes the status of its components", () => {
    const out = newProject();
    const project = newProject();
    capture(ingestArgs(writeScan(project, scanOf({ components: [comp("1:1", "Select", { id: "0:5", name: "🟢 Forms" })] })), project, out));
    expect(JSON.parse(readFileSync(join(out, "component-registry.json"), "utf8")).components[0].status).toBe("stable");
  });
});

describe("classification-conflicts: a heuristic against a sensed fact is asked, not applied", () => {
  const OTHER = { id: "0:2", name: "Other" };
  const libraryChoice = (c: Cluster): string[] => [c.options.find((o) => o.label === "Keep Library")!.id];

  it("a digit-led name on a page the owner kept as a library page raises the conflict, with the two candidate classes", () => {
    const project = newProject();
    const path = writeScan(project, scanOf({ components: [comp("1:1", "01 Intro", LIB), comp("1:2", "Card", LIB), comp("1:3", "Other Thing", OTHER)] }));
    const { asked } = ingestUntilReady(path, project, newProject(), (c) => (c.kind === "figma-library-pages" ? libraryChoice(c) : "as-component"));
    expect(asked.map((r) => r.map((c) => c.kind))).toEqual([["figma-library-pages"], ["classification-conflicts"]]);
    const q = asked[1]![0]!;
    expect(q.members).toEqual(["1:1"]);
    expect(q.options.map((o) => o.id)).toEqual(["as-component", "as-screen", "review-individually"]);
    expect(q.question).toContain("neither written nor dropped");
  });

  it("a frame 1,024 px wide or wider on a kept library page raises it; the same width on a page left out does not", () => {
    const wide = scanOf({ components: [comp("1:1", "Dashboard", LIB, { width: 1200 }), comp("1:2", "Other Wide", OTHER, { width: 1200 })] });
    const project = newProject();
    const { asked } = ingestUntilReady(writeScan(project, wide), project, newProject(), (c) => (c.kind === "figma-library-pages" ? libraryChoice(c) : "as-screen"));
    expect(asked[1]![0]!.members).toEqual(["1:1"]);
  });

  it("is also raised when the library-pages question never is: a node other components are built from is not a screen", () => {
    const scan = scanOf({ components: [comp("1:1", "01 Hero", LIB), comp("1:2", "Page", LIB, { instances: [{ component: "1:1", count: 1 }] })] });
    const q = ask(scan);
    expect(q.map((c) => c.kind)).toEqual(["classification-conflicts"]);
    expect(q[0]!.members).toEqual(["1:1"]);
  });

  it("must not raise: a digit-led name that nothing contradicts is a screen, applied and counted", () => {
    const project = newProject();
    const r = capture([...ingestArgs(writeScan(project, scanOf({ components: [comp("1:1", "01 Intro", LIB), comp("1:2", "Card", LIB)] })), project, newProject()), "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).data).toMatchObject({ screens: 1, componentsRegistered: 1 });
  });

  it("the answer is applied: as-component keeps the node in the registry, as-screen lists it as a screen; both balance", () => {
    for (const [answer, registered, screens] of [["as-component", 2, 0], ["as-screen", 1, 1]] as const) {
      const project = newProject();
      const path = writeScan(project, scanOf({ components: [comp("1:1", "01 Hero", LIB), comp("1:2", "Page", LIB, { instances: [{ component: "1:1", count: 1 }] })] }));
      const { final } = ingestUntilReady(path, project, newProject(), preferring(answer), ["--json"]);
      const data = JSON.parse(final.out).data as { componentsRegistered: number; screens: number; ledger: { in: { total: number }; written: { total: number }; excluded: { total: number }; pending: number } };
      expect([data.componentsRegistered, data.screens]).toEqual([registered, screens]);
      expect(data.ledger.in.total).toBe(data.ledger.written.total + data.ledger.excluded.total + data.ledger.pending);
    }
  });
  it("aliasTo is available to the other suites", () => { expect(aliasTo("1:1").type).toBe("VARIABLE_ALIAS"); });
});
