import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { capture, useTempDirs } from "./fixtures/knowledge-promotion/cli-capture.js";
import { LEARNING_EVENT_TYPES, EVENT_SOURCES, RULING_REF_RE } from "../src/core/knowledge-ledger-event.js";

const FIX = join(process.cwd(), "tests", "fixtures", "knowledge-ledger");
const tmp = useTempDirs("knowledge-ledger-lint-");
const lint = (file: string, extra: string[] = []) => capture(["knowledge", "ledger", "lint", file, "--json", ...extra]);
const data = (r: { out: string }) => JSON.parse(r.out).data;

describe("ui knowledge ledger lint", () => {
  it("C1: a clean ledger exits 0", () => {
    const r = lint(join(FIX, "clean.jsonl"));
    expect(r.code).toBe(0);
    expect(data(r)).toMatchObject({ events: 4, cleanEvents: 4, errorCount: 0, withoutRulingRef: 2 });
  });

  it("C1: a telemetry-kind event exits 1 and names the kind as out of scope", () => {
    const r = lint(join(FIX, "telemetry-kind.jsonl"));
    expect(r.code).toBe(1);
    const f = data(r).findings.find((x: { checkId: string }) => x.checkId === "event-type");
    expect(f.message).toContain("component_registered");
    expect(f.message).toContain("telemetry");
    expect(data(r)).toMatchObject({ events: 2, cleanEvents: 1 });
  });

  it("C1: a correction without a ruling ref exits 1 (a non-ruling ref does not count)", () => {
    const r = lint(join(FIX, "correction-without-ruling-ref.jsonl"));
    expect(r.code).toBe(1);
    expect(data(r).findings.map((f: { checkId: string }) => f.checkId)).toEqual(["ruling-ref-missing"]);
  });

  it("an approval without a ruling ref exits 1 too", () => {
    const p = join(tmp(), "a.jsonl");
    writeFileSync(p, `${JSON.stringify({ id: "a1", type: "approval", t: "2026-09-27", source: "observed", refs: [], text: "ok" })}\n`);
    expect(lint(p).code).toBe(1);
  });

  it("duplicate ids are an error", () => {
    const r = lint(join(FIX, "duplicate-id.jsonl"));
    expect(r.code).toBe(1);
    expect(data(r).findings.map((f: { checkId: string }) => f.checkId)).toEqual(["duplicate-id"]);
  });

  it("rejects bad source, bad date, missing fields, unknown fields and unreadable lines — each counted", () => {
    const p = join(tmp(), "bad.jsonl");
    writeFileSync(p, [
      JSON.stringify({ id: "b1", type: "gap", t: "yesterday", source: "guessed", refs: "r-x", text: "" }),
      JSON.stringify({ id: "b2", type: "gap", t: "2026-09-27", source: "observed", refs: [], text: "x", extra: 1 }),
      "{not json",
    ].join("\n") + "\n");
    const r = lint(p);
    expect(r.code).toBe(1);
    const ids = data(r).findings.map((f: { checkId: string }) => f.checkId);
    expect(ids).toEqual(expect.arrayContaining(["event-time", "event-source", "event-refs", "event-text", "event-field", "unreadable-line"]));
    expect(data(r).unreadableLines).toBe(1);
  });

  it("accepts the JSON-document shape ({entries:[…]}) and reports events that are not learning events", () => {
    const p = join(tmp(), "doc.json");
    writeFileSync(p, JSON.stringify({ schema: "x", entries: [{ id: "F-001", class: "visual-type", rule: "r" }] }));
    const r = lint(p);
    expect(r.code).toBe(1);
    expect(data(r)).toMatchObject({ events: 1, cleanEvents: 0 });
  });

  it("errors on a missing file and an empty ledger is clean", () => {
    expect(lint(join(tmp(), "nope.jsonl")).code).toBe(1);
    const p = join(tmp(), "empty.jsonl"); writeFileSync(p, "");
    expect(lint(p).code).toBe(0);
  });

  it("text mode prints one line per finding", () => {
    const r = capture(["knowledge", "ledger", "lint", join(FIX, "telemetry-kind.jsonl")]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("[event-type]");
  });

  it("the code constants and the schema file cannot drift apart", () => {
    const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas", "learning-event.schema.json"), "utf8"));
    expect(schema.properties.type.enum).toEqual([...LEARNING_EVENT_TYPES]);
    expect(schema.properties.source.enum).toEqual([...EVENT_SOURCES]);
    expect(schema.required).toEqual(["id", "type", "t", "source", "refs", "text"]);
    expect(Object.keys(schema.properties).sort()).toEqual(["id", "note", "refs", "source", "t", "text", "type"]);
    expect(schema.properties.refs.items.type).toBe("string");
    expect(RULING_REF_RE.test("r-draft-x-1234abcd")).toBe(true);
    expect(RULING_REF_RE.test("ev-000")).toBe(false);
  });
});
