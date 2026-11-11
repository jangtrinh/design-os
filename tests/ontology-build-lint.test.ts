/**
 * `ui ontology build` and `ui ontology lint`: the schema, determinism (the same tree twice, and from another checkout
 * path), what the build reads, what blocks it, and what the lint refuses: a dangling link, a duplicate id, a stale file,
 * orphans (a warning, an error under --strict) and the coverage table, which is always printed.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { build, json, lint, ontologyOf, read, ring1Project, write } from "./ontology-helpers.js";
import type { Scan } from "./ontology-helpers.js";

const ROOT = process.cwd();
const FILE = "design/knowledge/ontology.json";
const validate = new Ajv({ allErrors: true }).compile(JSON.parse(readFileSync(join(ROOT, "schemas", "ontology.schema.json"), "utf8")));
const edit = (p: string, change: (o: Record<string, any>) => void): void => { const o = JSON.parse(read(p, FILE)); change(o); write(p, FILE, `${JSON.stringify(o, null, 2)}\n`); }; // eslint-disable-line @typescript-eslint/no-explicit-any
const built = (): string => { const p = ring1Project(); expect(build(p).code).toBe(0); return p; };

describe("the file", () => {
  it("validates against schemas/ontology.schema.json, and each way to break the contract is refused", () => {
    const p = built();
    const o = ontologyOf(p);
    expect(validate(o), JSON.stringify(validate.errors)).toBe(true);
    const bad = (change: (x: Record<string, any>) => void): boolean => { const c = JSON.parse(JSON.stringify(o)); change(c); return validate(c) as boolean; }; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(bad((c) => { c["schema"] = "design-os-ontology/2"; })).toBe(false);
    expect(bad((c) => { c["nodes"][0].kind = "widget"; })).toBe(false);
    expect(bad((c) => { c["links"][0].kind = "owns"; })).toBe(false);
    expect(bad((c) => { c["generatedAt"] = "2026-11-11T00:00:00Z"; })).toBe(false);
  });
  it("carries no timestamp, no absolute path and no home directory", () => {
    const p = built();
    const text = read(p, FILE);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/);
    expect(text).not.toContain(p);
    expect(text).not.toMatch(/\/Users\/|\/home\/|\/private\/|\/var\/folders\//);
  });
  it("is the same bytes on a second build, and from a copy of the tree at another path", () => {
    const p = built();
    const first = read(p, FILE);
    build(p);
    expect(read(p, FILE)).toBe(first);
    const copy = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ontology-copy-"));
    cpSync(p, copy, { recursive: true });
    rmSync(join(copy, FILE));
    expect(copy).not.toBe(p);
    expect(build(copy).code).toBe(0);
    expect(read(copy, FILE)).toBe(first);
  });
  it("is written where --out says, relative to the project", () => {
    const p = ring1Project();
    expect(build(p, "--out", "out/graph.json").code).toBe(0);
    expect(existsSync(join(p, "out/graph.json"))).toBe(true);
    expect(existsSync(join(p, FILE))).toBe(false);
  });
});

describe("what the build reads and refuses", () => {
  it("builds from a project with nothing but a sealed store: missing sources are reported, never an error", () => {
    const p = ring1Project({ scan: false, soul: false });
    const done = build(p);
    expect(done.code).toBe(0);
    const sources = Object.fromEntries(ontologyOf(p).sources.map((s) => [s.kind, s.status]));
    expect(sources).toMatchObject({ token: "read", component: "read", screen: "missing", rule: "not-sensed", ruling: "missing" });
  });
  it("refuses a tampered registry and writes nothing", () => {
    const p = ring1Project();
    const file = join(p, "design", "component-registry.json");
    writeFileSync(file, readFileSync(file, "utf8").replace('"Card"', '"Cardx"'));
    const before = hashTree(p, [".design-os"]);
    const done = build(p);
    expect(done.code).toBe(1);
    expect(json(done.out).error!.code).toBe("DS_TAMPERED");
    expect(hashTree(p, [".design-os"])).toBe(before);
  });
  it("reads a registry that is present but not sealed as a missing source that says how to seal it", () => {
    const p = ring1Project();
    rmSync(join(p, "design", "ds.manifest.json"));
    expect(build(p).code).toBe(0);
    const component = ontologyOf(p).sources.find((x) => x.kind === "component")!;
    expect(component.status).toBe("missing");
    expect(component.note).toContain("is not sealed");
  });
  it("rejects an unknown flag and a missing project directory, with the meaning first and the code after it", () => {
    expect(capture(["ontology", "build", "--bogus"]).err).toContain("unknown flag '--bogus'");
    expect(capture(["ontology", "build", "--dir", join(ROOT, "no-such-directory")]).err).toMatch(/cannot read the project directory .+ \(READ_ERROR\)/);
    expect(capture(["ontology", "nope"]).err).toContain("unknown subcommand");
  });
  it("the text of a build leads with what was written, lists every source, the coverage and each link kind", () => {
    const p = ring1Project();
    const out = capture(["ontology", "build", "--dir", p]).out;
    expect(out).toMatch(/^Ontology written: \d+ node\(s\), \d+ link\(s\) in design\/knowledge\/ontology\.json/);
    for (const part of ["Sources", "Coverage", "Links", "uses-component", "consumes-token", "Next: ui ontology lint"]) expect(out).toContain(part);
  });
});

describe("ui ontology lint", () => {
  it("passes on a fresh build, prints the coverage table, and writes nothing", () => {
    const p = built();
    const before = hashTree(p);
    const done = lint(p);
    expect(done.code).toBe(0);
    expect(json(done.out).data!["coverage"].map((r: { kind: string }) => r.kind)).toContain("component");
    expect(capture(["ontology", "lint", "--dir", p]).out).toContain("source missing");
    expect(hashTree(p)).toBe(before);
  });
  it("a missing file is stale: it says to build", () => {
    const p = ring1Project();
    const done = lint(p);
    expect(done.code).toBe(1);
    expect(json(done.out).data!["findings"][0]).toMatchObject({ code: "ONTOLOGY_STALE", severity: "error" });
    expect(json(done.out).data!["findings"][0].message).toContain("ui ontology build");
  });
  it("a source that changed after the build makes the file stale, by re-emit and compare", () => {
    const p = built();
    const scan = JSON.parse(read(p, "design/ds.json")) as Scan;
    scan.frames![0]!["name"] = "Sign in again";
    write(p, "design/ds.json", JSON.stringify(scan));
    const done = lint(p);
    expect(done.code).toBe(1);
    expect(json(done.out).data!["findings"].map((f: { code: string }) => f.code)).toContain("ONTOLOGY_STALE");
  });
  it("a link to a node that does not exist is an error naming the link", () => {
    const p = built();
    edit(p, (o) => { o["links"].push({ kind: "uses-component", from: "screen:5:1", to: "component:Ghost" }); });
    const f = json(lint(p).out).data!["findings"] as { code: string; message: string }[];
    expect(f.find((x) => x.code === "ONTOLOGY_DANGLING_LINK")!.message).toContain("component:Ghost");
  });
  it("a node id that appears twice is an error", () => {
    const p = built();
    edit(p, (o) => { o["nodes"].push({ ...o["nodes"][0] }); });
    expect((json(lint(p).out).data!["findings"] as { code: string }[]).map((x) => x.code)).toContain("ONTOLOGY_DUPLICATE_ID");
  });
  it("an orphan is a warning, and an error only under --strict", () => {
    const p = ring1Project();
    write(p, "design/patterns/lonely.md", "# Lonely\n");
    build(p);
    const soft = lint(p);
    expect(soft.code).toBe(0);
    expect((json(soft.out).data!["findings"] as { code: string; severity: string; message: string }[]).find((f) => f.code === "ONTOLOGY_ORPHAN")).toMatchObject({ severity: "warning" });
    const strict = lint(p, "--strict");
    expect(strict.code).toBe(1);
    expect((json(strict.out).data!["findings"] as { code: string; severity: string }[]).find((f) => f.code === "ONTOLOGY_ORPHAN")).toMatchObject({ severity: "error" });
  });
  it("an open question blocks a fresh emit: the lint reports it as an error that names ui onboard questions, and raises nothing", () => {
    const p = built();
    write(p, "CONTEXT.md", "**Card**:\nA card.\n");
    const before = hashTree(p);
    const done = lint(p);
    expect(done.code).toBe(1);
    const f = (json(done.out).data!["findings"] as { code: string; message: string }[]).find((x) => x.code === "ONBOARD_BLOCKED_NEEDS_OWNER_RULING")!;
    expect(f.message).toContain("ui onboard questions");
    expect(hashTree(p)).toBe(before);
  });
  it("the text puts the meaning first and the code after it, and prints the coverage table even when it fails", () => {
    const p = ring1Project();
    const out = capture(["ontology", "lint", "--dir", p]).out;
    expect(out).toMatch(/error: .+ \(ONTOLOGY_STALE\)/);
    expect(out).toContain("Coverage");
  });
});
