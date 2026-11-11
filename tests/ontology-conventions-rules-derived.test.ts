/**
 * The convention `rule` nodes are derived from `totals` by the one function that derives them; the stored `rules` list is
 * never trusted. A stored list that differs from the derived one is `CONVENTIONS_PAIR_DRIFT`, and an edited or added rule
 * never becomes a node.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build, json, lint, must, ontologyOf, read, ring1Project, write } from "./ontology-helpers.js";

const DNA = join(process.cwd(), "tests", "fixtures", "figma-conventions", "usage-dna.json");
const DS = join(process.cwd(), "tests", "fixtures", "figma-conventions", "ds-scale.json");
const PAIR = "design/conventions.json";
const pair = (): string => { const p = ring1Project(); must(["synthesize-conventions", DNA, "--ds", DS, "--out", p]); return p; };
const edit = (p: string, change: (doc: Record<string, any>) => void): void => { const doc = JSON.parse(read(p, PAIR)); change(doc); write(p, PAIR, `${JSON.stringify(doc, null, 2)}\n`); }; // eslint-disable-line @typescript-eslint/no-explicit-any
const drift = (p: string): { severity: string; message: string }[] => (json(lint(p).out).data!["findings"] as { code: string; severity: string; message: string }[]).filter((f) => f.code === "CONVENTIONS_PAIR_DRIFT");
const conventionNodes = (p: string): { id: string; name: string; measured: unknown }[] => ontologyOf(p).nodes.filter((n) => n.kind === "rule" && n["origin"] === "convention") as never;

describe("a stored rule that totals do not give", () => {
  it("an untouched pair is consistent, and its nodes are the derived rules", () => {
    const p = pair();
    expect(drift(p)).toEqual([]);
    expect(build(p).code).toBe(0);
    expect(conventionNodes(p).map((n) => n.id).sort()).toEqual(JSON.parse(read(p, PAIR)).rules.map((r: { id: string }) => `rule:convention:${r.id}`).sort());
  });
  it("one edited count in a stored rule is an error, and the node carries the count the totals give", () => {
    const p = pair();
    const first = JSON.parse(read(p, PAIR)).rules[0] as { id: string; measured: { on: number } };
    const truth = first.measured.on;
    edit(p, (d) => { d["rules"][0].measured.on = truth + 1000; });
    expect(drift(p)).toMatchObject([{ severity: "error" }]);
    expect(build(p).code).toBe(0);
    expect(JSON.stringify(conventionNodes(p).map((n) => n.measured))).not.toContain(String(truth + 1000));
    expect((conventionNodes(p).find((n) => n.id === `rule:convention:${first.id}`)!.measured as { on: number }).on).toBe(truth);
    expect(drift(p)[0]!.message).toContain("rules");
  });
  it("one edited statement is an error, and the edited wording is not a node", () => {
    const p = pair();
    edit(p, (d) => { d["rules"][0].statement = "Do whatever you like"; });
    expect(drift(p)).toMatchObject([{ severity: "error" }]);
    expect(build(p).code).toBe(0);
    expect(conventionNodes(p).some((n) => n.name === "Do whatever you like")).toBe(false);
  });
  it("one added rule is an error, and it is not a node", () => {
    const p = pair();
    const clean = pair();
    expect(build(clean).code).toBe(0);
    const before = conventionNodes(clean).length;
    edit(p, (d) => { d["rules"].push({ id: "color.invented", category: "color", statement: "Invented", measured: { on: 1, of: 1 } }); });
    expect(drift(p)).toMatchObject([{ severity: "error" }]);
    expect(build(p).code).toBe(0);
    expect(conventionNodes(p)).toHaveLength(before);
    expect(conventionNodes(p).some((n) => n.id === "rule:convention:color.invented")).toBe(false);
  });
  it("an edited count in totals is an error too: the Markdown no longer renders from it", () => {
    const p = pair();
    edit(p, (d) => { d["totals"].autoFrames += 7; });
    expect(drift(p).length).toBeGreaterThanOrEqual(1);
    expect(drift(p).every((f) => f.severity === "error")).toBe(true);
  });
  it("a totals list that is not rows is refused by name, never an internal error", () => {
    const p = pair();
    edit(p, (d) => { d["totals"].spacing = ["a"]; });
    const done = build(p);
    expect(done.code).toBe(1);
    expect(json(done.out).error!.code).toBe("ONTOLOGY_BAD_SOURCE");
  });
});
