import { describe, expect, it, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
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

const tmpFiles: string[] = [];
function makeTmpIn(content: string): string {
  const p = join(tmpdir(), `export-in-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(p, content, "utf8");
  tmpFiles.push(p);
  return p;
}
function tmpOut(): string {
  const p = join(tmpdir(), `export-out-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  for (const p of tmpFiles) if (existsSync(p)) unlinkSync(p);
  tmpFiles.length = 0;
});

describe("ui export", () => {
  it("--out writes the exported file and it contains <!doctype html>", () => {
    const inFile = makeTmpIn("<div>hello</div>");
    const outFile = tmpOut();
    const { code } = captureRun(["export", inFile, "--out", outFile]);
    expect(code).toBe(0);
    expect(existsSync(outFile)).toBe(true);
    const content = readFileSync(outFile, "utf8");
    expect(content.toLowerCase()).toContain("<!doctype html>");
  });

  it("--title overrides the <title> in the output", () => {
    const inFile = makeTmpIn("<p>hi</p>");
    const outFile = tmpOut();
    captureRun(["export", inFile, "--out", outFile, "--title", "Custom"]);
    const content = readFileSync(outFile, "utf8");
    expect(content).toContain("<title>Custom</title>");
  });

  it("--minify with --json reports minified:true and bytes > 0", () => {
    const inFile = makeTmpIn("  <p>  hello  </p>  \n\n<!-- comment -->");
    const outFile = tmpOut();
    const { code, out } = captureRun(["export", inFile, "--out", outFile, "--minify", "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as { ok: boolean; data: { minified: boolean; bytes: number } };
    expect(json.ok).toBe(true);
    expect(json.data.minified).toBe(true);
    expect(json.data.bytes).toBeGreaterThan(0);
  });

  it("text mode reports wrote: <path> (<bytes> bytes) on stderr", () => {
    const inFile = makeTmpIn("<p>test</p>");
    const outFile = tmpOut();
    const { code, err } = captureRun(["export", inFile, "--out", outFile]);
    expect(code).toBe(0);
    expect(err).toMatch(/wrote:.*\(\d+ bytes\)/);
  });

  it("--json envelope has inputFile, outputFile, bytes, minified, title", () => {
    const inFile = makeTmpIn("<p>test</p>");
    const outFile = tmpOut();
    const { code, out } = captureRun(["export", inFile, "--out", outFile, "--json"]);
    expect(code).toBe(0);
    const json = JSON.parse(out) as {
      ok: boolean;
      data: { inputFile: string; outputFile: string; bytes: number; minified: boolean; title: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data.outputFile).toBe(outFile);
    expect(json.data.bytes).toBeGreaterThan(0);
    expect(json.data.minified).toBe(false);
    expect(typeof json.data.title).toBe("string");
  });

  it("wraps a body fragment into a full document", () => {
    const inFile = makeTmpIn(readFileSync(fix("export/fragment.html"), "utf8"));
    const outFile = tmpOut();
    captureRun(["export", inFile, "--out", outFile]);
    const content = readFileSync(outFile, "utf8");
    expect(content.toLowerCase()).toContain("<!doctype html>");
    expect(content.toLowerCase()).toContain("<html");
    expect(content).toContain("<body>");
  });

  it("preserves existing full document structure", () => {
    const inFile = makeTmpIn(readFileSync(fix("export/full-page.html"), "utf8"));
    const outFile = tmpOut();
    captureRun(["export", inFile, "--out", outFile]);
    const content = readFileSync(outFile, "utf8");
    expect(content.toLowerCase()).toContain("<!doctype html>");
  });

  it("missing input file → exit 1, FILE_NOT_FOUND", () => {
    const outFile = tmpOut();
    const { code, out } = captureRun(["export", "/no/such.html", "--out", outFile, "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("FILE_NOT_FOUND");
  });

  it("missing positional → exit 1, BAD_ARG", () => {
    const { code, out } = captureRun(["export", "--json"]);
    expect(code).toBe(1);
    const json = JSON.parse(out) as { error: { code: string } };
    expect(json.error.code).toBe("BAD_ARG");
  });

  it("--zip flag → exit 2, NOT_IMPLEMENTED", () => {
    const inFile = makeTmpIn("<p>test</p>");
    const outFile = tmpOut();
    const { code, out } = captureRun(["export", inFile, "--out", outFile, "--zip", "--json"]);
    expect(code).toBe(2);
    const json = JSON.parse(out) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("NOT_IMPLEMENTED");
  });

  it("--help exits 0", () => {
    const { code } = captureRun(["export", "--help"]);
    expect(code).toBe(0);
  });
});
