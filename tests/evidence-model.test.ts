/**
 * `evidence-model.ts` — pure anti-fabrication gate + record shape (no fs).
 * Covers quoteMatches/normalizeText, validateForAdd's error codes, id allocation,
 * parse/serialize round-trips, and the support-level mapping.
 */
import { describe, expect, it } from "vitest";
import {
  EvidenceError,
  MIN_QUOTE_CHARS,
  nextEvidenceId,
  normalizeText,
  parseEvidence,
  quoteMatches,
  serializeEvidence,
  supportOf,
  validateForAdd,
} from "../src/core/evidence-model.js";
import type { EvidenceRecord } from "../src/core/evidence-model.js";

describe("quoteMatches", () => {
  it("exact substring → true", () => {
    expect(quoteMatches("confused me completely", "The flow confused me completely and I gave up.")).toBe(true);
  });

  it("whitespace-normalised substring → true (source has newlines/extra spaces)", () => {
    const source = "The\nflow   confused   me\n\ncompletely   and I gave up.";
    expect(quoteMatches("confused me completely", source)).toBe(true);
  });

  it("non-substring → false", () => {
    expect(quoteMatches("this text never appeared anywhere", "The flow confused me completely.")).toBe(false);
  });

  it("a quote shorter than MIN_QUOTE_CHARS → false even when present as a substring", () => {
    const source = "hi there, general text";
    const shortQuote = source.slice(0, MIN_QUOTE_CHARS - 1);
    expect(shortQuote.length).toBeLessThan(MIN_QUOTE_CHARS);
    expect(source.includes(shortQuote)).toBe(true); // present…
    expect(quoteMatches(shortQuote, source)).toBe(false); // …but rejected as unverifiable
  });
});

describe("normalizeText", () => {
  it("collapses whitespace runs, trims, and preserves case", () => {
    expect(normalizeText("  Hello   World\n\tFoo  ")).toBe("Hello World Foo");
  });
});

describe("validateForAdd", () => {
  const code = (fn: () => void): string => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(EvidenceError);
      return (e as EvidenceError).code;
    }
    throw new Error("expected validateForAdd to throw");
  };

  it("kind=quote with no quote → BAD_ARG", () => {
    expect(code(() => validateForAdd("quote", { finding: "insight" }))).toBe("BAD_ARG");
  });

  it("kind=quote with a quote shorter than MIN_QUOTE_CHARS → QUOTE_TOO_SHORT", () => {
    expect(code(() => validateForAdd("quote", { finding: "insight", quote: "short" }))).toBe("QUOTE_TOO_SHORT");
  });

  it("kind=quote with a valid-length quote but no source → BAD_ARG", () => {
    expect(code(() => validateForAdd("quote", { finding: "insight", quote: "long enough quote text" }))).toBe("BAD_ARG");
  });

  it("kind=metric with no metric → BAD_ARG", () => {
    expect(code(() => validateForAdd("metric", { finding: "insight" }))).toBe("BAD_ARG");
  });

  it("kind=metric with a metric but no source → BAD_ARG", () => {
    expect(code(() => validateForAdd("metric", { finding: "insight", metric: { value: "42" } }))).toBe("BAD_ARG");
  });

  it("kind=observation with just a finding → OK (no throw)", () => {
    expect(() => validateForAdd("observation", { finding: "users seemed frustrated" })).not.toThrow();
  });

  it("missing finding → BAD_ARG (regardless of kind)", () => {
    expect(code(() => validateForAdd("observation", {}))).toBe("BAD_ARG");
  });
});

describe("nextEvidenceId", () => {
  it("[] → 'ev1'", () => {
    expect(nextEvidenceId([])).toBe("ev1");
  });

  it("records up through ev3 → 'ev4'", () => {
    const recs = ["ev1", "ev2", "ev3"].map((id) => ({ id, kind: "observation", finding: "x" }) as EvidenceRecord);
    expect(nextEvidenceId(recs)).toBe("ev4");
  });

  it("ignores non-matching ids", () => {
    const recs = [
      { id: "ev3", kind: "observation", finding: "x" },
      { id: "custom-id", kind: "observation", finding: "y" },
      { id: "evfoo", kind: "observation", finding: "z" },
    ] as EvidenceRecord[];
    expect(nextEvidenceId(recs)).toBe("ev4");
  });
});

describe("parseEvidence / serializeEvidence", () => {
  const full: EvidenceRecord = {
    id: "ev1",
    kind: "quote",
    finding: "users find checkout confusing",
    quote: "the checkout button was impossible to find",
    source: { ref: "interview1.txt", medium: "interview", locator: "line 12" },
    tags: ["checkout", "ux"],
    t: 1700000000000,
  };

  it("parseEvidence round-trips a full record", () => {
    const parsed = parseEvidence(JSON.parse(JSON.stringify(full)), "ctx");
    expect(parsed).toEqual(full);
  });

  it("throws BAD_EVIDENCE on missing id", () => {
    expect(() => parseEvidence({ kind: "quote", finding: "x" }, "ctx")).toThrow(EvidenceError);
    try {
      parseEvidence({ kind: "quote", finding: "x" }, "ctx");
    } catch (e) {
      expect((e as EvidenceError).code).toBe("BAD_EVIDENCE");
    }
  });

  it("throws BAD_EVIDENCE on a bad kind", () => {
    try {
      parseEvidence({ id: "ev1", kind: "rumor", finding: "x" }, "ctx");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EvidenceError);
      expect((e as EvidenceError).code).toBe("BAD_EVIDENCE");
    }
  });

  it("throws BAD_EVIDENCE on missing finding", () => {
    try {
      parseEvidence({ id: "ev1", kind: "observation" }, "ctx");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EvidenceError);
      expect((e as EvidenceError).code).toBe("BAD_EVIDENCE");
    }
  });

  it("serializeEvidence → JSON.parse → parseEvidence round-trips", () => {
    const line = serializeEvidence(full);
    const roundTripped = parseEvidence(JSON.parse(line), "ctx");
    expect(roundTripped).toEqual(full);
  });
});

describe("supportOf", () => {
  it("quote → 'quoted'", () => {
    expect(supportOf({ id: "ev1", kind: "quote", finding: "x" })).toBe("quoted");
  });
  it("metric → 'metric'", () => {
    expect(supportOf({ id: "ev1", kind: "metric", finding: "x" })).toBe("metric");
  });
  it("observation → 'unsupported'", () => {
    expect(supportOf({ id: "ev1", kind: "observation", finding: "x" })).toBe("unsupported");
  });
});
