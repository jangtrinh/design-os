/**
 * Ring-2 references: what `rulings.json` and the mentions in a ruling or principle name is read as the schema defines
 * it (`scope`: "global", or `{ apps, features, screens }`), every value left out is counted with its reason in the
 * source line, a backticked mention is exact, and an unreadable ring-2 path is a named refusal.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build, json, ontologyOf, ring1Project, write } from "./ontology-helpers.js";

type Ruling = { id: string; text: string; scope: unknown };
const withRulings = (rulings: Ruling[], meta?: Record<string, unknown>): string => {
  const p = ring1Project();
  write(p, "design/knowledge/rulings.json", JSON.stringify({ rulings: rulings.map((r) => ({ category: "x", source: ["t"], ...r })) }));
  if (meta !== undefined) write(p, "design/knowledge/screens.meta.json", JSON.stringify({ schema: "screens-meta/1", at: 1, unassigned: [], ...meta }));
  expect(build(p).code).toBe(0);
  return p;
};
const entry = (over: Record<string, unknown>): Record<string, unknown> => ({ name: "E", app: "web", feature: "checkout", figmaId: "none", ...over });
const governs = (p: string): string[] => ontologyOf(p).links.filter((l) => l.kind === "governs").map((l) => `${l.from}>${l.to}`).sort();
const report = (p: string): { unresolved: number; details: string[] } => ontologyOf(p).linkReports.find((r) => r.link === "governs")!;
const note = (p: string, kind: string): string => ontologyOf(p).sources.find((s) => s.kind === kind)!.note;

describe("a ruling's scope, as the schema defines it", () => {
  it("a string other than global is counted with its reason, linked to nothing, and not reported as naming no target", () => {
    const p = withRulings([{ id: "R-1", text: "t", scope: "web" }]);
    expect(governs(p)).toEqual([]);
    expect(note(p, "ruling")).toContain("1 scope value(s) not understood and counted: 1 string other than 'global'");
    expect(report(p).unresolved).toBe(0);
  });
  it("a non-string in a list and a list given as a string are each counted; the strings around them still link", () => {
    const p = withRulings([{ id: "R-2", text: "t", scope: { apps: ["web", 7], features: "settings" } }], { screens: { a: entry({}) } });
    expect(governs(p)).toEqual(["ruling:R-2>app:web"]);
    expect(note(p, "ruling")).toContain("2 scope value(s) not understood and counted: 1 non-string or empty value in a list, 1 list given as a string");
  });
  it("screens: an exact node id, and a screens-meta id whose entry ties to a screen node, both link; a name and an unknown id are unresolved", () => {
    const p = withRulings(
      [{ id: "R-3", text: "t", scope: { screens: ["Sign in", "screen:5:1", "sign-in", "ghost", "screen:5:2"] } }],
      { screens: { "sign-in": entry({ figmaId: "5:1" }), ghost: entry({ figmaId: "9:9" }) } },
    );
    expect(governs(p)).toEqual(["ruling:R-3>screen:5:1", "ruling:R-3>screen:5:2"]);
    expect(report(p).unresolved).toBe(2 + 0); // "Sign in" is a name; "ghost" ties to no frame
    expect(report(p).details.join(" ")).toContain("Sign in");
  });
  it("features: inside the scope's apps; with no app, in the one app that has the feature; in several apps it is unresolved", () => {
    const meta = { screens: {
      a: entry({ app: "web", feature: "checkout" }), b: entry({ app: "admin", feature: "checkout" }), c: entry({ app: "web", feature: "settings" }),
    } };
    const p = withRulings([
      { id: "R-A", text: "t", scope: { apps: ["admin"], features: ["checkout"] } },
      { id: "R-B", text: "t", scope: { features: ["settings"] } },
      { id: "R-C", text: "t", scope: { features: ["checkout"] } },
      { id: "R-D", text: "t", scope: { apps: ["web"], features: ["checkout", "missing"] } },
    ], meta);
    expect(governs(p)).toEqual(["ruling:R-A>app:admin", "ruling:R-A>feature:admin/checkout", "ruling:R-B>feature:web/settings", "ruling:R-D>app:web", "ruling:R-D>feature:web/checkout"]);
    expect(report(p).unresolved).toBe(2); // R-C: two apps have it; R-D: no app of its scope has `missing`
  });
});

describe("a backticked mention is exact", () => {
  it("`component:Card` links, `component: Card ` does not (no trimming inside the mention) and is counted unresolved", () => {
    const p = withRulings([{ id: "R-1", text: "Use `component:Card` and not `component: Card `.", scope: "global" }]);
    expect(governs(p)).toEqual(["ruling:R-1>component:Card", "ruling:R-1>project:root"]);
    expect(report(p).unresolved).toBe(1);
    expect(report(p).details.join(" ")).toContain("component: Card ");
  });
});

describe("an unreadable ring-2 path is a named refusal, never an internal error", () => {
  it("a directory at design/patterns/x.md", () => {
    const p = ring1Project();
    mkdirSync(join(p, "design", "patterns", "x.md"), { recursive: true });
    const done = build(p);
    expect(done.code).toBe(1);
    expect(json(done.out).error!.code).toBe("ONTOLOGY_BAD_SOURCE");
    expect(json(done.out).error!.message).toContain("design/patterns/x.md");
  });
  it.each([["design/knowledge/rulings.json"], ["design/principles.json"], ["CONTEXT.md"], ["design/knowledge/screens.meta.json"]])("a directory at %s", (rel) => {
    const p = ring1Project();
    mkdirSync(join(p, rel), { recursive: true });
    const done = build(p);
    expect(done.code).toBe(1);
    expect(json(done.out).error!.code).toBe("ONTOLOGY_BAD_SOURCE");
    expect(json(done.out).error!.message).toContain(rel);
  });
  it("design/patterns being a file", () => {
    const p = ring1Project();
    write(p, "design/patterns", "not a directory");
    const done = build(p);
    expect(json(done.out).error!.code).toBe("ONTOLOGY_BAD_SOURCE");
  });
});
