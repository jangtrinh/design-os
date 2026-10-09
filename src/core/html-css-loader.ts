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
import { Parser } from "htmlparser2";
import type { FloorFindingBase } from "./finding-schema.js";

const IMPORT_RE = /@import\s+(?:url\(\s*)?["']?([^"'()]+)["']?\)?[^;]*;/gi;

function isRemoteHref(href: string): boolean {
  return /^([a-z][a-z0-9+.-]*:)?\/\//i.test(href) || href.startsWith("data:");
}

const cleanHrefPath = (href: string): string => href.split(/[?#]/)[0] ?? "";
const escapeHtmlAttr = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function readLocalFile(path: string): { ok: true; text: string } | { ok: false; message: string } {
  try { return { ok: true, text: readFileSync(path, "utf8") }; }
  catch (e) { return { ok: false, message: e instanceof Error ? e.message : String(e) }; }
}

const unreadableFinding = (kind: "linked stylesheet" | "@import", href: string, resolvedPath: string, message: string): FloorFindingBase => ({
  checkId: "linked-css-unreadable",
  severity: "error",
  message: `cannot read ${kind} '${href}' (resolved to '${resolvedPath}'): ${message}`,
});

const isStylesheetLink = (rel: string): boolean =>
  rel.split(/\s+/).some((token) => token.toLowerCase() === "stylesheet");

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
    const cleanPath = cleanHrefPath(href);
    const resolvedPath = resolve(baseDir, cleanPath);
    const r = readLocalFile(resolvedPath);
    if (r.ok) imported.push(r.text);
    else errors.push(unreadableFinding("@import", href, resolvedPath, r.message));
  }
  return imported.length > 0 ? `${imported.join("\n")}\n${cssText}` : cssText;
}

interface DiscoveredLink {
  href: string;
  startIndex: number;
  endIndex: number;
}

function discoverStylesheetLinks(html: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (name.toLowerCase() === "link") {
          const rel = attribs["rel"];
          const href = attribs["href"];
          if (rel !== undefined && isStylesheetLink(rel) && href !== undefined) {
            links.push({ href, startIndex: parser.startIndex, endIndex: parser.endIndex });
          }
        }
      },
    },
    { lowerCaseAttributeNames: true, lowerCaseTags: true },
  );
  parser.write(html);
  parser.end();
  return links;
}

export interface LinkedStylesheet {
  /**
   * href as declared in the <link> tag (HTML entities decoded by the parser;
   * query/fragment preserved).
   */
  href: string;
  resolvedPath: string;
  /** Own content with one level of @import content prepended. */
  text: string;
}

export interface LinkedCssLoadResult {
  sheets: LinkedStylesheet[];
  errors: FloorFindingBase[];
}

interface ResolvedLinkEntry {
  link: DiscoveredLink;
  sheet?: LinkedStylesheet;
}

interface ResolvedLinkedCss {
  entries: ResolvedLinkEntry[];
  sheets: LinkedStylesheet[];
  errors: FloorFindingBase[];
}

function resolveLinkedCssEntries(htmlPath: string, html: string): ResolvedLinkedCss {
  const baseDir = dirname(resolve(htmlPath));
  const links = discoverStylesheetLinks(html);
  const entries: ResolvedLinkEntry[] = [];
  const sheets: LinkedStylesheet[] = [];
  const errors: FloorFindingBase[] = [];

  for (const link of links) {
    if (isRemoteHref(link.href)) {
      entries.push({ link });
      continue;
    }
    const cleanPath = cleanHrefPath(link.href);
    const resolvedPath = resolve(baseDir, cleanPath);
    const r = readLocalFile(resolvedPath);
    if (!r.ok) {
      errors.push(unreadableFinding("linked stylesheet", link.href, resolvedPath, r.message));
      entries.push({ link });
      continue;
    }
    const sheet: LinkedStylesheet = {
      href: link.href,
      resolvedPath,
      text: expandImportsOnce(resolvedPath, r.text, errors),
    };
    sheets.push(sheet);
    entries.push({ link, sheet });
  }

  return { entries, sheets, errors };
}

/**
 * Discover and read every LOCAL `<link rel="stylesheet">` an HTML document
 * pulls in, resolved relative to `htmlPath`'s directory, one level of
 * `@import` deep. Order matches document order; duplicate hrefs yield one
 * entry per occurrence.
 */
export function loadLinkedCss(htmlPath: string, html: string): LinkedCssLoadResult {
  const { sheets, errors } = resolveLinkedCssEntries(htmlPath, html);
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
  const { entries, sheets, errors } = resolveLinkedCssEntries(htmlPath, html);
  if (sheets.length === 0) return { html, errors };

  let out = "";
  let lastIndex = 0;
  for (const entry of entries) {
    if (entry.sheet === undefined) continue;
    out += html.slice(lastIndex, entry.link.startIndex);
    out += `<style data-ui-linked-href="${escapeHtmlAttr(entry.sheet.href)}">\n${entry.sheet.text}\n</style>`;
    lastIndex = entry.link.endIndex + 1;
  }
  out += html.slice(lastIndex);

  return { html: out, errors };
}
