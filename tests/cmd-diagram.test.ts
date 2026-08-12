import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";

const VALID_HTML = `<!DOCTYPE html>
<html>
<head><title>Diagram</title></head>
<body>
<svg data-diagram-owned="true" role="img" aria-labelledby="dt dd" data-diagram-grammar="architecture" data-reading-order="left-to-right" data-focal-id="n1" data-source-kind="brief" viewBox="0 0 100 100">
<title id="dt">Architecture diagram</title>
<desc id="dd">Shows two nodes connected by an orthogonal edge</desc>
<g id="n1"><rect width="10" height="10"/><text>Node One</text></g>
<g id="n2"><rect x="50" width="10" height="10"/><text>Node Two</text></g>
<path id="e1" d="M10,5 L50,5" data-edge-kind="orthogonal"/>
</svg>
</body>
</html>`;

const INVALID_HTML = VALID_HTML.replace(' data-diagram-owned="true"', "");

function capture(
  args: string[]
): { exitCode: number; stdout: string; stderr: string } {
  const originalOutWrite = process.stdout.write.bind(process.stdout);
  const originalErrWrite = process.stderr.write.bind(process.stderr);

  let stdout = "";
  let stderr = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = ((chunk: any) => {
    stdout += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = ((chunk: any) => {
    stderr += chunk.toString();
    return true;
  }) as typeof process.stderr.write;
  let exitCode: number;
  try {
    exitCode = run(args);
  } finally {
    process.stdout.write = originalOutWrite;
    process.stderr.write = originalErrWrite;
  }

  return { exitCode, stdout, stderr };
}

let dir: string;
let validPath: string;
let invalidPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "diagram-lint-"));
  validPath = join(dir, "valid.html");
  invalidPath = join(dir, "invalid.html");
  writeFileSync(validPath, VALID_HTML, "utf8");
  writeFileSync(invalidPath, INVALID_HTML, "utf8");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("diagram lint", () => {
  it("shows help", () => {
    const { exitCode, stdout } = capture(["diagram", "lint", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toContain("usage");
    expect(stdout.toLowerCase()).toContain("diagram lint");
  });

  it("lints a valid owned diagram as text", () => {
    const { exitCode, stdout } = capture(["diagram", "lint", validPath]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("0 error");
  });

  it("lints a valid owned diagram as json", () => {
    const { exitCode, stdout } = capture(["diagram", "lint", validPath, "--json"]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.data.findings).toEqual([]);
    expect(parsed.data.errorCount).toBe(0);
    expect(parsed.data.warningCount).toBe(0);
  });

  it("lints an invalid unowned diagram as text", () => {
    const { exitCode, stdout } = capture(["diagram", "lint", invalidPath]);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("svg-owned-count");
  });

  it("lints an invalid unowned diagram as json", () => {
    const { exitCode, stdout } = capture(["diagram", "lint", invalidPath, "--json"]);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.data.errorCount).toBeGreaterThan(0);
    expect(parsed.data.findings[0].checkId).toBe("svg-owned-count");
  });

  it("errors with BAD_ARG when file argument is missing", () => {
    const { stdout } = capture(["diagram", "lint", "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.error.code).toBe("BAD_ARG");
  });

  it("errors with FILE_NOT_FOUND for a nonexistent file", () => {
    const nonexistent = join(dir, "nonexistent.html");
    const { stdout } = capture(["diagram", "lint", nonexistent, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.error.code).toBe("FILE_NOT_FOUND");
  });

  it("errors with UNKNOWN_FLAG for a bogus flag", () => {
    const { stdout } = capture(["diagram", "lint", "--bogus", validPath, "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.error.code).toBe("UNKNOWN_FLAG");
  });
});
