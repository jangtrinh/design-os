import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { run } from "../src/cli.js";

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

describe("ui strip-fences", () => {
  it("strips fences from a fenced file", () => {
    const { code, out } = captureRun(["strip-fences", fix("stream/fenced.html")]);
    expect(code).toBe(0);
    expect(out).not.toContain("```");
    expect(out).toContain("<!doctype html>");
  });

  it("no-fence file is returned unchanged (modulo trailing newline)", () => {
    const { code, out } = captureRun(["strip-fences", fix("export/full-page.html")]);
    expect(code).toBe(0);
    expect(out).not.toContain("```");
    expect(out).toContain("<!doctype html>");
  });

  it("--json envelope has removedFences:true for a fenced file", () => {
    const { code, out } = captureRun(["strip-fences", fix("stream/fenced.html"), "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { file: string; strippedHtml: string; removedFences: boolean } };
    expect(json.ok).toBe(true);
    expect(json.data.removedFences).toBe(true);
    expect(json.data.strippedHtml).not.toContain("```");
  });

  it("--json envelope has removedFences:false for a fence-free file", () => {
    const { code, out } = captureRun(["strip-fences", fix("export/full-page.html"), "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { removedFences: boolean } };
    expect(json.ok).toBe(true);
    expect(json.data.removedFences).toBe(false);
  });

  it("missing argument → exit 1, BAD_ARG", () => {
    const { code, out } = captureRun(["strip-fences", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("nonexistent file → exit 1, FILE_NOT_FOUND", () => {
    const { code, out } = captureRun(["strip-fences", "/no/such/file.html", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("FILE_NOT_FOUND");
  });

  it("--help exits 0", () => {
    const { code } = captureRun(["strip-fences", "--help"]);
    expect(code).toBe(0);
  });
});
