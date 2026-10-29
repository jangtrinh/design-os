/**
 * Spec 031 FR-006 — `ds-usage` is a blocking `ui gate` family.
 *
 * Covers the composer (`runGate` with a DS), the declared skip without one, coverage truthfulness
 * (the catalog rows are exactly what the family emits), promoted `token-ban` rules with
 * `excludeElements`, and the CLI on the AC-2 fixtures.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";
import { runGate, gateCoverage, GATE_FAMILIES } from "../src/core/gate.js";
import { CHECK_CATALOG } from "../src/core/check-catalog.js";
import { fontTokenModel } from "../src/core/ds-usage-font-check.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import { declaredCssVarNames } from "../src/core/token-emit.js";
import { parseAdherenceRules } from "../src/core/adherence-rules.js";
import type { TokenBanRule } from "../src/core/adherence-rules.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/oi-browser/", import.meta.url));
const TOKENS = join(FIXTURES, "tokens.json");

const resolved = resolveTokens(parseTokenFile(JSON.parse(readFileSync(TOKENS, "utf8"))));
const LINT = { declaredVars: declaredCssVarNames(resolved), fonts: fontTokenModel(resolved) };

const page = (css: string, body = "<h1>Title</h1><p>Body</p>"): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title><style>${css}</style></head><body><main>${body}</main></body></html>`;
const MONO_PAGE = page(".a { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }");

const rule = (over: Record<string, unknown> = {}): TokenBanRule =>
  parseAdherenceRules(JSON.stringify({ rules: [{ id: "ns-01", kind: "token-ban", severity: "error", message: "no mono in UI", source: "NS-01", tokens: ["font-mono"], ...over }] }), "r.json", "binding")[0]!.rule as TokenBanRule;

const idsOf = (r: ReturnType<typeof runGate>): string[] => (r.families["ds-usage"]?.findings ?? []).map((f) => f.checkId);

describe("runGate ds-usage family", () => {
  it("is a gate family", () => {
    expect(GATE_FAMILIES).toContain("ds-usage");
  });

  it("with DS input, an undeclared monospace stack is an error in the ds-usage family and fails the gate", () => {
    const r = runGate(MONO_PAGE, { dsUsage: { lint: LINT, rules: [] } });
    expect(idsOf(r)).toEqual(["off-system-font"]);
    expect(r.families["ds-usage"]?.errorCount).toBe(1);
    expect(r.pass).toBe(false);
    expect(r.skipped.some((s) => s.startsWith("ds-usage:"))).toBe(false);
  });

  it("with DS input and a clean page the family runs and is clean", () => {
    const r = runGate(page(".a { font-family: inherit; }"), { dsUsage: { lint: LINT, rules: [] } });
    expect(r.families["ds-usage"]).toBeDefined();
    expect(idsOf(r)).toEqual([]);
  });

  it("a page-declared var is a warning and never fails the family", () => {
    const r = runGate(page(":root { --mine: monospace; } .a { font-family: var(--mine); }"), { dsUsage: { lint: LINT, rules: [] } });
    expect(r.families["ds-usage"]?.errorCount).toBe(0);
    expect(r.families["ds-usage"]?.warningCount).toBe(1);
    expect(idsOf(r)).toEqual(["off-system-token"]);
  });

  it("without DS input the family is skipped WITH a printed reason, never silently", () => {
    const r = runGate(MONO_PAGE, {});
    expect(r.families["ds-usage"]).toBeUndefined();
    const reason = r.skipped.find((s) => s.startsWith("ds-usage:"));
    expect(reason).toMatch(/^ds-usage: no design\.tokens\.json/);
    expect(reason).toMatch(/--tokens/);
  });

  it("--skip ds-usage:<reason> is honoured and reported with the caller's reason", () => {
    const r = runGate(MONO_PAGE, { dsUsage: { lint: LINT, rules: [] }, skip: { "ds-usage": "legacy page, tracked in #12" } });
    expect(r.families["ds-usage"]).toBeUndefined();
    expect(r.skipped).toContain("ds-usage: legacy page, tracked in #12");
  });

  it("emits every catalog row of the family and nothing the catalog does not list (coverage and runner agree)", () => {
    const tripAll = page(
      ":root { --page-only: red; } .a { color: #ff0000; background: var(--nowhere); border-color: var(--page-only); font-family: ui-monospace, Menlo; }",
    );
    const emitted = new Set(idsOf(runGate(tripAll, { dsUsage: { lint: LINT, rules: [] } })));
    const catalog = new Set(CHECK_CATALOG.filter((c) => c.family === "ds-usage").map((c) => c.id));
    expect([...emitted].sort()).toEqual([...catalog].sort());
    expect(catalog.size).toBe(4);
  });

  it("gate coverage reports the family: active with tokens, inactive without", () => {
    const withTokens = gateCoverage({ tokensPresent: true, dsPresent: true });
    const without = gateCoverage({ tokensPresent: false, dsPresent: false });
    expect(withTokens.families["ds-usage"]).toEqual({ total: 4, active: 4 });
    expect(without.families["ds-usage"]).toEqual({ total: 4, active: 0 });
  });
});

describe("promoted token-ban rules in the ds-usage family", () => {
  const body = `<code class="font-mono">a</code><p class="font-mono">b</p>`;

  it("an error rule fails the gate; excludeElements moves <code> occurrences to a printed exclusion count", () => {
    const r = runGate(page("", body), { dsUsage: { rules: [rule({ excludeElements: ["code", "pre"] })] } });
    expect(idsOf(r)).toEqual(["token-ban/ns-01"]);
    expect(r.families["ds-usage"]?.errorCount).toBe(1);
    expect(r.families["ds-usage"]?.notes?.join(" ")).toMatch(/ns-01: 1 occurrence\(s\) excluded inside <code>/);
    expect(r.pass).toBe(false);
  });

  it("a warning rule is reported and does not fail the family", () => {
    const r = runGate(page("", body), { dsUsage: { rules: [rule({ severity: "warning" })] } });
    expect(r.families["ds-usage"]?.errorCount).toBe(0);
    expect(r.families["ds-usage"]?.warningCount).toBe(2);
  });

  it("rules alone (no DS tokens) still run the family, with the colour and font checks absent", () => {
    const r = runGate(MONO_PAGE, { dsUsage: { rules: [] } });
    expect(r.families["ds-usage"]).toBeDefined();
    expect(idsOf(r)).toEqual([]);
  });

  it("the finding carries the rule's message, the token and the line", () => {
    const r = runGate(page("", body), { dsUsage: { rules: [rule()] } });
    const f = r.families["ds-usage"]?.findings[0];
    expect(f?.message).toContain("no mono in UI");
    expect(f?.message).toContain("font-mono");
    expect(typeof f?.line).toBe("number");
  });
});

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

describe("ui gate (CLI) with the ds-usage family", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-gate-ds-usage-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const put = (rel: string, body: string): string => {
    const p = join(dir, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, body, "utf8");
    return p;
  };
  const dsUsageOf = (json: string): { findings: { checkId: string; message: string }[]; errorCount: number } =>
    (JSON.parse(json).data.families as Record<string, { findings: { checkId: string; message: string }[]; errorCount: number }>)["ds-usage"]!;

  it("AC-2: the bad screen fails with OFF_SYSTEM_FONT on the ui-monospace stack", () => {
    const r = capture(["gate", join(FIXTURES, "settings-cli-core-bad.html"), "--tokens", TOKENS]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/ds-usage: \d+ error\(s\)/);
    expect(r.out).toContain("OFF_SYSTEM_FONT");
    expect(r.out).toContain("ui-monospace, SFMono-Regular");
    const json = capture(["gate", join(FIXTURES, "settings-cli-core-bad.html"), "--tokens", TOKENS, "--json"]);
    expect(dsUsageOf(json.out).findings.filter((f) => f.checkId === "off-system-font")).toHaveLength(7);
  });

  it("AC-2: the good screen and the anchor carry no off-system-font finding in the gate", () => {
    for (const f of ["settings-cli-core-good.html", "settings-account.html"]) {
      const json = capture(["gate", join(FIXTURES, f), "--tokens", TOKENS, "--json"]);
      expect(dsUsageOf(json.out).findings.filter((x) => x.checkId === "off-system-font"), f).toEqual([]);
    }
  });

  it("without a token file the family is skipped and the output says why", () => {
    const file = put("p.html", MONO_PAGE);
    const r = capture(["gate", file]);
    expect(r.out).toMatch(/skipped ds-usage: no design\.tokens\.json/);
    expect(r.out).not.toContain("OFF_SYSTEM_FONT");
  });

  it("a DS found by the design-dir contract turns the family on without --tokens", () => {
    const persona = fileURLToPath(new URL("../knowledge/personas/personas.json", import.meta.url));
    expect(capture(["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "a calm dense SaaS instrument", "--dir", dir, "--persona-data", persona]).code).toBe(0);
    const file = put("p.html", MONO_PAGE);
    const r = capture(["gate", file, "--dir", dir, "--json"]);
    expect(dsUsageOf(r.out).findings.map((f) => f.checkId)).toContain("off-system-font");
  });

  it("a design system whose token file is broken skips the family naming THAT cause, not 'no design.tokens.json'", () => {
    const persona = fileURLToPath(new URL("../knowledge/personas/personas.json", import.meta.url));
    expect(capture(["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "a calm dense SaaS instrument", "--dir", dir, "--persona-data", persona]).code).toBe(0);
    writeFileSync(join(dir, "design", "design.tokens.json"), "{ not json");
    const r = capture(["gate", put("p.html", MONO_PAGE), "--dir", dir, "--json"]);
    const skipped = JSON.parse(r.out).data.skipped as string[];
    expect(skipped.find((s) => s.startsWith("ds-usage:"))).toMatch(/token file is unreadable \(see token-coverage\/tokens-not-readable\)/);
    expect(skipped.join(" ")).not.toContain("no design.tokens.json");
    expect(r.code).toBe(1); // the unreadable file itself already fails the gate
  });

  it("promoted binding rules under --dir run in the family; excluded counts are printed", () => {
    put("design/rules/_adherence.rules.json", JSON.stringify({ rules: [{ id: "ns-01", kind: "token-ban", severity: "error", message: "no mono in UI", source: "NS-01", tokens: ["font-mono"], excludeElements: ["code"] }] }));
    const file = put("p.html", page("", `<code class="font-mono">a</code><p class="font-mono">b</p>`));
    const r = capture(["gate", file, "--tokens", TOKENS, "--dir", dir]);
    expect(r.out).toContain("[token-ban/ns-01]");
    expect(r.out).toMatch(/ns-01: 1 occurrence\(s\) excluded inside <code>/);
  });

  it("promoted rules alone (no token file anywhere) still run the family: no skip line, the rule fires", () => {
    put("design/rules/_adherence.rules.json", JSON.stringify({ rules: [{ id: "ns-01", kind: "token-ban", severity: "error", message: "no mono in UI", source: "NS-01", tokens: ["font-mono"] }] }));
    const file = put("p.html", page("", `<p class="font-mono">b</p>`));
    const r = capture(["gate", file, "--dir", dir]);
    expect(r.out).toContain("[token-ban/ns-01]");
    expect(r.out).not.toContain("skipped ds-usage");
  });

  it("the project's promoted rules apply under an explicit --tokens too, found from the page's folder", () => {
    put("design/rules/_adherence.rules.json", JSON.stringify({ rules: [{ id: "ns-01", kind: "token-ban", severity: "error", message: "no mono in UI", source: "NS-01", tokens: ["font-mono"] }] }));
    const file = put("p.html", page("", `<p class="font-mono">b</p>`));
    const r = capture(["gate", file, "--tokens", TOKENS, "--json"]);
    expect(dsUsageOf(r.out).findings.map((f) => f.checkId)).toContain("token-ban/ns-01");
  });

  it("--family keeps the family's printed exclusion notes (gate_policy rewrites findings, not counts-by-rule)", () => {
    const families = JSON.parse(readFileSync(fileURLToPath(new URL("../knowledge/personas/families.json", import.meta.url)), "utf8")) as { families: { slug: string }[] };
    put("design/rules/_adherence.rules.json", JSON.stringify({ rules: [{ id: "ns-01", kind: "token-ban", severity: "error", message: "no mono in UI", source: "NS-01", tokens: ["font-mono"], excludeElements: ["code"] }] }));
    const file = put("p.html", page("", `<code class="font-mono">a</code>`));
    const r = capture(["gate", file, "--tokens", TOKENS, "--dir", dir, "--family", families.families[0]!.slug]);
    expect(r.out).toMatch(/note ds-usage: ns-01: 1 occurrence\(s\) excluded inside <code>/);
  });

  it("proposed rules are evidence, not law: they never run in the gate", () => {
    put("design/rules/_adherence.proposed.json", JSON.stringify({ rules: [{ id: "ns-01", kind: "token-ban", severity: "error", message: "no mono", source: "NS-01", tokens: ["font-mono"] }] }));
    const file = put("p.html", page("", `<p class="font-mono">b</p>`));
    const r = capture(["gate", file, "--tokens", TOKENS, "--dir", dir, "--json"]);
    expect(dsUsageOf(r.out).findings.map((f) => f.checkId)).not.toContain("token-ban/ns-01");
  });

  it("an invalid promoted rules file stops the gate with the loader's code, never a weaker pass", () => {
    put("design/rules/_adherence.rules.json", "{ not json");
    const file = put("p.html", page(""));
    const r = capture(["gate", file, "--tokens", TOKENS, "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("ADHERENCE_BAD_JSON");
  });

  it("gate coverage --json lists the family", () => {
    const r = capture(["gate", "coverage", "--dir", dir, "--json"]);
    const fam = JSON.parse(r.out).data.families["ds-usage"] as { total: number; active: number };
    expect(fam).toEqual({ total: 4, active: 0 });
  });
});
