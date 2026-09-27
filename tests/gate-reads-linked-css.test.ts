/**
 * PR-FU3 — gates must read what the browser reads. A1: `ui gate`, `taste-lint`,
 * `a11y-lint`, `validate-layout`, `content-lint` and `token-coverage` resolve a
 * local `<link rel="stylesheet">` and judge it as if inlined. A2: red-first
 * parity — a fixture whose only violation lives in a linked stylesheet turns
 * the linter red, and gives IDENTICAL findings to the same fixture with the
 * CSS hand-inlined at the same spot. C1: negative controls (linked-only
 * violation → red; missing linked file → error finding, never silence).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-gate-linked-css-")); });

// A taste-lint violation (linear-easing) that lives ONLY in the CSS text.
const VIOLATING_CSS = ".cta { transition: transform 0.2s linear; }";
const PAGE_HEAD = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"><title>T</title>';
const LINKED = `${PAGE_HEAD}<link rel="stylesheet" href="styles.css"></head><body><main><button class="cta">Go</button></main></body></html>`;
const INLINED = `${PAGE_HEAD}<style>${VIOLATING_CSS}</style></head><body><main><button class="cta">Go</button></main></body></html>`;

describe("ui taste-lint reads linked CSS (A1/A2)", () => {
  it("a violation living only in a linked stylesheet turns it red (red-first)", () => {
    write("styles.css", VIOLATING_CSS);
    const r = capture(["taste-lint", write("linked.html", LINKED), "--json"]);
    expect(r.code).toBe(1);
    const findings = JSON.parse(r.out).data.findings;
    expect(findings.some((f: { checkId: string }) => f.checkId === "linear-easing")).toBe(true);
  });

  it("parity: linked-CSS findings match hand-inlined findings exactly (checkId+severity+message)", () => {
    write("styles.css", VIOLATING_CSS);
    const linked = capture(["taste-lint", write("linked.html", LINKED), "--json"]);
    const inlined = capture(["taste-lint", write("inlined.html", INLINED), "--json"]);
    const shape = (f: { checkId: string; severity: string; message: string }) => ({ checkId: f.checkId, severity: f.severity, message: f.message });
    expect(JSON.parse(linked.out).data.findings.map(shape)).toEqual(JSON.parse(inlined.out).data.findings.map(shape));
  });

  it("a missing linked stylesheet is an error finding, never silence (C1)", () => {
    const r = capture(["taste-lint", write("missing.html", LINKED), "--json"]);
    expect(r.code).toBe(1);
    const findings = JSON.parse(r.out).data.findings;
    expect(findings.some((f: { checkId: string }) => f.checkId === "linked-css-unreadable")).toBe(true);
  });

  it("clean page with a clean linked stylesheet stays green", () => {
    write("styles.css", ".cta { transition: transform 0.2s ease; }");
    const r = capture(["taste-lint", write("clean.html", LINKED), "--json"]);
    expect(r.code).toBe(0);
  });
});

describe("ui gate reads linked CSS (A1)", () => {
  it("a taste violation living only in a linked stylesheet fails the gate", () => {
    write("styles.css", VIOLATING_CSS);
    const r = capture(["gate", write("linked.html", LINKED), "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data;
    expect(d.families.taste.errorCount).toBeGreaterThan(0);
  });

  it("a missing linked stylesheet fails the gate with an error finding (C1)", () => {
    const r = capture(["gate", write("missing.html", LINKED), "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data;
    expect(d.linkedCssErrors.some((f: { checkId: string }) => f.checkId === "linked-css-unreadable")).toBe(true);
  });
});

describe("ui a11y-lint reads linked CSS (A1/C1)", () => {
  // outline: none with no visible replacement anywhere → focus-outline-removed
  const A11Y_CSS = "button:focus { outline: none; }";
  const linkedA11y = `${PAGE_HEAD}<link rel="stylesheet" href="styles.css"></head><body><main><button>Go</button></main></body></html>`;

  it("a violation living only in linked CSS turns a11y-lint red", () => {
    write("styles.css", A11Y_CSS);
    const r = capture(["a11y-lint", write("linked.html", linkedA11y), "--json"]);
    expect(r.code).toBe(1);
    const findings = JSON.parse(r.out).data.findings;
    expect(findings.some((f: { checkId: string }) => f.checkId === "focus-outline-removed")).toBe(true);
  });

  it("a missing linked stylesheet is an error finding, never silence", () => {
    const r = capture(["a11y-lint", write("missing.html", linkedA11y), "--json"]);
    expect(r.code).toBe(1);
    const findings = JSON.parse(r.out).data.findings;
    expect(findings.some((f: { checkId: string }) => f.checkId === "linked-css-unreadable")).toBe(true);
  });
});

describe("ui validate-layout reads linked CSS (A1/C1)", () => {
  const LAYOUT_CSS = "html, body { overflow-x: hidden; }";
  const linkedLayout = `${PAGE_HEAD}<link rel="stylesheet" href="styles.css"></head><body><main>x</main></body></html>`;

  it("a violation living only in linked CSS is found (warning: root-overflow-x-hidden)", () => {
    write("styles.css", LAYOUT_CSS);
    const r = capture(["validate-layout", write("linked.html", linkedLayout), "--json"]);
    const findings = JSON.parse(r.out).data.findings;
    expect(findings.some((f: { checkId: string }) => f.checkId === "root-overflow-x-hidden")).toBe(true);
  });

  it("a missing linked stylesheet is an error finding, never silence", () => {
    const r = capture(["validate-layout", write("missing.html", linkedLayout), "--json"]);
    expect(r.code).toBe(1);
    const findings = JSON.parse(r.out).data.findings;
    expect(findings.some((f: { checkId: string }) => f.checkId === "linked-css-unreadable")).toBe(true);
  });
});

describe("ui content-lint reads linked CSS load path (C1)", () => {
  const linked = `${PAGE_HEAD}<link rel="stylesheet" href="styles.css"></head><body><main>Hello.</main></body></html>`;

  it("a missing linked stylesheet is an error finding, never silence", () => {
    const r = capture(["content-lint", write("missing.html", linked), "--json"]);
    expect(r.code).toBe(1);
    const findings = JSON.parse(r.out).data.findings;
    expect(findings.some((f: { checkId: string }) => f.checkId === "linked-css-unreadable")).toBe(true);
  });

  it("clean page with a readable linked stylesheet stays green", () => {
    write("styles.css", "body { color: black; }");
    const r = capture(["content-lint", write("clean.html", linked), "--json"]);
    expect(r.code).toBe(0);
  });
});

describe("ui token-coverage reads linked CSS honestly (C1)", () => {
  const tokens = {
    color: { primary: { $type: "color", $value: "#336699" } },
  };
  const linked = `${PAGE_HEAD}<link rel="stylesheet" href="styles.css"></head><body><main>Hi</main></body></html>`;

  it("a missing linked stylesheet is an error finding and FAILS the check, never silence", () => {
    write("design.tokens.json", JSON.stringify(tokens));
    const r = capture(["token-coverage", write("missing.html", linked), "--tokens", join(dir, "design.tokens.json"), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.linkedCssErrors).toHaveLength(1);
  });

  it("a readable linked stylesheet's raw color counts toward coverage", () => {
    write("design.tokens.json", JSON.stringify(tokens));
    write("styles.css", ".x { color: #336699; }");
    const r = capture(["token-coverage", write("ok.html", linked), "--tokens", join(dir, "design.tokens.json"), "--json"]);
    const d = JSON.parse(r.out).data;
    expect(d.linkedCssErrors).toEqual([]);
    expect(d.categories.color.token).toBeGreaterThan(0);
  });
});

// ─── PR-FU3-r2 A10: ds-usage-lint and tenant-lint route through the shared loader too ───

describe("ui ds-usage-lint reads linked CSS (PR-FU3-r2 A10)", () => {
  const linked = `${PAGE_HEAD}<link rel="stylesheet" href="styles.css"></head><body><main>Hi</main></body></html>`;
  const inlined = (css: string): string => `${PAGE_HEAD}<style>${css}</style></head><body><main>Hi</main></body></html>`;
  const VIOLATING_CSS = ".card { color: var(--totally-undeclared-token); background: #ff0000; }";

  beforeEach(() => {
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(join(dir, "design", "design.tokens.json"), JSON.stringify({ brand: { primary: { $value: "#3b82f6", $type: "color" } } }));
  });

  it("a violation living only in a linked stylesheet fails ds-usage-lint (red-first)", () => {
    write("styles.css", VIOLATING_CSS);
    const r = capture(["ds-usage-lint", write("linked.html", linked), "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.findings.some((f: { checkId: string }) => f.checkId === "undeclared-token")).toBe(true);
  });

  it("parity: linked-CSS findings match hand-inlined findings exactly (checkId+severity+message)", () => {
    write("styles.css", VIOLATING_CSS);
    const linkedRes = capture(["ds-usage-lint", write("linked2.html", linked), "--dir", dir, "--json"]);
    const inlinedRes = capture(["ds-usage-lint", write("inlined2.html", inlined(VIOLATING_CSS)), "--dir", dir, "--json"]);
    const shape = (f: { checkId: string; severity: string; message: string }) => ({ checkId: f.checkId, severity: f.severity, message: f.message });
    expect(JSON.parse(linkedRes.out).data.findings.map(shape)).toEqual(JSON.parse(inlinedRes.out).data.findings.map(shape));
  });

  it("a missing linked stylesheet is an error finding, never silence", () => {
    const r = capture(["ds-usage-lint", write("missing.html", linked), "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.findings.some((f: { checkId: string }) => f.checkId === "linked-css-unreadable")).toBe(true);
  });
});

describe("ui tenant-lint reads linked CSS (PR-FU3-r2 A10)", () => {
  const linked = `${PAGE_HEAD}<link rel="stylesheet" href="styles.css"></head><body><section class="scrub"><div>Hi</div></section></body></html>`;
  const inlined = (css: string): string => `${PAGE_HEAD}<style>${css}</style></head><body><section class="scrub"><div>Hi</div></section></body></html>`;
  const VIOLATING_CSS = ":root { --scrub-x: 1; }";

  it("a violation living only in a linked stylesheet fails tenant-lint (red-first)", () => {
    write("styles.css", VIOLATING_CSS);
    const r = capture(["tenant-lint", write("linked.html", linked), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.findings.some((f: { rule: string }) => f.rule === "root-css-write")).toBe(true);
  });

  it("parity: linked-CSS findings match hand-inlined findings exactly (rule+detail)", () => {
    write("styles.css", VIOLATING_CSS);
    const linkedRes = capture(["tenant-lint", write("linked2.html", linked), "--json"]);
    const inlinedRes = capture(["tenant-lint", write("inlined2.html", inlined(VIOLATING_CSS)), "--json"]);
    const shape = (f: { rule: string; detail: string }) => ({ rule: f.rule, detail: f.detail });
    expect(JSON.parse(linkedRes.out).data.findings.map(shape)).toEqual(JSON.parse(inlinedRes.out).data.findings.map(shape));
  });

  it("a missing linked stylesheet is an error finding, never silence", () => {
    const r = capture(["tenant-lint", write("missing.html", linked), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.findings.some((f: { rule: string }) => f.rule === "linked-css-unreadable")).toBe(true);
  });
});
