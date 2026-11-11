/**
 * The readers of node sources: one per kind, a missing source yields zero nodes and one summary line (never a failure,
 * never an invented node), proposals and a draft soul are not nodes, an unsealed or tampered store is refused, and an id
 * carries no position and no path.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readNodeSources } from "../src/core/ontology/node-sources.js";
import { OntologyReadError } from "../src/core/ontology/read-error.js";
import { soulRuleKey } from "../src/core/ontology/node-ids.js";
import { read, ring1Project, write } from "./ontology-helpers.js";

const kindCount = (project: string, kind: string): number => readNodeSources(project).nodes.filter((n) => n.kind === kind).length;
const report = (project: string, kind: string): { status: string; nodes: number; note: string } => readNodeSources(project).reports.find((r) => r.kind === kind)!;

describe("every source of the ring-1 project is read once", () => {
  it("yields the nodes of each kind whose source exists, and none of the ring-2 kinds", () => {
    const p = ring1Project();
    const by = (k: string): number => kindCount(p, k);
    expect([by("project"), by("token"), by("component"), by("screen"), by("rule"), by("gate")]).toEqual([1, 3, 3, 2, 4, 7]);
    for (const k of ["ruling", "principle", "term", "pattern", "app", "feature"]) expect(by(k), k).toBe(0);
  });
});

describe("a missing source yields zero nodes and one summary line, and never fails the build", () => {
  it("an empty directory still builds: the project node, the gates, and one line per missing source", () => {
    const empty = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "ontology-empty-"));
    const s = readNodeSources(empty);
    expect(s.nodes.map((n) => n.kind).filter((k) => k !== "gate")).toEqual(["project"]);
    const missing = s.reports.filter((r) => r.status !== "read");
    expect(missing.map((r) => r.kind)).toEqual(["token", "component", "screen", "rule", "ruling", "principle", "term", "pattern", "app", "feature"]);
    for (const r of missing) { expect(r.nodes).toBe(0); expect(r.note.length).toBeGreaterThan(10); }
    expect(report(empty, "rule").status).toBe("not-sensed");
  });
  it.each([
    ["the scan", "design/ds.json", "screen"],
    ["the soul", "design/soul.md", "rule"],
  ])("without %s the kind it feeds loses its nodes and says why", (_label, rel, kind) => {
    const p = ring1Project({ promoted: false });
    const before = kindCount(p, kind);
    rmSync(join(p, rel));
    expect(kindCount(p, kind)).toBeLessThan(before);
    expect(report(p, kind).note).toContain(rel === "design/ds.json" ? "no Figma scan" : "absent");
  });
  it("a sealed registry that is not there is a missing source with the commands that produce one", () => {
    const p = ring1Project();
    for (const f of ["design/ds.manifest.json", "design/design.tokens.json", "design/component-registry.json"]) rmSync(join(p, f));
    expect(report(p, "component")).toMatchObject({ status: "missing", nodes: 0 });
    expect(report(p, "token").note).toContain("ui ds import");
  });
});

describe("what is not law is not a node", () => {
  it("proposals are counted and never nodes", () => {
    const p = ring1Project();
    const s = readNodeSources(p);
    expect(s.rules.proposals.soul).toBeGreaterThan(0);
    expect(s.rules.proposals.rules).toBeGreaterThan(0);
    expect(s.nodes.filter((n) => n.kind === "rule")).toHaveLength(4);
    expect(s.reports.find((r) => r.kind === "rule")!.note).toContain("proposal(s) waiting, not nodes");
  });
  it("a soul that is still a draft contributes no rule node and the line says to ratify it", () => {
    const p = ring1Project({ promoted: false });
    write(p, "design/soul.md", read(p, "design/soul.md").replace("status: ratified", "status: draft"));
    expect(kindCount(p, "rule")).toBe(0);
    expect(report(p, "rule")).toMatchObject({ status: "not-sensed" });
    expect(report(p, "rule").note).toContain("not ratified");
  });
});

describe("a source that is not sealed or cannot be read is refused by name", () => {
  it("a tampered registry is refused (DS_TAMPERED) and the message says to reseal", () => {
    const p = ring1Project();
    const file = join(p, "design", "component-registry.json");
    writeFileSync(file, readFileSync(file, "utf8").replace('"Card"', '"Cardx"'));
    expect(() => readNodeSources(p)).toThrow(OntologyReadError);
    expect(() => readNodeSources(p)).toThrow(/ui ds reseal/);
    try { readNodeSources(p); } catch (e) { expect((e as OntologyReadError).code).toBe("DS_TAMPERED"); }
  });
  it("an unreadable ring-2 file is refused by name, not read as missing", () => {
    const p = ring1Project();
    write(p, "design/knowledge/rulings.json", "{ not json");
    try { readNodeSources(p); expect.unreachable(); } catch (e) { expect((e as OntologyReadError).code).toBe("ONTOLOGY_BAD_SOURCE"); }
  });
});

describe("an id carries no position and no path", () => {
  it("a soul rule is keyed by its section and a hash of its whitespace-collapsed text, whatever its position", () => {
    expect(soulRuleKey("never", "Never   use\n a raw hex.")).toBe(soulRuleKey("never", "Never use a raw hex."));
    expect(soulRuleKey("never", "x")).not.toBe(soulRuleKey("always", "x"));
    expect(soulRuleKey("never", "x")).toMatch(/^never:[0-9a-f]{12}$/);
  });
  it("reordering the soul bullets and the scan frames leaves every id as it was", () => {
    const p = ring1Project();
    const ids = (): string[] => readNodeSources(p).nodes.map((n) => n.id);
    const before = ids();
    const soul = read(p, "design/soul.md");
    write(p, "design/soul.md", soul.replace("- Never use a raw hex colour where a token exists.\n- Never stack more than one primary action in a view.", "- Never stack more than one primary action in a view.\n- Never use a raw hex colour where a token exists."));
    const scan = JSON.parse(read(p, "design/ds.json")) as { frames: unknown[] };
    scan.frames.reverse();
    write(p, "design/ds.json", JSON.stringify(scan));
    expect(ids()).toEqual(before);
  });
});
