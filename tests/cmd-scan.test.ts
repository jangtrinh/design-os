/**
 * `ui scan` command — read-only design-signal detection + routing verdict.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import type { ScanResult } from "../src/core/project-scan.js";

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;

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

function initDs(tmp: string) {
  capture([
    "ds", "init", "acme",
    "--persona", "liquid-glass",
    "--intent", "landing for a gym",
    "--dir", tmp,
    "--persona-data", PERSONA_DATA,
  ]);
}

interface ScanEnvelope {
  ok: boolean;
  command: string;
  data: ScanResult;
}

/** Run `ui scan --cwd <tmp> --json` and parse the envelope. */
function scanJson(tmp: string): ScanEnvelope {
  const r = capture(["scan", "--cwd", tmp, "--json"]);
  return JSON.parse(r.stdout) as ScanEnvelope;
}

describe("ui scan", () => {
  it("an empty directory yields verdict greenfield, exit 0", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    const r = capture(["scan", "--cwd", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(
      'verdict: greenfield — empty project. Next: /ui:generate "<intent>"',
    );
  });

  it("next.js deps + a components dir with 3 .tsx files yields brownfield-code", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { next: "14" } }));
    const compDir = join(tmp, "src", "components");
    mkdirSync(compDir, { recursive: true });
    writeFileSync(join(compDir, "Button.tsx"), "export const Button = () => null;\n");
    writeFileSync(join(compDir, "Card.tsx"), "export const Card = () => null;\n");
    writeFileSync(join(compDir, "Modal.tsx"), "export const Modal = () => null;\n");

    const env = scanJson(tmp);
    expect(env.data.verdict).toBe("brownfield-code");
    expect(env.data.framework).toBe("next");
    const comp = env.data.componentDirs.find((d) => d.path.endsWith("components"));
    expect(comp).toBeDefined();
    expect(comp!.files).toBeGreaterThanOrEqual(3);
  });

  it("a root index.html + style.css yields verdict brownfield-html", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "index.html"), "<!doctype html><html><body>Hi</body></html>\n");
    writeFileSync(join(tmp, "style.css"), "body { margin: 0; }\n");

    const r = capture(["scan", "--cwd", tmp]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("verdict: brownfield-html — existing markup detected. Next: /ui:learn");

    const env = scanJson(tmp);
    expect(env.data.htmlFiles.length).toBeGreaterThanOrEqual(1);
    expect(env.data.htmlFiles[0]!.bytes).toBeGreaterThan(0);
    expect(env.data.cssFiles.length).toBeGreaterThanOrEqual(1);
    expect(env.data.cssFiles[0]!.bytes).toBeGreaterThan(0);
  });

  it("a directory with an initialized design system yields dsStatus present and verdict ds-present", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    initDs(tmp);

    const env = scanJson(tmp);
    expect(env.data.dsStatus).toBe("present");
    expect(env.data.verdict).toBe("ds-present");
  });

  it("excludes node_modules — html buried inside it is never counted", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    const nmDir = join(tmp, "node_modules", "react");
    mkdirSync(nmDir, { recursive: true });
    writeFileSync(join(nmDir, "index.html"), "<html></html>\n");

    const env = scanJson(tmp);
    expect(env.data.htmlFiles).toEqual([]);
    expect(env.data.verdict).toBe("greenfield");
  });

  it("a root tailwind.config.ts is detected as the tailwind styling signal", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "tailwind.config.ts"), "export default {};\n");

    const env = scanJson(tmp);
    expect(env.data.styling).toContain("tailwind");
    expect(env.data.tailwindConfig).not.toBeNull();
    expect(env.data.tailwindConfig!.endsWith("tailwind.config.ts")).toBe(true);
  });

  it("is deterministic — two --json runs on the same fixture are byte-identical", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { vue: "3" } }));
    writeFileSync(join(tmp, "index.html"), "<html></html>\n");
    writeFileSync(join(tmp, "style.css"), "body {}\n");

    const a = capture(["scan", "--cwd", tmp, "--json"]);
    const b = capture(["scan", "--cwd", tmp, "--json"]);
    expect(a.stdout).toBe(b.stdout);
  });

  it("--json emits an envelope with ok, command, and data.verdict", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-scan-"));
    const env = scanJson(tmp);
    expect(env.ok).toBe(true);
    expect(env.command).toBe("scan");
    expect(env.data.verdict).toBeDefined();
  });

  it("a stray positional is rejected as BAD_ARG", () => {
    const r = capture(["scan", "foo"]);
    expect(r.exitCode).toBe(1);
  });
});
