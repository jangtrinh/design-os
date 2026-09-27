/**
 * html-css-loader.ts — the ONE loader every HTML/CSS-judging command uses to
 * see a page's linked stylesheets (PR-FU3). Before this module, every linter
 * that reads CSS (`ui gate`, `taste-lint`, `a11y-lint`, `validate-layout`,
 * `content-lint`, `token-coverage`) read only the HTML file's own text —
 * `<link rel="stylesheet" href>` was invisible, so a page whose only
 * violations lived in a linked stylesheet gated green. `token-coverage`'s own
 * ad hoc linked-CSS reader (extractLinkedStylesheetPaths in
 * token-coverage-io.ts, now rebuilt on top of this module) additionally
 * SWALLOWED an unreadable linked file rather than reporting it — a fix at one
 * call site would have left every sibling linter with the same blind spot,
 * so this is the shared layer both bugs are fixed at.
 *
 * Local files only (no network): a remote (`http(s)://`, protocol-relative
 * `//`) or `data:` href is out of scope and silently skipped — nothing local
 * was promised there. A LOCAL href that cannot be read is never silence: it
 * becomes an error-severity FloorFinding the caller must surface (C1).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FloorFindingBase } from "./finding-schema.js";

const LINK_TAG_RE = /<link\b[^>]*>/gi;
const IMPORT_RE = /@import\s+(?:url\(\s*)?["']?([^"'()]+)["']?\)?[^;]*;/gi;

function isRemoteHref(href: string): boolean {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(href) || href.startsWith("data:");
}

function readLocalFile(path: string): { ok: true; text: string } | { ok: false; message: string } {
  try {
    return { ok: true, text: readFileSync(path, "utf8") };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

function unreadableFinding(kind: "linked stylesheet" | "@import", href: string, resolvedPath: string, message: string): FloorFindingBase {
  return {
    checkId: "linked-css-unreadable",
    severity: "error",
    message: `cannot read ${kind} '${href}' (resolved to '${resolvedPath}'): ${message}`,
  };
}

function parseLinkTag(tag: string): { rel: string; href: string } | undefined {
  const rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
  const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
  if (rel === undefined || href === undefined) return undefined;
  return { rel, href };
}

function isStylesheetLink(rel: string): boolean {
  return rel.split(/\s+/).some((token) => token.toLowerCase() === "stylesheet");
}

/**
 * One level of `@import` expansion for a loaded CSS file's own content:
 * targets found INSIDE `cssText` are read and prepended (CSS cascade order —
 * an `@import` is processed before the rest of the file), but `@import`s
 * inside THOSE files are never followed (PR-FU3 A1: "one level deep").
 */
function expandImportsOnce(cssPath: string, cssText: string, errors: FloorFindingBase[]): string {
  const baseDir = dirname(cssPath);
  const imported: string[] = [];
  IMPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(cssText)) !== null) {
    const href = (m[1] ?? "").trim();
    if (href === "" || isRemoteHref(href)) continue;
    const resolvedPath = resolve(baseDir, href);
    const r = readLocalFile(resolvedPath);
    if (r.ok) imported.push(r.text);
    else errors.push(unreadableFinding("@import", href, resolvedPath, r.message));
  }
  return imported.length > 0 ? `${imported.join("\n")}\n${cssText}` : cssText;
}

export interface LinkedStylesheet {
  /** href exactly as written in the <link> tag. */
  href: string;
  resolvedPath: string;
  /** Own content with one level of @import content prepended. */
  text: string;
}

export interface LinkedCssLoadResult {
  sheets: LinkedStylesheet[];
  errors: FloorFindingBase[];
}

/**
 * Discover and read every LOCAL `<link rel="stylesheet">` an HTML document
 * pulls in, resolved relative to `htmlPath`'s directory, one level of
 * `@import` deep. Order matches document order; a duplicate href yields one
 * entry per occurrence (a caller matching hrefs back to tags must consume
 * them in order — see `inlineLinkedCss`).
 */
export function loadLinkedCss(htmlPath: string, html: string): LinkedCssLoadResult {
  const baseDir = dirname(resolve(htmlPath));
  const sheets: LinkedStylesheet[] = [];
  const errors: FloorFindingBase[] = [];
  for (const m of html.matchAll(LINK_TAG_RE)) {
    const parsed = parseLinkTag(m[0]);
    if (parsed === undefined || !isStylesheetLink(parsed.rel)) continue;
    const { href } = parsed;
    if (isRemoteHref(href)) continue;
    const resolvedPath = resolve(baseDir, href);
    const r = readLocalFile(resolvedPath);
    if (!r.ok) {
      errors.push(unreadableFinding("linked stylesheet", href, resolvedPath, r.message));
      continue;
    }
    sheets.push({ href, resolvedPath, text: expandImportsOnce(resolvedPath, r.text, errors) });
  }
  return { sheets, errors };
}

/**
 * Build the effective document every family-style linter (`ui gate`,
 * `taste-lint`, `a11y-lint`, `validate-layout`, `content-lint`) scans: each
 * `<link rel="stylesheet">` tag is replaced IN PLACE by an equivalent
 * `<style>` block holding its resolved (import-expanded) content, so the
 * union of inline + linked CSS is judged exactly as if it had been hand-
 * inlined at that spot (A1/A2 parity — same content, same document position).
 * A `<link>` whose target could not be read is left untouched in the markup;
 * its failure already surfaced as an error finding in `errors`, never
 * silently dropped.
 */
export function inlineLinkedCss(htmlPath: string, html: string): { html: string; errors: FloorFindingBase[] } {
  const { sheets, errors } = loadLinkedCss(htmlPath, html);
  if (sheets.length === 0) return { html, errors };

  // Duplicate hrefs read fine at load time; queue per href so the replace
  // pass below consumes them in the same document order they were loaded.
  const queues = new Map<string, LinkedStylesheet[]>();
  for (const s of sheets) {
    const q = queues.get(s.href) ?? [];
    q.push(s);
    queues.set(s.href, q);
  }

  const out = html.replace(LINK_TAG_RE, (tag) => {
    const parsed = parseLinkTag(tag);
    if (parsed === undefined || !isStylesheetLink(parsed.rel) || isRemoteHref(parsed.href)) return tag;
    const sheet = queues.get(parsed.href)?.shift();
    if (sheet === undefined) return tag; // unreadable, or already consumed — leave <link> as-is
    return `<style data-ui-linked-href="${sheet.href}">\n${sheet.text}\n</style>`;
  });
  return { html: out, errors };
}
