/**
 * `ui critique-coverage --evidence-dir` — the T0×T6 loop. A criterion's
 * evidence[] is resolved as ids in a real T6 ledger: a missing id or a
 * drifted/fabricated quote fails the gate (unresolvedEvidence), even without
 * --require-evidence. Without --evidence-dir, legacy behaviour applies (any
 * non-empty evidence[] counts as provenance).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

let dir: string;
let evidenceDir: string;
const write = (name: string, obj: unknown): string => {
  const p = join(dir, name);
  writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj), "utf8");
  return p;
};

const SOURCE_TEXT = "the checkout button was impossible to find during the usability session";
const QUOTE = "checkout button was impossible to find";

const SPEC_CITES_EV1 = { acceptanceCriteria: [{ id: "c1", text: "fix checkout button", evidence: ["ev1"] }] };
const SPEC_CITES_EV404 = { acceptanceCriteria: [{ id: "c1", text: "fix checkout button", evidence: ["ev404"] }] };
const FULL_MANIFEST = { screens: [{ name: "Checkout", coversCriteria: ["c1"] }] };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-cov-evid-"));
  evidenceDir = join(dir, "evidence-store");
  const sourceFilePath = join(dir, "interview1.txt");
  writeFileSync(sourceFilePath, SOURCE_TEXT, "utf8");

  // Seed a real, verified ev1 via `ui evidence add`.
  const addResult = capture([
    "evidence", "add", "--dir", evidenceDir,
    "--finding", "checkout button hard to find",
    "--quote", QUOTE, "--source", sourceFilePath, "--json",
  ]);
  expect(addResult.code).toBe(0);
  const addEnvelope = JSON.parse(addResult.out) as { data: { id: string } };
  expect(addEnvelope.data.id).toBe("ev1");
});

describe("critique-coverage --evidence-dir", () => {
  it("a criterion citing a real verified id (ev1), fully covered → exit 0", () => {
    const spec = write("spec.json", SPEC_CITES_EV1);
    const manifest = write("m.json", FULL_MANIFEST);
    const r = capture(["critique-coverage", spec, manifest, "--evidence-dir", evidenceDir, "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { unresolvedEvidence?: unknown[] };
    expect(data.unresolvedEvidence ?? []).toEqual([]);
  });

  it("a criterion citing a missing id (ev404), covered → exit 1, unresolvedEvidence names ev404", () => {
    const spec = write("spec.json", SPEC_CITES_EV404);
    const manifest = write("m.json", FULL_MANIFEST);
    const r = capture(["critique-coverage", spec, manifest, "--evidence-dir", evidenceDir, "--json"]);
    expect(r.code).toBe(1);
    const data = JSON.parse(r.out).data as { unresolvedEvidence: { criterionId: string; evidenceId: string }[] };
    expect(data.unresolvedEvidence.some((u) => u.evidenceId === "ev404")).toBe(true);
  });

  it("a drifted/corrupted ev1 source fails the gate even without --require-evidence", () => {
    // Corrupt the store's own copy of the source so ev1's quote no longer matches.
    writeFileSync(join(evidenceDir, "research-sources", "interview1.txt"), "an entirely unrelated transcript body", "utf8");

    const spec = write("spec.json", SPEC_CITES_EV1);
    const manifest = write("m.json", FULL_MANIFEST);
    const r = capture(["critique-coverage", spec, manifest, "--evidence-dir", evidenceDir, "--json"]);
    expect(r.code).toBe(1);
    const data = JSON.parse(r.out).data as { unresolvedEvidence: { criterionId: string; evidenceId: string }[] };
    expect(data.unresolvedEvidence.some((u) => u.evidenceId === "ev1")).toBe(true);
  });

  it("the SAME spec WITHOUT --evidence-dir → legacy behaviour: non-empty evidence[] counts, exit 0, no unresolvedEvidence field", () => {
    // Even the "missing id" spec passes under legacy semantics — evidence[] is just a
    // provenance string list without a resolver, so any non-empty array counts.
    const spec = write("spec.json", SPEC_CITES_EV404);
    const manifest = write("m.json", FULL_MANIFEST);
    const r = capture(["critique-coverage", spec, manifest, "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { unresolvedEvidence?: unknown; assumptions: string[] };
    expect(data.unresolvedEvidence).toBeUndefined();
    expect(data.assumptions).toEqual([]);
  });
});
