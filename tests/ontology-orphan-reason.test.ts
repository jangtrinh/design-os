/**
 * The "orphans no question covers" line says why, per kind: how many of those orphans had a reference counted as
 * unresolved or not understood. The count is taken per node from the same facts as the source line, in the build text,
 * the lint finding and the file, and it is absent when no orphan has such a reference.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { build, fullProject, json, lint, ontologyOf, write } from "./ontology-helpers.js";

const WHY = "name a target that was not found or not understood: see the ruling source line";
function project(rulings: Record<string, unknown>[]): string {
  const p = fullProject();
  rmSync(join(p, "CONTEXT.md"));
  write(p, "design/knowledge/rulings.json", JSON.stringify({ rulings }));
  return p;
}
const MIXED = [
  { id: "A", text: "t", scope: { apps: ["nowhere"] } },
  { id: "B", text: "t", scope: { app: ["web"] } },
  { id: "C", text: "t", scope: {} },
  { id: "D", text: "t", scope: { apps: ["web"] } },
];

describe("the orphan line carries its reason", () => {
  it("the build text, the lint finding and the file say how many ruling orphans name a target that was lost", () => {
    const p = project(MIXED);
    const text = capture(["ontology", "build", "--dir", p]).out;
    expect(text).toContain(`3 ruling (2 of them ${WHY})`);
    const finding = (json(lint(p).out).data!["findings"] as { code: string; message: string }[]).find((f) => f.code === "ONTOLOGY_ORPHAN_UNASKED" && f.message.includes(" ruling "))!;
    expect(finding.message).toContain(`3 ruling orphan(s) have no candidate, so no question covers them yet (2 of them ${WHY})`);
    expect(ontologyOf(p)["uncovered"]).toContainEqual({ kind: "ruling", count: 3, withCountedReference: 2 });
  });
  it("an orphan that names nothing was not given a target that got lost, so it carries no reason", () => {
    const p = project([{ id: "A", text: "t", scope: { apps: [] } }, { id: "B", text: "t", scope: {} }]);
    expect(capture(["ontology", "build", "--dir", p]).out).toContain("2 ruling (no candidate");
    expect(ontologyOf(p)["uncovered"]).toContainEqual({ kind: "ruling", count: 2 });
  });
  it("a principle with a text field that is not a string and no other link is counted too", () => {
    const p = project([{ id: "A", text: "t", scope: "global" }]);
    write(p, "design/principles.json", JSON.stringify({ principles: [{ id: "C9", title: "t", yields_when: 5, test: "x" }] }));
    build(p);
    expect(ontologyOf(p)["uncovered"]).toContainEqual({ kind: "principle", count: 1, withCountedReference: 1 });
  });
});
