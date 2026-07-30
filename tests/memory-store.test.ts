/**
 * Registry-integrity phase 04 (5.4), §5 — `ledgerLineCount`'s persisted counter
 * (`memory.events.count.json`, beside the ledger). Before this: every call re-read and
 * re-split the WHOLE ledger just to pick the next event id (O(E) per event, O(E²)
 * cumulative). This suite proves the counter self-heals losslessly for a pre-existing
 * ledger (a project that predates this fix), stays correct across repeated appends, and
 * degrades safely on a malformed counter file (never trusts it blindly).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendEvent, ledgerLineCount, memoryPaths, type MemoryPaths } from "../src/core/memory-store.js";
import { serializeEvent, type MemoryEvent } from "../src/core/memory-events.js";

let dir: string;
let paths: MemoryPaths;

function counterPath(): string {
  return join(dir, "design", "memory.events.count.json");
}

function event(id: string): MemoryEvent {
  return { v: 1, id, t: new Date().toISOString(), type: "reconcile_applied", data: { added: [], updated: [], deprecated: [] } };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "memory-store-"));
  paths = memoryPaths(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("ledgerLineCount — absent ledger / absent counter", () => {
  it("0 when the ledger does not exist (no counter file created either)", () => {
    expect(ledgerLineCount(paths)).toBe(0);
  });

  it("self-heals a pre-existing ledger with no counter file — one real scan, then persists it", () => {
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(paths.ledger, [event("a"), event("b"), event("c")].map((e) => serializeEvent(e)).join("\n") + "\n", "utf8");
    expect(ledgerLineCount(paths)).toBe(3);
    const counter = JSON.parse(readFileSync(counterPath(), "utf8"));
    // Stage-4 MAJOR8 — the counter now also carries the ledger's own byte size at the
    // moment it was verified, so it round-trips as {count, bytes}, not {count} alone.
    expect(counter).toEqual({ count: 3, bytes: expect.any(Number) });
    // A second call reads the now-persisted counter — same answer, no need to re-scan
    // (behaviourally unobservable here, but the counter file itself is the proof it exists).
    expect(ledgerLineCount(paths)).toBe(3);
  });

  it("blank lines are not counted (matches the ledger's own convention)", () => {
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(paths.ledger, `${serializeEvent(event("a"))}\n\n   \n${serializeEvent(event("b"))}\n`, "utf8");
    expect(ledgerLineCount(paths)).toBe(2);
  });
});

describe("appendEvent — advances the counter by exactly one, every time", () => {
  it("three appends in a row produce counter values 1, 2, 3", () => {
    expect(ledgerLineCount(paths)).toBe(0);
    appendEvent(paths, event("a"));
    expect(ledgerLineCount(paths)).toBe(1);
    appendEvent(paths, event("b"));
    expect(ledgerLineCount(paths)).toBe(2);
    appendEvent(paths, event("c"));
    expect(ledgerLineCount(paths)).toBe(3);
  });

  it("appending to a PRE-EXISTING (uncounted) ledger continues from the real count, not from 0", () => {
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(paths.ledger, [event("a"), event("b")].map((e) => serializeEvent(e)).join("\n") + "\n", "utf8");
    appendEvent(paths, event("c"));
    expect(ledgerLineCount(paths)).toBe(3);
    const lines = readFileSync(paths.ledger, "utf8").trim().split("\n");
    expect(lines).toHaveLength(3);
  });
});

describe("the counter file degrades safely — never trusted blindly", () => {
  it("a malformed counter file triggers a fresh real count instead of crashing or trusting garbage", () => {
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(paths.ledger, [event("a"), event("b")].map((e) => serializeEvent(e)).join("\n") + "\n", "utf8");
    writeFileSync(counterPath(), "{not valid json", "utf8");
    expect(ledgerLineCount(paths)).toBe(2); // re-derived from the real ledger, not from garbage
  });

  it("a negative or non-integer counter value is rejected, re-derived from the real ledger", () => {
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(paths.ledger, [event("a")].map((e) => serializeEvent(e)).join("\n") + "\n", "utf8");
    writeFileSync(counterPath(), JSON.stringify({ count: -5 }), "utf8");
    expect(ledgerLineCount(paths)).toBe(1);
    writeFileSync(counterPath(), JSON.stringify({ count: 1.5 }), "utf8");
    expect(ledgerLineCount(paths)).toBe(1);
  });

  // Stage-4 MAJOR8 — the plan required the counter be VERIFIED on open, not trusted on
  // faith forever. A pre-MAJOR8 counter file ({count} alone, no `bytes`) cannot be
  // verified at all, so it must be treated exactly like "absent" — one self-healing
  // rescan, never blind trust.
  it("a pre-MAJOR8 counter file ({count} alone, no bytes) is treated as unverifiable — re-derived, not trusted", () => {
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(paths.ledger, [event("a"), event("b")].map((e) => serializeEvent(e)).join("\n") + "\n", "utf8");
    writeFileSync(counterPath(), JSON.stringify({ count: 99 }), "utf8"); // stale/unverifiable, no bytes
    expect(ledgerLineCount(paths)).toBe(2); // the REAL count, never the unverifiable 99
    const counter = JSON.parse(readFileSync(counterPath(), "utf8"));
    expect(counter).toEqual({ count: 2, bytes: expect.any(Number) }); // now upgraded + verifiable
  });

  it("the ledger changing OUT OF BAND (bytes no longer match) forces a rescan instead of trusting the stale cached count", () => {
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(paths.ledger, [event("a")].map((e) => serializeEvent(e)).join("\n") + "\n", "utf8");
    expect(ledgerLineCount(paths)).toBe(1); // establishes {count: 1, bytes: <size of 1 line>}

    // Simulate an out-of-band append (NOT via `appendEvent` — e.g. a restore, a hand-edit,
    // or a future writer that forgot to bump the counter): the ledger now has 3 lines, but
    // the counter file still says 1.
    writeFileSync(
      paths.ledger,
      [event("a"), event("b"), event("c")].map((e) => serializeEvent(e)).join("\n") + "\n",
      "utf8",
    );
    expect(ledgerLineCount(paths)).toBe(3); // detected via the byte-size mismatch, rescanned
    const counter = JSON.parse(readFileSync(counterPath(), "utf8"));
    expect(counter.count).toBe(3); // re-persisted, correct again
  });

  it("the ledger SHRINKING out of band (e.g. hand-truncated) is also caught by the byte check, not just growth", () => {
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(paths.ledger, [event("a"), event("b"), event("c")].map((e) => serializeEvent(e)).join("\n") + "\n", "utf8");
    expect(ledgerLineCount(paths)).toBe(3);

    writeFileSync(paths.ledger, [event("a")].map((e) => serializeEvent(e)).join("\n") + "\n", "utf8");
    expect(ledgerLineCount(paths)).toBe(1); // never the stale, now-too-high cached 3
  });
});
