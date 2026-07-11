/**
 * `evidence-store.ts` — IO layer for the T6 evidence ledger. Uses real temp
 * dirs (mkdtempSync) + node:fs; asserts ingestSource idempotency/collision,
 * append+load round-trip, verifyRecord's anti-fabrication check, and that a
 * malformed ledger line throws BAD_EVIDENCE.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendEvidence,
  eventsPath,
  ingestSource,
  loadEvidence,
  sourceFile,
  verifyRecord,
} from "../src/core/evidence-store.js";
import { EvidenceError } from "../src/core/evidence-model.js";
import type { EvidenceRecord } from "../src/core/evidence-model.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-evid-store-"));
});

describe("ingestSource", () => {
  it("copies a file into <dir>/research-sources/ and returns its basename", () => {
    const src = join(dir, "raw", "interview1.txt");
    mkdirSync(join(dir, "raw"), { recursive: true });
    writeFileSync(src, "the checkout button was impossible to find", "utf8");

    const ref = ingestSource(dir, src);
    expect(ref).toBe("interview1.txt");
    expect(existsSync(sourceFile(dir, ref))).toBe(true);
    expect(readFileSync(sourceFile(dir, ref), "utf8")).toBe("the checkout button was impossible to find");
  });

  it("ingesting the SAME content twice under the same basename is idempotent", () => {
    const src = join(dir, "interview1.txt");
    writeFileSync(src, "some transcript text", "utf8");
    ingestSource(dir, src);
    expect(() => ingestSource(dir, src)).not.toThrow();
  });

  it("ingesting DIFFERENT content under the same basename throws SOURCE_COLLISION", () => {
    const src1 = join(dir, "a", "interview1.txt");
    const src2 = join(dir, "b", "interview1.txt");
    mkdirSync(join(dir, "a"), { recursive: true });
    mkdirSync(join(dir, "b"), { recursive: true });
    writeFileSync(src1, "original transcript", "utf8");
    writeFileSync(src2, "a completely different transcript", "utf8");

    ingestSource(dir, src1);
    try {
      ingestSource(dir, src2);
      throw new Error("expected SOURCE_COLLISION");
    } catch (e) {
      expect(e).toBeInstanceOf(EvidenceError);
      expect((e as EvidenceError).code).toBe("SOURCE_COLLISION");
    }
  });
});

describe("appendEvidence / loadEvidence", () => {
  it("round-trips records through append + load", () => {
    const rec1: EvidenceRecord = { id: "ev1", kind: "observation", finding: "users seemed lost" };
    const rec2: EvidenceRecord = { id: "ev2", kind: "metric", finding: "slow signup", metric: { value: "42", unit: "%" } };
    appendEvidence(dir, rec1);
    appendEvidence(dir, rec2);
    const loaded = loadEvidence(dir);
    expect(loaded).toEqual([rec1, rec2]);
  });

  it("loadEvidence on a missing dir → []", () => {
    const missing = join(dir, "does-not-exist");
    expect(loadEvidence(missing)).toEqual([]);
  });

  it("loadEvidence on a malformed JSONL line throws EvidenceError BAD_EVIDENCE", () => {
    mkdirSync(dir, { recursive: true });
    appendFileSync(eventsPath(dir), "{not valid json\n");
    try {
      loadEvidence(dir);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EvidenceError);
      expect((e as EvidenceError).code).toBe("BAD_EVIDENCE");
    }
  });
});

describe("verifyRecord", () => {
  it("a quote record whose quote IS a substring of its ingested source → { ok: true }", () => {
    const src = join(dir, "interview1.txt");
    writeFileSync(src, "the checkout button was impossible to find", "utf8");
    const ref = ingestSource(dir, src);
    const rec: EvidenceRecord = {
      id: "ev1", kind: "quote", finding: "checkout confusion",
      quote: "checkout button was impossible to find", source: { ref },
    };
    expect(verifyRecord(dir, rec)).toEqual({ id: "ev1", ok: true });
  });

  it("a quote record whose quote is NOT a substring of its source → { ok: false, reason }", () => {
    const src = join(dir, "interview1.txt");
    writeFileSync(src, "the checkout button was impossible to find", "utf8");
    const ref = ingestSource(dir, src);
    const rec: EvidenceRecord = {
      id: "ev1", kind: "quote", finding: "checkout confusion",
      quote: "this sentence never appeared in the source", source: { ref },
    };
    const result = verifyRecord(dir, rec);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("a quote record whose source is absent → { ok: false } with a SOURCE_MISSING reason", () => {
    const rec: EvidenceRecord = {
      id: "ev1", kind: "quote", finding: "checkout confusion",
      quote: "some verbatim quote text", source: { ref: "never-ingested.txt" },
    };
    const result = verifyRecord(dir, rec);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not found/i);
  });

  it("a metric record → { ok: true } (no source check)", () => {
    const rec: EvidenceRecord = { id: "ev1", kind: "metric", finding: "slow signup", metric: { value: "42", unit: "%" } };
    expect(verifyRecord(dir, rec)).toEqual({ id: "ev1", ok: true });
  });

  it("an observation record → { ok: true } (no source check)", () => {
    const rec: EvidenceRecord = { id: "ev1", kind: "observation", finding: "users seemed lost" };
    expect(verifyRecord(dir, rec)).toEqual({ id: "ev1", ok: true });
  });
});
