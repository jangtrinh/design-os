/**
 * `ui flow lint` — E2E over the CLI dispatcher. Exit codes, --json envelope
 * shape, and the file/arg/shape error codes.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

let dir: string;
const write = (name: string, obj: unknown): string => {
  const p = join(dir, name);
  writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj), "utf8");
  return p;
};
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-flow-")); });

const CLEAN_FLOW = {
  entryPoints: [{ id: "e1", screen: "home" }],
  screens: [{ id: "home" }, { id: "detail" }],
  transitions: [
    { id: "t1", from: "home", to: "detail", trigger: "ON_CLICK" },
    { id: "t2", from: "detail", to: "home", trigger: "ON_CLICK" },
  ],
};

// entryPoints:[] → no-entry, plus dead-end + unreachable-screen on 'home'.
const ERROR_FLOW = {
  entryPoints: [],
  screens: [{ id: "home" }],
  transitions: [],
};

describe("ui flow lint — E2E", () => {
  it("a flow with errors → exit 1, --json data has errorCount>0 + findings", () => {
    const f = write("bad.json", ERROR_FLOW);
    const r = capture(["flow", "lint", f, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { errorCount: number; findings: unknown[] };
    expect(d.errorCount).toBeGreaterThan(0);
    expect(Array.isArray(d.findings)).toBe(true);
    expect(d.findings.length).toBeGreaterThan(0);
  });

  it("a clean flow → exit 0", () => {
    const f = write("clean.json", CLEAN_FLOW);
    const r = capture(["flow", "lint", f, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { errorCount: number };
    expect(d.errorCount).toBe(0);
  });

  it("text mode reports error/warning counts and per-finding lines", () => {
    const f = write("bad.json", ERROR_FLOW);
    const r = capture(["flow", "lint", f]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("error(s)");
    expect(r.out).toContain("[no-entry]");
  });

  it("missing <flow.json> positional → BAD_ARG", () => {
    const r = capture(["flow", "lint", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_ARG");
  });

  it("missing file → FILE_NOT_FOUND", () => {
    const r = capture(["flow", "lint", join(dir, "nope.json"), "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("FILE_NOT_FOUND");
  });

  it("malformed JSON → BAD_FLOW", () => {
    const f = write("bad.json", "{not json");
    const r = capture(["flow", "lint", f, "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_FLOW");
  });

  it("valid JSON but wrong shape → BAD_FLOW", () => {
    const f = write("bad.json", { nope: true });
    const r = capture(["flow", "lint", f, "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_FLOW");
  });

  it("unknown flag → UNKNOWN_FLAG", () => {
    const f = write("clean.json", CLEAN_FLOW);
    const r = capture(["flow", "lint", f, "--bogus", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("UNKNOWN_FLAG");
  });

  it("unknown subcommand ('ui flow bogus') → BAD_ARG", () => {
    const r = capture(["flow", "bogus", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_ARG");
  });

  it("no subcommand ('ui flow') → BAD_ARG", () => {
    const r = capture(["flow", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_ARG");
  });
});
