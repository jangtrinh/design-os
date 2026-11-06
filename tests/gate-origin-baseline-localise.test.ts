/**
 * `ui gate --origin / --src / --kit / --baseline` and dense-line localisation.
 *
 * The fixture is the shape of a page captured from a running React + Tailwind v4 +
 * component-kit app: framework runtime variables the page never declares, a kit
 * utility with a raw colour, a kit accordion keyframes that animates height, and the
 * whole rendered body on ONE line. Before this change every such view failed with
 * errors nobody authored, and every body finding named the same `<div id="root">` line.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

/** Compiled-CSS slice: one rule per line, as a dev server serves it. */
const CSS = [
  ":root { --color-ink: #0e1726; --color-canvas: #ffffff; }",
  "body { color: var(--color-ink); background: var(--color-canvas); }",
  ".shadow-xs { box-shadow: var(--tw-inset-shadow), var(--tw-ring-shadow), var(--tw-shadow); }",
  ".bg-black\\/10 {",
  "  background-color: #000;",
  "}",
  ".transition-all { transition-property: all; transition-duration: 150ms; }",
  ".animate-accordion-down { animation: accordion-down 200ms ease-out; }",
  "@keyframes accordion-down {",
  "  from { height: 0; }",
  "  to { height: var(--radix-accordion-content-height); }",
  "}",
  "@media (prefers-reduced-motion: reduce) { .animate-accordion-down { animation: none; } }",
];

/** A body long and tag-dense enough to be one captured line. */
const BODY = (extra = ""): string => {
  const items = Array.from({ length: 14 }, (_, i) => `<li class="item"><a href="/p${i}">Project number ${i} with a readable label</a></li>`).join("");
  return `<div id="root"><main><h1>Projects</h1><p class="lead">Every project we delivered, in order.</p><ul class="list">${items}</ul>${extra}<div class="bg-black/10 transition-all animate-accordion-down shadow-xs">Panel</div></main></div>`;
};

