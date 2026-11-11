/**
 * The lint judges the build it would run now, not only the file on disk: after a good build, a change that makes the
 * next build refuse (a duplicate component name, a Markdown that drifted from its JSON) is reported by the refusal's own
 * code, and the stale line never promises that `ui ontology build` rewrites the file. Each test runs the printed action.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashTree } from "./owner-rulings-helpers.js";
import { build, editRegistry, json, lint, must, read, ring1Project, write } from "./ontology-helpers.js";

const DNA = join(process.cwd(), "tests", "fixtures", "figma-conventions", "usage-dna.json");
const DS = join(process.cwd(), "tests", "fixtures", "figma-conventions", "ds-scale.json");
const findings = (p: string): { code: string; message: string }[] => json(lint(p).out).data!["findings"];

describe("after a good build, the lint reports what would refuse the next build", () => {
  it("a duplicate component name: the lint names ONTOLOGY_DUPLICATE_ID and does not say the build rewrites the file", () => {
    const p = ring1Project();
    expect(build(p).code).toBe(0);
    expect(lint(p).code).toBe(0);
    editRegistry(p, (r) => { r.components.push({ ...r.components[0]! }); });
    const all = findings(p);
    expect(all.map((f) => f.code)).toContain("ONTOLOGY_DUPLICATE_ID");
    const stale = all.find((f) => f.code === "ONTOLOGY_STALE")!;
    expect(stale.message).not.toContain("rewrites it");
    expect(stale.message).toContain("refused");
    const before = hashTree(p);
    const action = build(p);
    expect(action.code).toBe(1);
    expect(json(action.out).error!.code).toBe("ONTOLOGY_DUPLICATE_ID");
    expect(hashTree(p)).toBe(before);
  });
  it("a Markdown drift: the lint names CONVENTIONS_PAIR_DRIFT once and does not say the build rewrites the file", () => {
    const p = ring1Project();
    must(["synthesize-conventions", DNA, "--ds", DS, "--out", p]);
    expect(build(p).code).toBe(0);
    write(p, "CONVENTIONS.md", `${read(p, "CONVENTIONS.md")}\nan added line\n`);
    const all = findings(p);
    expect(all.filter((f) => f.code === "CONVENTIONS_PAIR_DRIFT")).toHaveLength(1);
    expect(all.find((f) => f.code === "ONTOLOGY_STALE")!.message).not.toContain("rewrites it");
    expect(build(p).code).toBe(1);
  });
  it("an edit the build accepts keeps the plain sentence, and that action works", () => {
    const p = ring1Project();
    expect(build(p).code).toBe(0);
    write(p, "design/knowledge/rulings.json", JSON.stringify({ rulings: [{ id: "R-1", text: "t", scope: "global" }] }));
    expect(findings(p).find((f) => f.code === "ONTOLOGY_STALE")!.message).toContain("ui ontology build rewrites it");
    expect(build(p).code).toBe(0);
    expect(lint(p).code).toBe(0);
  });
  it("a graph error shared by the file and the fresh build is reported once", () => {
    const p = ring1Project();
    editRegistry(p, (r) => { r.components.push({ ...r.components[0]! }); });
    const dup = findings(p).filter((f) => f.code === "ONTOLOGY_DUPLICATE_ID");
    expect(dup).toHaveLength(1);
  });
});
