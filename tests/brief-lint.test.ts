import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.js";
import {
  APP_SURFACES, D4_MAX_B, D4_MAX_L, d4Receipt, findBlockingFields,
} from "../src/core/brief-rules.js";
import {
  ASSUMPTION_LABELS, BRIEF_OPTIONAL, BRIEF_REQUIRED, BRIEF_SURFACES, COPY_LANGUAGES, SCREEN_STATES, validateBrief,
} from "../src/core/brief-validate.js";
import { APPROVER_ROLES } from "../src/core/rulings-validate.js";

const FIX = join(process.cwd(), "tests", "fixtures", "brief");
const LANDING = join(process.cwd(), "tests", "fixtures", "delivery", "design-brief-valid.json");
const SCHEMA = JSON.parse(readFileSync(join(process.cwd(), "schemas", "design-brief.schema.json"), "utf8"));

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  try { return { code: run(args), out }; }
  finally { process.stdout.write = oldOut; }
}

const load = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, "utf8"));
const fixture = (name: string): string => join(FIX, `${name}.json`);

/** Fixture with one mutation applied, written to a temp file. */
function mutated(name: string, mutate: (d: Record<string, unknown>) => void): string {
  const doc = load(fixture(name));
  mutate(doc);
  const path = join(mkdtempSync(join(tmpdir(), "brief-lint-")), "brief.json");
  writeFileSync(path, JSON.stringify(doc), "utf8");
  return path;
}

interface LintData { blocking: { field: string; routeChanging: boolean }[]; d4: { B: number; R: boolean; L: number; decision: string; routeChanging: string[] }; questionCount: number }
function lint(file: string, extra: string[] = []): { code: number; data: LintData & { findings?: { field: string }[] } } {
  const r = capture(["brief", "lint", file, "--json", ...extra]);
  return { code: r.code, data: JSON.parse(r.out).data };
}
const lowAssumptions = (n: number) => Array.from({ length: n }, (_, i) => ({ facet: `f${i}`, value: "v", provenance: "inferred", confidence: "low" }));

describe("design-brief schema stays pinned to the validator", () => {
  it("required and optional field lists match", () => {
    expect([...SCHEMA.required].sort()).toEqual([...BRIEF_REQUIRED].sort());
    expect(Object.keys(SCHEMA.properties).sort()).toEqual([...BRIEF_REQUIRED, ...BRIEF_OPTIONAL].sort());
  });
  it("enums match", () => {
    expect(SCHEMA.properties.surface.enum).toEqual([...BRIEF_SURFACES]);
    expect(SCHEMA.properties.copyLanguage.enum).toEqual([...COPY_LANGUAGES]);
    expect(SCHEMA.properties.screens.items.properties.states.items.enum).toEqual([...SCREEN_STATES]);
    expect(SCHEMA.properties.approvedBy.items.properties.role.enum).toEqual([...APPROVER_ROLES]);
    expect(SCHEMA.properties.assumptions.items.properties.label.enum).toEqual([...ASSUMPTION_LABELS]);
  });
  it("every route surface is a schema surface", () => {
    for (const s of APP_SURFACES) expect(SCHEMA.properties.surface.enum).toContain(s);
  });
});

describe("backward compatibility", () => {
  it("today's landing fixture validates with zero findings", () => {
    expect(validateBrief(load(LANDING))).toEqual([]);
  });
  it("every fixture in tests/fixtures/delivery that is a brief still validates", () => {
    expect(validateBrief(load(join(process.cwd(), "tests", "fixtures", "delivery", "design-brief-valid.json")))).toEqual([]);
  });
});

describe("ui brief lint — C1 negative controls", () => {
  it("dashboard without screens: BLOCKED, exit 2, B >= 1, R true", () => {
    const r = lint(fixture("dashboard-no-screens"));
    expect(r.code).toBe(2);
    expect(r.data.d4.decision).toBe("BLOCKED");
    expect(r.data.d4.B).toBeGreaterThanOrEqual(1);
    expect(r.data.d4.R).toBe(true);
    expect(r.data.blocking.map((b) => b.field)).toEqual(["screens"]);
  });
  it("landing fixture unchanged: CONTINUE, exit 0, 0 questions", () => {
    const out = join(mkdtempSync(join(tmpdir(), "brief-q-")), "q.json");
    const r = lint(LANDING, ["--questions", out]);
    expect(r.code).toBe(0);
    expect(r.data.d4).toMatchObject({ B: 0, R: false, L: 0, decision: "CONTINUE" });
    expect(r.data.questionCount).toBe(0);
    expect(load(out)["questions"]).toEqual([]);
  });
  it("complete dashboard: CONTINUE with one low assumption counted in L", () => {
    const r = lint(fixture("dashboard-complete"));
    expect(r.code).toBe(0);
    expect(r.data.d4).toMatchObject({ B: 0, R: false, L: 1, decision: "CONTINUE" });
  });
});

