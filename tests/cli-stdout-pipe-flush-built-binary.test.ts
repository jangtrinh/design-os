/**
 * Built-binary regression test for issue #209: stdout >64KB truncated at the
 * pipe buffer when the entrypoint calls process.exit() before the pipe drains.
 *
 * MUST spawn dist/cli.js: vitest-imported run() never reaches the entrypoint's
 * exit path, so a source-level test can never catch this. And it MUST read the
 * child through a PIPE (spawnSync's default) — a file redirect drains
 * synchronously and stays green even while every piped consumer is truncated
 * at exactly 65536 bytes (how the 0.5.0 delivery smoke found it).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(ROOT, "dist", "cli.js");

describe("built binary flushes stdout larger than the 64KB pipe buffer", () => {
  it.skipIf(!existsSync(CLI))("ui schema --json arrives complete and parseable through a pipe", () => {
    const r = spawnSync("node", [CLI, "schema", "--json"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(r.status).toBe(0);
    // The truncation bug cuts at exactly 65536 bytes; the real document is ~87KB.
    expect(r.stdout.length).toBeGreaterThan(65536);
    const parsed = JSON.parse(r.stdout) as { ok: boolean };
    expect(parsed.ok).toBe(true);
  });
});

/**
 * Built-binary proof for the Product Context Atlas commands.
 *
 * A source-level test cannot prove this: the canonical Atlas leaves the process
 * through the entrypoint's stdout, so only a spawned dist/cli.js read through a
 * PIPE shows whether a >64KB artifact arrives whole. These cases deliberately do
 * NOT skip when the binary is missing — `npm run build` precedes `npm test` in CI,
 * so an absent binary is a broken prerequisite, not a reason to report green.
 */
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const PIPE_BUFFER_BYTES = 65_536;
const MAX_RECEIPT_FILE_BYTES = 131_072;
const MAX_COMPILE_INPUT_BYTES = 524_288;
const RECEIPT_COUNT = 12;

interface AtlasCandidate { status: string }
interface AtlasField { field: string; resolution: string; value: unknown; candidates: AtlasCandidate[] }
interface Atlas { kind: string; receipts: unknown[]; fields: AtlasField[] }

function builtRun(args: string[]): SpawnSyncReturns<Buffer> {
  return spawnSync("node", [CLI, ...args], { maxBuffer: MAX_BUFFER_BYTES });
}

/** Every built spawn shares one completeness contract; only status differs. */
function expectWholeAtlas(result: SpawnSyncReturns<Buffer>, status: 0 | 1): Atlas {
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.stderr.toString("utf8")).toBe("");
  expect(result.status).toBe(status);
  expect(result.stdout.length).toBeGreaterThan(PIPE_BUFFER_BYTES);
  expect(result.stdout.length).toBeLessThan(MAX_BUFFER_BYTES);
  expect(result.stdout[result.stdout.length - 1]).toBe(0x0a);
  return JSON.parse(result.stdout.toString("utf8")) as Atlas;
}

