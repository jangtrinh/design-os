/**
 * HTML → DOM, with source offsets kept on every node.
 *
 * `parseDocument` returns `startIndex: null` unless the index options are on,
 * and without offsets a finding has no line number — which makes it a verdict
 * nobody can act on. So the options are not optional here.
 *
 * Stylesheets are collected but never fetched. A remote `<link>` is a DECLARED
 * unresolved input: it appears in `unresolvedSheets` so the caller can say the
 * document was only partly seen, rather than reporting a clean bill of health
 * over CSS it never read. The binary stays deterministic and offline.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { parseDocument } from "htmlparser2";
import * as du from "domutils";
import type { Document, Element, AnyNode } from "domhandler";

/** One stylesheet found in the document, with the offset its text starts at. */
export interface EmbeddedSheet {
  css: string;
  /** Byte offset of the sheet's first character inside the HTML source. */
  offset: number;
  /**
   * Set when the sheet came from a linked local file. Its declarations' line
   * numbers belong to THAT file, so the cascade reports them against the
   * `<link>` element rather than inventing an HTML line.
   */
  externalPath?: string;
}

export interface ParsedHtml {
  doc: Document;
  sheets: EmbeddedSheet[];
  /** hrefs of stylesheets that exist but were deliberately not fetched. */
  unresolvedSheets: string[];
  /** Set when the document could not be fully parsed; findings are an undercount. */
  degraded: boolean;
  degradeReason?: string;
  /** The original source, needed to turn an offset into a line. */
  source: string;
}

/**
 * Where a `<link rel=stylesheet>` href points, when it points at a local file.
 *
 * Real projects keep their CSS in files, not in `<style>`. Reading only inline
 * sheets was a hole fixtures hid completely: the repo's own `site/index.html`
 * has one `<style>` and three linked sheets, so an inline-only engine reported
 * a page with no colours at all.
 *
 * Local files are read from the SAME filesystem the linter is already reading.
 * That is not a network fetch and does not weaken determinism. `http(s)://`,
 * protocol-relative and `data:` hrefs stay unresolved and are declared as such.
 */
function localSheetPath(href: string, htmlPath: string | undefined): string | undefined {
  if (/^(?:[a-z]+:)?\/\//i.test(href) || href.startsWith("data:")) return undefined;
  if (htmlPath === undefined) return undefined;
  const clean = href.split(/[?#]/)[0] as string;
  if (clean === "") return undefined;
  const base = dirname(htmlPath);
  const abs = isAbsolute(clean) ? clean : resolve(base, clean);
  return existsSync(abs) ? abs : undefined;
}

/**
 * Parse HTML into a DOM that carries source offsets. Never throws.
 *
 * `htmlPath` enables reading linked LOCAL stylesheets; omit it and every link is
 * reported unresolved rather than silently ignored.
 */
export function parseHtml(html: string, htmlPath?: string): ParsedHtml {
  let doc: Document;
  try {
    doc = parseDocument(html, {
      withStartIndices: true,
      withEndIndices: true,
      lowerCaseAttributeNames: true,
      lowerCaseTags: true,
    });
  } catch (err) {
    return {
      doc: parseDocument(""),
      sheets: [],
      unresolvedSheets: [],
      degraded: true,
      degradeReason: `HTML did not parse: ${(err as Error).message}`,
      source: html,
    };
  }

  const sheets: EmbeddedSheet[] = [];
  const unresolvedSheets: string[] = [];

  for (const el of du.findAll((n): n is Element => isTag(n), doc.children)) {
    const tag = el.tagName.toLowerCase();
    if (tag === "style") {
      const text = du.textContent(el);
      if (text.trim() !== "") {
        // The child text node's own startIndex is the sheet's first character.
        const first = el.children[0];
        sheets.push({ css: text, offset: first?.startIndex ?? el.startIndex ?? 0 });
      }
    } else if (tag === "link") {
      const rel = (el.attribs["rel"] ?? "").toLowerCase();
      const href = el.attribs["href"];
      if (!rel.includes("stylesheet") || href === undefined || href === "") continue;
      const local = localSheetPath(href, htmlPath);
      if (local === undefined) {
        unresolvedSheets.push(href);
        continue;
      }
      try {
        // offset -1 marks "from another file": line numbers for these
        // declarations belong to that file, not to the HTML, so they are
        // reported against the <link> element instead of an invented HTML line.
        sheets.push({ css: readFileSync(local, "utf8"), offset: el.startIndex ?? 0, externalPath: local });
      } catch {
        unresolvedSheets.push(href);
      }
    }
  }

  return { doc, sheets, unresolvedSheets, degraded: false, source: html };
}

/** True for element nodes. Narrow helper so callers stop importing domhandler. */
export function isTag(node: AnyNode): node is Element {
  return node.type === "tag" || node.type === "script" || node.type === "style";
}

/** Every element in document order. */
export function elements(doc: Document): Element[] {
  return du.findAll((n): n is Element => isTag(n), doc.children);
}

/** 1-based line of a byte offset in the source. */
export function lineOfOffset(source: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) if (source[i] === "\n") line++;
  return line;
}

/** The element's own line, or 1 when offsets are unavailable. */
export function lineOfElement(source: string, el: Element): number {
  return lineOfOffset(source, el.startIndex ?? 0);
}

/**
 * A stable, human-readable locator: `body > div.card > p[1]`.
 *
 * Stability matters more than precision — the stuck detector keys error identity
 * on (checkId, nodeRef, expected), so a locator that renumbers on unrelated
 * edits makes churn look like progress (finding-schema.ts).
 */
export function nodeRef(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur !== null) {
    const cls = (cur.attribs["class"] ?? "").trim().split(/\s+/).filter(Boolean)[0];
    const siblings = du
      .getSiblings(cur)
      .filter((s): s is Element => isTag(s) && s.tagName === cur?.tagName);
    const idx = siblings.length > 1 ? `[${siblings.indexOf(cur)}]` : "";
    parts.unshift(`${cur.tagName}${cls !== undefined ? `.${cls}` : ""}${idx}`);
    const parent = du.getParent(cur);
    cur = parent !== null && parent.type !== "root" && isTag(parent as AnyNode) ? (parent as Element) : null;
  }
  return parts.join(" > ");
}

/** Visible text of an element, whitespace-collapsed. */
export function textOf(el: Element): string {
  return du.textContent(el).replace(/\s+/g, " ").trim();
}
