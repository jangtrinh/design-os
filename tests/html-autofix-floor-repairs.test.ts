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

// ─── Adversarial shapes from the stage-4 review — every output must stay structural ───

/** Brace balance with string literals blanked — a cheap "does the CSS still close" probe. */
function cssBraceBalanced(html: string): boolean {
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = (m[1] ?? "").replace(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, (s) => " ".repeat(s.length));
    let depth = 0;
    for (const ch of css) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      if (depth < 0) return false;
    }
    if (depth !== 0) return false;
  }
  return true;
}

describe("hover-media-guard — structural safety", () => {
  it("never engulfs base declarations of a CSS-nested rule (selector with ';' is not a selector)", () => {
    const html = `${VIEWPORT}<style>.card { padding: 2rem; background: var(--surface); &:hover { transform: translateY(-2px); } }</style>`;
    const { html: out } = fixHoverMediaGuard(html);
    expect(out).toContain("padding: 2rem; background: var(--surface);");
    expect(out).not.toMatch(/@media \(hover: hover\) \{ padding/);
    expect(cssBraceBalanced(out)).toBe(true);
  });

  it("a '}' inside a CSS string cannot produce an unclosed block", () => {
    const html = `${VIEWPORT}<style>.code:hover { content: "} }"; color: red; } .other { color: blue; }</style>`;
    const { html: out } = fixHoverMediaGuard(html);
    expect(cssBraceBalanced(out)).toBe(true);
    expect(out).toContain(".other { color: blue; }");
    expect(checkStickyHoverUnguarded(out)).toEqual([]);
  });

  it("a selector list mixing :hover with a non-hover state is skipped (miss, never a wrap)", () => {
    const html = `${VIEWPORT}<style>.c:hover, .c.is-active { transform: scale(1.05); }</style>`;
    const { html: out } = fixHoverMediaGuard(html);
    expect(out).toBe(html); // .is-active styling must not move behind hover capability
  });
});

describe("table-tabular-nums — placement safety", () => {
  const TABLE = "<table><tr><td>1,204</td></tr><tr><td>982</td></tr><tr><td>1,410</td></tr></table>";

  it("never injects into a <style> living inside a script string (fresh head block instead)", () => {
    const html = `<head><title>t</title></head><body><script>document.body.insertAdjacentHTML('beforeend', '<style>.x{color:red}</style>');</script>${TABLE}</body>`;
    const { html: out, applied } = fixTableTabularNums(html);
    expect(applied).toBe(true);
    expect(out).not.toMatch(/insertAdjacentHTML\('beforeend', '<style>\n/);
    expect(out).toMatch(/<head[^>]*>\s*<style>td, th \{ font-variant-numeric: tabular-nums; \}<\/style>/);
  });

  it("ignores commented-out/noscript style blocks — the injected rule must be live", () => {
    const html = `<head><title>t</title></head><body><!-- <style>.dead{}</style> --><noscript><style>.ns{}</style></noscript>${TABLE}</body>`;
    const { html: out } = fixTableTabularNums(html);
    expect(out).toMatch(/<head[^>]*>\s*<style>td, th \{ font-variant-numeric: tabular-nums; \}<\/style>/);
  });
});

describe("focus-outline-restore — markup-only class pass", () => {
  it("never edits documentation copy in <pre>/<code>, and never touches data-class/:class", () => {
    const html = '<button class="focus:outline-none">Go</button>' +
      '<pre><code>&lt;button class="focus:outline-none"&gt;</code></pre>' +
      '<div data-class="focus:outline-none ring-0"></div>' +
      '<div :class="btn focus:outline-none"></div>';
    const { html: out } = fixFocusOutlineRestore(html);
    expect(out).toContain('<pre><code>&lt;button class="focus:outline-none"&gt;</code></pre>');
    expect(out).toContain('data-class="focus:outline-none ring-0"');
    expect(out).toContain(':class="btn focus:outline-none"');
    expect(out).toContain('<button class="">Go</button>');
  });

  it("leaves attributes untouched when no token was removed (no diff noise)", () => {
    const html = '<style>a:focus{outline:none}</style><div class="grid  grid-cols-2\n gap-4  p-6">x</div>';
    const { html: out } = fixFocusOutlineRestore(html);
    expect(out).toContain('class="grid  grid-cols-2\n gap-4  p-6"');
  });

  it("a real ring in any focus rule means the checker is silent — the repair must not act at all", () => {
    // Shared-evidence semantics: outline: 0px solid transparent IS a ring, so the
    // checker does not fire and the aligned repair leaves the whole document alone.
    const html = "<style>a:focus { outline: none; } b:focus-visible { outline: 0px solid transparent; }</style>";
    expect(fixFocusOutlineRestore(html).applied).toBe(false);
  });

  it("deletes only the whole-value kill and keeps sibling declarations and non-focus rules", () => {
    const html = "<style>a:focus { outline: 0px; color: red; } .brand { outline: 0px solid gold; }</style>";
    const { html: out, applied } = fixFocusOutlineRestore(html);
    expect(applied).toBe(true);
    expect(out).toContain("color: red");
    expect(out).toContain("outline: 0px solid gold"); // non-focus rule untouched
    expect(out).not.toMatch(/a:focus \{ outline: 0px;/);
  });
});
