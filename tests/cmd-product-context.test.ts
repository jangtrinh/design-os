import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalStringify } from "../src/core/ds-manifest.js";
import { COMMAND_SIGNATURES } from "../src/core/command-signatures.js";
import { lintFlow } from "../src/core/flow-lint.js";
import { parseFlow } from "../src/core/flow-model.js";
import {
  allClaims, asObject, claim, clone, compareFindingTriples, createProductContextHarness, exactKeys, PRODUCT,
  PRODUCT_CONTEXT_SUITE, receipt, sha256, type Json,
} from "./helpers/product-context-fixtures.js";

const context = createProductContextHarness();
const { atlas, capture, compileFailure, compileOk, count, json, lint, write } = context;

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
        "project-flow": {
          summary: "Project a replayed Product Atlas into Flow",
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
    expect(result.out).toContain("ui product-context project-flow <atlas.json> [--json]");
    expect(result.err).toBe("");
    for (const args of [
      ["product-context", "compile", "--unknown-product-context-flag", "--json"],
      ["product-context", "lint", "atlas.json", "--unknown-product-context-flag", "--json"],
      ["product-context", "project-flow", "atlas.json", "--unknown-product-context-flag", "--json"],
    ]) {
      const unknownFlag = capture(args);
      expect(unknownFlag.code).toBe(1);
      expect(unknownFlag.err).toBe("");
      expect(json(unknownFlag, "product-context unknown flag")).toEqual({
        ok: false,
        command: `product-context ${args[1]}`,
        error: { code: "UNKNOWN_FLAG", message: expect.not.stringMatching(/^[A-Z][A-Z_]+$/) },
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

  it("product-context project-flow matches committed Flow fixture and replay finding union", () => {
    const source = readFileSync(join(process.cwd(), "tests/fixtures/diagram/product-flow-real.json"));
    const raw = JSON.parse(source.toString("utf8"));
    const receipts = [["screens", raw.screens], ["transitions", raw.transitions], ["entryPoints", raw.entryPoints]].map(([member, value], index) => receipt({ receiptId: `receipt-00${index + 1}`, sourceDigest: sha256(source), claims: [...allClaims().filter((item) => !String(item["field"]).startsWith("flow.")), claim(`flow-claim-00${index + 1}`, `flow.${member}`, value)] }));
    const compiled = compileOk(receipts);
    const atlasPath = write("committed-flow-atlas.json", canonicalStringify(atlas(compiled)));
    const before = readFileSync(atlasPath), fields = atlas(compiled)["fields"] as Json[];
    const resolved = (field: string): unknown => asObject(fields.find((item) => item["field"] === field))["value"];
    const expectedFlow = parseFlow({ screens: resolved("flow.screens"), transitions: resolved("flow.transitions"), entryPoints: resolved("flow.entryPoints") }, "replayed-flow.json");
    const replay = lint(atlasPath);
    expect(replay).toMatchObject({ code: 0, err: "" });
    const replayData = asObject(json(replay, "committed fixture replay").data);
    const result = capture(["product-context", "project-flow", atlasPath, "--json"]);
    expect(result).toMatchObject({ code: 0, err: "" });
    const envelope = json(result, "project-flow committed fixture");
    exactKeys(asObject(envelope), ["ok", "command", "data"]);
    expect(envelope).toMatchObject({ ok: true, command: "product-context project-flow" });
    const data = asObject(envelope.data);
    exactKeys(data, ["kind", "version", "status", "productId", "atlasDigest", "truthStatus", "flow", "findings", "errorCount", "warningCount"]);
    expect(data).toMatchObject({ kind: "product-context-flow-projection", version: 1, status: "available", productId: PRODUCT, atlasDigest: sha256(before), truthStatus: "not-evaluated" });
    const projected = asObject(data["flow"]);
    expect(projected["screens"]).toEqual(expectedFlow.screens);
    expect(projected["transitions"]).toEqual(expectedFlow.transitions);
    expect(projected["entryPoints"]).toEqual(expectedFlow.entryPoints);
    expect(readFileSync(atlasPath)).toEqual(before);
    const expected = [...(replayData["findings"] as Json[]), ...(lintFlow(expectedFlow).findings as unknown as Json[])].sort(compareFindingTriples).filter((item, index, values) => index === 0 || compareFindingTriples(item, values[index - 1]!) !== 0);
    expect(data["findings"]).toEqual(expected);
    expect(data["errorCount"]).toBe(expected.filter((finding) => finding["severity"] === "error").length);
    expect(data["warningCount"]).toBe(expected.filter((finding) => finding["severity"] === "warning").length);
    const text = capture(["product-context", "project-flow", atlasPath]);
    expect(text).toEqual({ code: 0, out: canonicalStringify(expectedFlow), err: "" });
  });
});