const page = (css: string[], body: string): string =>
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Projects</title>\n' +
  `<style>\n${css.join("\n")}\n</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

let dir: string;
let tokens: string;
let src: string;
let kit: string;
const write = (name: string, contents: string): string => {
  const p = join(dir, name);
  writeFileSync(p, contents, "utf8");
  return p;
};
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-gate-origin-"));
  tokens = write("tokens.json", JSON.stringify({ color: { ink: { $type: "color", $value: "#0e1726" }, canvas: { $type: "color", $value: "#ffffff" } } }));
  src = join(dir, "src");
  kit = join(src, "components", "ui");
  mkdirSync(kit, { recursive: true });
  // Authored code: uses its own classes, never the kit's internals.
  writeFileSync(join(src, "projects-page.tsx"), 'export const P = () => <ul className="list"><li className="item">x</li></ul>;\n', "utf8");
  // The unmodified kit: owns the raw-colour overlay, the transition and the accordion animation.
  writeFileSync(join(kit, "accordion.tsx"), 'export const cls = "bg-black/10 transition-all data-open:animate-accordion-down shadow-xs";\n', "utf8");
});

const gate = (file: string, ...flags: string[]) =>
  capture(["gate", file, "--tokens", tokens, "--token-coverage-floor", "0", "--json", ...flags]);
const findingsOf = (data: { families: Record<string, { findings: Array<Record<string, unknown>> }> }) =>
  Object.values(data.families).flatMap((f) => f.findings);

describe("ui gate --origin: only authored errors fail", () => {
  it("BEFORE: without --origin the framework + kit errors fail the gate", () => {
    const r = gate(write("p.html", page(CSS, BODY())));
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.errorCount).toBeGreaterThan(0);
  });

  it("AFTER: --origin --src --kit labels every finding and exits 0 when no authored error remains", () => {
    const r = gate(write("p.html", page(CSS, BODY())), "--origin", "--src", src, "--kit", kit);
    const d = JSON.parse(r.out).data;
    expect(d.origin.countedErrors).toBe(0);
    expect(d.origin.byOrigin.authored.errors).toBe(0);
    expect(d.origin.byOrigin.framework.errors).toBeGreaterThan(0); // --tw-*, --radix-*
    expect(d.origin.byOrigin.kit.errors).toBeGreaterThan(0); // #000 overlay, transition-all, accordion height
    expect(d.errorCount).toBeGreaterThan(0); // nothing is dropped: the totals still show them
    for (const f of findingsOf(d)) expect(["authored", "kit", "framework"]).toContain(f["origin"]);
    expect(r.code).toBe(0);
    expect(d.pass).toBe(true);
  });

  it("an authored error still fails: a hand-picked 13px class used in the authored sources", () => {
    writeFileSync(join(src, "note.tsx"), 'export const N = () => <p className="text-[13px]">small print</p>;\n', "utf8");
    const css = [...CSS, ".text-\\[13px\\] {", "  font-size: 13px;", "}"];
    const r = gate(write("p.html", page(css, BODY('<p class="text-[13px]">Small print that is far too small to read comfortably on a phone.</p>'))), "--src", src, "--kit", kit);
    const d = JSON.parse(r.out).data;
    expect(r.code).toBe(1);
    expect(d.origin.countedErrors).toBeGreaterThan(0);
    const authored = findingsOf(d).filter((f) => f["origin"] === "authored" && f["severity"] === "error");
    expect(authored.map((f) => f["checkId"])).toContain("tiny-body-text");
  });

  it("fails SAFE: without --kit, kit-owned findings are authored (nothing is assumed away)", () => {
    const r = gate(write("p.html", page(CSS, BODY())), "--origin");
    const d = JSON.parse(r.out).data;
    expect(d.origin.byOrigin.framework.errors).toBeGreaterThan(0); // framework vars need no flag
    expect(d.origin.byOrigin.kit.errors).toBe(0);
    expect(d.origin.byOrigin.authored.errors).toBeGreaterThan(0);
    expect(r.code).toBe(1);
  });

  it("--kit without --src is refused", () => {
    const r = gate(write("p.html", page(CSS, BODY())), "--kit", kit);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });

  it("text output prints the origin roll-up and the authored list only", () => {
    const r = capture(["gate", write("p.html", page(CSS, BODY())), "--tokens", tokens, "--token-coverage-floor", "0", "--src", src, "--kit", kit]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/origin: authored 0 error\(s\)/);
    expect(r.out).toMatch(/framework: ds-usage\/undeclared-token/);
    expect(r.out).not.toMatch(/✗ \[undeclared-token\]/);
  });
});

describe("dense-line localisation", () => {
  it("findings on a one-line body name their element and keep the original line", () => {
    // An icon-only button with no name: an a11y floor that reports a line, never a selector, by itself.
    const html = page(CSS, BODY('<button class="menu-toggle"><svg viewBox="0 0 8 8"></svg></button>'));
    const rootLine = html.split("\n").findIndex((l) => l.startsWith('<div id="root">')) + 1;
    const d = JSON.parse(gate(write("p.html", html)).out).data;
    const onRoot = findingsOf(d).filter((f) => f["line"] === rootLine);
    expect(onRoot.length).toBeGreaterThan(0);
    for (const f of onRoot) expect(typeof f["nodeRef"]).toBe("string");
    const icon = onRoot.find((f) => f["checkId"] === "icon-control-unnamed");
    expect(String(icon?.["nodeRef"])).toMatch(/main > button\.menu-toggle$/);
    // No finding points past the end of the real file.
    const max = html.split("\n").length;
    for (const f of findingsOf(d)) if (typeof f["line"] === "number") expect(f["line"]).toBeLessThanOrEqual(max);
  });

  it("a hand-written multi-line file is left exactly as it was (no localisation added)", () => {
    const html = page(CSS, BODY().replace(/></g, ">\n<"));
    const d = JSON.parse(gate(write("p.html", html)).out).data;
    const body = findingsOf(d).filter((f) => f["checkId"] === "tap-target-undersized" || f["checkId"] === "kicker-above-heading");
    for (const f of body) expect(f["line"]).toBeGreaterThan(0);
    expect(readFileSync(join(dir, "p.html"), "utf8")).toBe(html);
  });
});

describe("ui gate --baseline", () => {
  it("accepted findings pass; a NEW error fails, and only it counts", () => {
    const file = write("p.html", page(CSS, BODY()));
    const baseline = join(dir, "gate-baseline.json");
    const w = gate(file, "--write-baseline", baseline);
    expect(w.code).toBe(0);
    expect(JSON.parse(readFileSync(baseline, "utf8")).kind).toBe("ui-gate-baseline");

    const again = gate(file, "--baseline", baseline);
    expect(again.code).toBe(0);
    expect(JSON.parse(again.out).data.origin.baselined.errors).toBeGreaterThan(0);

    writeFileSync(file, page([...CSS, ".danger {", "  color: #ff0000;", "}"], BODY('<p class="danger">New</p>')), "utf8");
    const after = gate(file, "--baseline", baseline);
    const d = JSON.parse(after.out).data;
    expect(after.code).toBe(1);
    const counted = findingsOf(d).filter((f) => f["severity"] === "error" && f["baselined"] !== true);
    // Exactly the new red rule, seen by three families — none of the accepted findings came back.
    expect(counted.map((f) => f["checkId"]).sort()).toEqual(["hardcoded-color", "low-contrast", "raw-hex-when-token-exists"]);
    for (const f of counted) expect(String(f["message"])).toMatch(/#ff0000/i);
    expect(d.origin.countedErrors).toBe(3);
  });

  it("a file that is not a baseline is refused, never read as empty", () => {
    const bad = write("bad.json", JSON.stringify({ hello: "world" }));
    const r = gate(write("p.html", page(CSS, BODY())), "--baseline", bad);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_BASELINE");
  });
});
