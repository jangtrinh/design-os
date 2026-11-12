/**
 * An invented design package's CSS, in the shapes a built package ships: a minified token sheet whose base is
 * `:where(:root,:host,…)` and whose themes have unquoted attribute values, component classes holding local variables, a
 * Tailwind `@theme inline` sheet of aliases, and a project theme with a quoted attribute value.
 *
 * Names in the input: 17. What the door writes: 7 primitives (surface, text, border, radius, two motions, one font
 * stack) and 4 aliases (colour surface, colour text, font sans, radius md). What stays out: 6, each with a reason
 * (shadow and easing are not one leaf, three component-local variables sit under component selectors, one alias names
 * a property that is not in the input).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export const PACKAGE_TOKENS_CSS =
  '@layer ds{:where(:root,:host,.ds-root:not([data-theme] *)),[data-theme=light]{' +
  '--ds-surface:#fff;--ds-text:#111;--ds-border:#ddd;--ds-radius:.5rem;--ds-motion-fast:.1s;--ds-motion-base:.15s;' +
  '--ds-font-sans:"Inter",system-ui,sans-serif;--ds-shadow:0 1px 2px rgba(0,0,0,.1);--ds-ease:cubic-bezier(.4,0,.2,1)}}\n' +
  "[data-theme=dark]{--ds-surface:#111;--ds-text:#eee}\n" +
  ".ds-card{--ds-card-pad:1rem;--ds-card-gap:.5rem}\n" +
  ".ds-s-xs{--ds-local-size:12px}\n";

export const THEME_ALIASES_CSS =
  "@theme inline {\n  --color-surface: var(--ds-surface);\n  --color-text: var(--ds-text);\n  --font-sans: var(--ds-font-sans);\n" +
  "  --radius-md: var(--ds-radius);\n  --color-gone: var(--ds-missing);\n}\n";

export const PAPER_THEME_CSS = '[data-theme="paper"] {\n  --ds-surface: #f5f0e6;\n  --ds-text: #222;\n}\n';

export const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const DIST_CLI = join(REPO_ROOT, "dist", "cli.js");

/** Run the built CLI; the tests that use it are skipped (visibly) when `dist/` has not been built. */
export function runBuilt(args: string[], cwd: string): { code: number; out: string; err: string } {
  const r = spawnSync(process.execPath, [DIST_CLI, ...args], { cwd, encoding: "utf8" });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

/** Write the three sheets into `dir` and return the `ui designmd extract-tokens` argument list that collects them. */
export function writeSheets(dir: string, sheets: Record<string, string> = { "package-tokens.css": PACKAGE_TOKENS_CSS, "theme-aliases.css": THEME_ALIASES_CSS, "paper.css": PAPER_THEME_CSS }): { html: string; css: string } {
  mkdirSync(dir, { recursive: true });
  const html = join(dir, "page.html");
  writeFileSync(html, "<!doctype html><html><body></body></html>\n", "utf8");
  const css = Object.entries(sheets).map(([name, body]) => { const p = join(dir, name); writeFileSync(p, body, "utf8"); return p; }).join(",");
  return { html, css };
}
