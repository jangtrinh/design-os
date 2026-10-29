/**
 * Which token file the `ds-usage` family grades against, and whether `gate coverage` says the same as
 * the run. A project that keeps `design/design.tokens.json` without a `ds init` store is a project with
 * a design system: the family must run for it, and when it cannot run the skip line states the exact
 * condition that failed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { gateCoverage, runGate } from "../src/core/gate.js";
import { dsUsageCoverageContext, loadDsUsageGateInput, resolveDsUsageTokens } from "../src/core/ds-usage-gate.js";

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { out += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

const page = (css: string, body = "<h1>T</h1>"): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title><style>${css}</style></head><body><main>${body}</main></body></html>`;
const MONO_PAGE = page(".a { font-family: ui-monospace, Menlo, monospace; }");
const WITH_FONT = { fontFamily: { sans: { $type: "fontFamily", $value: ["Inter", "sans-serif"] } }, colors: { brand: { $type: "color", $value: "#3b82f6" } } };
const WITHOUT_FONT = { colors: { brand: { $type: "color", $value: "#3b82f6" } } };
const MONO_RULE = { rules: [{ id: "no-mono", kind: "token-ban", severity: "error", message: "no mono in UI", source: "monospace ban", tokens: ["font-mono"] }] };

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-gate-ds-inputs-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
const put = (rel: string, body: string): string => {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, "utf8");
  return p;
};
const ids = (json: string): string[] => {
  const fam = (JSON.parse(json).data.families as Record<string, { findings: { checkId: string }[] }>)["ds-usage"];
  return (fam?.findings ?? []).map((f) => f.checkId);
};

describe("the tokens the ds-usage family uses without --tokens", () => {
  it("design/design.tokens.json beside the page's project runs the family even when there is no ds init store", () => {
    put("design/design.tokens.json", JSON.stringify(WITH_FONT));
    const file = put("p.html", MONO_PAGE);
    const r = capture(["gate", file, "--dir", dir, "--json"]);
    expect(ids(r.out)).toEqual(["off-system-font"]);
    expect((JSON.parse(r.out).data.skipped as string[]).some((s) => s.startsWith("ds-usage"))).toBe(false);
  });

  it("the same holds when the project is found from the page's own folder (no --dir)", () => {
    put("design/design.tokens.json", JSON.stringify(WITH_FONT));
    const file = put("p.html", MONO_PAGE);
    expect(ids(capture(["gate", file, "--json"]).out)).toEqual(["off-system-font"]);
  });

  it("--tokens wins over a design/design.tokens.json that also exists", () => {
    put("design/design.tokens.json", JSON.stringify(WITH_FONT));
    const flagged = put("other.json", JSON.stringify(WITHOUT_FONT));
    const r = capture(["gate", put("p.html", MONO_PAGE), "--dir", dir, "--tokens", flagged, "--json"]);
    expect(ids(r.out)).toEqual([]); // the flagged file declares no font token: the font rule is skipped
    expect(JSON.parse(r.out).data.skipped).toContain("ds-usage/off-system-font: the design system declares no fontFamily token");
  });

  it("resolveDsUsageTokens: flag, then the detected file, then <start>/design/design.tokens.json, else nothing", () => {
    expect(resolveDsUsageTokens({ tokensFlag: "/x/t.json", projectStart: dir })).toBe("/x/t.json");
    expect(resolveDsUsageTokens({ projectStart: dir })).toBeUndefined();
    const plain = put("design/design.tokens.json", "{}");
    expect(resolveDsUsageTokens({ projectStart: dir })).toBe(plain);
    expect(resolveDsUsageTokens({ projectStart: dir, autoUnreadable: true })).toBeUndefined();
  });
});

describe("the skip line names the condition that failed", () => {
  it("with no token file and no rules it names the folder it looked in and both missing inputs", () => {
    const r = capture(["gate", put("p.html", MONO_PAGE), "--dir", dir, "--json"]);
    const reason = (JSON.parse(r.out).data.skipped as string[]).find((s) => s.startsWith("ds-usage:")) ?? "";
    expect(reason).toContain(join(dir, "design", "design.tokens.json"));
    expect(reason).toContain(join(dir, "design", "rules", "_adherence.rules.json"));
    expect(reason).toContain("no token file");
    expect(reason).toContain("no promoted token-ban rule");
  });

  it("an existing token file is never described as missing", () => {
    put("design/design.tokens.json", JSON.stringify(WITH_FONT));
    const r = capture(["gate", put("p.html", MONO_PAGE), "--dir", dir, "--json"]);
    expect((JSON.parse(r.out).data.skipped as string[]).join(" ")).not.toContain("no token file");
  });
});

describe("gate coverage says what the run does", () => {
  it("uses the same project token file as the run (no ds init store needed)", () => {
    put("design/design.tokens.json", JSON.stringify(WITH_FONT));
    const cov = JSON.parse(capture(["gate", "coverage", "--dir", dir, "--json"]).out).data;
    expect(cov.families["ds-usage"]).toEqual({ total: 4, active: 4 });
  });

  it("a design system with no fontFamily token: off-system-font is inactive, the other three stay active, and the run agrees", () => {
    put("design/design.tokens.json", JSON.stringify(WITHOUT_FONT));
    const cov = JSON.parse(capture(["gate", "coverage", "--dir", dir, "--json"]).out).data;
    expect(cov.families["ds-usage"]).toEqual({ total: 4, active: 3 });
    const font = (cov.checks as { id: string; active: boolean; inactiveReason?: string }[]).find((c) => c.id === "off-system-font");
    expect(font?.active).toBe(false);
    expect(font?.inactiveReason).toContain("no fontFamily token");
    const text = capture(["gate", "coverage", "--dir", dir]).out;
    expect(text).toContain("inactive: off-system-font (the design system declares no fontFamily token)");
    const gate = JSON.parse(capture(["gate", put("p.html", MONO_PAGE), "--dir", dir, "--json"]).out).data;
    expect(gate.skipped).toContain("ds-usage/off-system-font: the design system declares no fontFamily token");
  });

  it("promoted rules alone: the four token rows are inactive but coverage says the family still runs the rules", () => {
    put("design/rules/_adherence.rules.json", JSON.stringify(MONO_RULE));
    const cov = JSON.parse(capture(["gate", "coverage", "--dir", dir, "--json"]).out).data;
    expect(cov.families["ds-usage"]).toEqual({ total: 4, active: 0 });
    expect(cov.extra.join(" ")).toContain("1 promoted token-ban rule(s)");
    expect(capture(["gate", "coverage", "--dir", dir]).out).toContain("also: ds-usage: 1 promoted token-ban rule(s)");
    const gate = JSON.parse(capture(["gate", put("p.html", page("", `<p class="font-mono">x</p>`)), "--dir", dir, "--json"]).out).data;
    expect(Object.keys(gate.families)).toContain("ds-usage");
  });

  it("an unreadable token file is reported by coverage as the reason the family does not run", () => {
    put("design/design.tokens.json", "{ not json");
    const text = capture(["gate", "coverage", "--dir", dir]).out;
    expect(text).toContain("ds-usage inputs unreadable");
  });

  it("every ds-usage claim in coverage is something runGate emits or skips with a reason", () => {
    const ctxs = [
      { tokens: WITH_FONT, rules: false },
      { tokens: WITHOUT_FONT, rules: false },
      { tokens: undefined, rules: true },
    ];
    for (const c of ctxs) {
      const d = mkdtempSync(join(tmpdir(), "ease-gate-ds-claims-"));
      try {
        if (c.tokens !== undefined) { mkdirSync(join(d, "design"), { recursive: true }); writeFileSync(join(d, "design", "design.tokens.json"), JSON.stringify(c.tokens)); }
        if (c.rules) { mkdirSync(join(d, "design", "rules"), { recursive: true }); writeFileSync(join(d, "design", "rules", "_adherence.rules.json"), JSON.stringify(MONO_RULE)); }
        const ctx = dsUsageCoverageContext(d);
        const cov = gateCoverage({ tokensPresent: ctx.tokensPresent, dsPresent: false, fontTokenPresent: ctx.fontTokenPresent, promotedRules: ctx.promotedRules });
        const input = loadDsUsageGateInput({ tokensPath: resolveDsUsageTokens({ projectStart: d }), designDir: join(d, "design") });
        const tripAll = page(":root { --page-only: red; } .a { color: #ff0000; background: var(--nowhere); border-color: var(--page-only); font-family: ui-monospace, Menlo; }", `<p class="font-mono">x</p>`);
        const run1 = runGate(tripAll, input === undefined ? {} : { dsUsage: input });
        const emitted = new Set((run1.families["ds-usage"]?.findings ?? []).map((f) => f.checkId).filter((x) => !x.startsWith("token-ban/")));
        const claimed = new Set(cov.checks.filter((k) => k.family === "ds-usage" && k.active).map((k) => k.id));
        expect([...emitted].sort(), JSON.stringify(c)).toEqual([...claimed].sort());
        expect(run1.families["ds-usage"]?.findings.some((f) => f.checkId.startsWith("token-ban/"))).toBe(cov.extra.length > 0);
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    }
  });

  it("gateCoverage defaults stay: with tokens and no font information all four rows are active", () => {
    expect(gateCoverage({ tokensPresent: true, dsPresent: true }).families["ds-usage"]).toEqual({ total: 4, active: 4 });
  });
});
