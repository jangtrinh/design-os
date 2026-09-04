import { describe, expect, it } from "vitest";
import {
  asObject, claim, createProductContextHarness, DIGEST, lifecycle, PRODUCT_CONTEXT_SUITE, receipt,
  type Json,
} from "./helpers/product-context-fixtures.js";
import { productContextCoreSeams } from "./helpers/product-context-seams.js";

const context = createProductContextHarness();
const { atlas, compileFailure, compileOk, compileSemantic, count, findingCodes } = context;

describe(PRODUCT_CONTEXT_SUITE, () => {
  it.each([
    ["captured missing digest", () => receipt({ sourceDigest: null })],
    ["captured empty claims", () => receipt({ claims: [] })],
    ["captured nonzero omissions", () => receipt({ omittedCount: 1 })],
    ["captured reasons", () => receipt({ reasonCodes: ["captured-001"] })],
    ["capped zero omissions", () => receipt({ captureDisposition: "capped", omittedCount: 0, reasonCodes: ["capped-001"], claims: [] })],
    ["capped null digest", () => receipt({ captureDisposition: "capped", sourceDigest: null, omittedCount: 1, reasonCodes: ["capped-001"], claims: [] })],
    ["capped empty reasons", () => receipt({ captureDisposition: "capped", omittedCount: 1, reasonCodes: [], claims: [] })],
    ["skipped with claims", () => receipt({ captureDisposition: "skipped", sourceDigest: null, reasonCodes: ["skipped-001"] })],
    ["blocked empty reasons", () => receipt({ captureDisposition: "blocked", sourceDigest: null, reasonCodes: [], claims: [] })],
    ["failed omissions", () => receipt({ captureDisposition: "failed", sourceDigest: null, omittedCount: 1, reasonCodes: ["failed-001"], claims: [] })],
  ])("rejects lifecycle coupling: %s", (_label, makeReceipt) => { compileFailure([makeReceipt()], "BAD_PRODUCT_CONTEXT"); });

  it("accepts terminal lifecycles with null or preserved valid source digest", () => {
    for (const disposition of ["skipped", "blocked", "failed"]) {
      compileOk([receipt({ receiptId: `${disposition}-null`, captureDisposition: disposition, sourceDigest: null, omittedCount: 0, reasonCodes: [`${disposition}-001`], claims: [] })]);
      compileOk([receipt({ receiptId: `${disposition}-digest`, captureDisposition: disposition, sourceDigest: DIGEST, omittedCount: 0, reasonCodes: [`${disposition}-001`], claims: [] })]);
    }
  });

  it("accepts real RFC3339 calendar times and rejects impossible dates and offsets", async () => {
    const core = await productContextCoreSeams();
    expect(core?.normalizeProductContextReceipt, "missing expected normalizeProductContextReceipt core seam").toBeTypeOf("function");
    if (core?.normalizeProductContextReceipt === undefined) return;
    const normalize = core.normalizeProductContextReceipt;
    compileOk([receipt({ capturedAt: null })]);
    const leapDay = receipt({ capturedAt: "2024-02-29T23:59:59.123+07:00" });
    expect(normalize(leapDay)).toBeDefined();
    compileOk([leapDay]);
    const lowercaseSeparators = receipt({ capturedAt: "2024-02-29t23:59:59.123z" });
    expect(normalize(lowercaseSeparators)).toBeDefined();
    compileOk([lowercaseSeparators]);
    const leapSecond = receipt({ capturedAt: "1990-12-31T23:59:60Z" });
    expect(normalize(leapSecond)).toBeDefined();
    compileOk([leapSecond]);
    for (const capturedAt of [
      "2023-02-29T12:00:00Z",
      "2024-04-31T12:00:00Z",
      "2024-01-01T24:00:00Z",
      "2024-01-01T12:00:00+14:60",
      "2024-01-01T12:00:60Z",
      "2024-01-01T12:59:60Z",
      "2024-06-30T22:59:60Z",
      "2024-01-01T12:00:61Z",
    ]) {
      const invalid = receipt({ capturedAt });
      expect(() => normalize(invalid), capturedAt).toThrow();
      compileFailure([invalid], "BAD_PRODUCT_CONTEXT");
    }
  });

  it.each([
    ["receiptId", (length: number) => receipt({ receiptId: "a".repeat(length) })],
    ["productId", (length: number) => receipt({ productId: "a".repeat(length) })],
    ["sourceRef", (length: number) => receipt({ sourceRef: "a".repeat(length) })],
    ["claimId", (length: number) => receipt({ claims: [claim("a".repeat(length), "productTruth.audienceSituation", "audience-001")] })],
  ])("accepts 128 and rejects 129 characters for %s", (_label, makeReceipt) => {
    compileOk([makeReceipt(128)]);
    compileFailure([makeReceipt(129)], "BAD_PRODUCT_CONTEXT");
  });

  it("counts all five capture lifecycles and preserves lifecycle findings", () => {
    const data = compileSemantic([
      lifecycle("receipt-001", "captured"),
      lifecycle("receipt-002", "capped"),
      lifecycle("receipt-003", "skipped"),
      lifecycle("receipt-004", "blocked"),
      lifecycle("receipt-005", "failed"),
    ], 0);
    const compiled = atlas(data);
    expect(count(compiled, "captureDispositions")).toEqual({ captured: 1, capped: 1, skipped: 1, blocked: 1, failed: 1 });
    expect(asObject(compiled["coverage"])["omittedCount"]).toBe(1);
    expect(findingCodes(data)).toEqual(expect.arrayContaining(["capture-capped", "capture-skipped", "capture-blocked", "capture-failed"]));
  });

  it("counts every disposition and preserves stale, rejected, malformed audit values", () => {
    const claims = [
      claim("claim-001", "productTruth.audienceSituation", "audience-001"),
      claim("claim-002", "productTruth.desiredChange", null, { disposition: "missing" }),
      claim("claim-003", "productTruth.primaryOutcome", null, { disposition: "empty" }),
      claim("claim-004", "productTruth.primaryAction", "action-001", { disposition: "stale" }),
      claim("claim-005", "productTruth.availableProof", ["proof-001"], { disposition: "rejected" }),
      claim("claim-006", "productTruth.prohibitedClaims", null, { disposition: "malformed" }),
      claim("claim-007", "productTruth.contentInventory", ["content-001"], { disposition: "partial" }),
      claim("claim-008", "flow.screens", null, { disposition: "not-evaluated" }),
    ];
    const data = compileSemantic([receipt({ claims })], 1);
    const compiled = atlas(data);
    const embedded = asObject((compiled["receipts"] as unknown[])[0]);
    const embeddedClaims = embedded["claims"] as Json[];
    expect(count(compiled, "claimDispositions")).toMatchObject({ present: 1, missing: 1, empty: 1, stale: 1, rejected: 1, malformed: 1, partial: 1, "not-evaluated": 1 });
    expect(embeddedClaims.find((item) => item["claimId"] === "claim-004")).toMatchObject({ disposition: "stale", value: "action-001" });
    expect(embeddedClaims.find((item) => item["claimId"] === "claim-005")).toMatchObject({ disposition: "rejected", value: ["proof-001"] });
    expect(embeddedClaims.find((item) => item["claimId"] === "claim-006")).toMatchObject({ disposition: "malformed", value: null });
    expect(findingCodes(data)).toEqual(expect.arrayContaining(["context-empty", "context-stale", "context-rejected", "context-malformed"]));
  });
});
