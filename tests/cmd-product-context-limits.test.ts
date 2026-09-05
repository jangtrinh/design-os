import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  asObject, ATLAS_MAX, canonicalText, claim, clone, createProductContextHarness, flowScreensReceipt,
  INPUT_MAX, lifecycle, PRODUCT_CONTEXT_SUITE, RECEIPT_MAX, receipt, type Json,
} from "./helpers/product-context-fixtures.js";
import { productContextSeams } from "./helpers/product-context-seams.js";

const context = createProductContextHarness();
const { atlas, capture, compile, compileFailure, compileOk, compilePaths, compileText, json, lintFailure, padded, write, writeCompact } = context;

describe(PRODUCT_CONTEXT_SUITE, () => {
  it("accepts frozen exact collection/scalar maxima and rejects every max plus one", () => {
    const scalar = (size: number) => receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", "😀".repeat(size))] });
    const listItem = (size: number) => receipt({ claims: [claim("claim-001", "productTruth.availableProof", ["😀".repeat(size)])] });
    const list = (size: number) => receipt({ claims: [claim("claim-001", "productTruth.availableProof", Array.from({ length: size }, () => "proof-001"))] });
    const states = (size: number) => receipt({ claims: [claim("claim-001", "flow.screens", [{ id: "screen-001", states: Array.from({ length: size }, (_, index) => `state-${index}`) }])] });
    const nested = (size: number) => receipt({ claims: [claim("claim-001", "flow.screens", [{ id: "screen-001", name: "😀".repeat(size) }])] });
    const reason = (size: number) => receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", "audience-001", { reason: "😀".repeat(size) })] });
    const codeCount = (size: number) => receipt({ captureDisposition: "capped", omittedCount: 1, claims: [], reasonCodes: Array.from({ length: size }, (_, index) => `code-${String(index).padStart(2, "0")}`) });
    const codeLength = (size: number) => receipt({ captureDisposition: "capped", omittedCount: 1, claims: [], reasonCodes: ["a".repeat(size)] });
    const claims = (size: number) => receipt({ claims: Array.from({ length: size }, (_, index) => claim(`claim-${index}`, "productTruth.audienceSituation", "same-001")) });
    const cases: Array<[string, () => Json, () => Json]> = [
      ["reason scalar 500/501", () => reason(500), () => reason(501)],
      ["product scalar 2000/2001", () => scalar(2000), () => scalar(2001)],
      ["product list item 2000/2001", () => listItem(2000), () => listItem(2001)],
      ["product list 256/257", () => list(256), () => list(257)],
      ["reason code length 64/65", () => codeLength(64), () => codeLength(65)],
      ["reason code count 64/65", () => codeCount(64), () => codeCount(65)],
      ["screen states 64/65", () => states(64), () => states(65)],
      ["nested Flow scalar 500/501", () => nested(500), () => nested(501)],
      ["claims 256/257", () => claims(256), () => claims(257)],
    ];
    for (const [, exact, overflow] of cases) {
      compileOk([exact()]);
      compileFailure([overflow()], "BAD_PRODUCT_CONTEXT");
    }
  });

  it("counts astral scalars once and rejects lone UTF-16 surrogates", () => {
    compileOk([receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", "😀".repeat(2000))] })]);
    compileFailure([receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", "\ud800") ] })], "BAD_PRODUCT_CONTEXT");
  });

  it("covers Flow collection and receipt-count bounds with aggregate-byte precedence", () => {
    const screens = (size: number) => receipt({ claims: [claim("claim-001", "flow.screens", Array.from({ length: size }, (_, index) => ({ id: `screen-${index}` })))] });
    const transitions = (size: number) => receipt({ claims: [claim("claim-001", "flow.transitions", Array.from({ length: size }, (_, index) => ({ id: `transition-${index}`, from: "screen-001", to: "screen-001", trigger: "ON_CLICK" })))] });
    const entries = (size: number) => receipt({ claims: [claim("claim-001", "flow.entryPoints", Array.from({ length: size }, (_, index) => ({ id: `entry-${index}`, screen: "screen-001" })))] });
    const manyReceipts = (size: number) => Array.from({ length: size }, (_, index) => lifecycle(`receipt-${index}`, "capped"));
    const screenExact = compile([screens(4096)], ["--json"], true);
    expect(screenExact.code).toBe(0);
    expect(screenExact.err).toBe("");
    expect(json(screenExact, "compact screen exact")).toMatchObject({ ok: true, command: "product-context compile" });
    const screenOverflow = compile([screens(4097)], ["--json"], true);
    expect(screenOverflow.code).toBe(1);
    expect(screenOverflow.err).toBe("");
    expect(json(screenOverflow, "compact screen overflow")).toMatchObject({
      ok: false,
      command: "product-context compile",
      error: { code: "BAD_PRODUCT_CONTEXT" },
    });
    compileOk([entries(1024)]);
    compileFailure([entries(1025)], "BAD_PRODUCT_CONTEXT");
    for (const [label, value] of [["transitions exact", transitions(4096)], ["transitions max plus one", transitions(4097)]] as Array<[string, Json]>) {
      const result = compile([value]);
      expect(result.code, `${label} is deliberately intercepted by the receipt byte gate`).toBe(1);
      expect(json(result, label).error?.code).toBe("PRODUCT_CONTEXT_RECEIPT_TOO_LARGE");
    }
    compileOk(manyReceipts(1024));
    compileFailure(manyReceipts(1025), "BAD_ARG");
  });

  it("accepts 64 supersession refs and rejects 65 after exact target resolution", () => {
    const receiptsFor = (size: number): Json[] => {
      const targets = Array.from({ length: size }, (_, index) => claim(`target-${String(index).padStart(3, "0")}`, "productTruth.primaryOutcome", "outcome-001"));
      const target = receipt({ claims: targets });
      const source = receipt({ receiptId: "receipt-002", claims: [claim("source-001", "productTruth.primaryOutcome", "outcome-001", { supersedes: targets.map((item) => `receipt-001#${item["claimId"]}`) })] });
      return [target, source];
    };
    compileOk(receiptsFor(64));
    compileFailure(receiptsFor(65), "BAD_PRODUCT_CONTEXT");
  });

  it("rejects duplicate and ASCII-unsorted supersession references", () => {
    const targets = [claim("target-001", "productTruth.primaryOutcome", "outcome-001"), claim("target-002", "productTruth.primaryOutcome", "outcome-001")];
    const target = receipt({ claims: targets });
    const source = (refs: string[]) => receipt({ receiptId: "receipt-002", claims: [claim("source-001", "productTruth.primaryOutcome", "outcome-001", { supersedes: refs })] });
    compileFailure([target, source(["receipt-001#target-002", "receipt-001#target-001"])], "BAD_PRODUCT_CONTEXT");
    compileFailure([target, source(["receipt-001#target-001", "receipt-001#target-001"])], "BAD_PRODUCT_CONTEXT");
  });

  it("enforces receipt and aggregate byte limits before JSON parsing", () => {
    const exact = compilePaths([padded("receipt-exact.json", receipt(), RECEIPT_MAX)]);
    expect(exact).toMatchObject({ code: 0, err: "" });
    expect(json(exact, "exact receipt")).toMatchObject({ ok: true, command: "product-context compile" });
    const tooLarge = compilePaths([write("receipt-too-large.json", " ".repeat(RECEIPT_MAX + 1))]);
    expect(tooLarge.code).toBe(1);
    expect(json(tooLarge, "receipt overflow").error?.code).toBe("PRODUCT_CONTEXT_RECEIPT_TOO_LARGE");
    expect(json(tooLarge, "receipt overflow").error?.message).toContain(`exceeds ${RECEIPT_MAX} bytes`);
    const aggregate = [0, 1, 2, 3].map((index) => padded(`aggregate-${index}.json`, lifecycle(`receipt-${index + 1}`, "capped"), RECEIPT_MAX));
    const exactAggregate = compilePaths(aggregate);
    expect(exactAggregate).toMatchObject({ code: 0, err: "" });
    expect(json(exactAggregate, "exact aggregate")).toMatchObject({ ok: true, command: "product-context compile" });
    const aggregateOverflow = compilePaths([...aggregate, write("aggregate-overflow.json", " ")]);
    expect(aggregateOverflow.code).toBe(1);
    expect(json(aggregateOverflow, "aggregate overflow").error?.code).toBe("PRODUCT_CONTEXT_INPUT_TOO_LARGE");
    expect(json(aggregateOverflow, "aggregate overflow").error?.message).toContain(`exceed ${INPUT_MAX} bytes in total`);
    expect(aggregate.reduce((total, path) => total + Buffer.byteLength(readFileSync(path)), 0)).toBe(INPUT_MAX);
  });

  it("gives file and aggregate gates precedence over malformed earlier input", () => {
    const dir = context.dir;
    const malformed = write("malformed-first.json", "{");
    const oversized = write("oversized-later.json", " ".repeat(RECEIPT_MAX + 1));
    const perFile = compilePaths([malformed, oversized]);
    expect(json(perFile, "per-file precedence").error?.code).toBe("PRODUCT_CONTEXT_RECEIPT_TOO_LARGE");
    const exactMalformed = write("malformed-exact.json", "{" + " ".repeat(RECEIPT_MAX - 1));
    const aggregate = [0, 1, 2].map((index) => padded(`precedence-${index}.json`, lifecycle(`receipt-${index + 1}`, "capped"), RECEIPT_MAX));
    const aggregateOverflow = compilePaths([exactMalformed, ...aggregate, write("one-byte-overflow.json", " ")]);
    expect(json(aggregateOverflow, "aggregate precedence").error?.code).toBe("PRODUCT_CONTEXT_INPUT_TOO_LARGE");
    const missing = compilePaths([malformed, join(dir, "missing-after-malformed.json")]);
    expect(json(missing, "missing precedence").error?.code).toBe("FILE_NOT_FOUND");
  });

  it("enforces safe omitted-count arithmetic with the named aggregate overflow", () => {
    const max = lifecycle("receipt-max", "capped");
    max["omittedCount"] = Number.MAX_SAFE_INTEGER - 1;
    const next = lifecycle("receipt-next", "capped");
    next["omittedCount"] = 1;
    const exact = compileOk([max, next]);
    expect(asObject(atlas(exact)["coverage"])["omittedCount"]).toBe(Number.MAX_SAFE_INTEGER);
    const overflowMax = clone(max);
    overflowMax["omittedCount"] = Number.MAX_SAFE_INTEGER;
    const overflow = compilePaths([write("max-a.json", overflowMax), write("max-b.json", next)]);
    expect(overflow.code).toBe(1);
    expect(json(overflow, "omitted aggregate overflow").error?.code).toBe("PRODUCT_CONTEXT_OMITTED_COUNT_OVERFLOW");
    const unsafe = lifecycle("receipt-unsafe", "capped");
    unsafe["omittedCount"] = Number.MAX_SAFE_INTEGER + 1;
    const invalid = compilePaths([write("unsafe.json", unsafe)]);
    expect(invalid.code).toBe(1);
    expect(json(invalid, "unsafe omitted count").error?.code).toBe("BAD_PRODUCT_CONTEXT");
  });

  it("lets an exact-size Atlas reach replay validation but rejects max plus one before parse", () => {
    const canonical = compileText([receipt()]);
    const exact = write("atlas-exact.json", canonical + " ".repeat(ATLAS_MAX - Buffer.byteLength(canonical))), large = write("atlas-too-large.json", canonical + " ".repeat(ATLAS_MAX + 1 - Buffer.byteLength(canonical)));
    lintFailure(exact, "BAD_PRODUCT_ATLAS"); lintFailure(large, "PRODUCT_ATLAS_INPUT_TOO_LARGE");
    const projectedExact = capture(["product-context", "project-flow", exact, "--json"]);
    expect(json(projectedExact, "exact project-flow size")).toEqual({ ok: false, command: "product-context project-flow", error: { code: "BAD_PRODUCT_ATLAS", message: expect.stringMatching(/[a-z]{3}/) } });
    const projectedLarge = capture(["product-context", "project-flow", large, "--json"]);
    expect(json(projectedLarge, "large project-flow size")).toEqual({ ok: false, command: "product-context project-flow", error: { code: "PRODUCT_ATLAS_INPUT_TOO_LARGE", message: expect.stringMatching(/[a-z]{3}/) } });
  });
  it("requires the output guard seam at exact and max-plus-one Atlas bytes", async () => {
    const seams = await productContextSeams();
    expect(seams?.assertAtlasOutputSize, "missing expected assertAtlasOutputSize command seam").toBeTypeOf("function");
    if (seams?.assertAtlasOutputSize === undefined) return;
    expect(seams.assertAtlasOutputSize(Buffer.alloc(ATLAS_MAX))).toBeUndefined();
    expect(seams.assertAtlasOutputSize(Buffer.alloc(ATLAS_MAX + 1))).toBe("PRODUCT_ATLAS_OUTPUT_TOO_LARGE");
  });

  it("admits an actual exact-limit Atlas and rejects an actual over-limit Atlas before emitting an artifact", () => {
    const writeFixture = (name: string, receipts: Json[], expectedReceiptBytes: number): string[] => receipts.map((value, index) => {
      const path = writeCompact(`${name}-${index + 1}.json`, value);
      expect(readFileSync(path).length).toBe(expectedReceiptBytes);
      return path;
    });
    const receiptIds = ["receipt-001", "receipt-002", "receipt-003", "receipt-004"];
    const exactPaths = writeFixture(
      "exact-limit",
      receiptIds.map((receiptId) => flowScreensReceipt(receiptId, 1_437, 5, `a${"z".repeat(122)}`)),
      49_417,
    );
    expect(exactPaths.reduce((total, path) => total + readFileSync(path).length, 0)).toBeLessThanOrEqual(INPUT_MAX);
    const exact = capture(["product-context", "compile", ...exactPaths]);
    expect(exact.code).toBe(0);
    expect(exact.err).toBe("");
    expect(Buffer.byteLength(exact.out)).toBe(ATLAS_MAX);
    canonicalText(exact.out);

    const overflowPaths = writeFixture(
      "over-limit",
      receiptIds.map((receiptId) => flowScreensReceipt(receiptId, 3_842, 12)),
      RECEIPT_MAX,
    );
    expect(overflowPaths.reduce((total, path) => total + readFileSync(path).length, 0)).toBe(INPUT_MAX);
    const textOverflow = capture(["product-context", "compile", ...overflowPaths]);
    expect(textOverflow).toEqual({
      code: 1,
      out: "",
      err: `ui: product-context compile: PRODUCT_ATLAS_OUTPUT_TOO_LARGE: compiled atlas exceeds ${ATLAS_MAX} bytes\n`,
    });
    const jsonOverflow = capture(["product-context", "compile", ...overflowPaths, "--json"]);
    expect(jsonOverflow.code).toBe(1);
    expect(jsonOverflow.err).toBe("");
    expect(json(jsonOverflow, "over-limit Atlas JSON")).toEqual({
      ok: false,
      command: "product-context compile",
      error: { code: "PRODUCT_ATLAS_OUTPUT_TOO_LARGE", message: expect.stringMatching(/[a-z]{3}/) },
    });
  });
});
