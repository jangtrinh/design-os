/**
 * The full ontology fixture: the ring-1 project plus every ring-2 source, one unresolved instance, one term with
 * name-only candidates, one process ruling with no target. The build emits nodes of every kind whose source exists,
 * writes only exact links, raises `inferred-links` for the terms, and the coverage table counts `not-sensed`,
 * `unresolved` and empty separately.
 */
import { describe, expect, it } from "vitest";
import { keyOf, submit } from "./project-kinds-helpers.js";
import { capture } from "./owner-rulings-helpers.js";
import { build, fullProject, json, lint, ontologyOf, ring1Project, write } from "./ontology-helpers.js";

const NODE_KINDS = ["app", "component", "feature", "gate", "pattern", "principle", "project", "rule", "ruling", "screen", "term", "token"];
const ruled = (): string => {
  const p = fullProject();
  build(p);
  const questions = keyOf(p).filter((k) => k.kind === "inferred-links");
  const answers = questions.map((k) => ({ fingerprint: k.fingerprint, choice: Object.keys(k.memberChoices!).some((m) => m.startsWith("term:Card→")) ? "link-all" : "standalone" }));
  expect(submit(p, answers).code).toBe(0);
  expect(build(p).code).toBe(0);
  return p;
};

describe("before the owner answers", () => {
  it("raises one question per term named like a node, none for a term nothing is named after, and writes nothing", () => {
    const p = fullProject();
    const done = build(p);
    expect(done.code).toBe(1);
    const found = keyOf(p).filter((k) => k.kind === "inferred-links");
    expect(found).toHaveLength(2);
    expect(found.map((k) => Object.keys(k.memberChoices!).length).sort()).toEqual([1, 2]);
    expect(json(done.out).data!["wouldWrite"].uncovered).toContainEqual({ kind: "term", count: 1 });
  });
});

describe("after the answers", () => {
  const p = ruled();
  const o = ontologyOf(p);
  const ids = (kind: string): string[] => o.nodes.filter((n) => n.kind === kind).map((n) => n.id).sort();
  const pairs = (kind: string): string[] => o.links.filter((l) => l.kind === kind).map((l) => `${l.from}>${l.to}`).sort();
  const report = (link: string): (typeof o.linkReports)[number] => o.linkReports.find((r) => r.link === link)!;

  it("emits nodes of every kind whose source exists", () => {
    expect([...new Set(o.nodes.map((n) => n.kind))].sort()).toEqual(NODE_KINDS);
    expect(ids("term")).toEqual(["term:Card", "term:Ledger", "term:Sign in"]);
    expect(ids("pattern")).toEqual(["pattern:card", "pattern:card-grid"]);
    expect(ids("ruling")).toEqual(["ruling:R-1", "ruling:R-2", "ruling:R-3", "ruling:R-4", "ruling:R-5"]);
    expect(ids("app")).toEqual(["app:web"]);
  });
  it("writes only exact links: every target exists, and what a source names exactly is linked", () => {
    const exists = new Set(o.nodes.map((n) => n.id));
    for (const l of o.links) { expect(exists.has(l.from), `${l.kind} from ${l.from}`).toBe(true); expect(exists.has(l.to), `${l.kind} to ${l.to}`).toBe(true); }
    expect(pairs("governs")).toEqual(expect.arrayContaining(["ruling:R-1>component:Card", "ruling:R-1>token:color.ink", "ruling:R-1>pattern:card-grid", "ruling:R-1>project:root", "ruling:R-2>app:web", "ruling:R-2>feature:checkout", "principle:C1>pattern:card-grid"]));
    expect(pairs("superseded-by")).toEqual(["ruling:R-3>ruling:R-1"]);
    expect(pairs("belongs-to")).toEqual(expect.arrayContaining(["screen:5:1>feature:checkout", "screen:5:2>app:web", "feature:checkout>app:web", "app:web>project:root"]));
    expect(pairs("defines")).toEqual(["term:Card>component:Card", "term:Card>pattern:card"]);
  });
  it("counts what matches nothing under unresolved, per link kind, and never links it", () => {
    expect(report("governs").unresolved).toBe(1); // `component:Ghost`
    expect(report("governs").details.join(" ")).toContain("component:Ghost");
    expect(report("superseded-by").unresolved).toBe(1); // R-99
    expect(report("belongs-to").unresolved).toBe(1); // screen:9:9
    expect(report("uses-component").unresolved).toBe(2); // the unresolved instance and the host lookup
    expect(o.nodes.some((n) => n.id === "component:Ghost" || n.id === "ruling:R-99")).toBe(false);
  });
  it("counts what the host never sensed under not sensed, apart from unresolved", () => {
    expect(report("consumes-token")).toMatchObject({ notSensed: 1, unresolved: 0 });
    expect(report("consumes-token").notSensedReason).toContain("re-scan");
  });
  it("a ruling that names no target stays a ruling node with no link, and the summary counts it as an orphan no question covers", () => {
    expect(o.links.some((l) => l.from === "ruling:R-5" || l.to === "ruling:R-5")).toBe(false);
    expect(o["uncovered"]).toContainEqual({ kind: "ruling", count: 1 });
  });
  it("lint passes with orphans as warnings, and the coverage table separates standalone from orphan", () => {
    const l = lint(p);
    expect(l.code).toBe(0);
    const coverage = json(l.out).data!["coverage"] as { kind: string; nodes: number; orphan: number; standalone: number }[];
    expect(coverage.find((r) => r.kind === "term")).toMatchObject({ nodes: 3, standalone: 1 });
    expect(coverage.find((r) => r.kind === "ruling")).toMatchObject({ nodes: 5, orphan: 1 });
  });
});

describe("not-sensed, unresolved and empty are three different facts in the table", () => {
  it("a missing source, a source read with nothing in it, and a source never sensed are reported apart", () => {
    const p = ring1Project({ soul: false });
    write(p, "design/principles.json", JSON.stringify({ version: 1, principles: [] }));
    build(p);
    const text = capture(["ontology", "lint", "--dir", p]).out;
    const row = (kind: string): string => text.split("\n").find((l) => l.trim().startsWith(kind) && /\d/.test(l))!;
    expect(row("principle")).toMatch(/principle\s+0\s+0\s+0\s+0\s+no$/); // read, empty
    expect(row("term")).toMatch(/term\s+0\s+0\s+0\s+0\s+missing$/); // no CONTEXT.md
    expect(row("rule")).toMatch(/rule\s+0\s+0\s+0\s+0\s+not-sensed$/); // no rule source was ever sensed
  });
});
