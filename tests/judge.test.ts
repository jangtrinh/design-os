import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DECISION_POINTS } from "../src/core/judge-validate.js";
import { MIN_SAMPLE } from "../src/core/judge-report-build.js";
import {
  JUDGMENT_SCHEMA, FIXTURE, capture, judgment, ledgerWith, record, report, stat, tmp, withHuman,
} from "./fixtures/judge/judge-helpers.js";

describe("judgment schema stays pinned to the code", () => {
  it("decision points match the schema enum", () => {
    expect([...DECISION_POINTS]).toEqual(JUDGMENT_SCHEMA.properties.decisionPoint.enum);
  });
});

describe("ui judge record", () => {
  it("appends a valid shadow judgment and reports it pending", () => {
    const path = join(tmp(), "design", "judgments.jsonl");
    const r = record(path, FIXTURE);
    expect(r.code).toBe(0);
    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(1);
    expect(stat(report(path).points, "persona-family")).toMatchObject({ total: 1, pending: 1, resolved: 0 });
  });

  it("C1: a judgment without evidence refs exits 1 and appends nothing", () => {
    const path = join(tmp(), "judgments.jsonl");
    const noRefs = judgment("j-1", "art-direction", (j) => { (j["pick"] as Record<string, unknown>)["evidenceRefs"] = []; });
    const missing = judgment("j-2", "art-direction", (j) => { delete (j["pick"] as Record<string, unknown>)["evidenceRefs"]; });
    for (const bad of [noRefs, missing]) {
      const r = record(path, bad);
      expect(r.code).toBe(1);
      expect(r.body.error?.code).toBe("SCHEMA_ERROR");
      expect(r.body.data?.findings?.map((f) => f.field).join(" ")).toContain("evidenceRefs");
    }
    expect(existsSync(path)).toBe(false);
  });

  it("rejects every kind of malformed judgment", () => {
    const path = join(tmp(), "judgments.jsonl");
    const cases: [string, Record<string, unknown>][] = [
      ["mode enforce", judgment("a", "art-direction", (j) => { j["mode"] = "enforce"; })],
      ["unknown decision point", judgment("b", "brand-name")],
      ["ruling ref not r-*", judgment("c", "art-direction", (j) => { (j["pick"] as { evidenceRefs: unknown[] }).evidenceRefs = [{ type: "ruling", ref: "2026-01" }]; })],
      ["pick outside candidates", judgment("d", "art-direction", (j) => { (j["pick"] as Record<string, unknown>)["candidate"] = "omega"; })],
      ["one candidate only", judgment("e", "art-direction", (j) => { j["candidates"] = ["alpha"]; })],
      ["duplicate candidate", judgment("f", "art-direction", (j) => { j["candidates"] = ["alpha", "alpha"]; })],
      ["changed-to without changedTo", withHuman(judgment("g"), "changed-to")],
      ["changedTo on accepted", withHuman(judgment("h"), "accepted", "beta")],
      ["changed to the shadow pick", withHuman(judgment("i"), "changed-to", "alpha")],
      ["unknown field", judgment("k", "art-direction", (j) => { j["score"] = 0.9; })],
    ];
    for (const [name, ev] of cases) expect({ name, code: record(path, ev).code }).toEqual({ name, code: 1 });
    expect(existsSync(path)).toBe(false);
  });

  it("is append-only: a human decision repeats the pending judgment, then the id is closed", () => {
    const path = join(tmp(), "judgments.jsonl");
    const base = judgment("j-1");
    expect(record(path, base).code).toBe(0);
    expect(record(path, base).body.error?.code).toBe("DUPLICATE_ID");
    const drifted = withHuman(judgment("j-1", "art-direction", (j) => { j["kernelConstraints"] = ["something else"]; }), "accepted");
    expect(record(path, drifted).body.error?.code).toBe("DUPLICATE_ID");
    expect(record(path, withHuman(base, "changed-to", "beta")).code).toBe(0);
    expect(record(path, withHuman(base, "accepted")).body.error?.code).toBe("DUPLICATE_ID");
    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(2);
    expect(stat(report(path).points, "art-direction")).toMatchObject({ total: 1, resolved: 1, changed: 1, pending: 0 });
  });

  it("refuses to append to a ledger that has an invalid line", () => {
    const path = join(tmp(), "judgments.jsonl");
    writeFileSync(path, "{not json}\n", "utf8");
    expect(record(path, judgment("j-1")).body.error?.code).toBe("LEDGER_INVALID");
  });

  it("flag errors are typed", () => {
    expect(capture(["judge", "record", "--json", "--event", "{}"]).code).toBe(1);
    expect(JSON.parse(capture(["judge", "record", "--out", "x", "--json"]).out).error.code).toBe("BAD_ARG");
    expect(JSON.parse(capture(["judge", "record", "--out", "x", "--event", "nope", "--json"]).out).error.code).toBe("BAD_JSON");
    expect(JSON.parse(capture(["judge", "record", "--out", "x", "--evnt", "{}", "--json"]).out).error.code).toBe("UNKNOWN_FLAG");
  });
});

