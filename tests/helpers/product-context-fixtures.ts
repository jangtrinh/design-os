import { afterEach, beforeEach, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../../src/cli.js";
import { canonicalStringify } from "../../src/core/ds-manifest.js";
export type Json = Record<string, unknown>;
export interface Capture { code: number; out: string; err: string; }
export interface Envelope { ok: boolean; command: string; data?: Json; error?: { code: string; message: string }; }
export const PRODUCT_CONTEXT_SUITE = "ui product-context — Phase 1 compile and replay lint";
export const RECEIPT_MAX = 131_072;
export const INPUT_MAX = 524_288;
export const ATLAS_MAX = 2_097_152;
export const PRODUCT = "product-001";
export const DIGEST = `sha256:${"0".repeat(64)}`;

export function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
export function asObject(value: unknown): Json { expect(value).toBeTypeOf("object"); expect(value).not.toBeNull(); expect(Array.isArray(value)).toBe(false); return value as Json; }
export function sha256(value: string | Buffer): string { return `sha256:${createHash("sha256").update(typeof value === "string" ? Buffer.from(value, "utf8") : value).digest("hex")}`; }
export function exactKeys(value: Json, keys: string[]): void {
  const ascii = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  expect(Object.keys(value).sort(ascii)).toEqual([...keys].sort(ascii));
}
export function canonicalText(raw: string): Json { const parsed = JSON.parse(raw) as Json; expect(raw).toBe(canonicalStringify(parsed)); return parsed; }
export function invalidUtf8(value: string, marker: string): Buffer { const bytes = Buffer.from(value, "utf8"); const index = bytes.indexOf(Buffer.from(marker, "utf8")); expect(index, `missing authored marker '${marker}'`).toBeGreaterThanOrEqual(0); bytes[index] = 0x80; return bytes; }
export function compareFindingTriples(left: Json, right: Json): number {
  for (const key of ["severity", "checkId", "message"]) {
    const [leftValue, rightValue] = [String(left[key]), String(right[key])];
    if (leftValue < rightValue) return -1;
    if (leftValue > rightValue) return 1;
  }
  return 0;
}
export function findingTripleIdentity(value: Json): string {
  return JSON.stringify([value["severity"], value["checkId"], value["message"]]);
}
export function reverseNestedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseNestedKeys);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value as Json).reverse().map(([key, nested]) => [key, reverseNestedKeys(nested)]));
  return value;
}
export function claim(id: string, field: string, value: unknown, overrides: Json = {}): Json {
  return { claimId: id, field, required: true, disposition: "present", value, reason: "observed", supersedes: [], ...overrides };
}
export function allClaims(prefix = "claim"): Json[] {
  return [
    claim(`${prefix}-001`, "productTruth.audienceSituation", "audience-001"),
    claim(`${prefix}-002`, "productTruth.desiredChange", "change-001"),
    claim(`${prefix}-003`, "productTruth.primaryOutcome", "outcome-001"),
    claim(`${prefix}-004`, "productTruth.primaryAction", "action-001"),
    claim(`${prefix}-005`, "productTruth.availableProof", ["proof-001"]),
    claim(`${prefix}-006`, "productTruth.prohibitedClaims", ["constraint-001"]),
    claim(`${prefix}-007`, "productTruth.contentInventory", ["content-001"]),
    claim(`${prefix}-008`, "flow.screens", [{ id: "screen-001" }]),
    claim(`${prefix}-009`, "flow.transitions", []),
    claim(`${prefix}-010`, "flow.entryPoints", [{ id: "entry-001", screen: "screen-001" }]),
  ];
}
export function receipt(overrides: Json = {}): Json {
  return {
    kind: "product-context-receipt", version: 1, receiptId: "receipt-001", productId: PRODUCT,
    sourceRef: "source-001", sourceDigest: DIGEST, capturedAt: null, captureDisposition: "captured",
    omittedCount: 0, reasonCodes: [], claims: allClaims(), ...overrides,
  };
}
export function flowScreensReceipt(receiptId: string, screenCount: number, reasonLength: number, firstScreenId = "a"): Json {
  const screens = Array.from({ length: screenCount }, (_, index) => ({ id: index === 0 ? firstScreenId : "a", states: ["a", "b", "c"] }));
  return receipt({ receiptId, claims: [claim("claim-001", "flow.screens", screens, { reason: "r".repeat(reasonLength) })] });
}
export function lifecycle(id: string, disposition: string): Json {
  if (disposition === "captured") return receipt({ receiptId: id });
  if (disposition === "capped") return receipt({ receiptId: id, captureDisposition: disposition, omittedCount: 1, reasonCodes: ["capped-001"], claims: [] });
  return receipt({ receiptId: id, captureDisposition: disposition, sourceDigest: null, omittedCount: 0, reasonCodes: [`${disposition}-001`], claims: [] });
}
export function createProductContextHarness() {
  let dir = "";
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-product-context-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  function capture(args: string[]): Capture {
    let out = "";
    let err = "";
    const stdout = process.stdout.write.bind(process.stdout);
    const stderr = process.stderr.write.bind(process.stderr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
    let code: number;
    try { code = run(args); } finally {
      process.stdout.write = stdout;
      process.stderr.write = stderr;
    }
    return { code, out, err };
  }
  function json(result: Capture, label: string): Envelope { expect(result.out, `${label} must emit a JSON envelope on stdout`).not.toBe(""); return JSON.parse(result.out) as Envelope; }
  function captureWithoutReplacement(args: string[]): { result: Capture; parsedReplacement: boolean } {
    const parse = JSON.parse;
    let parsedReplacement = false;
    JSON.parse = ((text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) => {
      parsedReplacement ||= text.includes("\uFFFD");
      return parse(text, reviver);
    }) as typeof JSON.parse;
    try { return { result: capture(args), parsedReplacement }; } finally { JSON.parse = parse; }
  }
  function write(name: string, value: unknown): string {
    const path = join(dir, name);
    writeFileSync(path, typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + "\n");
    return path;
  }
  function writeCompact(name: string, value: unknown): string {
    const path = join(dir, name);
    writeFileSync(path, typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value));
    return path;
  }
  function padded(name: string, value: unknown, size: number): string {
    const raw = JSON.stringify(value);
    const padding = size - Buffer.byteLength(raw);
    expect(padding, `${name} must fit before padding`).toBeGreaterThanOrEqual(0);
    return write(name, raw + " ".repeat(padding));
  }
  function compile(receipts: Json[], flags: string[] = ["--json"], compact = false): Capture {
    const writeReceipt = compact ? writeCompact : write;
    const paths = receipts.map((value, index) => writeReceipt(`receipt-${index + 1}.json`, value));
    return capture(["product-context", "compile", ...paths, ...flags]);
  }
  function compilePaths(paths: string[], flags: string[] = ["--json"]): Capture { return capture(["product-context", "compile", ...paths, ...flags]); }
  function compileOk(receipts: Json[]): Json {
    const result = compile(receipts);
    expect(result.code, "valid receipts must compile through the public command").toBe(0);
    expect(result.err).toBe("");
    const resultJson = json(result, "product-context compile");
    expect(Object.keys(resultJson)).toEqual(["ok", "command", "data"]);
    expect(resultJson).toMatchObject({ ok: true, command: "product-context compile" });
    return asObject(resultJson.data);
  }
  function compileSemantic(receipts: Json[], expectedExit: 0 | 1): Json {
    const result = compile(receipts);
    expect(result.code, "semantic findings must use their exact error-count exit code").toBe(expectedExit);
    expect(result.err).toBe("");
    const resultJson = json(result, "product-context semantic compile");
    expect(Object.keys(resultJson)).toEqual(["ok", "command", "data"]);
    expect(resultJson.ok).toBe(true);
    return asObject(resultJson.data);
  }
  function compileFailure(receipts: Json[], code: string): void {
    const result = compile(receipts);
    expect(result.code).toBe(1);
    expect(result.err).toBe("");
    expect(result.out).toMatch(/\n$/);
    const resultJson = json(result, "product-context compile failure");
    exactKeys(asObject(resultJson), ["ok", "command", "error"]);
    expect(resultJson).toMatchObject({ ok: false, command: "product-context compile" });
    exactKeys(asObject(resultJson.error), ["code", "message"]);
    expect(asObject(resultJson.error)["code"]).toBe(code);
    // A message equal to its own code tells the operator nothing; the code already said that.
    expect(asObject(resultJson.error)["message"], "the message must say more than the code").not.toBe(code);
    expect(resultJson.data).toBeUndefined();
  }
  function compileText(receipts: Json[], expectedExit = 0): string {
    const result = compile(receipts, []);
    expect(result.code, "text compilation must use its contract-specific exit code").toBe(expectedExit);
    expect(result.err, "schema-valid text compile writes only the raw Atlas").toBe("");
    expect(result.out).toMatch(/\n$/);
    canonicalText(result.out);
    return result.out;
  }
  function lint(path: string, flags: string[] = ["--json"]): Capture { return capture(["product-context", "lint", path, ...flags]); }
  function lintOk(path: string): Json {
    const result = lint(path);
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    const resultJson = json(result, "product-context lint");
    expect(Object.keys(resultJson)).toEqual(["ok", "command", "data"]);
    expect(resultJson).toMatchObject({ ok: true, command: "product-context lint" });
    return asObject(resultJson.data);
  }
  function lintFailure(path: string, code: string): void {
    const result = lint(path);
    expect(result.code).toBe(1);
    expect(result.err).toBe("");
    expect(result.out).toMatch(/\n$/);
    const resultJson = json(result, "product-context lint failure");
    exactKeys(asObject(resultJson), ["ok", "command", "error"]);
    expect(resultJson).toMatchObject({ ok: false, command: "product-context lint" });
    exactKeys(asObject(resultJson.error), ["code", "message"]);
    expect(asObject(resultJson.error)["code"]).toBe(code);
    // A message equal to its own code tells the operator nothing; the code already said that.
    expect(asObject(resultJson.error)["message"], "the message must say more than the code").not.toBe(code);
    expect(resultJson.data).toBeUndefined();
  }
  function atlas(data: Json): Json { return asObject(data["atlas"]); }
  function count(atlasValue: Json, name: string): Json { return asObject(asObject(atlasValue["coverage"])[name]); }
  function findingCodes(data: Json): string[] { return (data["findings"] as Json[]).map((item) => String(item["checkId"])); }
  return {
    get dir(): string { return dir; }, capture, json, captureWithoutReplacement, write, writeCompact, padded,
    compile, compilePaths, compileOk, compileSemantic, compileFailure, compileText, lint, lintOk, lintFailure,
    atlas, count, findingCodes,
  };
}
