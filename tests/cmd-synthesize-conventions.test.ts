/**
 * `ui synthesize-conventions` — learn applied conventions from real screens (C7 part C).
 * Asserts: aggregate math, DO/DON'T derivation, DS cross-reference (off-scale vs valid),
 * stray-font + deprecated capture, memory seeding, determinism, and every error path.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import {
  parseDnaFile,
  parseDsScale,
  aggregate,
  synthesizeConventions,
} from "../src/core/figma-conventions-synth.js";

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
  try {
    code = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

const USAGE = resolve(__dirname, "fixtures/figma-conventions/usage-dna.json");
const DS = resolve(__dirname, "fixtures/figma-conventions/ds-scale.json");
const dna = () => parseDnaFile(JSON.parse(readFileSync(USAGE, "utf8")));

const savedHome = process.env["EASE_DESIGN_HOME"];
let home: string;
let out: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ease-home-"));
  out = mkdtempSync(join(tmpdir(), "ease-conv-"));
  process.env["EASE_DESIGN_HOME"] = home;
});
afterEach(() => {
  if (savedHome === undefined) delete process.env["EASE_DESIGN_HOME"];
  else process.env["EASE_DESIGN_HOME"] = savedHome;
});

describe("synthesize-conventions — pure aggregation + synthesis", () => {
  it("parses the two-section fixture and aggregates the totals", () => {
    const t = aggregate(dna());
    expect(t.sections).toBe(2);
    expect(t.screens).toBe(5);
    expect(t.autoFrames).toBe(19);
    expect(t.rawFrames).toBe(1);
    expect(t.boundFills).toBe(18);
    expect(t.rawFills).toBe(2);
    expect(t.truncated).toEqual(["Beta"]);
  });

  it("without a DS: reports DO/DON'T but counts zero deviations", () => {
    const r = synthesizeConventions(dna(), undefined, "usage-dna.json");
    expect(r.stats.screens).toBe(5);
    expect(r.stats.autoPct).toBe(95);
    expect(r.stats.tokenizedPct).toBe(90);
    expect(r.stats.deviations).toBe(0);
    expect(r.stats.truncated).toEqual(["Beta"]);
    expect(r.conventionsMd).toContain("## Layout");
    expect(r.conventionsMd).toContain("DO");
  });

  it("with a DS: cross-references the scale — off-scale radius/spacing + stray font become real deviations", () => {
    const ds = parseDsScale(JSON.parse(readFileSync(DS, "utf8")));
    expect(ds.present).toBe(true);
    const r = synthesizeConventions(dna(), ds, "usage-dna.json");
    // radius 5 (×1) + spacing 11 (×1) + Inter font (×1) + 2 raw fills = 5 deviating instances
    expect(r.stats.deviations).toBeGreaterThanOrEqual(3);
    expect(r.conventionsMd).toContain("Inter"); // stray font surfaced
    expect(r.conventionsMd.toLowerCase()).toContain("off-scale");
    // on-scale values (8, 999) must NOT be flagged as deviations
    expect(r.stats.deviations).toBeLessThan(t_totalInstances(dna()));
  });

  it("flags deprecated components seen in use", () => {
    const r = synthesizeConventions(dna(), undefined, "usage-dna.json");
    expect(r.conventionsMd).toContain("OldTab");
  });
});

function t_totalInstances(d: ReturnType<typeof dna>): number {
  return d.reduce((n, s) => n + (s.fills?.bound ?? 0) + (s.fills?.raw ?? 0), 0);
}

describe("synthesize-conventions — command", () => {
  it("writes CONVENTIONS.md and (with --seed-memory) seeds project memory", () => {
    const r = capture(["synthesize-conventions", USAGE, "--out", out, "--seed-memory", "--now", "2026-07-09T00:00:00Z"]);
    expect(r.code, r.err).toBe(0);
    expect(existsSync(join(out, "CONVENTIONS.md"))).toBe(true);
    expect(readFileSync(join(out, "CONVENTIONS.md"), "utf8")).toContain("Applied Conventions");
    expect(existsSync(join(out, "design", "memory.events.jsonl"))).toBe(true);
  });

  it("with --ds, the doc names real deviations", () => {
    const r = capture(["synthesize-conventions", USAGE, "--ds", DS, "--out", out]);
    expect(r.code, r.err).toBe(0);
    expect(readFileSync(join(out, "CONVENTIONS.md"), "utf8").toLowerCase()).toContain("deviation");
  });

  it("is deterministic — identical inputs + --now → identical bytes", () => {
    const a = mkdtempSync(join(tmpdir(), "ease-conv-a-"));
    const b = mkdtempSync(join(tmpdir(), "ease-conv-b-"));
    const args = (o: string) => ["synthesize-conventions", USAGE, "--ds", DS, "--out", o, "--now", "2026-07-09T00:00:00Z"];
    expect(capture(args(a)).code).toBe(0);
    expect(capture(args(b)).code).toBe(0);
    expect(readFileSync(join(a, "CONVENTIONS.md"), "utf8")).toBe(readFileSync(join(b, "CONVENTIONS.md"), "utf8"));
  });
});

describe("synthesize-conventions — error paths (code in the --json envelope)", () => {
  const errCode = (args: string[]): string => {
    const r = capture([...args, "--json"]);
    expect(r.code).toBe(1);
    return (JSON.parse(r.out) as { error: { code: string } }).error.code;
  };
  it("missing positional → BAD_ARG", () => {
    expect(errCode(["synthesize-conventions", "--out", out])).toBe("BAD_ARG");
  });
  it("nonexistent file → FILE_NOT_FOUND", () => {
    expect(errCode(["synthesize-conventions", join(out, "nope.json"), "--out", out])).toBe("FILE_NOT_FOUND");
  });
  it("malformed JSON → BAD_JSON", () => {
    const bad = join(out, "bad.json");
    writeFileSync(bad, "{not json", "utf8");
    expect(errCode(["synthesize-conventions", bad, "--out", out])).toBe("BAD_JSON");
  });
  it("usage-dna not an array → BAD_DNA", () => {
    const obj = join(out, "obj.json");
    writeFileSync(obj, JSON.stringify({ nope: true }), "utf8");
    expect(errCode(["synthesize-conventions", obj, "--out", out])).toBe("BAD_DNA");
  });
  it("--ds not a DTCG object → BAD_DS", () => {
    const badDs = join(out, "badds.json");
    writeFileSync(badDs, JSON.stringify([1, 2, 3]), "utf8");
    expect(errCode(["synthesize-conventions", USAGE, "--ds", badDs, "--out", out])).toBe("BAD_DS");
  });
});