describe("ui judge report", () => {
  it("C1: n = 3 prints 'not enough data' with the count and no rate", () => {
    const r = report(ledgerWith(["accepted", "accepted", "rejected"]));
    const s = stat(r.points, "art-direction");
    expect(s).toMatchObject({ resolved: 3, status: "not-enough-data", agreementRate: null });
    expect(r.out).toMatch(/art-direction\s+not enough data \(n=3 resolved, need 5\)/);
    expect(r.out).not.toMatch(/agreement \d+%/);
  });

  it("C1: n = 5 mixed prints a rate (3 accepted, 1 changed, 1 rejected = 60%)", () => {
    const r = report(ledgerWith(["accepted", "accepted", "changed-to", "accepted", "rejected"]));
    expect(stat(r.points, "art-direction")).toMatchObject({ resolved: 5, accepted: 3, changed: 1, rejected: 1, agreementRate: 0.6, status: "rate" });
    expect(r.out).toMatch(/art-direction\s+agreement 60% \(3\/5 accepted\) · changed 1 · rejected 1/);
  });

  it("boundary: n = 4 is still not enough data, n = 5 all accepted is 100%", () => {
    expect(MIN_SAMPLE).toBe(5);
    expect(stat(report(ledgerWith(["accepted", "accepted", "accepted", "accepted"])).points, "art-direction").agreementRate).toBeNull();
    expect(stat(report(ledgerWith(Array(5).fill("accepted"))).points, "art-direction").agreementRate).toBe(1);
  });

  it("keeps decision points apart and counts pending judgments out of the sample", () => {
    const path = ledgerWith(Array(5).fill("rejected"), "layout-archetype");
    expect(record(path, judgment("p-1", "copy-language")).code).toBe(0);
    const pts = report(path).points;
    expect(stat(pts, "layout-archetype")).toMatchObject({ resolved: 5, agreementRate: 0 });
    expect(stat(pts, "copy-language")).toMatchObject({ total: 1, pending: 1, resolved: 0, status: "not-enough-data" });
    expect(stat(pts, "art-direction")).toMatchObject({ total: 0, status: "not-enough-data" });
  });

  it("exits 1 and names the line when the ledger has an invalid record", () => {
    const path = ledgerWith(["accepted"]);
    writeFileSync(path, `${readFileSync(path, "utf8")}${JSON.stringify(judgment("bad", "art-direction", (j) => { j["mode"] = "enforce"; }))}\n`, "utf8");
    const r = report(path);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/✗ line 3 · mode/);
  });

  it("missing ledger is a typed error", () => {
    expect(JSON.parse(capture(["judge", "report", join(tmp(), "none.jsonl"), "--json"]).out).error.code).toBe("FILE_NOT_FOUND");
  });
});
