/**
 * `ui build-evidence lint` — E2E over the build-loop standard's linter half (r1-r7).
 * Red-first: tests/fixtures/evidence/green passes every rule; each red-r<N>
 * fixture is the green folder with exactly rule r<N>'s precondition broken,
 * and must flip only that rule red (mirrors the mkdtempSync + stdout/stderr
 * capture convention in cmd-content-lint.test.ts, but reads committed
 * fixtures rather than building HTML strings — the shape under test is a
 * folder, not a file).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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

const FIXTURES = join(process.cwd(), "tests/fixtures/evidence");
const ALL_RULES = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"];

function verdicts(dir: string): Record<string, string> {
  const r = capture(["build-evidence", "lint", dir, "--json"]);
  const data = JSON.parse(r.out).data as { rules: Array<{ id: string; verdict: string }> };
  const map: Record<string, string> = {};
  for (const rule of data.rules) map[rule.id] = rule.verdict;
  return map;
}

describe("evidence lint — green fixture", () => {
  it("every rule PASSes, exit 0", () => {
    const r = capture(["build-evidence", "lint", join(FIXTURES, "green"), "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { failCount: number; passCount: number; rules: unknown[] };
    expect(data.failCount).toBe(0);
    expect(data.passCount).toBe(7);
    expect(data.rules).toHaveLength(7);
  });

  it("text mode reports 7 PASS and exit 0", () => {
    const r = capture(["build-evidence", "lint", join(FIXTURES, "green")]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("7 PASS, 0 FAIL");
  });
});

describe("evidence lint — red-first fixtures (each breaks exactly one rule)", () => {
  it.each(ALL_RULES)("red-%s flips only %s to FAIL", (ruleId) => {
    const v = verdicts(join(FIXTURES, `red-${ruleId}`));
    expect(v[ruleId]).toBe("FAIL");
    for (const other of ALL_RULES) {
      if (other === ruleId) continue;
      expect(v[other], `red-${ruleId} unexpectedly changed ${other} (${v[other]})`).not.toBe("FAIL");
    }
  });

  it("a broken rule flips the exit code to 1", () => {
    const r = capture(["build-evidence", "lint", join(FIXTURES, "red-r1")]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("✗ r1");
  });
});

describe("evidence lint — folder missing (A1 exit 2)", () => {
  it("exit 2, DIR_NOT_FOUND in --json mode", () => {
    const r = capture(["build-evidence", "lint", join(FIXTURES, "does-not-exist"), "--json"]);
    expect(r.code).toBe(2);
    const body = JSON.parse(r.out) as { error: { code: string } };
    expect(body.error.code).toBe("DIR_NOT_FOUND");
  });

  it("exit 2, text mode", () => {
    const r = capture(["build-evidence", "lint", join(FIXTURES, "does-not-exist")]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("not found");
  });
});

describe("evidence lint — error paths", () => {
  it("missing <dir> positional → BAD_ARG", () => {
    const r = capture(["build-evidence", "lint", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_ARG");
  });

  it("unknown flag → UNKNOWN_FLAG", () => {
    const r = capture(["build-evidence", "lint", join(FIXTURES, "green"), "--bogus", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("UNKNOWN_FLAG");
  });

  it("non-numeric --widths → BAD_ARG", () => {
    const r = capture(["build-evidence", "lint", join(FIXTURES, "green"), "--widths", "abc", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_ARG");
  });
});

describe("evidence lint — --widths overrides the default set", () => {
  let dir: string;
  it("a width the folder never shot → r2 FAILs only for that width", () => {
    dir = mkdtempSync(join(tmpdir(), "ease-evidence-lint-widths-"));
    writeFileSync(join(dir, "full-1440.png"), "placeholder-png");
    writeFileSync(join(dir, "full-1440.json"), JSON.stringify({ scrollWidth: 1440, innerWidth: 1440 }));
    const withDefault = verdicts(dir); // default widths 375/768/1440 — missing 375,768
    expect(withDefault["r2"]).toBe("FAIL");
    const r = capture(["build-evidence", "lint", dir, "--widths", "1440", "--json"]);
    const data = JSON.parse(r.out).data as { rules: Array<{ id: string; verdict: string }> };
    expect(data.rules.find((x) => x.id === "r2")?.verdict).toBe("PASS");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("evidence lint — nested screenshot dir + aggregate probes.json (real-world shape)", () => {
  it("resolves probe partners across probes.json keyed by '<stem>-<width>'", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-evidence-lint-nested-"));
    mkdirSync(join(dir, "shots"));
    for (const w of [375, 768, 1440]) writeFileSync(join(dir, "shots", `full-${w}.png`), "placeholder-png");
    writeFileSync(
      join(dir, "probes.json"),
      JSON.stringify({
        "full-375": { scrollWidth: 375, innerWidth: 375 },
        "full-768": { scrollWidth: 768, innerWidth: 768 },
        "full-1440": { scrollWidth: 1440, innerWidth: 1440 },
      }),
    );
    const v = verdicts(dir);
    expect(v["r1"]).toBe("PASS");
    expect(v["r2"]).toBe("PASS");
    expect(v["r3"]).toBe("PASS");
    rmSync(dir, { recursive: true, force: true });
  });
});
