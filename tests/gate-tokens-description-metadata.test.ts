/**
 * A DTCG token file may carry `$description` (and other `$`-prefixed metadata) at the
 * file root and on any group. Those keys are documentation, not categories or tokens:
 * `ui gate --tokens` refused a real project file with "category `$description` must be an
 * object". The fix lives in the ONE parser every token consumer shares.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { parseTokenFile } from "../src/core/token-model.js";

const DESCRIBED = {
  $description: "Brand tokens, sampled from the logo.",
  color: {
    $description: "Every colour the product may use.",
    brand: {
      $description: "Primary brand group.",
      navy: { $type: "color", $value: "#082358", $description: "Primary action" },
    },
    canvas: { $type: "color", $value: "#ffffff" },
  },
  spacing: { $description: "4px grid.", sm: { $type: "dimension", $value: "8px" } },
};

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

describe("token files with $description metadata", () => {
  it("parseTokenFile skips $-prefixed metadata at the root and on groups", () => {
    const tree = parseTokenFile(DESCRIBED);
    expect(Object.keys(tree).sort()).toEqual(["color", "spacing"]);
    expect(Object.keys(tree["color"]!).sort()).toEqual(["brand-navy", "canvas"]);
    expect(tree["color"]!["brand-navy"]!.$value).toBe("#082358");
    expect(tree["spacing"]!["sm"]!.$value).toBe("8px");
  });

  it("a $description that is not a string is still refused (metadata, not a free-for-all)", () => {
    expect(() => parseTokenFile({ color: { $description: { nested: true } } })).toThrow(/\$description/);
  });

  it("ui gate --tokens accepts the file instead of erroring", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-gate-desc-"));
    const tokens = join(dir, "tokens.json");
    writeFileSync(tokens, JSON.stringify(DESCRIBED), "utf8");
    const page = join(dir, "page.html");
    writeFileSync(page, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title><style>:root{--color-brand-navy:#082358}body{color:var(--color-brand-navy)}</style></head><body><main><h1>Alpha</h1><p>Welcome back.</p></main></body></html>', "utf8");
    const r = capture(["gate", page, "--tokens", tokens, "--json"]);
    const env = JSON.parse(r.out);
    expect(env.error?.message ?? "").not.toMatch(/must be an object/);
    expect(env.ok).toBe(true);
  });
});
