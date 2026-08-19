/**
 * Floor repairs — the autofix half of the interface-craft floors. Each repair is
 * gated by the SAME check function that reports the finding, and every positive
 * case asserts the check goes silent after the repair (checker and repair share
 * one evidence source — a repair the checker can't confirm fixed nothing).
 */
import { describe, expect, it } from "vitest";
import {
  fixHoverMediaGuard,
  fixTableTabularNums,
  fixFocusOutlineRestore,
} from "../src/core/html-autofix-floor-repairs.js";
import { runAutofix } from "../src/core/html-autofix.js";
import { checkStickyHoverUnguarded } from "../src/core/layout-checks-hover.js";
import { checkDataNumbersNotTabular } from "../src/core/taste-checks-typography.js";
import { checkFocusOutlineRemoved } from "../src/core/a11y-checks.js";

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">';

describe("hover-media-guard", () => {
  const bad = `${VIEWPORT}<style>.btn:hover{background:#eee}.card{color:#111}</style>`;

  it("wraps the unguarded :hover rule in place and the check goes silent", () => {
    const { html, applied } = fixHoverMediaGuard(bad);
    expect(applied).toBe(true);
    expect(html).toMatch(/@media \(hover: hover\)\s*\{\s*\.btn:hover\{background:#eee\}\s*\}/);
    expect(html).toContain(".card{color:#111}"); // non-hover rules untouched
    expect(checkStickyHoverUnguarded(html)).toEqual([]);
  });

  it("wraps a :hover rule nested inside an unrelated media query too", () => {
    const nested = `${VIEWPORT}<style>@media (min-width: 768px){.a:hover{opacity:.8}}</style>`;
    const { html } = fixHoverMediaGuard(nested);
    expect(checkStickyHoverUnguarded(html)).toEqual([]);
  });

  it("is idempotent and leaves already-guarded documents untouched", () => {
    const once = fixHoverMediaGuard(bad).html;
    const twice = fixHoverMediaGuard(once);
    expect(twice.applied).toBe(false);
    expect(twice.html).toBe(once);
  });

  it("does not touch a desktop-only document (no mobile intent — the check's own gate)", () => {
    const desktop = "<style>.btn:hover{background:#eee}</style>";
    expect(fixHoverMediaGuard(desktop).applied).toBe(false);
  });
});

describe("table-tabular-nums", () => {
  const TABLE = "<table><tr><td>1,204</td></tr><tr><td>982</td></tr><tr><td>1,410</td></tr></table>";
  const bad = `<head><style>body{font-family:Inter}</style></head><body>${TABLE}</body>`;

  it("injects the td,th tabular-nums rule and the check goes silent", () => {
    const { html, applied } = fixTableTabularNums(bad);
    expect(applied).toBe(true);
    expect(html).toMatch(/td,\s*th\s*\{\s*font-variant-numeric:\s*tabular-nums;?\s*\}/);
    expect(checkDataNumbersNotTabular(html)).toEqual([]);
  });

  it("creates a style block in head when none exists", () => {
    const noStyle = `<head><title>t</title></head><body>${TABLE}</body>`;
    const { html, applied } = fixTableTabularNums(noStyle);
    expect(applied).toBe(true);
    expect(checkDataNumbersNotTabular(html)).toEqual([]);
  });

  it("is idempotent and skips documents the check does not flag", () => {
    const once = fixTableTabularNums(bad).html;
    expect(fixTableTabularNums(once).applied).toBe(false);
    expect(fixTableTabularNums("<table><tr><td>Alpha</td><td>Beta</td></tr></table>").applied).toBe(false);
  });
});

describe("focus-outline-restore", () => {
  it("deletes the outline-killing declaration so the browser ring returns", () => {
    const bad = "<style>button:focus { outline: none; color: red; }</style>";
    const { html, applied } = fixFocusOutlineRestore(bad);
    expect(applied).toBe(true);
    expect(html).toContain("color: red");
    expect(html).not.toMatch(/outline\s*:\s*none/);
    expect(checkFocusOutlineRemoved(html)).toEqual([]);
  });

  it("removes the Tailwind focus:outline-none class token, keeping siblings", () => {
    const bad = '<button class="px-3 focus:outline-none font-bold">Go</button>';
    const { html, applied } = fixFocusOutlineRestore(bad);
    expect(applied).toBe(true);
    expect(html).toContain("px-3");
    expect(html).toContain("font-bold");
    expect(html).not.toContain("focus:outline-none");
    expect(checkFocusOutlineRemoved(html)).toEqual([]);
  });

  it("never touches a document whose removal has a legitimate replacement", () => {
    const ok = "<style>button:focus { outline: none; box-shadow: 0 0 0 2px var(--ring); }</style>";
    expect(fixFocusOutlineRestore(ok).applied).toBe(false);
  });

  it("is idempotent", () => {
    const once = fixFocusOutlineRestore("<style>a:focus{outline:0}</style>").html;
    expect(fixFocusOutlineRestore(once).applied).toBe(false);
  });
});

describe("runAutofix — floor repairs are registered", () => {
  it("one pass over a document violating all three floors clears all three checks", () => {
    const bad = `<!doctype html><html lang="en"><head>${VIEWPORT}<title>t</title>` +
      "<style>button:focus{outline:none}.btn:hover{background:#eee}</style></head><body>" +
      "<table><tr><td>1,204</td></tr><tr><td>982</td></tr><tr><td>1,410</td></tr></table></body></html>";
    const { html, findings } = runAutofix(bad);
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain("hover-media-guard");
    expect(ids).toContain("table-tabular-nums");
    expect(ids).toContain("focus-outline-restore");
    expect(checkStickyHoverUnguarded(html)).toEqual([]);
    expect(checkDataNumbersNotTabular(html)).toEqual([]);
    expect(checkFocusOutlineRemoved(html)).toEqual([]);
  });
});
