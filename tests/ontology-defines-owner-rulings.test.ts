/**
 * Owner rulings on `defines`: a ruled pair that no candidate matches any more (the term or the node was renamed or
 * removed) is shown, never silently dropped; the report counts as awaiting only what is still open; a candidate the
 * owner ruled standalone is not an orphan; a term is standalone only when none of its pairs is linked.
 */
import { renameSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { keyOf, submit } from "./project-kinds-helpers.js";
import { build, json, ontologyOf, ring1Project, write } from "./ontology-helpers.js";

const CONTEXT = (...terms: string[]): string => `# Glossary\n\n${terms.map((t) => `**${t}**:\nA definition of ${t}.\n_Avoid_: other\n`).join("\n")}`;
const key = (p: string): ReturnType<typeof keyOf> => keyOf(p).filter((k) => k.kind === "inferred-links");
const report = (p: string): ReturnType<typeof ontologyOf>["linkReports"][number] => ontologyOf(p).linkReports.find((r) => r.link === "defines")!;

/** A project with the term Card named like a component and a pattern, answered link-all and built. */
function linked(): string {
  const p = ring1Project();
  write(p, "CONTEXT.md", CONTEXT("Card"));
  write(p, "design/patterns/card.md", "# Card\n\nA pattern.\n");
  build(p);
  expect(submit(p, [{ fingerprint: key(p)[0]!.fingerprint, choice: "link-all" }]).code).toBe(0);
  expect(build(p).code).toBe(0);
  return p;
}

describe("a ruled pair that no candidate matches any more", () => {
  it("the term was renamed: both pairs are counted, written in the file and printed by the build, and the build does not block", () => {
    const p = linked();
    expect(report(p)).toMatchObject({ written: 2, unresolved: 0 });
    write(p, "CONTEXT.md", CONTEXT("Cards"));
    const done = capture(["ontology", "build", "--dir", p]);
    expect(done.code).toBe(0);
    expect(done.out).toContain("2 owner-ruled pair(s) no longer match a candidate");
    expect(done.out).toContain("term:Card→component:Card");
    const r = report(p);
    expect(r).toMatchObject({ written: 0, unresolved: 2 });
    expect(r.details.join(" ")).toContain("term:Card→pattern:card");
  });
  it("the node was renamed: only its pair is counted, the other keeps its link", () => {
    const p = linked();
    renameSync(join(p, "design/patterns/card.md"), join(p, "design/patterns/card-old.md"));
    write(p, "design/patterns/card-old.md", "# Old card\n");
    expect(build(p).code).toBe(0);
    const r = report(p);
    expect(r).toMatchObject({ written: 1, unresolved: 1 });
    expect(r.details.join(" ")).toContain("1 owner-ruled pair(s) no longer match a candidate");
    expect(r.details.join(" ")).toContain("term:Card→pattern:card");
    expect(ontologyOf(p).links.filter((l) => l.kind === "defines")).toEqual([{ kind: "defines", from: "term:Card", to: "component:Card" }]);
  });
  it("a renamed term that now matches a node raises its own question, as before", () => {
    const p = linked();
    write(p, "CONTEXT.md", CONTEXT("Card Grid"));
    write(p, "design/patterns/card-grid.md", "# Card Grid\n");
    const done = build(p);
    expect(done.code).toBe(1);
    expect(key(p)).toHaveLength(1);
  });
});

describe("the defines report says what is true", () => {
  it("counts as awaiting only the pairs still open: the whole count before an answer, nothing after it", () => {
    const p = ring1Project();
    write(p, "CONTEXT.md", CONTEXT("Card"));
    write(p, "design/patterns/card.md", "# Card\n");
    const blocked = json(build(p).out).data!["wouldWrite"].linkReports.find((r: { link: string }) => r.link === "defines");
    expect(blocked.details.join(" ")).toContain("2 candidate pair(s) await an owner ruling");
    expect(submit(p, [{ fingerprint: key(p)[0]!.fingerprint, choice: "link-all" }]).code).toBe(0);
    const done = capture(["ontology", "build", "--dir", p]);
    expect(done.code).toBe(0);
    expect(report(p).details).toEqual([]);
    expect(done.out).not.toContain("await an owner ruling");
  });
  it("with one term answered and another not, only the pairs of the other are awaited", () => {
    const p = ring1Project();
    write(p, "CONTEXT.md", CONTEXT("Card", "Sign in"));
    write(p, "design/patterns/card.md", "# Card\n");
    build(p);
    const card = key(p).find((k) => Object.keys(k.memberChoices!).some((m) => m.startsWith("term:Card→")))!;
    expect(submit(p, [{ fingerprint: card.fingerprint, choice: "link-all" }]).code).toBe(0);
    const wouldWrite = json(build(p).out).data!["wouldWrite"];
    expect(wouldWrite.linkReports.find((r: { link: string }) => r.link === "defines").details.join(" ")).toContain("1 candidate pair(s) await an owner ruling");
    expect(wouldWrite.linkReports.find((r: { link: string }) => r.link === "defines").written).toBe(2);
  });
});

describe("what the owner ruled standalone", () => {
  it("a candidate ruled standalone is not an orphan: the term and the candidate no other link reaches are marked", () => {
    const p = ring1Project();
    write(p, "CONTEXT.md", CONTEXT("Card"));
    write(p, "design/patterns/card.md", "# Card\n");
    build(p);
    expect(submit(p, [{ fingerprint: key(p)[0]!.fingerprint, choice: "standalone" }]).code).toBe(0);
    expect(build(p).code).toBe(0);
    const nodes = ontologyOf(p).nodes;
    for (const id of ["term:Card", "pattern:card"]) expect(nodes.find((n) => n.id === id), id).toMatchObject({ standalone: true });
    expect(nodes.find((n) => n.id === "component:Card")!["standalone"]).toBeUndefined(); // linked by a screen's instances: not an orphan anyway
  });
  it("a term is standalone only when none of its pairs is linked; a node ruled standalone but linked elsewhere is not marked", () => {
    const p = ring1Project();
    write(p, "CONTEXT.md", CONTEXT("Card"));
    write(p, "design/patterns/card.md", "# Card\n");
    build(p);
    const entry = key(p)[0]!;
    const [a, b] = entry.perMemberAnswer!.members as [string, string];
    expect(submit(p, [{ fingerprint: entry.fingerprint, choice: "review-individually", members: { [a]: "link", [b]: "standalone" } }]).code).toBe(0);
    expect(build(p).code).toBe(0);
    const o = ontologyOf(p);
    expect(o.nodes.find((n) => n.id === "term:Card")!["standalone"]).toBeUndefined();
    expect(o.links.filter((l) => l.kind === "defines")).toHaveLength(1);
    const declined = b.split("→")[1]!;
    expect(o.nodes.find((n) => n.id === declined)).toMatchObject({ standalone: true });
  });
  it("an orphan no open question covers is counted under what no question covers, once every question is answered", () => {
    const p = ring1Project();
    write(p, "CONTEXT.md", CONTEXT("Card"));
    write(p, "design/patterns/card.md", "# Card\n");
    write(p, "design/patterns/lonely.md", "# Lonely\n");
    build(p);
    submit(p, [{ fingerprint: key(p)[0]!.fingerprint, choice: "link-all" }]);
    expect(build(p).code).toBe(0);
    expect(ontologyOf(p)["uncovered"]).toContainEqual({ kind: "pattern", count: 1 });
  });
});
