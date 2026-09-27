import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { capture, useTempDirs } from "./fixtures/knowledge-promotion/cli-capture.js";

const tmp = useTempDirs("knowledge-ledger-append-");
const ev = (over: Record<string, unknown> = {}) => JSON.stringify({ id: "ev-9", type: "gap", t: "2026-09-27", source: "observed", refs: [], text: "A gap.", ...over });
const append = (file: string, event: string) => capture(["knowledge", "ledger", "append", file, "--event", event, "--json"]);

describe("ui knowledge ledger append", () => {
  it("creates the ledger (and its folder) and writes one line", () => {
    const p = join(tmp(), "design", "ledger.jsonl");
    expect(append(p, ev()).code).toBe(0);
    expect(readFileSync(p, "utf8")).toBe(`${ev()}\n`);
  });

  it("appends after existing lines and never rewrites them, even when the last line has no newline", () => {
    const p = join(tmp(), "l.jsonl");
    const first = ev({ id: "ev-1" });
    writeFileSync(p, first);
    expect(append(p, ev({ id: "ev-2" })).code).toBe(0);
    expect(readFileSync(p, "utf8")).toBe(`${first}\n${ev({ id: "ev-2" })}\n`);
  });

  it("rejects an invalid event and leaves the file byte-identical", () => {
    const p = join(tmp(), "l.jsonl");
    writeFileSync(p, `${ev({ id: "ev-1" })}\n`);
    const before = readFileSync(p, "utf8");
    expect(append(p, ev({ id: "ev-2", type: "vote" })).code).toBe(1);
    expect(append(p, ev({ id: "ev-3", type: "correction" })).code).toBe(1);
    expect(append(p, "{nope").code).toBe(1);
    expect(readFileSync(p, "utf8")).toBe(before);
  });

  it("rejects a duplicate id and leaves the file untouched", () => {
    const p = join(tmp(), "l.jsonl");
    writeFileSync(p, `${ev({ id: "ev-1" })}\n`);
    const r = append(p, ev({ id: "ev-1", text: "again" }));
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("DUPLICATE_ID");
    expect(readFileSync(p, "utf8").split("\n").filter(Boolean)).toHaveLength(1);
  });

  it("refuses a JSON-document ledger instead of rewriting it, and does not create a file on failure", () => {
    const doc = join(tmp(), "doc.json");
    writeFileSync(doc, JSON.stringify({ entries: [] }));
    expect(append(doc, ev()).code).toBe(1);
    expect(readFileSync(doc, "utf8")).toBe('{"entries":[]}');
    const fresh = join(tmp(), "fresh.jsonl");
    expect(append(fresh, ev({ type: "vote" })).code).toBe(1);
    expect(existsSync(fresh)).toBe(false);
  });

  it("requires --event", () => {
    expect(capture(["knowledge", "ledger", "append", join(tmp(), "l.jsonl")]).code).toBe(1);
  });
});
