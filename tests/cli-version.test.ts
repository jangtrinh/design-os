import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { run } from "../src/cli.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function capture(args: string[]): string {
  let out = "";
  const orig = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  try { run(args); } finally { process.stdout.write = orig; }
  return out;
}

describe("cli version", () => {
  it("`ui --version` matches package.json version (no drift)", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string };
    const reported = capture(["--version"]).trim();
    expect(reported).toBe(pkg.version);
  });

  it("reports a real, publishable semver (not 0.0.0)", () => {
    const reported = capture(["--version"]).trim();
    expect(reported).toMatch(/^\d+\.\d+\.\d+$/);
    expect(reported).not.toBe("0.0.0");
  });
});
