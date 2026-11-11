/**
 * Conventions are read only as a consistent pair: the stored `rules` equal the rules derived from the stored `totals`,
 * and `CONVENTIONS.md` equals a render of the JSON. While the pair drifts the build refuses with
 * `CONVENTIONS_PAIR_DRIFT`, writes nothing, and no convention node exists; the lint reports the same drift through the
 * same function. A pair forged consistently is a known limit (docs).
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hashTree } from "./owner-rulings-helpers.js";
import { build, json, lint, must, ontologyOf, read, ring1Project, write } from "./ontology-helpers.js";

const DNA = join(process.cwd(), "tests", "fixtures", "figma-conventions", "usage-dna.json");
const DS = join(process.cwd(), "tests", "fixtures", "figma-conventions", "ds-scale.json");
const PAIR = "design/conventions.json";
const pair = (): string => { const p = ring1Project(); must(["synthesize-conventions", DNA, "--ds", DS, "--out", p]); return p; };
const edit = (p: string, change: (doc: Record<string, any>) => void): void => { const doc = JSON.parse(read(p, PAIR)); change(doc); write(p, PAIR, `${JSON.stringify(doc, null, 2)}\n`); }; // eslint-disable-line @typescript-eslint/no-explicit-any
const drift = (p: string): { severity: string; message: string }[] => (json(lint(p).out).data!["findings"] as { code: string; severity: string; message: string }[]).filter((f) => f.code === "CONVENTIONS_PAIR_DRIFT");
const refused = (p: string): { code: string; message: string } => {
  const before = hashTree(p);
  const done = build(p);
  expect(done.code).toBe(1);
  expect(hashTree(p)).toBe(before);
  return json(done.out).error!;
};

describe("an untouched pair", () => {
  it("is consistent, and its nodes are the derived rules with the measured counts", () => {
    const p = pair();
    expect(drift(p)).toEqual([]);
    expect(build(p).code).toBe(0);
    const nodes = ontologyOf(p).nodes.filter((n) => n.kind === "rule" && n["origin"] === "convention");
    expect(nodes.map((n) => n.id).sort()).toEqual(JSON.parse(read(p, PAIR)).rules.map((r: { id: string }) => `rule:convention:${r.id}`).sort());
    expect(nodes.every((n) => (n["measured"] as { of: number }).of > 0)).toBe(true);
  });
});

describe("a pair that drifts is refused by the build and reported by the lint, with the same sentence", () => {
  it("one edited totals row: refused, nothing written", () => {
    const p = pair();
    edit(p, (d) => { d["totals"].radius[0][1] += 984; });
    const err = refused(p);
    expect(err.code).toBe("CONVENTIONS_PAIR_DRIFT");
    expect(err.message).toContain("ui synthesize-conventions emits the pair again");
    expect(drift(p).map((f) => f.message).every((m) => err.message.includes(m))).toBe(true);
  });
  it("the Markdown edited alone: refused, and the sentence says it is the Markdown that differs", () => {
    const p = pair();
    write(p, "CONVENTIONS.md", `${read(p, "CONVENTIONS.md")}\nan added line\n`);
    const err = refused(p);
    expect(err.code).toBe("CONVENTIONS_PAIR_DRIFT");
    expect(err.message).toContain("CONVENTIONS.md differs from a render");
    expect(err.message).not.toContain("rules stored");
  });
  it("one edited count in a stored rule: refused, and the lint names the stored rules", () => {
    const p = pair();
    edit(p, (d) => { d["rules"][0].measured.on += 1000; });
    expect(refused(p).message).toContain("the rules stored in design/conventions.json differ");
    expect(drift(p)[0]).toMatchObject({ severity: "error" });
  });
  it("one edited statement, and one added rule: each refused", () => {
    const a = pair();
    edit(a, (d) => { d["rules"][0].statement = "Do whatever you like"; });
    expect(refused(a).code).toBe("CONVENTIONS_PAIR_DRIFT");
    const b = pair();
    edit(b, (d) => { d["rules"].push({ id: "color.invented", category: "color", statement: "Invented", measured: { on: 1, of: 1 } }); });
    expect(refused(b).code).toBe("CONVENTIONS_PAIR_DRIFT");
  });
  it("the Markdown missing: refused", () => {
    const p = pair();
    write(p, "CONVENTIONS.md", "");
    expect(refused(p).message).toContain("CONVENTIONS.md differs from a render");
  });
  it("the lint never says a stored rule 'becomes no node' while a node exists: after the change none exists", () => {
    const p = pair();
    edit(p, (d) => { d["rules"][0].measured.on += 1; });
    expect(drift(p).every((f) => !f.message.includes("becomes no node"))).toBe(true);
  });
  it("a totals list that is not rows is refused by name, never an internal error", () => {
    const p = pair();
    edit(p, (d) => { d["totals"].spacing = ["a"]; });
    expect(refused(p).code).toBe("ONTOLOGY_BAD_SOURCE");
  });
});
