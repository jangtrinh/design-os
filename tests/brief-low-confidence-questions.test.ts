import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.js";

const FIX = join(process.cwd(), "tests", "fixtures", "brief");

function lint(file: string): { code: number; data: { d4: { L: number; B: number; decision: string }; questionCount: number }; questions: { field: string; question: string }[] } {
  const dir = mkdtempSync(join(tmpdir(), "brief-low-"));
  const qFile = join(dir, "questions.json");
  let out = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  let code: number;
  try { code = run(["brief", "lint", file, "--questions", qFile, "--json"]); }
  finally { process.stdout.write = oldOut; }
  return { code, data: JSON.parse(out).data, questions: JSON.parse(readFileSync(qFile, "utf8")).questions };
}

describe("a BLOCKED receipt never has zero questions", () => {
  it("landing-shaped brief with L=4 and no other gap: 4 questions, one per low-confidence assumption", () => {
    const r = lint(join(FIX, "landing-shaped-low-confidence.json"));
    expect(r.code).toBe(2);
    expect(r.data.d4).toMatchObject({ B: 0, L: 4, decision: "BLOCKED" });
    expect(r.data.questionCount).toBe(4);
    expect(r.questions.map((q) => q.field)).toEqual(["assumption:product-shell", "assumption:ui-language", "assumption:status-vocabulary", "assumption:cost-format"]);
  });
  it("each question names the assumption and its current value", () => {
    const r = lint(join(FIX, "landing-shaped-low-confidence.json"));
    const cost = r.questions.find((q) => q.field === "assumption:cost-format")!;
    expect(cost.question).toContain("'cost-format'");
    expect(cost.question).toContain("USD, two decimals, labelled estimated");
  });
  it("a facet that is both unknown-provenance and low-confidence yields one question, not two", () => {
    const brief = JSON.parse(readFileSync(join(FIX, "landing-shaped-low-confidence.json"), "utf8"));
    brief.surface = "web-app";
    brief.assumptions.push({ facet: "tenancy", value: "single tenant", provenance: "unknown", confidence: "low" });
    const file = join(mkdtempSync(join(tmpdir(), "brief-low-")), "b.json");
    writeFileSync(file, JSON.stringify(brief));
    const r = lint(file);
    expect(r.questions.filter((q) => q.field === "assumption:tenancy")).toHaveLength(1);
  });
  it("a CONTINUE brief with one low assumption stays at zero questions", () => {
    const r = lint(join(FIX, "dashboard-complete.json"));
    expect(r.data.d4).toMatchObject({ L: 1, decision: "CONTINUE" });
    expect(r.questions).toEqual([]);
  });
});
