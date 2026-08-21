import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path: string) => readFileSync(join(root, path), "utf8");
const grader = join(root, "eval", "web-technique-routing-grader.mjs");
let temp = "";

afterEach(() => { if (temp) rmSync(temp, { recursive: true, force: true }); temp = ""; });

describe("web-technique routing contract", () => {
  it("makes generate, redesign, and the designer consult one-primary catalog routing without a new question", () => {
    for (const path of ["templates/workflows/generate.md", "templates/workflows/redesign.md", "templates/agents/designer.md"]) {
      const content = read(path);
      expect(content).toContain("knowledge/web-technique-craft.md");
      expect(content).toContain("knowledge/web-techniques/catalog.json");
      expect(content).toContain("at most one primary");
      expect(content).toContain("technique-preference question");
      expect(content).toContain("only the selected");
    }
  });

  it("keeps the router to one imported ID per direction and freezes catalog-authorized handoff", () => {
    const content = read("knowledge/web-technique-craft.md");
    expect(content).toMatch(/at most one primary imported technique per\s+direction/);
    expect(content).toContain("<ID> — <brief-specific adaptation>");
    expect(content).toContain("registered and reachable");
    expect(content).toContain("suitability, tier, and anti-use");
  });

  it("opens no catalog card for a compatible legacy free-string technique", () => {
    for (const path of ["knowledge/generation-craft-defaults.md", "knowledge/prompt-plan-orchestration.md"]) {
      expect(read(path)).toContain("free string");
      expect(read(path)).toContain("no catalog card");
    }
  });

  it("provides a bounded deterministic grader for valid, repeated, and overloaded direction IDs", () => {
    expect(existsSync(grader)).toBe(true);
    temp = mkdtempSync(join(tmpdir(), "web-technique-routing-"));
    const decisions = join(temp, "decisions.json");
    const valid = ["brief-1", "brief-2", "brief-3"].map((id, index) => ({ id, questionsAsked: 0, directions: [
      { signatureTechnique: index === 0 ? "FX-01 — spatial grid for live operational proof" : "STR-04 — availability-led service path" },
      { signatureTechnique: "MOT-02 — staged readable headline" },
      { signatureTechnique: "original editorial fold" },
    ] }));
    const run = (prompts = "eval/web-technique-routing-prompts.json") => spawnSync(process.execPath, [grader, prompts, decisions], { cwd: root, encoding: "utf8" });
    writeFileSync(decisions, JSON.stringify(valid));
    expect(run().status).toBe(0);
    writeFileSync(decisions, "[]");
    const uncovered = run();
    expect(uncovered.status).toBe(1);
    expect(JSON.parse(uncovered.stdout).summary.covered).toBe("0/3");
    expect(JSON.parse(uncovered.stdout).misses[0].problems).toContain("decision-missing");
    writeFileSync(decisions, JSON.stringify([...valid, valid[0]]));
    const duplicate = run();
    expect(duplicate.status).toBe(1);
    expect(JSON.parse(duplicate.stdout).misses[0].problems).toContain("decision-id-duplicate");
    writeFileSync(decisions, JSON.stringify([...valid, { ...valid[0], id: "unknown-brief" }]));
    const unknown = run();
    expect(unknown.status).toBe(1);
    expect(JSON.parse(unknown.stdout).summary.covered).toBe("3/3");
    expect(JSON.parse(unknown.stdout).misses.at(-1).problems).toContain("unknown-brief-id");
    writeFileSync(decisions, JSON.stringify({ directions: [] }));
    const malformedRoot = run();
    expect(malformedRoot.status).toBe(1);
    expect(JSON.parse(malformedRoot.stdout).misses[0].problems).toContain("input-shape-invalid");
    writeFileSync(decisions, JSON.stringify([{ ...valid[0], directions: { length: 3 } }]));
    expect(run().status).toBe(1);
    writeFileSync(decisions, JSON.stringify([{ ...valid[0], directions: [null, ...valid[0]!.directions.slice(1)] }]));
    const nullDirection = run();
    expect(nullDirection.status).toBe(1);
    expect(JSON.parse(nullDirection.stdout).misses[0].problems).toContain("direction-shape-invalid");
    const malformedPrompts = join(temp, "malformed-prompts.json");
    writeFileSync(malformedPrompts, JSON.stringify({ catalog: "knowledge/web-techniques/catalog.json", briefs: [null] }));
    expect(JSON.parse(run(malformedPrompts).stdout).misses[0].problems).toContain("input-shape-invalid");
    writeFileSync(malformedPrompts, JSON.stringify({ catalog: "knowledge/web-techniques/catalog.json", briefs: [{ id: "brief-1" }, { id: "brief-1" }] }));
    expect(JSON.parse(run(malformedPrompts).stdout).misses[0].problems).toContain("input-shape-invalid");
    const malformedCatalog = join(temp, "malformed-catalog.json");
    writeFileSync(malformedCatalog, JSON.stringify({ techniques: [null] }));
    writeFileSync(malformedPrompts, JSON.stringify({ catalog: malformedCatalog, briefs: [{ id: "brief-1" }] }));
    expect(JSON.parse(run(malformedPrompts).stdout).misses[0].problems).toContain("input-shape-invalid");
    const baseline = valid[0]!;
    writeFileSync(decisions, JSON.stringify([{ ...baseline, directions: [{ signatureTechnique: "FX-01 — first; MOT-02 — second" }, ...baseline.directions.slice(1)] }]));
    const overloaded = run();
    expect(overloaded.status).toBe(1);
    expect(JSON.parse(overloaded.stdout).misses[0].problems).toContain("multiple-catalog-ids");
    writeFileSync(decisions, JSON.stringify([{ ...baseline, directions: [{ signatureTechnique: "FX-01 — one" }, { signatureTechnique: "FX-01 — different suffix" }, baseline.directions[2]!] }]));
    const repeated = run();
    expect(repeated.status).toBe(1);
    expect(JSON.parse(repeated.stdout).misses[0].problems).toContain("primary-id-repeated");
  });
});
