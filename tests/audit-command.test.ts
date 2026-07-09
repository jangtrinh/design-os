/**
 * C1 — `ui audit` CLI wiring: arg/file/JSON error paths, exit codes, and the
 * --json envelope. The detection logic itself is covered in audit-detect.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";

function capture(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { stdout += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { stderr += String(c); return true; };
  let exitCode: number;
  try {
    exitCode = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { exitCode, stdout, stderr };
}

let dir: string;
let nodesClean: string;
let nodesDirty: string;
let tokens: string;
let nodesRadius9: string;
let radiusTokens: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ui-audit-"));
  nodesClean = join(dir, "clean.json");
  nodesDirty = join(dir, "dirty.json");
  tokens = join(dir, "tokens.json");
  nodesRadius9 = join(dir, "radius9.json");
  radiusTokens = join(dir, "radius-tokens.json");
  writeFileSync(nodesClean, JSON.stringify({ name: "OK", type: "FRAME", cornerRadius: 8 }));
  writeFileSync(nodesDirty, JSON.stringify({ name: "Bad", type: "FRAME", fills: [{ hex: "#ff0000" }] }));
  writeFileSync(tokens, JSON.stringify({ color: { danger: { $value: "#ff0000", $type: "color" } } }));
  writeFileSync(nodesRadius9, JSON.stringify({ name: "Card", type: "FRAME", cornerRadius: 9 }));
  writeFileSync(radiusTokens, JSON.stringify({ radius: { sm: { $value: "9px", $type: "dimension" } } }));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("ui audit — exit codes", () => {
  it("exit 0 + 'No DS violations' on a clean tree", () => {
    const { exitCode, stdout } = capture(["audit", nodesClean]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No DS violations");
  });
  it("exit 1 when a violation is found", () => {
    const { exitCode, stdout } = capture(["audit", nodesDirty, "--tokens", tokens]);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("raw-hex-vs-token");
  });
  it("exit 0 when an off-grid radius is a DS token value (--tokens radius scale)", () => {
    const { exitCode, stdout } = capture(["audit", nodesRadius9, "--tokens", radiusTokens]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No DS violations");
  });
  it("exit 1 for the same off-grid radius without --tokens (grid-multiple behavior)", () => {
    const { exitCode, stdout } = capture(["audit", nodesRadius9]);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("off-grid");
  });
  it("--json returns an ok envelope with counts + remap even on exit 1", () => {
    const { exitCode, stdout } = capture(["audit", nodesDirty, "--tokens", tokens, "--json"]);
    expect(exitCode).toBe(1);
    const env = JSON.parse(stdout);
    expect(env.ok).toBe(true);
    expect(env.command).toBe("audit");
    expect(env.data.total).toBe(1);
    expect(env.data.remap[0]).toMatchObject({ kind: "color", to: "color.danger" });
  });
});

describe("ui audit — error paths", () => {
  it("BAD_ARG when the node file positional is missing", () => {
    const { exitCode, stdout } = capture(["audit", "--json"]);
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("BAD_ARG");
  });
  it("BAD_ARG on a non-integer --grid", () => {
    const { stdout } = capture(["audit", nodesClean, "--grid", "3.5", "--json"]);
    expect(JSON.parse(stdout).error.code).toBe("BAD_ARG");
  });
  it("FILE_NOT_FOUND when the node file does not exist", () => {
    const { stdout } = capture(["audit", join(dir, "nope.json"), "--json"]);
    expect(JSON.parse(stdout).error.code).toBe("FILE_NOT_FOUND");
  });
  it("BAD_JSON when the node file is not valid JSON", () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{ not json");
    expect(JSON.parse(capture(["audit", bad, "--json"]).stdout).error.code).toBe("BAD_JSON");
  });
  it("BAD_JSON when nodes.json is a scalar, not a node/array", () => {
    const scalar = join(dir, "scalar.json");
    writeFileSync(scalar, "42");
    expect(JSON.parse(capture(["audit", scalar, "--json"]).stdout).error.code).toBe("BAD_JSON");
  });
  it("UNKNOWN_FLAG on a hallucinated flag (central guard via signature)", () => {
    const { exitCode, stdout } = capture(["audit", nodesClean, "--brand-color", "#fff", "--json"]);
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout).error.code).toBe("UNKNOWN_FLAG");
  });
});
