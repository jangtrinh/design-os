import { describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalStringify } from "../src/core/ds-manifest.js";
import {
  createProductContextHarness, invalidUtf8, PRODUCT_CONTEXT_SUITE, receipt,
} from "./helpers/product-context-fixtures.js";

const context = createProductContextHarness();
const { capture, captureWithoutReplacement, compileFailure, compilePaths, compileText, json, lintFailure, write } = context;

describe(PRODUCT_CONTEXT_SUITE, () => {
  it.each([
    ["compile missing input", ["product-context", "compile", "--json"]],
    ["compile repeated json", ["product-context", "compile", "--json", "--json"]],
    ["lint missing input", ["product-context", "lint", "--json"]],
    ["lint extra input", ["product-context", "lint", "one.json", "two.json", "--json"]],
  ])("rejects local argv attack: %s", (_label, args) => {
    const result = capture(args);
    expect(result.code).toBe(1);
    expect(result.err).toBe("");
    const resultJson = json(result, "product-context argv failure");
    expect(resultJson).toEqual({
      ok: false,
      command: args[1] === "compile" ? "product-context compile" : "product-context lint",
      error: { code: "BAD_ARG", message: expect.any(String) },
    });
  });

  it.each([
    ["compile string-valued json", ["product-context", "compile", "--json=false"]],
    ["lint string-valued json", ["product-context", "lint", "one.json", "--json=false"]],
    ["lint flag before input", ["product-context", "lint", "--json", "one.json"]],
  ])("renders string-valued local argv failure as text: %s", (_label, args) => {
    const result = capture(args);
    expect(result.code).toBe(1);
    expect(result.out).toBe("");
    expect(result.err).not.toBe("");
    expect(result.err).not.toContain("unknown command");
    expect(result.err).toContain("product-context");
    expect(result.err).toMatch(/\n$/);
  });

  it("maps missing, unreadable, malformed, and structurally invalid receipt inputs through JSON errors", () => {
    const dir = context.dir;
    const missing = compilePaths([join(dir, "missing.json")]);
    expect(missing.code).toBe(1);
    expect(json(missing, "missing receipt").error?.code).toBe("FILE_NOT_FOUND");
    const unreadablePath = join(dir, "directory.json");
    mkdirSync(unreadablePath);
    const unreadable = compilePaths([unreadablePath]);
    expect(unreadable.code).toBe(1);
    expect(json(unreadable, "unreadable receipt").error?.code).toBe("READ_ERROR");
    const malformed = compilePaths([write("malformed.json", "{not-json")]);
    expect(malformed.code).toBe(1);
    expect(json(malformed, "malformed receipt").error?.code).toBe("BAD_PRODUCT_CONTEXT");
    compileFailure([receipt({ unexpected: true })], "BAD_PRODUCT_CONTEXT");
  });

  it("maps missing, unreadable, malformed, and structurally invalid Atlas inputs through JSON errors", () => {
    const dir = context.dir;
    lintFailure(join(dir, "missing-atlas.json"), "FILE_NOT_FOUND");
    const directory = join(dir, "atlas-directory.json");
    mkdirSync(directory);
    lintFailure(directory, "READ_ERROR");
    lintFailure(write("bad-atlas.json", "{not-json"), "BAD_PRODUCT_ATLAS");
    lintFailure(write("wrong-atlas.json", canonicalStringify({ kind: "wrong" })), "BAD_PRODUCT_ATLAS");
  });

  it("rejects invalid UTF-8 receipt input before JSON parsing", () => {
    const receiptBytes = invalidUtf8(JSON.stringify(receipt()), "audience-001");
    const invalidReceipt = write("invalid-receipt-utf8.json", receiptBytes);
    const receiptCapture = captureWithoutReplacement(["product-context", "compile", invalidReceipt, "--json"]);
    expect(receiptCapture.parsedReplacement).toBe(false);
    expect(receiptCapture.result.code).toBe(1);
    expect(receiptCapture.result.err).toBe("");
    expect(json(receiptCapture.result, "invalid receipt UTF-8")).toEqual({
      ok: false,
      command: "product-context compile",
      error: { code: "BAD_PRODUCT_CONTEXT", message: expect.any(String) },
    });
  });

  it("rejects invalid UTF-8 Atlas input before JSON parsing", () => {
    const atlasBytes = invalidUtf8(compileText([receipt()]), "observed");
    const invalidAtlas = write("invalid-atlas-utf8.json", atlasBytes);
    const atlasCapture = captureWithoutReplacement(["product-context", "lint", invalidAtlas, "--json"]);
    expect(atlasCapture.parsedReplacement).toBe(false);
    expect(atlasCapture.result.code).toBe(1);
    expect(atlasCapture.result.err).toBe("");
    expect(json(atlasCapture.result, "invalid Atlas UTF-8")).toEqual({
      ok: false,
      command: "product-context lint",
      error: { code: "BAD_PRODUCT_ATLAS", message: expect.any(String) },
    });
  });

  it("rejects 1025 compile paths before opening their first input", () => {
    const dir = context.dir;
    const paths = Array.from({ length: 1025 }, (_, index) => join(dir, index === 0 ? "missing-first.json" : `ignored-${index}.json`));
    const result = compilePaths(paths);
    expect(result.code).toBe(1);
    expect(result.err).toBe("");
    expect(json(result, "compile arity")).toEqual({
      ok: false,
      command: "product-context compile",
      error: { code: "BAD_ARG", message: expect.any(String) },
    });
  });
});
