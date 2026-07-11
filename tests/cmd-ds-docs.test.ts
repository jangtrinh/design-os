import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

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

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-docs-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(join(dir, "design", "design.tokens.json"),
    JSON.stringify({ color: { primary: { $value: "#2563EB", $type: "color" } } }), "utf8");
  writeFileSync(join(dir, "design", "component-registry.json"),
    JSON.stringify({ version: "1", components: [
      { name: "Button/Primary", category: "button", markup: "<button></button>", tokensUsed: ["color.primary"], variants: ["solid"], states: ["default"], description: "CTA." },
    ] }), "utf8");
});

describe("ui ds docs", () => {
  it("regenerates markdown docs with resolved token values", () => {
    const r = capture(["ds", "docs", "--dir", dir]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("### Button/Primary");
    expect(r.out).toContain("`color.primary` → #2563EB");
    expect(r.out).toContain("Consider adding:"); // missing states hint
  });

  it("--json envelopes the structured model", () => {
    const r = capture(["ds", "docs", "--dir", dir, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { componentCount: number };
    expect(d.componentCount).toBe(1);
  });

  it("--out writes the docs to a file", () => {
    const out = join(dir, "COMPONENTS.md");
    const r = capture(["ds", "docs", "--dir", dir, "--out", out]);
    expect(r.code).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, "utf8")).toContain("Button/Primary");
  });

  it("no registry → REGISTRY_NOT_FOUND", () => {
    const empty = mkdtempSync(join(tmpdir(), "ease-docs-empty-"));
    const r = capture(["ds", "docs", "--dir", empty, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("REGISTRY_NOT_FOUND");
  });

  it("unknown flag is rejected", () => {
    const r = capture(["ds", "docs", "--dir", dir, "--nope", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("UNKNOWN_FLAG");
  });
});
