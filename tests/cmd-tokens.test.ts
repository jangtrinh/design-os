import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { run } from "../src/cli.js";

// Resolve fixture paths relative to this test file so CWD doesn't matter.
const HERE = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) => join(HERE, "fixtures", name);

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

describe("ui tokens compile — CSS target (default)", () => {
  it("exits 0 and stdout contains :root {", () => {
    const { code, out } = captureRun(["tokens", "compile", fix("valid.tokens.json")]);
    expect(code).toBe(0);
    expect(out).toContain(":root {");
  });

  it("resolved alias has literal hex value in output", () => {
    const { out } = captureRun(["tokens", "compile", fix("valid.tokens.json")]);
    expect(out).toContain("--color-primary: #3b82f6");
  });
});

describe("ui tokens compile — tailwind target", () => {
  it("exits 0 and stdout contains @theme {", () => {
    const { code, out } = captureRun([
      "tokens", "compile", fix("valid.tokens.json"), "--target", "tailwind",
    ]);
    expect(code).toBe(0);
    expect(out).toContain("@theme {");
  });
});

describe("ui tokens compile — figma target", () => {
  it("exits 0 and stdout is valid JSON", () => {
    const { code, out } = captureRun([
      "tokens", "compile", fix("valid.tokens.json"), "--target", "figma",
    ]);
    expect(code).toBe(0);
    expect(() => JSON.parse(out)).not.toThrow();
  });
});

describe("ui tokens compile — --json mode", () => {
  it("exits 0 and data has css, tailwind, figma keys", () => {
    const { code, out } = captureRun([
      "tokens", "compile", fix("valid.tokens.json"), "--json",
    ]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      ok: boolean;
      data: { css: string; tailwind: string; figma: unknown };
    };
    expect(json.ok).toBe(true);
    expect(typeof json.data.css).toBe("string");
    expect(typeof json.data.tailwind).toBe("string");
    expect(json.data.figma).toBeDefined();
  });

  it("css artifact contains :root {", () => {
    const { out } = captureRun([
      "tokens", "compile", fix("valid.tokens.json"), "--json",
    ]);
    const json = JSON.parse(out) as { data: { css: string } };
    expect(json.data.css).toContain(":root {");
  });
});

describe("ui tokens compile — error paths", () => {
  it("non-existent file → exit 1, FILE_NOT_FOUND", () => {
    const { code, out } = captureRun([
      "tokens", "compile", "/nonexistent-file-xyz.json", "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FILE_NOT_FOUND");
  });

  it("cyclic token file → exit 1, ALIAS_CYCLE", () => {
    const { code, out } = captureRun([
      "tokens", "compile", fix("cyclic.tokens.json"), "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("ALIAS_CYCLE");
  });

  it("dangling alias → exit 1, DANGLING_ALIAS", () => {
    const { code, out } = captureRun([
      "tokens", "compile", fix("dangling.tokens.json"), "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("DANGLING_ALIAS");
  });

  it("bad JSON file → exit 1, BAD_JSON", () => {
    const { code, out } = captureRun([
      "tokens", "compile", fix("bad-json.txt"), "--json",
    ]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("BAD_JSON");
  });

  it("unknown --target exits 1", () => {
    const { code, err } = captureRun([
      "tokens", "compile", fix("valid.tokens.json"), "--target", "xml",
    ]);
    expect(code).toBe(1);
    expect(err).toContain("unknown --target");
  });

  it("missing file argument exits 1", () => {
    const { code } = captureRun(["tokens", "compile"]);
    expect(code).toBe(1);
  });

  it("ui tokens --help exits 0", () => {
    const { code, out } = captureRun(["tokens", "--help"]);
    expect(code).toBe(0);
    expect(out.toLowerCase()).toContain("tokens");
  });
});
