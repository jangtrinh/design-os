/**
 * `ui ds import` runs the negative-space pass over the project: one summary line, proposals only, and a
 * harvest failure is a warning that never fails an import whose store was already written.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
describe("ui ds import runs the harvest", () => {
  function importProject(files: Record<string, string>, extra?: (root: string) => void): { root: string; r: ReturnType<typeof capture> } {
    const root = mkdtempSync(join(tmpdir(), "ns-imp-"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    extra?.(root);
    const tokens = join(root, "tokens.json");
    writeFileSync(tokens, JSON.stringify({ colors: { primary: "#3366ff" } }));
    return { root, r: capture(["ds", "import", tokens, "--dir", root]) };
  }

  it("prints one summary line and writes proposals, never the binding files", () => {
    const { root, r } = importProject({ "src/app.html": `<h1>Hi</h1>` });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/harvest: 12 probes at 0 → 12 proposals/);
    const soul = readFileSync(join(root, "design", "soul.md"), "utf8");
    expect(soul).toContain("## Never (proposed)");
    expect(soul).toContain("under ./");
    expect(existsSync(join(root, "design", "rules", "_adherence.rules.json"))).toBe(false);
  });
  it("proposes nothing for a project with no UI source, and says so", () => {
    const { root, r } = importProject({});
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/harvest: 0 probes at 0 → 0 proposals|harvest: \d+ probes at 0 → 0 proposals/);
    expect(readFileSync(join(root, "design", "soul.md"), "utf8")).not.toContain("## Never (proposed)");
  });
  it("a harvest failure is a warning with its cause and the import still succeeds", () => {
    const { root, r } = importProject({ "src/app.html": `<h1>Hi</h1>` }, (p) => {
      mkdirSync(join(p, "design", "rules"), { recursive: true });
      writeFileSync(join(p, "design", "rules", "_adherence.rules.json"), "{ not json");
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("warning: harvest skipped");
    expect(r.out).toContain("_adherence.rules.json is not valid JSON");
    expect(existsSync(join(root, "design", "design.tokens.json"))).toBe(true);
  });
  it("--json reports the harvest outcome", () => {
    const root = mkdtempSync(join(tmpdir(), "ns-imp-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.html"), "<p>x</p>");
    writeFileSync(join(root, "tokens.json"), JSON.stringify({ colors: { primary: "#3366ff" } }));
    const r = capture(["ds", "import", join(root, "tokens.json"), "--dir", root, "--json"]);
    const data = (JSON.parse(r.out) as { data: { harvest: { probesAtZero: number; proposals: number } } }).data;
    expect(data.harvest).toEqual({ probesAtZero: 12, proposals: 12 });
  });
});
