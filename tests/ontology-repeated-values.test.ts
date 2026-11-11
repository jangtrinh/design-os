/**
 * A repeated reference is one link and a count: a value that names a target already linked (the same app twice, two
 * scope names that resolve to one screen, one mention written twice) is counted under "repeated value" in the source
 * line and in `leftOut`. The final de-duplication of the links remains a safety net that removes nothing. A ruling that
 * names itself as its successor is counted and gets no link.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readRulingStore } from "../src/core/owner-rulings/ruling-store.js";
import { buildLinks } from "../src/core/ontology/link-rules.js";
import { readNodeSources } from "../src/core/ontology/node-sources.js";
import { build, fullProject, json, ontologyOf, write } from "./ontology-helpers.js";

/** The full fixture without its glossary, so no inferred-links question blocks the build. */
function noTerms(): string { const p = fullProject(); rmSync(join(p, "CONTEXT.md")); return p; }

const RULINGS = "design/knowledge/rulings.json";
type Source = { kind: string; note: string; seen?: number; leftOut?: Record<string, number> };
const rulings = (p: string, items: Record<string, unknown>[]): void => write(p, RULINGS, JSON.stringify({ rulings: items }));
const source = (p: string, kind: string): Source => (ontologyOf(p).sources as Source[]).find((s) => s.kind === kind)!;
const governs = (p: string, from: string): string[] => ontologyOf(p).links.filter((l) => l.kind === "governs" && l.from === from).map((l) => l.to).sort();

describe("one link and a count", () => {
  it("the same app named twice in a scope", () => {
    const p = noTerms();
    rulings(p, [{ id: "R-1", text: "t", scope: { apps: ["web", "web"] } }]);
    expect(build(p).code).toBe(0);
    expect(governs(p, "ruling:R-1")).toEqual(["app:web"]);
    expect(source(p, "ruling").leftOut).toEqual({ "scope: repeated value": 1 });
    expect(source(p, "ruling").note).toContain("1 repeated value(s) linked once and counted");
  });
  it("two scope names that resolve to one screen: the screens-meta key and the screen id", () => {
    const p = noTerms();
    rulings(p, [{ id: "R-1", text: "t", scope: { screens: ["sign-in", "screen:5:1"] } }]);
    expect(build(p).code).toBe(0);
    expect(governs(p, "ruling:R-1")).toEqual(["screen:5:1"]);
    expect(source(p, "ruling").leftOut).toEqual({ "scope: repeated value": 1 });
  });
  it("one mention written twice in a ruling, and in a principle", () => {
    const p = noTerms();
    rulings(p, [{ id: "R-1", text: "Use `component:Card` and again `component:Card`.", scope: "global" }]);
    write(p, "design/principles.json", JSON.stringify({ principles: [{ id: "C1", title: "t `pattern:card-grid`", yields_when: "`pattern:card-grid`", test: "x" }] }));
    expect(build(p).code).toBe(0);
    expect(governs(p, "ruling:R-1")).toEqual(["component:Card", "project:root"]);
    expect(source(p, "ruling").leftOut).toEqual({ "mention: repeated value": 1 });
    expect(source(p, "principle").leftOut).toEqual({ "mention: repeated value": 1 });
  });
  it("an unresolved value written twice is two unresolved references, never a repeat", () => {
    const p = noTerms();
    rulings(p, [{ id: "R-1", text: "t", scope: { apps: ["nowhere", "nowhere"] } }]);
    build(p);
    expect(source(p, "ruling").leftOut).toBeUndefined();
    expect(ontologyOf(p).linkReports.find((r) => r.link === "governs")!.unresolved).toBe(2);
  });
  it("the final de-duplication removes no link from the full fixture", () => {
    const p = noTerms();
    const sources = readNodeSources(p, readRulingStore(p).rulings);
    expect(buildLinks(sources).deduped).toBe(0);
  });
});

describe("a ruling that names itself as its successor", () => {
  it("gets no link and is counted under its own reason", () => {
    const p = noTerms();
    rulings(p, [{ id: "R-1", text: "t", scope: "global", superseded_by: "R-1" }, { id: "R-2", text: "t", scope: "global", superseded_by: "R-1" }]);
    const done = build(p);
    expect(done.code).toBe(0);
    expect(json(done.out).data!["linkReports"].find((r: { link: string }) => r.link === "superseded-by")).toMatchObject({ written: 1, unresolved: 0 });
    expect(ontologyOf(p).links.filter((l) => l.kind === "superseded-by")).toEqual([{ kind: "superseded-by", from: "ruling:R-2", to: "ruling:R-1" }]);
    expect(source(p, "ruling").leftOut).toEqual({ "superseded_by: names itself": 1 });
    expect(source(p, "ruling").note).toContain("1 superseded_by value(s) naming their own ruling counted");
  });
});
