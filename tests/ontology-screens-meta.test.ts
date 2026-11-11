/**
 * `screens-meta/1` as a project supplies it: `screens` keyed by the project's own screen id, no `apps` or `features`
 * list. The app and feature nodes are the distinct values of those fields; an entry ties to a screen node only by a
 * `figmaId` equal to the frame's node id; what cannot be read in this shape is refused by name, never read as zero.
 */
import { describe, expect, it } from "vitest";
import { build, json, ontologyOf, ring1Project, write } from "./ontology-helpers.js";

const FILE = "design/knowledge/screens.meta.json";
type Entry = Record<string, unknown>;
const entry = (over: Entry): Entry => ({ name: "Entry", app: "web", feature: "checkout", figmaId: "5:1", kind: "route", page: "Flows", purpose: "", aliases: [], masters: [], overlays: [], parentScreenId: null, noteIds: [], confidence: 1, pageContent: "", ...over });
const project = (doc: Record<string, unknown>): string => {
  const p = ring1Project();
  write(p, FILE, JSON.stringify({ schema: "screens-meta/1", at: 1, unassigned: [], ...doc }));
  return p;
};
const sourceOf = (p: string, kind: string): string => ontologyOf(p).sources.find((s) => s.kind === kind)!.note;
const pairs = (p: string, kind: string): string[] => ontologyOf(p).links.filter((l) => l.kind === kind).map((l) => `${l.from}>${l.to}`).sort();

describe("what is read from the real shape", () => {
  it("makes an app node per distinct app and a feature node per distinct (app, feature) pair, keyed by both", () => {
    const p = project({ screens: {
      a: entry({ figmaId: "5:1" }), b: entry({ figmaId: "5:2", feature: "cart" }),
      c: entry({ figmaId: "x", app: "admin", feature: "checkout" }), d: entry({ figmaId: "y", app: "admin", feature: "checkout" }),
    } });
    expect(build(p).code).toBe(0);
    const o = ontologyOf(p);
    expect(o.nodes.filter((n) => n.kind === "app").map((n) => n.id)).toEqual(["app:admin", "app:web"]);
    expect(o.nodes.filter((n) => n.kind === "feature").map((n) => `${n.id}=${n.name}`)).toEqual(["feature:admin/checkout=checkout", "feature:web/cart=cart", "feature:web/checkout=checkout"]);
    expect(pairs(p, "belongs-to")).toEqual(expect.arrayContaining(["feature:admin/checkout>app:admin", "feature:web/cart>app:web", "feature:web/checkout>app:web", "app:admin>project:root", "app:web>project:root"]));
  });
  it("ties an entry to a screen node by figmaId alone: belongs-to and the string fields as meta", () => {
    const p = project({ screens: { a: entry({ figmaId: "5:1", name: "Sign in", kind: "modal", purpose: "start", page: "Flows" }) } });
    build(p);
    expect(pairs(p, "belongs-to")).toContain("screen:5:1>feature:web/checkout");
    expect(ontologyOf(p).nodes.find((n) => n.id === "screen:5:1")!["meta"]).toEqual({ kind: "modal", name: "Sign in", page: "Flows", purpose: "start" });
  });
  it("never ties by name: an entry named like a frame with another figmaId is unresolved, and its app and feature are still read", () => {
    const p = project({ screens: { a: entry({ figmaId: "9:9", name: "Sign in" }) } });
    build(p);
    expect(pairs(p, "belongs-to").some((l) => l.startsWith("screen:"))).toBe(false);
    const r = ontologyOf(p).linkReports.find((x) => x.link === "belongs-to")!;
    expect(r.unresolved).toBe(1);
    expect(r.details.join(" ")).toContain("a ties to no screen (figmaId 9:9)");
    expect(ontologyOf(p).nodes.map((n) => n.id)).toContain("feature:web/checkout");
    expect(ontologyOf(p).nodes.find((n) => n.id === "screen:5:1")!["meta"]).toBeUndefined();
  });
  it("counts unassigned in the source line, an entry with no app apart, and copies no time", () => {
    const p = project({ at: 1760000000, screens: { a: entry({}), b: entry({ app: undefined, feature: "lone", figmaId: "5:2" }) }, unassigned: [{ app: "web", figmaId: "1:1", reason: "x" }, { app: "web", figmaId: "1:2", reason: "y" }] });
    build(p);
    expect(sourceOf(p, "app")).toContain("2 screen entries, 2 unassigned, 1 without an app left out and counted");
    expect(ontologyOf(p).nodes.some((n) => n.id.startsWith("feature:") && n.id.includes("lone"))).toBe(false);
    expect(JSON.stringify(ontologyOf(p))).not.toContain("1760000000");
  });
  it("a screen entry with an app and no feature belongs to the app", () => {
    const p = project({ screens: { a: entry({ feature: undefined }) } });
    build(p);
    expect(pairs(p, "belongs-to")).toContain("screen:5:1>app:web");
  });
});

describe("one figmaId, one entry", () => {
  const claimed = (): string => project({ screens: {
    a: entry({ figmaId: "5:1", name: "First", feature: "settings" }),
    b: entry({ figmaId: "5:1", name: "Second", app: "admin", feature: "billing" }),
    c: entry({ figmaId: "5:2", name: "Alone" }),
  } });
  it("an id two entries claim ties neither: no metadata, no parent, both counted with the reason, app and feature still read", () => {
    const p = claimed();
    expect(build(p).code).toBe(0);
    const o = ontologyOf(p);
    expect(pairs(p, "belongs-to").filter((l) => l.startsWith("screen:5:1>"))).toEqual([]);
    expect(o.nodes.find((n) => n.id === "screen:5:1")!["meta"]).toBeUndefined();
    const r = o.linkReports.find((x) => x.link === "belongs-to")!;
    expect(r.unresolved).toBe(2);
    expect(r.details.join(" ")).toContain("2 entries claim one figmaId, 5:1");
    expect(o.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(["feature:admin/billing", "feature:web/settings"]));
    expect(pairs(p, "belongs-to")).toContain("screen:5:2>feature:web/checkout");
  });
});

describe("a file that declares the schema and cannot be read in this shape", () => {
  it.each([
    ["screens is a list", { screens: [] }],
    ["screens is missing", {}],
    ["an entry is not an object", { screens: { a: "text" } }],
    ["unassigned is not a list", { screens: {}, unassigned: "none" }],
  ])("%s: refused by name, never read as zero apps", (_why, doc) => {
    const p = project(doc);
    const done = build(p);
    expect(done.code).toBe(1);
    expect(json(done.out).error!.code).toBe("ONTOLOGY_BAD_SOURCE");
    expect(json(done.out).error!.message).toContain("design/knowledge/screens.meta.json");
  });
  it("the legacy lists are not read: a file with apps and features and no screens object is refused", () => {
    const p = project({ apps: [{ id: "web", name: "Web" }], features: [] });
    expect(json(build(p).out).error!.message).toContain("'screens' must be an object keyed by screen id");
  });
});
