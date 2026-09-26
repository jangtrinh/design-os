import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.js";
import { APPROVER_ROLES, OPTIONAL_FIELDS, REQUIRED_FIELDS, SCOPE_KEYS, STATUS_VALUES } from "../src/core/rulings-validate.js";
import { repoPathOf } from "../src/core/rulings-lint.js";

const FIX = join(process.cwd(), "tests", "fixtures", "rulings");

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  try { return { code: run(args), out }; }
  finally { process.stdout.write = oldOut; }
}

interface Finding { checkId: string; severity: string; id?: string }
function lint(file: string): { code: number; findings: Finding[]; errorCount: number } {
  const r = capture(["knowledge", "lint", file, "--root", FIX, "--json"]);
  const data = JSON.parse(r.out).data;
  return { code: r.code, findings: data.findings, errorCount: data.errorCount };
}

/** Clean fixture with one mutation applied, written to a temp file. */
function mutated(mutate: (d: { rulings: Record<string, unknown>[] }) => void): string {
  const doc = JSON.parse(readFileSync(join(FIX, "clean.json"), "utf8"));
  mutate(doc);
  const path = join(mkdtempSync(join(tmpdir(), "rulings-lint-")), "rulings.json");
  writeFileSync(path, JSON.stringify(doc), "utf8");
  return path;
}

describe("ui knowledge lint — negative control", () => {
  it("clean fixture: exit 0, zero findings", () => {
    const r = lint(join(FIX, "clean.json"));
    expect(r.code).toBe(0);
    expect(r.findings).toEqual([]);
  });

  it("broken fixture: exit 1 with BOTH the dead anchor and the unmarked supersession", () => {
    const r = lint(join(FIX, "broken.json"));
    expect(r.code).toBe(1);
    const dead = r.findings.find((f) => f.checkId === "dead-source-anchor");
    const unmarked = r.findings.find((f) => f.checkId === "unmarked-supersession");
    expect(dead).toMatchObject({ severity: "error", id: "r-b-new" });
    expect(unmarked).toMatchObject({ severity: "warning", id: "r-a-old" });
  });

  it("removing only the dead anchor drops exit to 0 and leaves the warning", () => {
    const path = mutated((d) => {
      d.rulings[0]!["source"] = ["anchors/live.md"];
      delete d.rulings[1]!["superseded_by"];
    });
    const r = lint(path);
    expect(r.code).toBe(0);
    expect(r.findings.map((f) => f.checkId)).toEqual(["unmarked-supersession"]);
  });

  it("text output prints counts and exits 1 on errors", () => {
    const r = capture(["knowledge", "lint", join(FIX, "broken.json"), "--root", FIX]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("1 error(s), 1 warning(s)");
  });
});

describe("ui knowledge lint — every schema knob goes red", () => {
  const cases: [string, (d: { rulings: Record<string, unknown>[] }) => void, string][] = [
    ...REQUIRED_FIELDS.map((f): [string, (d: { rulings: Record<string, unknown>[] }) => void, string] => [
      `missing required '${f}'`, (d) => { delete d.rulings[0]![f]; }, "schema-field"]),
    ["bad since date", (d) => { d.rulings[0]!["since"] = "yesterday"; }, "schema-field"],
    ["null since (real VSF shape)", (d) => { d.rulings[0]!["since"] = null; }, "schema-field"],
    ["bad status", (d) => { d.rulings[0]!["status"] = "zombie"; }, "schema-field"],
    ["bad scope string", (d) => { d.rulings[0]!["scope"] = "local"; }, "schema-field"],
    ["bad scope.screens", (d) => { d.rulings[0]!["scope"] = { screens: "x" }; }, "schema-field"],
    ["bad approver role", (d) => { d.rulings[0]!["approved_by"] = [{ role: "intern", person: "p", at: "2026-01-01" }]; }, "schema-field"],
    ["approver missing person", (d) => { d.rulings[0]!["approved_by"] = [{ role: "PM", at: "2026-01-01" }]; }, "schema-field"],
    ["empty source array", (d) => { d.rulings[0]!["source"] = []; }, "schema-field"],
    ["duplicate id", (d) => { d.rulings[1]!["id"] = "r-b-new"; }, "duplicate-id"],
    ["dangling superseded_by", (d) => { d.rulings[1]!["superseded_by"] = "r-nope"; }, "dangling-ruling-ref"],
    ["dangling supersedes", (d) => { d.rulings[0]!["supersedes"] = ["r-nope"]; }, "dangling-ruling-ref"],
  ];
  it.each(cases)("%s", (_name, mutate, checkId) => {
    const r = lint(mutated(mutate));
    expect(r.code).toBe(1);
    expect(r.findings.some((f) => f.checkId === checkId && f.severity === "error")).toBe(true);
  });

  it("accepts the VSF scope shape and the string 'global'", () => {
    expect(lint(join(FIX, "clean.json")).code).toBe(0);
    const path = mutated((d) => { d.rulings[0]!["scope"] = { apps: ["a"], features: ["a/f"] }; });
    expect(lint(path).code).toBe(0);
  });

  it("errors on a non-rulings file", () => {
    const path = mutated((d) => { (d as unknown as Record<string, unknown>)["schema"] = "other/9"; });
    expect(lint(path).code).toBe(1);
  });
});

describe("repoPathOf", () => {
  it.each([
    ["docs/a.md#Heading", "docs/a.md"],
    [".brv/context-tree/x/_index.md#Durable", ".brv/context-tree/x/_index.md"],
    ["figma:1:2", null],
    ["https://example.com/a.md", null],
    ["legacy memory (lost 2026-09 move): note.md", null],
    ["/abs/path.md", null],
    ["../escape.md", null],
  ])("%s", (input, expected) => { expect(repoPathOf(input)).toBe(expected); });
});

describe("rulings.schema.json parity with the validator", () => {
  const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas", "rulings.schema.json"), "utf8"));
  const ruling = schema.definitions.ruling;
  it("required + optional fields match", () => {
    expect([...ruling.required].sort()).toEqual([...REQUIRED_FIELDS].sort());
    expect(Object.keys(ruling.properties).sort()).toEqual([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].sort());
  });
  it("enums and scope keys match", () => {
    expect(ruling.properties.status.enum).toEqual([...STATUS_VALUES]);
    expect(schema.definitions.approval.properties.role.enum).toEqual([...APPROVER_ROLES]);
    expect(Object.keys(schema.definitions.scope.oneOf[1].properties)).toEqual([...SCOPE_KEYS]);
  });
});
