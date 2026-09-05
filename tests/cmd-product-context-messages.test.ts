/**
 * What a product-context failure TELLS the operator.
 *
 * The suite that shipped with the feature asserted `message: expect.any(String)`
 * everywhere, which is green whether the message is useful, empty of meaning, or
 * leaking. These cases pin a distinguishing substring per code, so a message that
 * says nothing — or one that forges a line into the terminal — turns them red.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalStringify } from "../src/core/ds-manifest.js";
import {
  asObject, canonicalText, createProductContextHarness, invalidUtf8,
  PRODUCT_CONTEXT_SUITE, receipt, type Json,
} from "./helpers/product-context-fixtures.js";

const context = createProductContextHarness();
const { capture, compileText, json, write } = context;

/** Every failure is read the same way: exact code, and a message that must earn its place. */
function failure(args: string[], code: string): string {
  const result = capture([...args, "--json"]);
  expect(result.code).toBe(1);
  expect(result.err).toBe("");
  const error = asObject(json(result, args.join(" ")).error as unknown as Json);
  expect(error["code"]).toBe(code);
  const message = String(error["message"]);
  expect(message, "a message equal to its code says nothing").not.toBe(code);
  return message;
}

describe(PRODUCT_CONTEXT_SUITE, () => {
  it("names the file it could not open, and says which way it failed", () => {
    const missing = join(context.dir, "missing-receipt.json");
    expect(failure(["product-context", "compile", missing], "FILE_NOT_FOUND"))
      .toBe(`file not found: '${missing}'`);
    const directory = join(context.dir, "receipt-directory.json");
    mkdirSync(directory);
    expect(failure(["product-context", "compile", directory], "READ_ERROR"))
      .toContain(`cannot read '${directory}'`);
  });

  it("names WHICH receipt is malformed out of twelve, not just that one is", () => {
    const paths = Array.from({ length: 12 }, (_, index) =>
      write(`r${index + 1}.json`, receipt({ receiptId: `receipt-${String(index + 1).padStart(3, "0")}` })));
    // The seventh is the only broken one; the other eleven are valid.
    writeFileSync(paths[6]!, "{not-json");
    const message = failure(["product-context", "compile", ...paths], "BAD_PRODUCT_CONTEXT");
    expect(message, "the operator must learn which of twelve files failed").toContain("r7.json");
    for (const other of [paths[0]!, paths[11]!]) expect(message).not.toContain(other);
  });

  it("separates a byte-level rejection from a shape-level one", () => {
    const utf8 = write("bad-utf8-receipt.json", invalidUtf8(JSON.stringify(receipt()), "audience-001"));
    expect(failure(["product-context", "compile", utf8], "BAD_PRODUCT_CONTEXT"))
      .toMatch(/not valid UTF-8/);
    const malformed = write("bad-json-atlas.json", "{not-json");
    expect(failure(["product-context", "lint", malformed], "BAD_PRODUCT_ATLAS"))
      .toMatch(/not valid JSON/);
    const shape = write("wrong-atlas.json", canonicalStringify({ kind: "wrong" }));
    expect(failure(["product-context", "lint", shape], "BAD_PRODUCT_ATLAS"))
      .toMatch(/invalid atlas/);
  });

  it("says replay mismatch when the bytes are well-formed but do not reproduce", () => {
    const atlas = canonicalText(compileText([receipt()]));
    const coverage = asObject(atlas["coverage"]);
    // Well-formed and structurally valid; only recompilation can catch it.
    coverage["omittedCount"] = 1;
    const path = write("replay-mismatch-atlas.json", canonicalStringify(atlas));
    expect(failure(["product-context", "lint", path], "BAD_PRODUCT_ATLAS"))
      .toMatch(/replay mismatch/);
  });

  it.each([
    ["a trailing byte", (raw: string) => `${raw} `],
    ["re-indentation that changes no meaning", (raw: string) => `${JSON.stringify(JSON.parse(raw), null, 4)}\n`],
  ])("blames the bytes, not the receipts, when the atlas is only non-canonical: %s", (_label, mangle) => {
    const path = write("non-canonical-atlas.json", mangle(compileText([receipt()])));
    const message = failure(["product-context", "lint", path], "BAD_PRODUCT_ATLAS");
    // The receipts replay perfectly here; the repair is to re-emit the file, not to audit them.
    expect(message).toMatch(/not in canonical form/);
    expect(message, "a wrong cause sends the operator to the wrong repair").not.toMatch(/replay mismatch/);
  });

  it("forwards the cross-receipt reason instead of restating the code", () => {
    const paths = [
      write("product-a.json", receipt({ receiptId: "receipt-001" })),
      write("product-b.json", receipt({ receiptId: "receipt-002", productId: "product-002" })),
    ];
    expect(failure(["product-context", "compile", ...paths], "PRODUCT_ID_MISMATCH"))
      .toMatch(/product mismatch/);
  });

  it.each([
    ["expects at least one receipt", ["product-context", "compile"], /at least 1/],
    ["expects exactly one atlas", ["product-context", "lint", "a.json", "b.json"], /exactly 1/],
    ["refuses a value on --json", ["product-context", "lint", "a.json", "--json=false"], /--json takes no value/],
    ["refuses a repeated flag", ["product-context", "compile", "a.json", "--json", "--json"], /repeated flag/],
  ])("says what is wrong with the arguments: %s", (_label, args, match) => {
    // `--json=false` never turns the JSON channel on, so its failure lands on stderr; a
    // repeated `--json` does, so that one still answers in the envelope. Read whichever
    // channel actually spoke rather than assuming one of them.
    const result = capture(args);
    expect(result.code).toBe(1);
    const channel = result.out === "" ? result.err : result.out;
    expect(channel).toMatch(match);
  });

  it("prefixes the command exactly once on the human channel", () => {
    const result = capture(["product-context", "compile", "one.json", "--json=false"]);
    expect(result.err).toMatch(/^ui: product-context compile: /);
    expect(result.err.match(/product-context compile/g)).toHaveLength(1);
  });

  it("keeps the raw string in JSON and escapes it for the terminal", () => {
    // A newline inside a path lets the input forge a line that reads as the engine speaking.
    const forged = join(context.dir, "forged\nline.json");
    const asJson = failure(["product-context", "compile", forged], "FILE_NOT_FOUND");
    expect(asJson, "the machine channel carries the value unchanged").toContain("\n");
    const text = capture(["product-context", "compile", forged]);
    expect(text.code).toBe(1);
    expect(text.err).toContain("\\x0a");
    expect(text.err.split("\n").filter((line) => line !== ""), "one failure is one line")
      .toHaveLength(1);
  });
});
