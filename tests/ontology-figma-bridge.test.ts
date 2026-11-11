/**
 * The bridge from a Figma instance to a registry record. A component found in one door is never linked by name alone
 * to a record of the other door (`component-source-match` is the question that links them), so only a record the
 * Figma ingest wrote takes part: one with no provenance, including one the owner linked to code. The name is derived
 * exactly as the ingest derives it, with the ingest's own function and flags, so a kept-deprecated component ties.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build, codeProject, editRegistry, ontologyOf, read, ring1Project, write } from "./ontology-helpers.js";
import type { Scan } from "./ontology-helpers.js";

const RING1_SCAN = join(process.cwd(), "tests", "fixtures", "ontology", "ring1", "ds.json");
const pairs = (p: string): string[] => ontologyOf(p).links.filter((l) => l.kind === "uses-component").map((l) => `${l.from}>${l.to}`).sort();
const uses = (p: string): ReturnType<typeof ontologyOf>["linkReports"][number] => ontologyOf(p).linkReports.find((r) => r.link === "uses-component")!;

/** The code project with a Figma scan placed beside it: one page of frames, components named like the code ones. */
function crossDoor(): string {
  const p = codeProject();
  const scan = JSON.parse(readFileSync(RING1_SCAN, "utf8")) as Scan;
  scan.frames = scan.frames!.filter((f) => f["page"].id === "0:2");
  write(p, "design/ds.json", JSON.stringify(scan));
  return p;
}

describe("only a record the Figma ingest wrote ties to a scan component", () => {
  it("a record registered from code that merely shares a name is never linked: counted unresolved with its own reason line", () => {
    const p = crossDoor();
    const names = JSON.parse(read(p, "design/component-registry.json")).components.map((c: { name: string; provenance?: { kind: string } }) => `${c.name}:${c.provenance?.kind}`) as string[];
    expect(names.some((n) => n.startsWith("Button:code"))).toBe(true);
    expect(build(p).code).toBe(0);
    expect(pairs(p).filter((l) => l.startsWith("screen:5:"))).toEqual([]);
    const r = uses(p);
    expect(r.details.join(" ")).toMatch(/\d+ reference\(s\) match only a record another door wrote \(registered from code, or any provenance the Figma ingest does not write\), which is never tied to a Figma component by name: .*Button/);
    expect(r.unresolved).toBeGreaterThanOrEqual(1);
  });
  it("a record the owner linked to code keeps no provenance and still ties", () => {
    const p = ring1Project();
    expect(build(p).code).toBe(0);
    const before = pairs(p);
    expect(before).toContain("screen:5:1>component:Button");
    editRegistry(p, (registry) => { registry.components.find((c) => c["name"] === "Button")!["code"] = { sourceRef: "src/Button.tsx:1-9", sha256: "a".repeat(64) }; });
    expect(build(p).code).toBe(0);
    expect(pairs(p)).toEqual(before);
    expect(ontologyOf(p).nodes.find((n) => n.id === "component:Button")!["codeFile"]).toBe("src/Button.tsx");
  });
  it("a record with a code provenance never ties, even when it is the only record of that name", () => {
    const p = ring1Project();
    editRegistry(p, (registry) => { registry.components.find((c) => c["name"] === "Card")!["provenance"] = { kind: "code", sourceRef: "src/Card.tsx:1-9", sha256: "b".repeat(64) }; });
    expect(build(p).code).toBe(0);
    expect(pairs(p).some((l) => l.endsWith(">component:Card"))).toBe(false);
    expect(uses(p).details.join(" ")).toContain("match only a record another door wrote");
  });
});

describe("the name is the one the ingest derived", () => {
  it("a component kept as deprecated ties to its record: the archive marker is stripped as the ingest strips it", () => {
    const p = ring1Project({ edit: (scan) => { scan.components.find((c) => c["name"] === "Badge")!["name"] = "Badge [archived]"; } });
    expect(JSON.parse(read(p, "design/component-registry.json")).components.find((c: { name: string }) => c.name === "Badge")).toMatchObject({ deprecated: true });
    expect(build(p).code).toBe(0);
    expect(pairs(p)).toContain("screen:5:1>component:Badge");
    expect(uses(p).details.join(" ")).not.toContain("Badge [archived]");
  });
  it("two scan components that derive the same name tie to nothing, and are counted", () => {
    const p = ring1Project();
    const scanPath = join(p, "design", "ds.json");
    const scan = JSON.parse(readFileSync(scanPath, "utf8")) as Scan;
    scan.components.push({ ...scan.components.find((c) => c["name"] === "Card")!, id: "1:9", key: "c".repeat(40) });
    write(p, "design/ds.json", JSON.stringify(scan));
    expect(build(p).code).toBe(0);
    expect(pairs(p).some((l) => l.endsWith(">component:Card"))).toBe(false);
    expect(uses(p).unresolved).toBeGreaterThanOrEqual(1);
  });
});
