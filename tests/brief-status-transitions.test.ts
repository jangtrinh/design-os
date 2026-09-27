import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.js";

const FIX = join(process.cwd(), "tests", "fixtures", "brief");

function lintWithStatus(name: string, status: unknown, extra: string[] = [], mutate: (d: { assumptions: unknown[] }) => void = () => undefined): { code: number; data: Record<string, unknown> & { blocking: { field: string }[]; d4: Record<string, unknown>; findings?: { field: string }[] }; questions?: { field: string; question: string; recommended: string | null }[] } {
  const doc: { status?: unknown; assumptions: unknown[] } = JSON.parse(readFileSync(join(FIX, `${name}.json`), "utf8"));
  doc.status = status;
  mutate(doc);
  const dir = mkdtempSync(join(tmpdir(), "brief-transitions-"));
  const file = join(dir, "brief.json");
  writeFileSync(file, JSON.stringify(doc), "utf8");
  let out = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  let code: number;
  try { code = run(["brief", "lint", file, "--json", "--questions", join(dir, "q.json"), ...extra]); }
  finally { process.stdout.write = oldOut; }
  const qFile = join(dir, "q.json");
  return { code, data: JSON.parse(out).data, questions: existsSync(qFile) ? JSON.parse(readFileSync(qFile, "utf8")).questions : undefined };
}

describe("status.transitions is a route rule, not a schema requirement", () => {
  it("several states without transitions: a blocking field, a question, still a receipt", () => {
    const r = lintWithStatus("dashboard-complete", { states: ["ACTIVE", "INACTIVE"] });
    expect(r.data.findings).toBeUndefined();
    expect(r.data.blocking.map((b) => b.field)).toEqual(["status.transitions"]);
    expect(r.data.d4).toMatchObject({ B: 1, R: false, decision: "CONTINUE" });
    expect(r.code).toBe(0);
    const q = r.questions!.find((x) => x.field === "status.transitions")!;
    expect(q.question).toBe("Which transitions exist between ACTIVE, INACTIVE?");
    expect(q.recommended).toBeNull();
  });
  it("an empty transitions list counts as missing", () => {
    const r = lintWithStatus("dashboard-complete", { states: ["ACTIVE", "INACTIVE"], transitions: [] });
    expect(r.data.blocking.map((b) => b.field)).toContain("status.transitions");
  });
  it("counts toward B and can tip the decision to BLOCKED", () => {
    const unknown = (facet: string) => ({ facet, value: "?", provenance: "unknown", confidence: "low" });
    const r = lintWithStatus("dashboard-complete", { states: ["A", "B"] }, [], (d) => { d.assumptions.push(unknown("flows"), unknown("metrics")); });
    expect(r.data.d4).toMatchObject({ B: 3, decision: "BLOCKED" });
    expect(r.code).toBe(2);
  });
  it("a single state needs no transitions: no blocking field, no question", () => {
    const r = lintWithStatus("dashboard-complete", { states: ["ACTIVE"] });
    expect(r.data.blocking).toEqual([]);
    expect(r.questions).toEqual([]);
    expect(r.code).toBe(0);
  });
  it("transitions present: nothing to ask", () => {
    const r = lintWithStatus("dashboard-complete", { states: ["A", "B"], transitions: [{ from: "A", to: "B" }] });
    expect(r.data.blocking).toEqual([]);
    expect(r.questions).toEqual([]);
  });
  it("malformed transitions stay a schema error", () => {
    const r = lintWithStatus("dashboard-complete", { states: ["A", "B"], transitions: [{ from: "A" }] });
    expect(r.code).toBe(1);
    expect(r.data.findings!.map((f) => f.field)).toContain("status.transitions[0].to");
  });
});
