/**
 * The links of the ontology, each only from its exact source. A reference that matches nothing is counted unresolved and
 * never matched to the nearest name; a link whose source was never sensed is counted not sensed with the command that
 * would sense it; `checked-by` comes from one table whose every row is proven against the gate that evaluates it.
 */
import { describe, expect, it } from "vitest";
import { GATE_FAMILIES } from "../src/core/gate.js";
import { CHECKED_BY, gateFamilyFor } from "../src/core/ontology/gate-table.js";
import { buildLinks } from "../src/core/ontology/link-rules.js";
import { figmaIdentity, usesComponentLinks } from "../src/core/ontology/link-uses-component.js";
import { readNodeSources } from "../src/core/ontology/node-sources.js";
import type { Scan } from "./ontology-helpers.js";
import { codeProject, ring1Project } from "./ontology-helpers.js";

const linksOf = (p: string): ReturnType<typeof buildLinks> => buildLinks(readNodeSources(p));
const pairs = (r: ReturnType<typeof buildLinks>, kind: string): string[] => r.links.filter((l) => l.kind === kind).map((l) => `${l.from} -> ${l.to}`).sort();
const report = (r: ReturnType<typeof buildLinks>, kind: string): ReturnType<typeof buildLinks>["reports"][number] => r.reports.find((x) => x.link === kind)!;

describe("uses-component, Figma door: by identity, closed over nested components", () => {
  it("links a frame to the components it instances and to the ones those components nest", () => {
    const r = linksOf(ring1Project());
    expect(pairs(r, "uses-component")).toEqual([
      "screen:5:1 -> component:Badge", "screen:5:1 -> component:Button", "screen:5:1 -> component:Card", "screen:5:2 -> component:Card",
    ]);
  });
  it("counts a reference that matches nothing, and the instances the host could not resolve, under unresolved", () => {
    const rep = report(linksOf(ring1Project()), "uses-component");
    expect(rep.unresolved).toBe(2);
    expect(rep.details.join(" ")).toContain("ffffffffffffffffffffffffffffffffffffffff");
    expect(rep.details.join(" ")).toContain("1 instance(s) the host could not resolve");
  });
  it("never matches the nearest name: a node whose name only resembles a record's is not linked to it", () => {
    const records = [{ name: "Button", category: "c", markup: "", tokensUsed: [] }];
    const scan = { components: [{ id: "1:9", name: "button", type: "COMPONENT" }, { id: "1:8", name: "Buttons", type: "COMPONENT" }], tokens: [], styles: [], pageSignal: "absent" } as never;
    const frames = [{ id: "5:1", name: "F", pageId: "0:1", pageName: "P", instances: [{ component: "1:9", count: 1 }, { component: "1:8", count: 2 }] }];
    const out = usesComponentLinks({ scan, frames } as never, null, records as never, new Set(), undefined);
    expect(out.links).toEqual([]);
    expect(out.report.unresolved).toBe(2);
  });
  it("ties a scan component to a record only when its derived name is the record's and no other node derives it", () => {
    const records = [{ name: "Card", category: "c", markup: "", tokensUsed: [] }, { name: "Button", category: "c", markup: "", tokensUsed: [] }];
    const node = (id: string, name: string, key?: string): never => ({ id, name, type: "COMPONENT", ...(key === undefined ? {} : { key }) }) as never;
    const map = figmaIdentity([node("1:1", "Card", "aa"), node("1:2", "Card"), node("1:3", "Button", "bb"), node("1:4", "Renamed")], records, new Set());
    expect([...map.entries()].sort()).toEqual([["1:3", "Button"], ["bb", "Button"]]);
  });
});

describe("uses-component, code door: the import against the record's code reference", () => {
  it("links a page file to the components it imports and to nothing else", () => {
    const r = linksOf(codeProject());
    expect(pairs(r, "uses-component")).toEqual(["screen:src/pages/home.tsx -> component:Button", "screen:src/pages/home.tsx -> component:Card", "screen:src/pages/pricing.tsx -> component:Card"]);
    expect(report(r, "uses-component").unresolved).toBe(0);
  });
});

describe("consumes-token: the registry's tokensUsed, and not-sensed is not none", () => {
  it("writes a link per token a component names, from the registry alone", () => {
    expect(pairs(linksOf(ring1Project()), "consumes-token")).toEqual([
      "component:Badge -> token:color.ink", "component:Button -> token:color.ink", "component:Card -> token:color.paper", "component:Card -> token:space.gap",
    ]);
  });
  it("a scan the host skipped makes every empty component not sensed, with the reason and the command", () => {
    const p = ring1Project({ edit: (s: Scan) => {
      for (const c of s.components) { delete c["boundVariables"]; delete c["instances"]; }
      delete s.frames;
      s.sensing = { status: "skipped", reason: "sensing exceeded its time budget" };
    } });
    const rep = report(linksOf(p), "consumes-token");
    expect(rep.written).toBe(0);
    expect(rep.notSensed).toBe(3);
    expect(rep.notSensedReason).toContain("sensing exceeded its time budget");
    expect(rep.notSensedReason).toContain("figma-agent scan-design-system");
  });
  it("a component the scan sensed with no binding consumes none: that is not not-sensed", () => {
    const p = ring1Project({ edit: (s: Scan) => { s.components.find((c) => c["name"] === "Badge")!["boundVariables"] = []; } });
    const rep = report(linksOf(p), "consumes-token");
    expect(rep.notSensed).toBe(0);
    expect(pairs(linksOf(p), "consumes-token").some((l) => l.startsWith("component:Badge "))).toBe(false);
  });
  it("without the scan file a Figma-door component with no token is not sensed, naming the scan command", () => {
    const p = ring1Project({ scan: false, edit: (s: Scan) => { s.components.find((c) => c["name"] === "Badge")!["boundVariables"] = []; } });
    const rep = report(linksOf(p), "consumes-token");
    expect(rep.notSensed).toBe(1);
    expect(rep.notSensedReason).toContain("no Figma scan at design/ds.json");
  });
});

describe("checked-by comes from one table, and each row is proven against the code", () => {
  it("every row names a real gate family", () => {
    for (const row of CHECKED_BY) expect(GATE_FAMILIES as readonly string[], row.kind).toContain(row.family);
  });
  it("a soul rule and a convention are evaluated by no gate: no row, no link, counted as not checked", () => {
    expect(gateFamilyFor("soul", "never")).toBeUndefined();
    expect(gateFamilyFor("convention", "layout")).toBeUndefined();
    const r = linksOf(ring1Project());
    expect(pairs(r, "checked-by")).toEqual(["rule:adherence:NS-10 -> gate:ds-usage"]);
    expect(report(r, "checked-by").notChecked).toBe(3);
  });
});

describe("constrains: a rule's own target", () => {
  it("every rule constrains the project, and no link points anywhere a source did not name", () => {
    const r = linksOf(ring1Project());
    expect(pairs(r, "constrains")).toHaveLength(4);
    expect(new Set(r.links.filter((l) => l.kind === "constrains").map((l) => l.to))).toEqual(new Set(["project:root"]));
  });
});
