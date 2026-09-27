import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FIX, capture, useTempDirs } from "./fixtures/knowledge-promotion/cli-capture.js";

const tmp = useTempDirs("knowledge-ledger-promote-");
const draftInto = (dir: string, ledger: string) =>
  capture(["knowledge", "draft-ruling", "--from", join(FIX, "correction.json"), "--out", join(dir, "draft.json"), "--ledger", ledger, "--as-of", "2026-09-27", "--json"]);
const evt = (id: string, type: string, ref: string) =>
  JSON.stringify({ id, type, t: "2026-09-27", source: "observed", refs: [ref], text: `${type} on the empty state` });
const promote = (dir: string, rulings: string, ledger: string) => {
  capture(["knowledge", "promote", rulings, "--ledger", ledger, "--out", join(dir, "out"), "--json"]);
  return JSON.parse(readFileSync(join(dir, "out", "candidates.json"), "utf8")) as { candidates: { id: string; reasons: string[]; recurrence: number }[] };
};

describe("draft-ruling → ledger → promote recurrence path", () => {
  it("draft-ruling appends a ruling-candidate event that names the new ruling id", () => {
    const dir = tmp(); const ledger = join(dir, "ledger.jsonl");
    const r = draftInto(dir, ledger);
    expect(r.code).toBe(0);
    const rulingId = JSON.parse(readFileSync(join(dir, "draft.json"), "utf8")).rulings[0].id;
    const lines = readFileSync(ledger, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ type: "ruling-candidate", source: "observed", t: "2026-09-27", refs: [rulingId] });
    expect(capture(["knowledge", "ledger", "lint", ledger]).code).toBe(0);
    expect(JSON.parse(r.out).data).toMatchObject({ id: rulingId, ledger, ledgerEvent: lines[0].id });
  });

  it("re-running the same draft records the event once (idempotent by id)", () => {
    const dir = tmp(); const ledger = join(dir, "ledger.jsonl");
    draftInto(dir, ledger);
    const again = capture(["knowledge", "draft-ruling", "--from", join(FIX, "correction.json"), "--out", join(dir, "draft.json"), "--force", "--ledger", ledger, "--as-of", "2026-09-27"]);
    expect(again.code).toBe(0);
    expect(readFileSync(ledger, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("a bad --ledger fails before any draft file is written", () => {
    const dir = tmp(); const doc = join(dir, "doc.json"); writeFileSync(doc, JSON.stringify({ entries: [] }));
    expect(draftInto(dir, doc).code).toBe(1);
    expect(() => readFileSync(join(dir, "draft.json"), "utf8")).toThrow();
  });

  it("≥3 events sharing the ruling ref make promote propose it by recurrence; 2 do not", () => {
    const dir = tmp(); const ledger = join(dir, "ledger.jsonl");
    draftInto(dir, ledger);
    const draft = JSON.parse(readFileSync(join(dir, "draft.json"), "utf8"));
    const id = draft.rulings[0].id as string;
    const live = { ...draft, rulings: [{ ...draft.rulings[0], status: "active", source: ["docs/a.md#x"] }] };
    const rulings = join(dir, "rulings.json"); writeFileSync(rulings, JSON.stringify(live));

    capture(["knowledge", "ledger", "append", ledger, "--event", evt("ev-c1", "correction", id)]);
    expect(promote(dir, rulings, ledger).candidates).toEqual([]);
    capture(["knowledge", "ledger", "append", ledger, "--event", evt("ev-a1", "approval", id)]);
    const hit = promote(dir, rulings, ledger);
    expect(hit.candidates).toHaveLength(1);
    expect(hit.candidates[0]).toMatchObject({ id, reasons: ["recurrence"], recurrence: 3 });
  });

  it("schema-shaped events count only by refs: a mention in free text is not a recurrence", () => {
    const dir = tmp(); const ledger = join(dir, "ledger.jsonl");
    draftInto(dir, ledger);
    const draft = JSON.parse(readFileSync(join(dir, "draft.json"), "utf8"));
    const id = draft.rulings[0].id as string;
    const rulings = join(dir, "rulings.json");
    writeFileSync(rulings, JSON.stringify({ ...draft, rulings: [{ ...draft.rulings[0], status: "active", source: ["docs/a.md#x"] }] }));
    for (const n of [1, 2]) capture(["knowledge", "ledger", "append", ledger, "--event", JSON.stringify({ id: `m${n}`, type: "retro", t: "2026-09-27", source: "observed", refs: [], text: `we discussed ${id}` })]);
    expect(promote(dir, rulings, ledger).candidates).toEqual([]);
  });
});
