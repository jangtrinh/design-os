/**
 * The four guards of the query that the other suites never reached, each pinned on a small ontology written out by hand:
 * the expansion never reaches a superseded ruling, a node outside `--area` is reached only as a token or a rule of an
 * in-area node, a matched screen is not listed among its own siblings, and the area list counts the rulings' areas.
 */
import { describe, expect, it } from "vitest";
import { listAreas } from "../src/core/ontology/query-areas.js";
import { queryOntology } from "../src/core/ontology/query-ontology.js";
import type { OntLink, OntNode, Ontology } from "../src/core/ontology/ontology-types.js";

const node = (id: string, name: string, extra: Record<string, unknown> = {}): OntNode => ({ id, kind: id.slice(0, id.indexOf(":")) as OntNode["kind"], name, ...extra });
const link = (kind: OntLink["kind"], from: string, to: string): OntLink => ({ kind, from, to });
const ontology = (nodes: OntNode[], links: OntLink[]): Ontology => ({ schema: "design-os-ontology/1", nodes, links, sources: [], linkReports: [], proposals: { rules: 0, soul: 0 }, uncovered: [] });
const packed = (o: Ontology, text: string, area: string | null = null): string[] => (queryOntology(o, text, area, 100000).pack?.groups ?? []).flatMap((g) => g.entries.map((e) => e.id));

describe("the expansion", () => {
  it("never reaches a ruling that a newer ruling replaces, from either side of the link", () => {
    const o = ontology(
      [node("component:Card", "Card"), node("ruling:old", "old", { text: "x" }), node("ruling:new", "new", { text: "x" })],
      [link("governs", "ruling:old", "component:Card"), link("governs", "ruling:new", "component:Card"), link("superseded-by", "ruling:old", "ruling:new")],
    );
    const ids = packed(o, "Card");
    expect(ids).toContain("ruling:new");
    expect(ids).not.toContain("ruling:old");
  });
});

describe("under --area", () => {
  const nodes = [
    node("component:Card", "Card", { area: "page:Kit" }),
    node("component:Chip", "Chip", { area: "page:Other" }),
    node("token:color", "color", { area: "tokens:color" }),
    node("rule:r1", "r1", { origin: "soul" }),
    node("ruling:far", "far", { text: "x", area: "rulings:other" }),
  ];
  const links = [link("consumes-token", "component:Card", "token:color"), link("constrains", "rule:r1", "component:Card"), link("uses-component", "component:Card", "component:Chip"), link("governs", "ruling:far", "component:Card")];
  it("a node of another area is reached only as a token or a rule of an in-area node", () => {
    const ids = packed(ontology(nodes, links), "Card", "page:Kit");
    expect(ids).toEqual(expect.arrayContaining(["component:Card", "token:color", "rule:r1"]));
    expect(ids).not.toContain("component:Chip");
    expect(ids).not.toContain("ruling:far");
  });
  it("without --area the same nodes are reached", () => {
    expect(packed(ontology(nodes, links), "Card")).toEqual(expect.arrayContaining(["component:Chip", "ruling:far"]));
  });
});

describe("sibling screens", () => {
  const nodes = [node("screen:1", "Sign in"), node("screen:2", "Sign up"), node("screen:3", "Profile"), node("feature:f", "Account")];
  const links = [link("belongs-to", "screen:1", "feature:f"), link("belongs-to", "screen:2", "feature:f"), link("belongs-to", "screen:3", "feature:f")];
  it("a matched screen is not listed among its own siblings, and one that matched on its own is not repeated", () => {
    const siblings = (text: string): string[] => (queryOntology(ontology(nodes, links), text, null, 100000).pack?.groups.find((g) => g.group === "sibling screens")?.entries ?? []).map((e) => e.id);
    expect(siblings("Profile")).toEqual(["screen:1", "screen:2"]);
    expect(siblings("Sign")).toEqual(["screen:3"]);
  });
});

describe("a matched screen whose feature no other screen shares", () => {
  const nodes = [node("screen:1", "Sign in"), node("screen:2", "Dashboard"), node("feature:f", "Account"), node("component:Card", "Card")];
  const links = [link("belongs-to", "screen:1", "feature:f"), link("uses-component", "screen:1", "component:Card"), link("uses-component", "screen:2", "component:Card")];
  it("is not its own sibling by feature, so it keeps the siblings it reaches through a shared component", () => {
    const groups = queryOntology(ontology(nodes, links), "Sign in", null, 100000).pack?.groups ?? [];
    expect(groups.find((g) => g.group === "sibling screens")?.entries.map((e) => e.id)).toEqual(["screen:2"]);
  });
});

describe("the area list", () => {
  it("counts the areas the rulings carry beside those of components and tokens", () => {
    const rows = listAreas({ nodes: [node("component:Card", "Card", { area: "page:Kit" }), node("ruling:a", "a", { area: "rulings:layout" }), node("ruling:b", "b", { area: "rulings:layout" })] });
    expect(rows).toEqual([{ key: "page:Kit", nodes: 1 }, { key: "rulings:layout", nodes: 2 }]);
  });
});
