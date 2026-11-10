/**
 * Skipped variables are counted and asked about, every item of a scan is accounted for in the ledger, and the
 * component → token links are read from the bound variables by id, never inferred.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDsFile, planIngest } from "../src/core/figma-ds-ingest.js";
import { buildLedger } from "../src/core/figma-ds-ledger.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { aliasTo, colorVar, comp, ingestArgs, ingestUntilReady, newProject, preferring, scanOf, takeRecommended, writeScan } from "./figma-ingest-helpers.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";

const FIX = (name: string): string => join(process.cwd(), "tests", "fixtures", "owner-rulings", name);
const blocked = (out: string): Cluster[] => JSON.parse(out).data.blocked.clusters as Cluster[];

/** One variable of each reason the Figma door can skip for, beside a good one. */
const reasons = (): Record<string, unknown> => scanOf({ tokens: [
  colorVar("1:1", "color/good", "Core"),
  { id: "VariableID:2:1", name: "flags/enabled", type: "BOOLEAN", collection: "Core", value: true },
  { id: "VariableID:3:1", name: "color/empty", type: "COLOR", collection: "Core", value: null },
  colorVar("4:1", "color/dangling", "Core", { Light: aliasTo("9:9") }),
  colorVar("5:1", "color/loop-a", "Core", { Light: aliasTo("6:1") }),
  colorVar("6:1", "color/loop-b", "Core", { Light: aliasTo("5:1") }),
  { id: "VariableID:7:1", name: "color/not-a-colour", type: "COLOR", collection: "Core", value: { r: "x", g: 0, b: 0 } },
] });

describe("AC-22 (the Figma door): every skip reason is counted, asked in one question, and nothing is written until it is answered", () => {
  it("raises one untypeable-tokens question sub-grouped by reason, and writes nothing", () => {
    const project = newProject();
    const out = newProject();
    const before = hashTree(out);
    const r = capture([...ingestArgs(writeScan(project, reasons()), project, out), "--json"]);
    expect(r.code).toBe(1);
    expect(hashTree(out)).toBe(before);
    const clusters = blocked(r.out);
    expect(clusters.map((c) => c.kind)).toEqual(["untypeable-tokens"]);
    const q = clusters[0]!;
    expect(q.count).toBe(6);
    expect(q.evidence).toEqual({ byReason: [
      { reason: "alias-cycle", count: 2 }, { reason: "bad-colour", count: 1 }, { reason: "dangling-alias", count: 1 }, { reason: "null-leaf", count: 1 }, { reason: "unmappable-type", count: 1 },
    ] });
    for (const label of ["unmappable type", "null value", "dangling alias", "alias cycle", "bad colour"]) expect(q.question).toContain(label);
    expect(q.options.map((o) => o.id)).toEqual(["keep-raw", "exclude", "review-individually"]);
  });

  it("excluding them counts each reason in the ledger", () => {
    const project = newProject();
    const { final } = ingestUntilReady(writeScan(project, reasons()), project, newProject(), preferring("exclude"), ["--json"]);
    const ledger = JSON.parse(final.out).data.ledger as { in: { total: number }; written: { tokens: number }; excluded: Record<string, number>; pending: number };
    expect(ledger.written.tokens).toBe(1);
    expect(ledger.excluded).toMatchObject({ "unmappable-type": 1, "null-leaf": 1, "dangling-alias": 1, "alias-cycle": 2, "bad-colour": 1, total: 6 });
    expect(ledger.in.total).toBe(7);
  });

  it("keeping them as raw string tokens writes them under raw, and the token file still resolves", () => {
    const project = newProject();
    const out = newProject();
    const { final } = ingestUntilReady(writeScan(project, reasons()), project, out, preferring("keep-raw"), ["--json"]);
    const tree = JSON.parse(readFileSync(join(out, "tokens.json"), "utf8")) as Record<string, Record<string, { $type: string; $value: string }>>;
    expect(Object.keys(tree["raw"]!)).toHaveLength(6);
    expect(Object.values(tree["raw"]!).every((t) => t.$type === "string")).toBe(true);
    expect(() => resolveTokens(parseTokenFile(tree))).not.toThrow();
    expect(JSON.parse(final.out).data.ledger.excluded.total).toBe(0);
  });

  it("review individually decides member by member", () => {
    const project = newProject();
    const path = writeScan(project, reasons());
    const first = capture(ingestArgs(path, project, newProject()));
    expect(first.code).toBe(1);
    const q = (JSON.parse(readFileSync(join(project, ".design-os", "onboard", "pending.json"), "utf8")) as { clusters: Cluster[] }).clusters[0]!;
    const members = Object.fromEntries(q.members.map((m, i) => [m, i === 0 ? "keep-raw" : "exclude"]));
    const file = join(project, "a.json");
    writeFileSync(file, JSON.stringify({ answers: [{ fingerprint: q.fingerprint, choice: "review-individually", members }] }));
    expect(capture(["onboard", "answer", "--file", file, "--cwd", project, "--json"]).code).toBe(0);
    const out = newProject();
    const done = capture([...ingestArgs(path, project, out), "--json"]);
    expect(done.code).toBe(0);
    expect(JSON.parse(done.out).data.ledger.excluded.total).toBe(5);
    expect(Object.keys(JSON.parse(readFileSync(join(out, "tokens.json"), "utf8")).raw)).toHaveLength(1);
  });

  it("a variable that is the loser of a collision is excluded under its own reason, not under a skip reason", () => {
    const project = newProject();
    const scan = scanOf({ tokens: [colorVar("1:1", "x/color/brand", "Same"), colorVar("2:1", "x/color/brand", "Same")] });
    const { final, asked } = ingestUntilReady(writeScan(project, scan), project, newProject(), preferring("keep-first"), ["--json"]);
    expect(asked[0]!.map((c) => c.kind)).toEqual(["token-path-collision"]);
    expect(JSON.parse(final.out).data.ledger.excluded).toMatchObject({ "path-collision": 1, total: 1 });
  });
});

