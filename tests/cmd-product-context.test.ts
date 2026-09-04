import { describe, expect, it } from "vitest";
import { canonicalStringify } from "../src/core/ds-manifest.js";
import { COMMAND_SIGNATURES } from "../src/core/command-signatures.js";
import {
  asObject, canonicalText, claim, clone, createProductContextHarness, exactKeys, PRODUCT,
  PRODUCT_CONTEXT_SUITE, receipt, sha256, type Json,
} from "./helpers/product-context-fixtures.js";
import { productContextCoreSeams, productContextSeams } from "./helpers/product-context-seams.js";

const context = createProductContextHarness();
const { atlas, capture, compileFailure, compileOk, compileSemantic, compileText, count, json, lintFailure, write } = context;

describe(PRODUCT_CONTEXT_SUITE, () => {
  it("registers compile and lint with their exact public signatures", () => {
    expect(COMMAND_SIGNATURES["product-context"]).toEqual({
      summary: "Compile and replay-lint Product Context Atlases",
      subcommands: {
        compile: {
          summary: "Compile receipts into a canonical Product Atlas",
          positionals: [{ name: "<receipt.json>", required: true, variadic: true, summary: "Product context receipt" }],
          flags: [],
          errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "READ_ERROR", "BAD_PRODUCT_CONTEXT", "PRODUCT_ID_MISMATCH", "PRODUCT_CONTEXT_RECEIPT_TOO_LARGE", "PRODUCT_CONTEXT_INPUT_TOO_LARGE", "PRODUCT_CONTEXT_OMITTED_COUNT_OVERFLOW", "PRODUCT_ATLAS_OUTPUT_TOO_LARGE"],
        },
        lint: {
          summary: "Replay and byte-compare a Product Atlas",
          positionals: [{ name: "<atlas.json>", required: true, summary: "Product Atlas" }],
          flags: [],
          errorCodes: ["BAD_ARG", "UNKNOWN_FLAG", "FILE_NOT_FOUND", "READ_ERROR", "BAD_PRODUCT_ATLAS", "PRODUCT_ATLAS_INPUT_TOO_LARGE"],
        },
      },
    });
    const result = capture(["product-context", "--help"]);
    expect(result.code, "product-context dispatcher must be registered").toBe(0);
    expect(result.out).toContain("ui product-context compile <receipt.json>... [--json]");
    expect(result.out).toContain("ui product-context lint <atlas.json> [--json]");
    expect(result.out).not.toContain("project-flow");
    expect(result.err).toBe("");
    for (const args of [
      ["product-context", "compile", "--unknown-product-context-flag", "--json"],
      ["product-context", "lint", "atlas.json", "--unknown-product-context-flag", "--json"],
    ]) {
      const unknownFlag = capture(args);
      expect(unknownFlag.code).toBe(1);
      expect(unknownFlag.err).toBe("");
      expect(json(unknownFlag, "product-context unknown flag")).toEqual({
        ok: false,
        command: `product-context ${args[1]}`,
        error: { code: "UNKNOWN_FLAG", message: expect.any(String) },
      });
    }
  });

  it("accepts exact roots, fixed fields, digests, and every zero coverage bucket", () => {
    const data = compileOk([receipt()]);
    const compiled = atlas(data);
    exactKeys(data, ["atlas", "atlasDigest", "errorCount", "findings", "warningCount"]);
    exactKeys(compiled, ["kind", "version", "productId", "inputSetDigest", "receipts", "fields", "coverage"]);
    expect(compiled).toMatchObject({ kind: "product-atlas", version: 1, productId: PRODUCT });
    const embedded = asObject((compiled["receipts"] as unknown[])[0]);
    const embeddedClaim = asObject((embedded["claims"] as unknown[])[0]);
    const field = asObject((compiled["fields"] as unknown[])[0]);
    const candidate = asObject((field["candidates"] as unknown[])[0]);
    exactKeys(embedded, ["kind", "version", "receiptId", "productId", "sourceRef", "sourceDigest", "capturedAt", "captureDisposition", "omittedCount", "reasonCodes", "claims", "receiptDigest"]);
    exactKeys(embeddedClaim, ["claimId", "field", "required", "disposition", "value", "reason", "supersedes"]);
    exactKeys(field, ["field", "resolution", "value", "candidates"]);
    exactKeys(candidate, ["receiptId", "claim", "status"]);
    exactKeys(asObject(compiled["coverage"]), ["captureDispositions", "claimDispositions", "candidateStatuses", "resolutions", "omittedCount"]);
    const normalizedReceipt = clone(embedded);
    delete normalizedReceipt["receiptDigest"];
    expect(embedded["receiptDigest"]).toBe(sha256(canonicalStringify(normalizedReceipt)));
    expect(compiled["inputSetDigest"]).toBe(sha256(canonicalStringify([{ receiptId: embedded["receiptId"], receiptDigest: embedded["receiptDigest"] }])));
    expect(data["atlasDigest"]).toBe(sha256(canonicalStringify(compiled)));
    expect(compiled["receipts"] as unknown[]).toHaveLength(1);
    expect(compiled["fields"] as unknown[]).toHaveLength(10);
    expect(count(compiled, "captureDispositions")).toEqual({ captured: 1, capped: 0, skipped: 0, blocked: 0, failed: 0 });
    expect(count(compiled, "claimDispositions")).toEqual({ present: 10, missing: 0, empty: 0, stale: 0, rejected: 0, malformed: 0, partial: 0, "not-evaluated": 0 });
    expect(count(compiled, "candidateStatuses")).toEqual({ selected: 10, coalesced: 0, superseded: 0, excluded: 0, conflicted: 0 });
    expect(count(compiled, "resolutions")).toEqual({ resolved: 10, missing: 0, unresolved: 0, conflicting: 0 });
    expect(asObject(compiled["coverage"])["omittedCount"]).toBe(0);
  });

  it.each([
    ["additional root property", () => receipt({ unexpected: true })],
    ["missing root property", () => { const value = receipt(); delete value["sourceRef"]; return value; }],
    ["additional claim property", () => receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", "audience-001", { unexpected: true })] })],
    ["missing claim property", () => { const value = receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", "audience-001")] }); delete asObject((value["claims"] as Json[])[0])["reason"]; return value; }],
    ["wrong kind", () => receipt({ kind: "not-a-receipt" })],
    ["uppercase receipt ID", () => receipt({ receiptId: "Receipt-001" })],
    ["slash source reference", () => receipt({ sourceRef: "source/001" })],
    ["bad source digest", () => receipt({ sourceDigest: "sha256:UPPER" })],
    ["unsorted reason codes", () => receipt({ captureDisposition: "capped", omittedCount: 1, reasonCodes: ["z-001", "a-001"], claims: [] })],
    ["duplicate reason codes", () => receipt({ captureDisposition: "capped", omittedCount: 1, reasonCodes: ["capped-001", "capped-001"], claims: [] })],
    ["duplicate claim identifier", () => receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", "audience-001"), claim("claim-001", "productTruth.desiredChange", "change-001")] })],
    ["unknown claim field", () => receipt({ claims: [claim("claim-001", "productTruth.unknown", "audience-001")] })],
    ["unknown claim disposition", () => receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", "audience-001", { disposition: "unknown" })] })],
    ["non-boolean claim required", () => receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", "audience-001", { required: "true" })] })],
    ["scalar field list value", () => receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", ["audience-001"])] })],
    ["list field scalar value", () => receipt({ claims: [claim("claim-001", "productTruth.availableProof", "proof-001")] })],
    ["unknown Flow transition trigger", () => receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: "transition-001", from: "screen-001", to: "screen-001", trigger: "UNKNOWN" }])] })],
  ])("rejects strict receipt shape: %s", (_label, makeReceipt) => { compileFailure([makeReceipt()], "BAD_PRODUCT_CONTEXT"); });

  it("rejects both extra and missing keys at every strict Atlas schema boundary before replay", async () => {
    const core = await productContextCoreSeams();
    const command = await productContextSeams();
    expect(core?.normalizeProductAtlas, "missing expected normalizeProductAtlas strict Atlas seam").toBeTypeOf("function");
    expect(command?.productContextCommand?.run, "missing expected productContextCommand dispatcher").toBeTypeOf("function");
    expect(command?.runProductContextCompile, "missing expected runProductContextCompile handler").toBeTypeOf("function");
    expect(command?.runProductContextLint, "missing expected runProductContextLint handler").toBeTypeOf("function");
    if (core?.normalizeProductAtlas === undefined || command?.productContextCommand?.run === undefined || command.runProductContextCompile === undefined || command.runProductContextLint === undefined) return;
    const normalizeAtlas = core.normalizeProductAtlas;
    expect(command.productContextCommand.run.toString()).toMatch(/\brunProductContextCompile\s*\(/);
    expect(command.productContextCommand.run.toString()).toMatch(/\brunProductContextLint\s*\(/);
    expect(command.runProductContextLint.toString()).toMatch(/\bnormalizeProductAtlas\s*\(/);
    const bytes = compileText([receipt()]);
    const cases: Array<[string, (value: Json) => void]> = [
      ["Atlas extra", (value) => { value["unexpected"] = true; }],
      ["Atlas missing", (value) => { delete value["coverage"]; }],
      ["Atlas kind", (value) => { value["kind"] = "wrong"; }],
      ["Atlas version", (value) => { value["version"] = 2; }],
      ["Atlas product ID grammar", (value) => { value["productId"] = "Product-001"; }],
      ["Atlas input digest malformed", (value) => { value["inputSetDigest"] = "not-a-digest"; }],
      ["Atlas input digest uppercase", (value) => { value["inputSetDigest"] = `sha256:${"A".repeat(64)}`; }],
      ["embedded receipt extra", (value) => { asObject((value["receipts"] as Json[])[0])["unexpected"] = true; }],
      ["embedded receipt missing", (value) => { delete asObject((value["receipts"] as Json[])[0])["sourceRef"]; }],
      ["embedded receipt enum", (value) => { asObject((value["receipts"] as Json[])[0])["captureDisposition"] = "unknown"; }],
      ["embedded receipt digest", (value) => { asObject((value["receipts"] as Json[])[0])["receiptDigest"] = `sha256:${"A".repeat(64)}`; }],
      ["embedded claim extra", (value) => { asObject((asObject((value["receipts"] as Json[])[0])["claims"] as Json[])[0])["unexpected"] = true; }],
      ["embedded claim missing", (value) => { delete asObject((asObject((value["receipts"] as Json[])[0])["claims"] as Json[])[0])["reason"]; }],
      ["embedded claim field enum", (value) => { asObject((asObject((value["receipts"] as Json[])[0])["claims"] as Json[])[0])["field"] = "productTruth.unknown"; }],
      ["embedded claim disposition enum", (value) => { asObject((asObject((value["receipts"] as Json[])[0])["claims"] as Json[])[0])["disposition"] = "unknown"; }],
      ["embedded claim required type", (value) => { asObject((asObject((value["receipts"] as Json[])[0])["claims"] as Json[])[0])["required"] = "true"; }],
      ["embedded claim value type", (value) => { asObject((asObject((value["receipts"] as Json[])[0])["claims"] as Json[])[0])["value"] = ["audience-001"]; }],
      ["field extra", (value) => { asObject((value["fields"] as Json[])[0])["unexpected"] = true; }],
      ["field missing", (value) => { delete asObject((value["fields"] as Json[])[0])["resolution"]; }],
      ["field resolution enum", (value) => { asObject((value["fields"] as Json[])[0])["resolution"] = "unknown"; }],
      ["candidate extra", (value) => { asObject((asObject((value["fields"] as Json[])[0])["candidates"] as Json[])[0])["unexpected"] = true; }],
      ["candidate missing", (value) => { delete asObject((asObject((value["fields"] as Json[])[0])["candidates"] as Json[])[0])["status"]; }],
      ["candidate status enum", (value) => { asObject((asObject((value["fields"] as Json[])[0])["candidates"] as Json[])[0])["status"] = "unknown"; }],
      ["coverage extra", (value) => { asObject(value["coverage"])["unexpected"] = 0; }],
      ["coverage missing", (value) => { delete asObject(value["coverage"])["resolutions"]; }],
    ];
    for (const [bucket, counter] of [
      ["captureDispositions", "captured"],
      ["claimDispositions", "present"],
      ["candidateStatuses", "selected"],
      ["resolutions", "resolved"],
    ] as Array<[string, string]>) {
      cases.push(
        [`${bucket} counter extra`, (value) => { asObject(asObject(value["coverage"])[bucket])["unexpected"] = 0; }],
        [`${bucket} counter missing`, (value) => { delete asObject(asObject(value["coverage"])[bucket])[counter]; }],
        [`${bucket} counter type`, (value) => { asObject(asObject(value["coverage"])[bucket])[counter] = "0"; }],
      );
    }
    cases.push(["coverage omitted count type", (value) => { asObject(value["coverage"])["omittedCount"] = "0"; }]);
    for (const [index, [label, mutate]] of cases.entries()) {
      const value = clone(canonicalText(bytes));
      mutate(value);
      expect(() => normalizeAtlas(value), `${label} must fail strict Atlas normalization before replay`).toThrow();
      lintFailure(write(`atlas-shape-${index}-${label}.json`, canonicalStringify(value)), "BAD_PRODUCT_ATLAS");
    }
    const semantic = compileSemantic([receipt({ claims: [claim("claim-001", "productTruth.primaryOutcome", null, { disposition: "missing" })] })], 1);
    for (const finding of semantic["findings"] as Json[]) exactKeys(finding, ["checkId", "severity", "message"]);
  });
});