describe("ui brief lint — schema errors exit 1", () => {
  it("unknown surface", () => {
    const r = lint(fixture("invalid-surface"));
    expect(r.code).toBe(1);
    expect(r.data.findings?.map((f) => f.field)).toContain("surface");
  });
  it.each([
    ["state outside the enum", (d: Record<string, unknown>) => { (d["screens"] as { states: string[] }[])[0]!.states = ["offline"]; }, "screens[0].states[0]"],
    ["missing required field", (d: Record<string, unknown>) => { delete d["audience"]; }, "audience"],
    ["unknown top-level field", (d: Record<string, unknown>) => { d["mood"] = "calm"; }, "mood"],
    ["approver role outside the set", (d: Record<string, unknown>) => { (d["approvedBy"] as { role: string }[])[0]!.role = "intern"; }, "approvedBy[0].role"],
    ["approval date not a date", (d: Record<string, unknown>) => { (d["approvedBy"] as { at: string }[])[0]!.at = "yesterday"; }, "approvedBy[0].at"],
    ["assumption label outside the set", (d: Record<string, unknown>) => { (d["assumptions"] as { label: string }[])[0]!.label = "guess"; }, "assumptions[0].label"],
    ["copyLanguage outside the set", (d: Record<string, unknown>) => { d["copyLanguage"] = "fr"; }, "copyLanguage"],
    ["unknown field on a screen", (d: Record<string, unknown>) => { (d["screens"] as Record<string, unknown>[])[0]!["unspecifiedField"] = "x"; }, "screens[0].unspecifiedField"],
    ["unknown field on a role", (d: Record<string, unknown>) => { (d["roles"] as Record<string, unknown>[])[0]!["level"] = 3; }, "roles[0].level"],
    ["unknown field on a status transition", (d: Record<string, unknown>) => { ((d["status"] as { transitions: Record<string, unknown>[] }).transitions)[0]!["guard"] = "x"; }, "status.transitions[0].guard"],
    ["unknown field on an approval", (d: Record<string, unknown>) => { (d["approvedBy"] as Record<string, unknown>[])[0]!["email"] = "x"; }, "approvedBy[0].email"],
    ["unknown field on a criterion", (d: Record<string, unknown>) => { (d["criteria"] as Record<string, unknown>[])[0]!["weight"] = 1; }, "criteria[0].weight"],
    ["unknown field on an assumption", (d: Record<string, unknown>) => { (d["assumptions"] as Record<string, unknown>[])[0]!["note"] = "x"; }, "assumptions[0].note"],
    ["unknown field on the status object", (d: Record<string, unknown>) => { (d["status"] as Record<string, unknown>)["initial"] = "ACTIVE"; }, "status.initial"],
    ["screen without a purpose", (d: Record<string, unknown>) => { delete (d["screens"] as Record<string, unknown>[])[0]!["purpose"]; }, "screens[0].purpose"],
    ["several states without transitions", (d: Record<string, unknown>) => { delete (d["status"] as Record<string, unknown>)["transitions"]; }, "status.transitions"],
    ["version 2 without activationRef", (d: Record<string, unknown>) => { d["version"] = 2; }, "activationRef"],
  ])("%s", (_name, mutate, field) => {
    const r = lint(mutated("dashboard-complete", mutate));
    expect(r.code).toBe(1);
    expect(r.data.findings?.map((f) => f.field)).toContain(field);
  });
  it("a single-state status vocabulary may omit transitions", () => {
    const r = lint(mutated("dashboard-complete", (d) => { d["status"] = { states: ["ACTIVE"] }; }));
    expect(r.code).toBe(0);
    expect(r.data.findings).toBeUndefined();
  });
  it("unreadable and non-JSON input exit 1 with a code", () => {
    expect(JSON.parse(capture(["brief", "lint", join(FIX, "nope.json"), "--json"]).out).error.code).toBe("FILE_NOT_FOUND");
    const bad = join(mkdtempSync(join(tmpdir(), "brief-bad-")), "b.json");
    writeFileSync(bad, "{not json");
    const r = capture(["brief", "lint", bad, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_JSON");
  });
});

describe("D4 thresholds — both sides of every boundary", () => {
  const withScreens = (n: number) => (d: Record<string, unknown>) => {
    d["screens"] = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `S${i}`, purpose: `Purpose ${i}`, states: [] }));
  };
  it("B = 2 continues, B = 3 blocks (no route-changing field)", () => {
    const two = lint(mutated("dashboard-complete", withScreens(2)));
    expect(two.data.d4).toMatchObject({ B: D4_MAX_B, R: false, decision: "CONTINUE" });
    expect(two.code).toBe(0);
    const three = lint(mutated("dashboard-complete", withScreens(3)));
    expect(three.data.d4).toMatchObject({ B: D4_MAX_B + 1, R: false, decision: "BLOCKED" });
    expect(three.code).toBe(2);
  });
  it("L = 3 continues, L = 4 blocks", () => {
    const three = lint(mutated("dashboard-complete", (d) => { d["assumptions"] = lowAssumptions(D4_MAX_L); }));
    expect(three.data.d4).toMatchObject({ L: D4_MAX_L, decision: "CONTINUE" });
    const four = lint(mutated("dashboard-complete", (d) => { d["assumptions"] = lowAssumptions(D4_MAX_L + 1); }));
    expect(four.data.d4).toMatchObject({ L: D4_MAX_L + 1, decision: "BLOCKED" });
  });
  it("one route-changing field blocks even when B and L are tiny", () => {
    for (const field of ["roles", "status"]) {
      const r = lint(mutated("dashboard-complete", (d) => { delete d[field]; }));
      expect(r.data.d4).toMatchObject({ B: 1, R: true, decision: "BLOCKED" });
      expect(r.data.d4.routeChanging).toEqual([field]);
    }
  });
  it("an unknown-provenance assumption is a blocking field; route-changing only when its facet is", () => {
    const unknown = (facet: string) => (d: Record<string, unknown>) => {
      d["assumptions"] = [{ facet, value: "?", provenance: "unknown", confidence: "medium" }];
    };
    const surface = lint(mutated("dashboard-complete", unknown("surface")));
    expect(surface.data.d4).toMatchObject({ B: 1, R: true, decision: "BLOCKED" });
    const flows = lint(mutated("dashboard-complete", unknown("flows")));
    expect(flows.data.d4).toMatchObject({ B: 1, R: false, decision: "CONTINUE" });
  });
  it("a gap declared both structurally and as an unknown assumption counts once", () => {
    const r = lint(mutated("dashboard-complete", (d) => {
      delete d["roles"];
      d["assumptions"] = [{ facet: "roles", value: "?", provenance: "unknown", confidence: "medium" }];
    }));
    expect(r.data.d4).toMatchObject({ B: 1, R: true });
    expect(r.data.blocking.map((b) => b.field)).toEqual(["roles"]);
  });
  it("landing keeps today's rules: an unknown assumption does not block a landing", () => {
    const r = lint(mutated("dashboard-complete", (d) => {
      d["surface"] = "landing"; delete d["screens"]; delete d["roles"]; delete d["status"];
      d["assumptions"] = [{ facet: "surface", value: "?", provenance: "unknown", confidence: "medium" }];
    }));
    expect(r.data.d4).toMatchObject({ B: 0, R: false, decision: "CONTINUE" });
  });
  it("the pure receipt agrees with the command", () => {
    const brief = load(fixture("dashboard-no-screens"));
    expect(d4Receipt(brief, findBlockingFields(brief)).decision).toBe("BLOCKED");
  });
});

describe("ui brief lint — output", () => {
  it("text mode prints the blocking fields and all three D4 numbers", () => {
    const r = capture(["brief", "lint", fixture("dashboard-no-screens")]);
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/screens: a screen-based route needs screens\[\]/);
    expect(r.out).toMatch(/d4: B=1 R=yes L=1 → BLOCKED/);
  });
  it("--questions output is byte-identical across runs", () => {
    const dir = mkdtempSync(join(tmpdir(), "brief-det-"));
    lint(fixture("webapp-many-questions"), ["--questions", join(dir, "a.json")]);
    lint(fixture("webapp-many-questions"), ["--questions", join(dir, "b.json")]);
    expect(readFileSync(join(dir, "a.json"), "utf8")).toBe(readFileSync(join(dir, "b.json"), "utf8"));
  });
});
