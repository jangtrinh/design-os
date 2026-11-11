/**
 * A ruling that declares a successor is never packed as current, even when the successor it names is no ruling in the
 * file: the ruling's own field says it is replaced. The query counts such rulings and says why they were left out.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { queryOntology } from "../src/core/ontology/query-ontology.js";
import type { OntNode, Ontology } from "../src/core/ontology/ontology-types.js";
import { capture } from "./owner-rulings-helpers.js";
import { build } from "./ontology-helpers.js";
import { builtFull, ids, query, queryData } from "./ontology-query-helpers.js";

const RULINGS = "design/knowledge/rulings.json";
function withOrphanSuccessor(): string {
  const p = builtFull();
  const file = join(p, RULINGS);
  const store = JSON.parse(readFileSync(file, "utf8")) as { rulings: Record<string, unknown>[] };
  store.rulings.push({ id: "R-9", text: "Spacing is twelve", scope: "global", superseded_by: "R-404" });
  writeFileSync(file, JSON.stringify(store, null, 2));
  expect(build(p).code).toBe(0);
  return p;
}

describe("a ruling whose own field names a successor that is no node, on an ontology written by hand", () => {
  const node = (id: string, name: string, extra: Record<string, unknown> = {}): OntNode => ({ id, kind: id.slice(0, id.indexOf(":")) as OntNode["kind"], name, ...extra });
  const o: Ontology = { schema: "design-os-ontology/1", nodes: [node("component:Card", "Card"), node("ruling:lost", "lost", { text: "x", supersededBy: "ruling:none" })], links: [{ kind: "governs", from: "ruling:lost", to: "component:Card" }], sources: [], linkReports: [], proposals: { rules: 0, soul: 0 }, uncovered: [] };
  it("is neither a match nor reached by the expansion, and is counted", () => {
    const ids = (queryOntology(o, "Card", null, 100000).pack?.groups ?? []).flatMap((g) => g.entries.map((e) => e.id));
    expect(ids).toEqual(["component:Card"]);
    expect(queryOntology(o, "lost", null, 100000).matchCount).toBe(0);
    expect(queryOntology(o, "lost", null, 100000).supersededLeftOut).toBe(1);
  });
});

describe("a ruling whose successor names no ruling", () => {
  it("is not packed and not a match, although the build wrote no link for it", () => {
    const p = withOrphanSuccessor();
    expect(queryData(p, "9").matches.map((m) => m.id)).not.toContain("ruling:R-9");
    expect(ids(queryData(p, "9"))).not.toContain("ruling:R-9");
    expect(queryData(p, "1").matches.map((m) => m.id)).toContain("ruling:R-1");
  });
  it("is counted, with the reason, in the data and in the text", () => {
    const p = withOrphanSuccessor();
    expect(queryData(p, "9").supersededLeftOut).toBe(1);
    const text = query(p, "9").out;
    expect(text).toContain("Left out because a newer ruling replaces them: 1 ruling(s)");
    expect(text).not.toMatch(/\/Users\//);
  });
  it("says nothing when no matching ruling is replaced", () => {
    const p = builtFull();
    expect(queryData(p, "3").supersededLeftOut).toBe(1);
    expect(queryData(p, "1").supersededLeftOut).toBe(0);
    expect(capture(["ontology", "query", "1", "--dir", p]).out).not.toContain("Left out because a newer ruling");
  });
});