describe("built binary emits whole Product Atlases larger than the 64KB pipe buffer", () => {
  let dir = "";
  let cleanPaths: string[] = [];
  let conflictPaths: string[] = [];

  beforeAll(() => {
    expect(existsSync(CLI), `${CLI} is missing — run npm run build before npm test`).toBe(true);
    dir = mkdtempSync(join(tmpdir(), "ease-built-product-atlas-"));
    const source = readFileSync(join(ROOT, "tests", "fixtures", "diagram", "product-flow-real.json"));
    const flow = JSON.parse(source.toString("utf8")) as Record<string, unknown>;
    const sourceDigest = `sha256:${createHash("sha256").update(source).digest("hex")}`;
    const inventory = Array.from({ length: 64 }, (_, index) => `content-${String(index).padStart(3, "0")}-${"x".repeat(64)}`);
    const claim = (claimId: string, field: string, value: unknown) => ({ claimId, field, required: true, disposition: "present", value, reason: "observed", supersedes: [] });
    const receipt = (index: number, conflicting: boolean) => ({
      kind: "product-context-receipt", version: 1, receiptId: `receipt-${String(index).padStart(4, "0")}`,
      productId: "product-001", sourceRef: `source-${String(index).padStart(4, "0")}`, sourceDigest,
      capturedAt: null, captureDisposition: "captured", omittedCount: 0, reasonCodes: [],
      claims: [
        claim("claim-001", "productTruth.audienceSituation", conflicting ? "audience-002" : "audience-001"),
        claim("claim-002", "productTruth.desiredChange", "change-001"),
        claim("claim-003", "productTruth.primaryOutcome", "outcome-001"),
        claim("claim-004", "productTruth.primaryAction", "action-001"),
        claim("claim-005", "productTruth.availableProof", ["proof-001"]),
        claim("claim-006", "productTruth.prohibitedClaims", ["constraint-001"]),
        claim("claim-007", "productTruth.contentInventory", inventory),
        claim("claim-008", "flow.screens", flow["screens"]),
        claim("claim-009", "flow.transitions", flow["transitions"]),
        claim("claim-010", "flow.entryPoints", flow["entryPoints"]),
      ],
    });
    const emit = (name: string, value: unknown): string => {
      const path = join(dir, name);
      const bytes = Buffer.from(JSON.stringify(value), "utf8");
      // A fixture above the per-receipt ceiling would prove an input-limit error, not the pipe.
      expect(bytes.length).toBeLessThanOrEqual(MAX_RECEIPT_FILE_BYTES);
      writeFileSync(path, bytes);
      return path;
    };
    cleanPaths = Array.from({ length: RECEIPT_COUNT }, (_, index) => emit(`receipt-${index + 1}.json`, receipt(index + 1, false)));
    conflictPaths = [emit("conflicting-receipt.json", receipt(1, true)), ...cleanPaths.slice(1)];
    const aggregate = cleanPaths.reduce((total, path) => total + statSync(path).size, 0);
    expect(aggregate).toBeLessThanOrEqual(MAX_COMPILE_INPUT_BYTES);
  });

  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  it("compiles a clean Atlas that arrives complete and parseable through the pipe", () => {
    const atlas = expectWholeAtlas(builtRun(["product-context", "compile", ...cleanPaths]), 0);
    expect(atlas.kind).toBe("product-atlas");
    expect(atlas.receipts).toHaveLength(RECEIPT_COUNT);
  });

  it("emits the whole Atlas for a semantic conflict, with exit 1 and an empty stderr", () => {
    const atlas = expectWholeAtlas(builtRun(["product-context", "compile", ...conflictPaths]), 1);
    const field = atlas.fields.find((entry) => entry.field === "productTruth.audienceSituation");
    expect(field, "the conflicting field must survive into the emitted Atlas").toBeDefined();
    // Conflict keeps every candidate and picks none: no order winner.
    expect(field?.value).toBeNull();
    expect(field?.resolution).toBe("conflicting");
    expect(field?.candidates).toHaveLength(RECEIPT_COUNT);
    expect(field?.candidates.every((candidate) => candidate.status === "conflicted")).toBe(true);
  });

  it("returns byte-identical Atlas buffers when the receipt argv is reversed", () => {
    const forward = builtRun(["product-context", "compile", ...cleanPaths]);
    const reverse = builtRun(["product-context", "compile", ...[...cleanPaths].reverse()]);
    expectWholeAtlas(forward, 0);
    expectWholeAtlas(reverse, 0);
    expect(reverse.stdout.equals(forward.stdout)).toBe(true);
  });

  it("projects Flow as a separate artifact and leaves the Atlas bytes untouched", () => {
    const atlasPath = join(dir, "atlas.json");
    writeFileSync(atlasPath, builtRun(["product-context", "compile", ...cleanPaths]).stdout);
    const before = readFileSync(atlasPath);
    const projected = builtRun(["product-context", "project-flow", atlasPath]);
    expect(projected.error).toBeUndefined();
    expect(projected.signal).toBeNull();
    expect(projected.status).toBe(0);
    expect(projected.stderr.toString("utf8")).toBe("");
    const flow = JSON.parse(projected.stdout.toString("utf8")) as Record<string, unknown>;
    // The projection is derived output, never part of the Atlas it was read from.
    expect(Object.keys(flow).sort()).toEqual(["entryPoints", "screens", "transitions"]);
    expect(projected.stdout.equals(before)).toBe(false);
    expect(readFileSync(atlasPath).equals(before)).toBe(true);
  });
});