describe("the ledger equation: in = written + excluded + pending", () => {
  const fixtures: [string, string][] = [
    ["control", FIX("control-single-collection-single-page.json")],
    ["mixed", join(process.cwd(), "tests", "fixtures", "figma-ds", "ds-mixed.json")],
    ["plugin scan", join(process.cwd(), "tests", "fixtures", "figma-ds", "ds.json")],
    ["five collections", FIX("variables-five-collections.json")],
    ["eleven pages", FIX("components-eleven-pages.json")],
    ["sensed field shape", FIX("scan-sensed-field-shape.json")],
  ];
  for (const [label, path] of fixtures) {
    it(`holds on ${label}, blocked (everything pending) and written`, () => {
      const ds = parseDsFile(JSON.parse(readFileSync(path, "utf8")));
      const total = ds.tokens.length + ds.components.length;
      const first = planIngest(ds, "s", "s");
      if (first.result === null) expect(first.ledger.pending).toBe(total);
      const project = newProject();
      const { final } = ingestUntilReady(path, project, newProject(), (c) => (c.kind === "figma-library-pages" ? takeRecommended(c) : preferring("exclude-surplus")(c)), ["--json"]);
      const l = JSON.parse(final.out).data.ledger as { in: { total: number }; written: { total: number }; excluded: { total: number }; pending: number };
      expect(l.in.total).toBe(total);
      expect(l.written.total + l.excluded.total + l.pending).toBe(total);
      expect(l.pending).toBe(0);
    });
  }
  it("buildLedger refuses a run whose three parts do not add up", () => {
    const zero = Object.fromEntries(["lucide-name"].map((h) => [h, 0])) as never;
    expect(() => buildLedger({ variables: 3, components: 0, writtenTokens: 1, writtenComponents: 0, excluded: { "null-leaf": 1 }, pending: 0, classifiedByHeuristic: zero })).toThrow(/does not add up/);
  });
  it("the text summary and DESIGN.md end with the ledger", () => {
    const project = newProject();
    const out = newProject();
    const r = capture(ingestArgs(FIX("control-single-collection-single-page.json"), project, out));
    expect(r.out).toContain("ledger");
    expect(r.out).toMatch(/in 17 \(12 variables, 5 nodes\) = written 17/);
    expect(readFileSync(join(out, "DESIGN.md"), "utf8")).toMatch(/## Ledger\n\n- in 17 \(12 variables, 5 nodes\) = written 17/);
  });
});

describe("AC-15 (the Figma door): tokensUsed from the bound variables, by variable id", () => {
  const P = "VariableID:1:1";
  const S = "VariableID:2:1";
  const X = "VariableID:3:1";
  const base = (components: unknown[], sensing?: unknown): Record<string, unknown> => scanOf({
    components, sensing,
    tokens: [
      colorVar("1:1", "primitives/color/blue", "Primitives"), colorVar("2:1", "semantic/color/action", "Semantic", { Light: aliasTo("1:1") }),
      colorVar("3:1", "x/color/brand", "Plugin A"), colorVar("4:1", "x/color/brand", "Plugin B"),
    ],
  });
  const run = (scan: unknown): { data: Record<string, unknown>; registry: { components: { name: string; tokensUsed: string[] }[] }; md: string } => {
    const project = newProject();
    const out = newProject();
    const { final } = ingestUntilReady(writeScan(project, scan), project, out, takeRecommended, ["--json"]);
    return { data: JSON.parse(final.out).data, registry: JSON.parse(readFileSync(join(out, "component-registry.json"), "utf8")), md: readFileSync(join(out, "DESIGN.md"), "utf8") };
  };

  it("every record's tokensUsed equals its bound variables inside the kept collections, primitives included; the rest are listed", () => {
    const { data, registry } = run(base([comp("1:1", "Button", undefined, { boundVariables: [P, S, X, "VariableID:9:9"] }), comp("1:2", "Chip", undefined, { boundVariables: [] })], { status: "complete" }));
    expect(registry.components.find((c) => c.name === "Button")!.tokensUsed).toEqual(["color.action", "color.blue"]);
    expect(registry.components.find((c) => c.name === "Chip")!.tokensUsed).toEqual([]);
    expect(data["bindings"]).toEqual({ sensed: 2, notSensed: 0, linked: 2, excluded: { collections: [{ name: "Plugin A", count: 1 }], notWritten: 0, outsideScan: 1, unsafePath: 0 } });
  });
  it("a scan without the field leaves tokensUsed empty and the link is not-sensed, naming both hosts", () => {
    const { data, registry, md } = run(base([comp("1:1", "Button")]));
    expect(registry.components[0]!.tokensUsed).toEqual([]);
    expect(data["bindings"]).toMatchObject({ sensed: 0, notSensed: 1, linked: 0 });
    expect(md).toContain("Not sensed");
    expect(md).toContain("Figma plugin scan");
    expect(md).toContain("DESIGN:OS Studio scan (version: not released)");
  });
  it("a scan whose sensing was skipped is read as not-sensed even when a field is present", () => {
    const { data, registry } = run(base([comp("1:1", "Button", undefined, { boundVariables: [P] })], { status: "skipped", reason: "timeout" }));
    expect(registry.components[0]!.tokensUsed).toEqual([]);
    expect(data["bindings"]).toMatchObject({ sensed: 0, notSensed: 1 });
  });
  it("not-sensed, unresolved-free and none stay three different answers: an absent field is not an empty list", () => {
    const { data } = run(base([comp("1:1", "A", undefined, { boundVariables: [] }), comp("1:2", "B")]));
    expect(data["bindings"]).toMatchObject({ sensed: 1, notSensed: 1 });
  });
});
