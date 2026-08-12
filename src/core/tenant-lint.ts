/**
 * Deterministic Tenant-contract linter — string/regex heuristics, zero npm deps
 * (uses node:fs/node:path to resolve local linked files, mirroring the original CLI).
 *
 * Enforces the Tenant Law for embeddable motion sections
 * (knowledge/motion-craft.md § Tenant contract): an embedded interactive block is a
 * GUEST — it reads the host page only through its own bounding box, and writes only
 * inside its own subtree. Ported (logic-preserving TS-ify) from
 * studio repo: specs/021-scrollworld-gflow-video-track/embed-section/tenant-lint.mjs. The two rule
 * groups (section-body JS/CSS, host-ancestor sticky-killer) live in
 * tenant-lint-checks.ts — split out to stay under the repo's 200-line file guideline
 * (mirrors taste-lint.ts importing its checks from taste-checks*.ts).
 *
 * Severity model: every Tenant violation is an `error` — a global write or a
 * sticky-killer ancestor is absolute, there is no warnings tier (unlike taste-lint's
 * error/warning split).
 *
 * Coverage:
 *   Section-body (JS) — window.scrollTo / document(.scrollingElement)/documentElement
 *     .scrollTo, window.scrollY/pageYOffset, document.body.style.height mutation,
 *     .scrollingElement assignment, documentElement.style.setProperty, position:fixed.
 *     Scanned in BOTH inline `<script>` bodies and local `<script src>` files (resolved
 *     against `opts.baseDir`) — the shipped section engine is always linked, not
 *     inlined, so external resolution is where the real coverage lives.
 *   Section-body (CSS) — a `:root {}` block declaring a `--scrub-*` variable, or
 *     `position: fixed` on a selector that touches `.scrub` scope. Scanned in both
 *     inline `<style>` bodies and local `<link rel=stylesheet href>` files.
 *   Host-ancestor (sticky-killer) — any ancestor of a `.scrub` element carrying
 *     overflow:hidden|clip|auto, transform, filter, perspective, or a layout/paint/
 *     strict `contain` in its inline style — any of these silently kill the
 *     `position:sticky` pin the section relies on. HTML-only (inline style attributes
 *     on the page itself); does not read linked files.
 *
 * External-file resolution (mirrors tenant-lint.mjs's resolveHref, :35): a `src`/`href`
 * is followed only when `opts.baseDir` is supplied AND the URL is local — an absolute
 * `http(s)://` or protocol-relative `//…` URL is "external, not ours to lint" and is
 * always skipped. Without `baseDir` (a pure in-memory string, e.g. a unit test with no
 * filesystem) external files are skipped entirely — that call shape trades full
 * coverage for zero I/O; the CLI command always passes `baseDir` for full parity with
 * the original standalone linter. A missing or unreadable linked file is silently
 * skipped (not this linter's job to report I/O errors — that is validate-layout's).
 *
 * HONEST LIMITATIONS (regex/string-level, not a DOM/CSSOM/module-resolver — matches
 * taste-lint's documented precision tradeoff):
 *   - Bracket-notation calls (`window['scrollTo'](...)`) are invisible to the
 *     identifier-shaped regexes in tenant-lint-checks.ts.
 *   - An aliased reference (`const w = window; w.scrollTo(...)`) is not traced.
 *   - Unquoted HTML attributes (`<div class=scrub style=transform:...>`) are not
 *     matched by the `["']`-quoted attribute regexes.
 *   - The host-ancestor sticky-killer check is inline-style-only — a killer applied
 *     via an external CSS class on the ancestor is not caught.
 *   - External-file resolution is one level, string-path only — no bundler resolution
 *     semantics, no import maps, no recursive `@import`/`import` following.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { scanJS, scanCSS, scanHostAncestors } from "./tenant-lint-checks.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantFinding {
  /** Machine-stable rule id, e.g. "window-scrollto" or "sticky-killer-ancestor". */
  rule: string;
  /** 1-based line number within the scanned snippet (script body, style body, or
   *  the full HTML document for the host-ancestor check). */
  line: number;
  detail: string;
  /** Every Tenant violation is absolute — no warnings tier. */
  severity: "error";
}

export interface TenantLintResult {
  findings: TenantFinding[];
  /** Every finding is severity "error", so this equals findings.length. */
  errorCount: number;
}

export interface LintTenantOptions {
  /**
   * Directory to resolve local `<script src>` / `<link href>` paths against — pass
   * the linted HTML file's own directory for full parity with the original
   * standalone tenant-lint.mjs. Omit for a pure in-memory string with no filesystem
   * access; external files are then skipped (see the module header).
   */
  baseDir?: string;
}

// ─── External-file resolution ───────────────────────────────────────────────────

/** "external, not ours to lint" — mirrors tenant-lint.mjs's resolveHref (:35). */
function isLocalHref(href: string): boolean {
  return !/^https?:\/\//i.test(href) && !href.startsWith("//");
}

/** Read a local file for external-resolution scanning; never throws — a missing or
 *  unreadable linked file is silently skipped (not this linter's job to report). */
function readLocalFile(baseDir: string, href: string): string | null {
  if (!isLocalHref(href)) return null;
  const abs = resolvePath(baseDir, href);
  if (!existsSync(abs)) return null;
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run every Tenant-contract check against a full HTML document string and return
 * findings. Extracts inline `<script>` bodies plus local `<script src>` files
 * (when `opts.baseDir` is given) and inline `<style>` bodies plus local
 * `<link rel=stylesheet href>` files for the section-body rules, then walks the tag
 * stack once (HTML-only) for the host-ancestor rule.
 */
export function lintTenant(html: string, opts: LintTenantOptions = {}): TenantLintResult {
  const findings: TenantFinding[] = [];
  const { baseDir } = opts;

  const scriptTagRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptTagRe.exec(html))) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/.exec(attrs);
    if (srcMatch) {
      const href = srcMatch[1] ?? "";
      const external = baseDir !== undefined ? readLocalFile(baseDir, href) : null;
      if (external !== null) findings.push(...scanJS(external));
    } else if (body.trim()) {
      findings.push(...scanJS(body));
    }
  }

  const styleTagRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleTagRe.exec(html))) {
    findings.push(...scanCSS(m[1] ?? ""));
  }

  const linkTagRe = /<link\b([^>]*)>/gi;
  while ((m = linkTagRe.exec(html))) {
    const attrs = m[1] ?? "";
    if (!/rel\s*=\s*["']stylesheet["']/i.test(attrs)) continue;
    const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/.exec(attrs);
    if (!hrefMatch) continue;
    const href = hrefMatch[1] ?? "";
    const external = baseDir !== undefined ? readLocalFile(baseDir, href) : null;
    if (external !== null) findings.push(...scanCSS(external));
  }

  findings.push(...scanHostAncestors(html));

  return { findings, errorCount: findings.length };
}
