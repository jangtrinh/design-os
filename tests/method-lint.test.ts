import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { run } from "../src/cli.js";

const fixture = (name: string): string => join(process.cwd(), "tests", "fixtures", "method", name);
type Run = { steps: Record<string, { status: string; skip_reason?: { code: string; detail: string }; artifacts: Array<{ path: string; provenance: string }>; needs_humans: Array<{ question: string; role: string; answered_by?: string; answered_at?: string }> }> };

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = ""; let err = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  const oldErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  try { return { code: run(args), out, err }; }
  finally { process.stdout.write = oldOut; process.stderr.write = oldErr; }
}

function editedRun(edit: (run: Run) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "method-lint-"));
  const run = JSON.parse(readFileSync(fixture("valid-run.json"), "utf8")) as Run;
  edit(run);
  writeFileSync(join(dir, "run.json"), JSON.stringify(run));
  writeFileSync(join(dir, "brief.json"), readFileSync(fixture("brief.json")));
  return join(dir, "run.json");
}

describe("ui method lint", () => {
  it("accepts a valid six-step run and prints six cells", () => {
    const result = capture(["method", "lint", fixture("valid-run.json")]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("frame ✓ define ✓ explore ✓ decide ✓ build ✓ verify ✓");
  });

  it("rejects a skipped step without a reason", () => {
    const file = editedRun((r) => { r.steps.explore!.status = "skipped"; });
    const result = capture(["method", "lint", file, "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).data.findings.map((f: { checkId: string }) => f.checkId)).toContain("skip-reason");
  });

  it("rejects unanswered human need on a done decide", () => {
    const file = editedRun((r) => { delete r.steps.decide!.needs_humans[0]!.answered_by; });
    const result = capture(["method", "lint", file, "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).data.findings.map((f: { checkId: string }) => f.checkId)).toContain("unanswered-human");
  });

  it("shows a skipped cell and rejects an invalid brief", () => {
    const file = editedRun((r) => {
      r.steps.explore!.status = "skipped";
      r.steps.explore!.skip_reason = { code: "existing-evidence", detail: "Existing evidence covers the candidate set." };
    });
    expect(capture(["method", "lint", file]).out).toContain("explore –");
    const invalid = editedRun((r) => { r.steps.define!.artifacts[0]!.path = "missing/brief.json"; });
    const result = capture(["method", "lint", invalid, "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).data.findings.map((f: { checkId: string }) => f.checkId)).toContain("invalid-brief");
  });

  it("accepts blocked-intake as a skip code and still rejects an unknown one", () => {
    const skipWith = (code: string): string => editedRun((r) => {
      r.steps.explore!.status = "skipped";
      r.steps.explore!.skip_reason = { code, detail: "Intake receipt is BLOCKED; questions are unanswered." };
    });
    const ok = capture(["method", "lint", skipWith("blocked-intake"), "--json"]);
    expect(ok.code).toBe(0);
    expect(JSON.parse(ok.out).data.findings).toEqual([]);
    const bad = capture(["method", "lint", skipWith("blocked-elsewhere"), "--json"]);
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.out).data.findings.map((f: { checkId: string }) => f.checkId)).toContain("schema-shape");
  });

  it("rejects a readable brief that violates the current brief schema", () => {
    const file = editedRun(() => {});
    writeFileSync(join(dirname(file), "brief.json"), JSON.stringify({ kind: "design-brief", version: 1 }));
    const result = capture(["method", "lint", file, "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).data.findings.map((f: { checkId: string }) => f.checkId)).toContain("invalid-brief");
  });

  it("rejects invalid school, provenance, and unknown fields", () => {
    const file = editedRun((r) => {
      (r as Run & { school: string }).school = "invented";
      r.steps.define!.artifacts[0]!.provenance = "fabricated";
      (r.steps.frame as object as Record<string, unknown>)["extra"] = true;
    });
    const result = capture(["method", "lint", file, "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).data.errorCount).toBeGreaterThanOrEqual(3);
  });

  it("rejects inherited Object property names as unknown JSON fields", () => {
    const file = editedRun((r) => { (r.steps.frame as object as Record<string, unknown>)["constructor"] = true; });
    const result = capture(["method", "lint", file, "--json"]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).data.findings.map((f: { message: string }) => f.message)).toContain("$.steps.frame.constructor: unknown property");
  });
});
