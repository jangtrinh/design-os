/**
 * `ui persona lint` (PR-FU5b A2) — CLI surface over the thin-family floor.
 * Errors, flags, exit codes, then the real shipped families.json.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
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
const write = (name: string, contents: string): string => {
  const p = join(dir, name);
  writeFileSync(p, contents, "utf8");
  return p;
};
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-persona-")); });

describe("ui persona — subcommand and argument errors", () => {
  it("no subcommand is BAD_ARG", () => {
    const r = capture(["persona", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });

  it("lint with no file is BAD_ARG", () => {
    const r = capture(["persona", "lint", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });

  it("a missing file is FILE_NOT_FOUND", () => {
    const r = capture(["persona", "lint", join(dir, "nope.json"), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("FILE_NOT_FOUND");
  });

  it("invalid JSON is BAD_JSON", () => {
    const p = write("bad.json", "{ not json");
    const r = capture(["persona", "lint", p, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_JSON");
  });

  it("valid JSON with no families array is BAD_JSON", () => {
    const p = write("no-families.json", JSON.stringify({ version: 1 }));
    const r = capture(["persona", "lint", p, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_JSON");
  });

  it("a non-positive --min-screens-per-app is BAD_ARG", () => {
    const p = write("families.json", JSON.stringify({ families: [] }));
    const r = capture(["persona", "lint", p, "--min-screens-per-app", "0", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });
});

describe("ui persona lint — thin-family floor (red-first fixture)", () => {
  it("a fixture family with apps 2 / screens 5 → thin, and the gate fails", () => {
    const p = write(
      "fixture-families.json",
      JSON.stringify({ families: [{ slug: "fixture-thin", apps: 2, screens: 5 }] }),
    );
    const r = capture(["persona", "lint", p, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { rows: Array<{ slug: string; thin: boolean }>; failing: string[]; pass: boolean };
    expect(d.rows[0]?.thin).toBe(true);
    expect(d.failing).toEqual(["fixture-thin"]);
    expect(d.pass).toBe(false);
  });

  it("an excused thin family (history note says 'thin') passes", () => {
    const p = write(
      "fixture-excused.json",
      JSON.stringify({
        families: [{ slug: "fixture-thin", apps: 2, screens: 5, history: [{ note: "merged; still thin" }] }],
      }),
    );
    const r = capture(["persona", "lint", p, "--json"]);
    expect(r.code).toBe(0);
  });
});

describe("ui persona lint — the real shipped families.json (PR-FU5b A2 real run)", () => {
  it("finds several thin iOS/web families, and the command exits 1", () => {
    const r = capture(["persona", "lint", join(process.cwd(), "knowledge", "personas", "families.json"), "--json"]);
    const d = JSON.parse(r.out).data as { rows: Array<{ slug: string; apps: number; screens: number; ratio: number; thin: boolean }>; failing: string[] };
    expect(d.rows.length).toBeGreaterThan(0);
    expect(d.failing.length).toBeGreaterThan(0);
    expect(r.code).toBe(1);
  });
});
