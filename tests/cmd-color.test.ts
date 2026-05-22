import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

// Capture stdout/stderr written during run() by monkey-patching process streams
function captureRun(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  let code: number;
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

describe("ui color convert", () => {
  it("--json returns ok:true with oklch l/c/h", () => {
    const { code, out } = captureRun(["color", "convert", "#3b82f6", "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { oklch: { l: number; c: number; h: number } } };
    expect(json.ok).toBe(true);
    expect(typeof json.data.oklch.l).toBe("number");
    expect(typeof json.data.oklch.c).toBe("number");
    expect(typeof json.data.oklch.h).toBe("number");
  });

  it("text mode prints arrow format", () => {
    const { code, out } = captureRun(["color", "convert", "#3b82f6"]);
    expect(code).toBe(0);
    expect(out).toContain("→");
    expect(out).toContain("oklch(");
  });
});

describe("ui color scale", () => {
  it("--json returns 11 stops with anchorStop", () => {
    const { code, out } = captureRun(["color", "scale", "#3b82f6", "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { stops: unknown[]; anchorStop: number } };
    expect(json.ok).toBe(true);
    expect(json.data.stops).toHaveLength(11);
    expect(typeof json.data.anchorStop).toBe("number");
  });

  it("each stop has wcag band in the enum", () => {
    const { out } = captureRun(["color", "scale", "#3b82f6", "--json"]);
    const json = JSON.parse(out) as { data: { stops: { wcag: string }[] } };
    const validBands = new Set(["AAA", "AA", "AA-large", "fail"]);
    for (const stop of json.data.stops) {
      expect(validBands.has(stop.wcag)).toBe(true);
    }
  });

  it("invalid hex exits 1 with stderr message", () => {
    const { code, err } = captureRun(["color", "scale", "notacolor"]);
    expect(code).toBe(1);
    expect(err).toContain("invalid hex");
  });

  it("invalid hex with --json exits 1 with ok:false and BAD_HEX", () => {
    const { code, out } = captureRun(["color", "scale", "notacolor", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("BAD_HEX");
  });

  it("text mode prints a table with stop numbers", () => {
    const { code, out } = captureRun(["color", "scale", "#3b82f6"]);
    expect(code).toBe(0);
    expect(out).toContain("50");
    expect(out).toContain("950");
    expect(out).toContain("anchor");
  });
});

describe("ui color contrast", () => {
  it("--json: black on white ≈ 21, AAA", () => {
    const { code, out } = captureRun(["color", "contrast", "#000000", "#FFFFFF", "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { ratio: number; wcag: string } };
    expect(json.ok).toBe(true);
    expect(json.data.ratio).toBeGreaterThan(20);
    expect(json.data.wcag).toBe("AAA");
  });
});

describe("ui color semantic", () => {
  it("--json returns entries for primary and danger roles", () => {
    const { code, out } = captureRun([
      "color", "semantic", "brand:#3b82f6", "error:#ef4444", "--json",
    ]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { entries: { role: string }[] } };
    expect(json.ok).toBe(true);
    const roles = json.data.entries.map((e) => e.role);
    expect(roles).toContain("primary");
    expect(roles).toContain("danger");
  });
});

describe("ui color error paths", () => {
  it("unknown subcommand exits 1", () => {
    const { code } = captureRun(["color", "bogus"]);
    expect(code).toBe(1);
  });

  it("--help exits 0 and prints help text", () => {
    const { code, out } = captureRun(["color", "--help"]);
    expect(code).toBe(0);
    expect(out.toLowerCase()).toContain("color");
  });
});
