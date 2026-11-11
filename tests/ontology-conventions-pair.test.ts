/**
 * Measured conventions in machine form: `ui synthesize-conventions` writes `design/conventions.json` together with
 * `CONVENTIONS.md`, the Markdown being a pure render of the JSON; `ui ontology lint` reports the pair when one differs
 * from a fresh emit of the other; `rule` nodes with `origin: "convention"` carry the measured counts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDnaFile, parseDsScale, synthesizeConventions } from "../src/core/figma-conventions-synth.js";
import { renderConventionsMarkdown } from "../src/core/ontology/conventions-machine-form.js";
import { build, json, lint, must, ontologyOf, read, ring1Project, write } from "./ontology-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

const DNA = join(process.cwd(), "tests", "fixtures", "figma-conventions", "usage-dna.json");
const DS = join(process.cwd(), "tests", "fixtures", "figma-conventions", "ds-scale.json");
const withConventions = (...extra: string[]): string => { const p = ring1Project(); must(["synthesize-conventions", DNA, "--out", p, ...extra]); return p; };
const pairFindings = (p: string): { code: string; severity: string; message: string }[] => (json(lint(p).out).data!["findings"] as { code: string; severity: string; message: string }[]).filter((f) => f.code === "CONVENTIONS_PAIR_DRIFT");

describe("synthesize-conventions writes the pair", () => {
  it("writes design/conventions.json beside CONVENTIONS.md, and the Markdown is exactly a render of the JSON", () => {
    const p = withConventions("--ds", DS);
    const doc = JSON.parse(read(p, "design/conventions.json"));
    expect(doc.schema).toBe("design-os-conventions/1");
    expect(read(p, "CONVENTIONS.md")).toBe(renderConventionsMarkdown(doc));
  });
  it("renders the same Markdown the synthesis alone produced, with and without a design-system scale", () => {
    for (const extra of [["--ds", DS], []]) {
      const p = withConventions(...extra);
      const direct = synthesizeConventions(parseDnaFile(JSON.parse(readFileSync(DNA, "utf8"))), extra.length === 0 ? undefined : parseDsScale(JSON.parse(readFileSync(DS, "utf8"))), "usage-dna.json").conventionsMd;
      expect(read(p, "CONVENTIONS.md")).toBe(direct);
    }
  });
  it("carries no time and gives the same bytes twice", () => {
    const a = withConventions("--ds", DS);
    const b = withConventions("--ds", DS);
    expect(read(a, "design/conventions.json")).toBe(read(b, "design/conventions.json"));
    expect(read(a, "design/conventions.json")).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
  it("names the machine form in its text output", () => {
    const p = ring1Project();
    expect(capture(["synthesize-conventions", DNA, "--out", p]).out).toContain("design/conventions.json");
  });
});

describe("rule nodes with origin convention", () => {
  it("carry the measured counts: on how many of how many uses", () => {
    const p = withConventions("--ds", DS);
    expect(build(p).code).toBe(0);
    const doc = JSON.parse(read(p, "design/conventions.json"));
    const nodes = ontologyOf(p).nodes.filter((n) => n.kind === "rule" && n["origin"] === "convention");
    expect(nodes.length).toBe(doc.rules.length);
    expect(nodes.length).toBeGreaterThan(0);
    for (const r of doc.rules) {
      const node = nodes.find((n) => n.id === `rule:convention:${r.id}`)!;
      expect(node["measured"]).toEqual(r.measured);
      expect(r.measured.of).toBeGreaterThan(0);
    }
    const radius = nodes.find((n) => n.id === "rule:convention:radius.dominant")!;
    expect((radius["measured"] as { on: number; of: number }).on).toBeLessThanOrEqual((radius["measured"] as { of: number }).of);
  });
  it("exist only when design/conventions.json exists: a CONVENTIONS.md alone makes none", () => {
    const p = ring1Project();
    write(p, "CONVENTIONS.md", "# Applied Conventions\n");
    build(p);
    expect(ontologyOf(p).nodes.some((n) => n["origin"] === "convention")).toBe(false);
  });
});

describe("the lint reports a pair that differs", () => {
  it("is silent on a pair written together", () => {
    const p = withConventions("--ds", DS);
    build(p);
    expect(pairFindings(p)).toEqual([]);
  });
  it("reports an edited CONVENTIONS.md as an error naming the command that writes the pair", () => {
    const p = withConventions("--ds", DS);
    write(p, "CONVENTIONS.md", `${read(p, "CONVENTIONS.md")}\nA hand-written line.\n`);
    const f = pairFindings(p);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ severity: "error" });
    expect(f[0]!.message).toContain("ui synthesize-conventions");
  });
  it("reports an edited design/conventions.json whose Markdown was not re-rendered", () => {
    const p = withConventions("--ds", DS);
    const doc = JSON.parse(read(p, "design/conventions.json"));
    doc.totals.autoFrames += 1;
    write(p, "design/conventions.json", `${JSON.stringify(doc, null, 2)}\n`);
    expect(pairFindings(p).map((f) => f.message.split(" ")[0])).toEqual(["the", "CONVENTIONS.md"]); // the stored rules no longer follow the totals, and the Markdown is not their render
  });
  it("reports the JSON without its Markdown as an error, and the Markdown without its JSON as a warning", () => {
    const p = withConventions();
    write(p, "CONVENTIONS.md", "");
    expect(pairFindings(p)[0]).toMatchObject({ severity: "error" });
    const q = ring1Project();
    write(q, "CONVENTIONS.md", "# Applied Conventions\n");
    expect(pairFindings(q)[0]).toMatchObject({ severity: "warning" });
  });
  it("refuses a design/conventions.json that is not the schema, by name, in the build", () => {
    const p = ring1Project();
    write(p, "design/conventions.json", JSON.stringify({ schema: "other" }));
    const done = build(p);
    expect(done.code).toBe(1);
    expect(json(done.out).error!.code).toBe("ONTOLOGY_BAD_SOURCE");
  });
});
