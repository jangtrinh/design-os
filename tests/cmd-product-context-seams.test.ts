import { describe, expect, it } from "vitest";
import { forTerminal } from "../src/core/output.js";
import {
  claim, compareFindingTriples, createProductContextHarness, PRODUCT_CONTEXT_SUITE,
  RECEIPT_MAX, receipt, type Capture, type Json,
} from "./helpers/product-context-fixtures.js";
import { fakeBoundedOps, productContextCoreSeams, productContextSeams } from "./helpers/product-context-seams.js";

const context = createProductContextHarness();
const { capture, compileText, write, writeCompact } = context;

describe(PRODUCT_CONTEXT_SUITE, () => {
  it("requires an injectable bounded reader for preflight, short-read, growth, EOF, close, and overflow precedence", async () => {
    const seams = await productContextSeams();
    expect(seams?.readBoundedFile, "missing expected readBoundedFile command seam").toBeTypeOf("function");
    if (seams?.readBoundedFile === undefined) return;
    const code = "PRODUCT_CONTEXT_RECEIPT_TOO_LARGE";
    const preflight = fakeBoundedOps([], RECEIPT_MAX + 1);
    expect(seams.readBoundedFile("receipt", RECEIPT_MAX, code, preflight.ops)).toEqual({ ok: false, code });
    expect(preflight.state).toEqual({ closeCount: 1, readCount: 0, readCalls: [] });
    const exactEof = fakeBoundedOps([Buffer.from("abcd"), Buffer.alloc(0)], 4);
    expect(seams.readBoundedFile("receipt", 4, code, exactEof.ops)).toEqual({ ok: true, bytes: Buffer.from("abcd") });
    expect(exactEof.state).toEqual({ closeCount: 1, readCount: 2, readCalls: [[0, 5, 5], [4, 1, 5]] });
    const shortReads = fakeBoundedOps([Buffer.from("ab"), Buffer.from("cd"), Buffer.alloc(0)], 0);
    const accepted = seams.readBoundedFile("receipt", 4, code, shortReads.ops);
    expect(accepted).toEqual({ ok: true, bytes: Buffer.from("abcd") });
    expect(shortReads.state).toEqual({ closeCount: 1, readCount: 3, readCalls: [[0, 5, 5], [2, 3, 5], [4, 1, 5]] });
    const oneByte = fakeBoundedOps([Buffer.from("a"), Buffer.alloc(0)], 1);
    const oneByteAccepted = seams.readBoundedFile("receipt", RECEIPT_MAX, code, oneByte.ops);
    expect(oneByteAccepted).toEqual({ ok: true, bytes: Buffer.from("a") });
    if (oneByteAccepted.ok) expect(oneByteAccepted.bytes.buffer.byteLength).toBe(1);
    const growth = fakeBoundedOps([Buffer.from("abcde")], 0);
    expect(seams.readBoundedFile("receipt", 4, code, growth.ops)).toEqual({ ok: false, code });
    expect(growth.state.readCalls).toEqual([[0, 5, 5]]);
    for (const [label, ops] of [
      ["open", fakeBoundedOps([], 0, { open: true })],
      ["fstat", fakeBoundedOps([], 0, { fstat: true })],
      ["read", fakeBoundedOps([], 0, { read: true })],
      ["close", fakeBoundedOps([Buffer.from("abcd"), Buffer.alloc(0)], 4, { close: true })],
    ] as Array<[string, ReturnType<typeof fakeBoundedOps>]>) {
      expect(seams.readBoundedFile("receipt", 4, code, ops.ops), label).toEqual({ ok: false, code: "READ_ERROR" });
      expect(ops.state.closeCount, `${label} closes every successfully opened descriptor`).toBe(label === "open" ? 0 : 1);
    }
    const overflowCloseFailure = fakeBoundedOps([Buffer.from("abcde")], 0, { close: true });
    expect(seams.readBoundedFile("receipt", 4, code, overflowCloseFailure.ops)).toEqual({ ok: false, code });
    expect(overflowCloseFailure.state.closeCount).toBe(1);
  });

  it("surfaces unexpected JSON parser failures through the public compile and lint commands", () => {
    const receiptPath = writeCompact("unexpected-parser-receipt.json", receipt());
    const atlasPath = write("unexpected-parser-atlas.json", compileText([receipt()]));
    const parse = JSON.parse;
    let compileResult: Capture;
    let lintResult: Capture;
    JSON.parse = (() => { throw new Error("forced-parser-failure"); }) as typeof JSON.parse;
    try {
      compileResult = capture(["product-context", "compile", receiptPath, "--json"]);
      lintResult = capture(["product-context", "lint", atlasPath, "--json"]);
    } finally {
      JSON.parse = parse;
    }
    expect(compileResult!).toEqual({ code: 2, out: "", err: "ui: internal error: forced-parser-failure\n" });
    expect(lintResult!).toEqual({ code: 2, out: "", err: "ui: internal error: forced-parser-failure\n" });
  });

  it("requires core normalizer and finalizer seams while terminal escaping remains a copied-output boundary", async () => {
    const core = await productContextCoreSeams();
    expect(core?.normalizeProductContextReceipt, "missing expected normalizeProductContextReceipt core seam").toBeTypeOf("function");
    expect(core?.finalizeProductContextFindings, "missing expected finalizeProductContextFindings core seam").toBeTypeOf("function");
    if (core?.normalizeProductContextReceipt === undefined || core.finalizeProductContextFindings === undefined) return;
    const normalize = core.normalizeProductContextReceipt;
    const finalize = core.finalizeProductContextFindings;
    expect(normalize(receipt({ claims: [claim("claim-001", "flow.transitions", Array.from({ length: 4096 }, (_, index) => ({ id: `transition-${index}`, from: "screen-001", to: "screen-001", trigger: "ON_CLICK" })))] }))).toBeDefined();
    expect(() => normalize(receipt({ claims: [claim("claim-001", "flow.transitions", Array.from({ length: 4097 }, (_, index) => ({ id: `transition-${index}`, from: "screen-001", to: "screen-001", trigger: "ON_CLICK" })))] }))).toThrow();
    const flowStringPaths: Array<[string, (value: string) => Json]> = [
      ["screen id", (value) => receipt({ claims: [claim("claim-001", "flow.screens", [{ id: value }])] })],
      ["screen name", (value) => receipt({ claims: [claim("claim-001", "flow.screens", [{ id: "screen-001", name: value }])] })],
      ["screen mode", (value) => receipt({ claims: [claim("claim-001", "flow.screens", [{ id: "screen-001", mode: value }])] })],
      ["screen artifact", (value) => receipt({ claims: [claim("claim-001", "flow.screens", [{ id: "screen-001", artifact: value }])] })],
      ["screen state", (value) => receipt({ claims: [claim("claim-001", "flow.screens", [{ id: "screen-001", states: [value] }])] })],
      ["transition id", (value) => receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: value, from: "screen-001", to: "screen-001", trigger: "ON_CLICK" }])] })],
      ["transition from", (value) => receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: "transition-001", from: value, to: "screen-001", trigger: "ON_CLICK" }])] })],
      ["transition to", (value) => receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: "transition-001", from: "screen-001", to: value, trigger: "ON_CLICK" }])] })],
      ["transition label", (value) => receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: "transition-001", from: "screen-001", to: "screen-001", trigger: "ON_CLICK", label: value }])] })],
      ["transition source", (value) => receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: "transition-001", from: "screen-001", to: "screen-001", trigger: "ON_CLICK", source: value }])] })],
      ["transition guard", (value) => receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: "transition-001", from: "screen-001", to: "screen-001", trigger: "ON_CLICK", guard: value }])] })],
      ["entry id", (value) => receipt({ claims: [claim("claim-001", "flow.entryPoints", [{ id: value, screen: "screen-001" }])] })],
      ["entry screen", (value) => receipt({ claims: [claim("claim-001", "flow.entryPoints", [{ id: "entry-001", screen: value }])] })],
      ["entry name", (value) => receipt({ claims: [claim("claim-001", "flow.entryPoints", [{ id: "entry-001", screen: "screen-001", name: value }])] })],
    ];
    for (const [label, makeReceipt] of flowStringPaths) {
      expect(normalize(makeReceipt("😀".repeat(500))), `${label} accepts 500 Unicode scalars`).toBeDefined();
      expect(() => normalize(makeReceipt("😀".repeat(501))), `${label} rejects 501 Unicode scalars`).toThrow();
      expect(() => normalize(makeReceipt("\ud800")), `${label} rejects a lone surrogate`).toThrow();
    }
    const transitionReceipt = (trigger: string) => receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: "transition-001", from: "screen-001", to: "screen-001", trigger }])] });
    for (const trigger of ["ON_CLICK", "ON_HOVER", "ON_PRESS", "AFTER_DELAY", "ON_KEY", "ON_SUBMIT"]) {
      expect(normalize(transitionReceipt(trigger)), `${trigger} is an accepted Flow trigger`).toBeDefined();
    }
    expect(() => normalize(transitionReceipt("UNKNOWN"))).toThrow();
    expect(() => normalize(transitionReceipt(""))).toThrow();
    for (const [label, invalid] of [
      ["reason", receipt({ claims: [claim("claim-001", "productTruth.audienceSituation", "audience-001", { reason: "\ud800" })] })],
      ["product list item", receipt({ claims: [claim("claim-001", "productTruth.availableProof", ["\ud800"])] })],
      ["screen extra", receipt({ claims: [claim("claim-001", "flow.screens", [{ id: "screen-001", unexpected: true }])] })],
      ["screen wrong", receipt({ claims: [claim("claim-001", "flow.screens", [{ id: 1 }])] })],
      ["screen missing", receipt({ claims: [claim("claim-001", "flow.screens", [{ name: "screen" }])] })],
      ["transition extra", receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: "transition-001", from: "screen-001", to: "screen-001", trigger: "ON_CLICK", unexpected: true }])] })],
      ["transition wrong", receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: "transition-001", from: 1, to: "screen-001", trigger: "ON_CLICK" }])] })],
      ["transition missing", receipt({ claims: [claim("claim-001", "flow.transitions", [{ id: "transition-001", to: "screen-001", trigger: "ON_CLICK" }])] })],
      ["entry extra", receipt({ claims: [claim("claim-001", "flow.entryPoints", [{ id: "entry-001", screen: "screen-001", unexpected: true }])] })],
      ["entry wrong", receipt({ claims: [claim("claim-001", "flow.entryPoints", [{ id: "entry-001", screen: 1 }])] })],
      ["entry missing", receipt({ claims: [claim("claim-001", "flow.entryPoints", [{ id: "entry-001" }])] })],
    ] as Array<[string, Json]>) expect(() => normalize(invalid), label).toThrow();
    const prefix = "x".repeat(130);
    const rawA = `${prefix}\nraw\r\u001bA`;
    const rawB = `${prefix}\nraw\r\u001bB`;
    const expectedFindings = [
      { checkId: "optional-context-gap", severity: "warning", message: rawA },
      { checkId: "optional-context-gap", severity: "warning", message: rawB },
      { checkId: "required-context-missing", severity: "error", message: rawB },
    ] as Json[];
    expectedFindings.sort(compareFindingTriples);
    const finalized = finalize([
      ...expectedFindings,
      { checkId: "optional-context-gap", severity: "warning", message: rawA },
    ]);
    expect(finalized).toEqual({ findings: expectedFindings, errorCount: 1, warningCount: 2 });
    expect(forTerminal(rawA)).toBe(forTerminal(rawB));
  });
});
