/**
 * Per-rule static-HTML a11y checks (see a11y-lint.ts). Each is a pure function of the
 * HTML string returning findings. Regex-based, precision-first: a rule fires only when
 * the violation is unambiguous from the markup alone.
 */
import { lineAt } from "./a11y-lint.js";
import type { A11yFinding } from "./a11y-lint.js";
import { isRedirectStub } from "./redirect-stub.js";
// Re-exported so existing importers of isRedirectStub from a11y-checks keep working —
// the detector itself now lives in redirect-stub.ts, shared with validate-layout (L4).
export { isRedirectStub } from "./redirect-stub.js";

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  if (m === null) return null;
  return m[2] ?? m[3] ?? m[4] ?? "";
}
function hasAttr(tag: string, name: string): boolean {
  return new RegExp(`\\b${name}(\\s*=|\\s|>|/)`, "i").test(tag);
}

// ── 1.1.1 Non-text content: every <img> needs an alt attribute (empty=decorative ok) ──
export function checkImgAlt(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!hasAttr(m[0], "alt")) {
      out.push({ checkId: "img-missing-alt", severity: "error", sc: "1.1.1",
        message: "<img> has no alt attribute (use alt=\"\" for decorative images)", line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── 3.1.1 Language of page: <html lang="…"> present + non-empty ──
export function checkHtmlLang(html: string): A11yFinding[] {
  if (isRedirectStub(html)) return [];
  const m = /<html\b[^>]*>/i.exec(html);
  const lang = m !== null ? attr(m[0], "lang") : null;
  if (m === null || lang === null || lang.trim() === "") {
    return [{ checkId: "html-lang", severity: "error", sc: "3.1.1",
      message: "the document has no <html lang=\"…\"> — screen readers can't pick a voice", line: m !== null ? lineAt(html, m.index) : 1 }];
  }
  return [];
}

// ── 2.4.2 Page titled: non-empty <title> ──
export function checkDocumentTitle(html: string): A11yFinding[] {
  if (isRedirectStub(html)) return [];
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (m === null || (m[1] ?? "").trim() === "") {
    return [{ checkId: "document-title", severity: "error", sc: "2.4.2",
      message: "the document has no non-empty <title>", line: m !== null ? lineAt(html, m.index) : 1 }];
  }
  return [];
}

// ── 2.4.3 Focus order: tabindex > 0 is an anti-pattern ──
export function checkPositiveTabindex(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  for (const m of html.matchAll(/\btabindex\s*=\s*("|')?(\d+)\1?/gi)) {
    if (Number.parseInt(m[2] as string, 10) > 0) {
      out.push({ checkId: "positive-tabindex", severity: "error", sc: "2.4.3",
        message: `tabindex="${m[2]}" hijacks focus order — use 0 or -1`, line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── 1.4.4 Resize text: viewport must not block zoom ──
export function checkViewportZoom(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  for (const m of html.matchAll(/<meta\b[^>]*name\s*=\s*("|')?viewport\1?[^>]*>/gi)) {
    const content = attr(m[0], "content") ?? "";
    const maxScale = /maximum-scale\s*=\s*([\d.]+)/i.exec(content);
    if (/user-scalable\s*=\s*(no|0)/i.test(content) || (maxScale !== null && Number.parseFloat(maxScale[1] as string) < 2)) {
      out.push({ checkId: "viewport-zoom-blocked", severity: "error", sc: "1.4.4",
        message: "viewport blocks zoom (user-scalable=no or maximum-scale<2)", line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── 1.4.10 Reflow: a mobile-responsive doc must declare a viewport meta ──
/** Mobile-intent signals: a responsive breakpoint prefix or a width-based media query. */
const MOBILE_INTENT = /\b(?:sm|md|lg|xl|2xl):[a-z[]/i;
const WIDTH_MEDIA = /@media[^{]*\(\s*(?:max|min)-width/i;

/**
 * checkViewportMetaPresent — the companion to checkViewportZoom (which flags a meta
 * that BLOCKS zoom). This flags a meta that is entirely MISSING on a document that
 * is clearly built to be responsive. Without `<meta name="viewport"
 * content="width=device-width…">`, mobile browsers render at a fake ~980px desktop
 * width and downscale, so the responsive breakpoints never fire. Precision-first:
 * only fires when the markup shows mobile intent (a responsive breakpoint class or a
 * width media query), so a print/email/desktop-only page is never nagged.
 */
export function checkViewportMetaPresent(html: string): A11yFinding[] {
  if (isRedirectStub(html)) return [];
  if (hasViewportMeta(html)) return [];
  if (!MOBILE_INTENT.test(html) && !WIDTH_MEDIA.test(html)) return [];
  return [{ checkId: "viewport-meta-missing", severity: "warning", sc: "1.4.10",
    message: "a responsive document has no <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> — mobile browsers render it at a fake ~980px desktop width and downscale, so the breakpoints never fire",
    line: 1 }];
}

// ── 4.1.2 / 2.4.4 Icon/emoji controls need an accessible name ──
const ICON_GLYPHS = "×✕✓✔▶◀▲▼☰≡⋮⋯…→←↑↓«»‹›⌄⌃✚＋−✖☆★♥♡⚙🔍";
// eslint-disable-next-line no-misleading-character-class
const EMOJI_OR_GLYPH = new RegExp(`^(?:[\\p{Extended_Pictographic}\\uFE0F\\u200D${ICON_GLYPHS}\\s]|[\\u{1F1E6}-\\u{1F1FF}])+$`, "u");

export function checkIconControlUnnamed(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  const re = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(re)) {
    const openAttrs = m[2] ?? "";
    const inner = m[3] ?? "";
    // A programmatic name via ARIA/title exempts it.
    if (hasAttr(openAttrs, "aria-label") || hasAttr(openAttrs, "aria-labelledby") || hasAttr(openAttrs, "title")) continue;
    // A nested <img alt>/<svg><title> also names it; be conservative and skip those.
    if (/<img\b[^>]*\balt\s*=\s*("|')?[^"'\s>]+/i.test(inner) || /<title\b/i.test(inner)) continue;
    const text = inner.replace(/<[^>]*>/g, "").replace(/&[a-z#0-9]+;/gi, " ").trim();
    if (text === "" || EMOJI_OR_GLYPH.test(text)) {
      const kind = text === "" ? "an icon-only control has no accessible name" : `an emoji/glyph ("${text}") is used as a control with no accessible name`;
      out.push({ checkId: "icon-control-unnamed", severity: "error", sc: "4.1.2",
        message: `${kind} — add aria-label (never rely on an emoji/glyph as the name)`, line: lineAt(html, m.index) });
    }
  }
  return out;
}

// ── 3.3.8 Accessible authentication: never block paste ──
/** An inline onpaste handler that cancels the event (return false / preventDefault). */
const ONPASTE_BLOCKING = /\bonpaste\s*=\s*("([^"]*)"|'([^']*)')/gi;
/** Head of a scripted paste listener; the handler text is paren-matched from here. */
const PASTE_LISTENER_HEAD = /addEventListener\(\s*["']paste["']\s*,/gi;
/**
 * A handler that touches the clipboard content is re-inserting, not blocking —
 * the paste-as-plain-text idiom (preventDefault + getData + insertText) is the
 * OPPOSITE of a 3.3.8 violation and must never flag.
 */
const CLIPBOARD_REINSERT = /clipboardData|getData|insertText|execCommand/i;

/**
 * checkPasteBlocked — blocking paste breaks password managers and one-time-code
 * entry (WCAG 2.2 SC 3.3.8 Accessible Authentication: no cognitive-function test
 * such as retyping). Fires only on POSITIVE cancel evidence, and only inside the
 * paste handler itself:
 *   - an `onpaste` attribute that returns false / calls preventDefault → ERROR
 *     (the handler text is fully visible, so the evidence is unambiguous);
 *   - a scripted `paste` listener whose paren-matched argument text calls
 *     preventDefault → WARNING (a regex cannot prove runtime semantics).
 * Both forms are exempt when the handler touches the clipboard content — that
 * is a re-insert, not a block. A handler that merely observes never flags, and
 * paren-matching confines the search to THIS listener, so a neighboring
 * handler's preventDefault can never bleed in.
 */
export function checkPasteBlocked(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  for (const m of html.matchAll(ONPASTE_BLOCKING)) {
    const handler = m[2] ?? m[3] ?? "";
    if ((/return\s+false|preventDefault/i.test(handler)) && !CLIPBOARD_REINSERT.test(handler)) {
      out.push({ checkId: "paste-blocked", severity: "error", sc: "3.3.8",
        message: "paste is blocked (onpaste cancels the event) — people paste passwords and one-time codes; never block paste", line: lineAt(html, m.index) });
    }
  }
  let lm: RegExpExecArray | null;
  PASTE_LISTENER_HEAD.lastIndex = 0;
  while ((lm = PASTE_LISTENER_HEAD.exec(html)) !== null) {
    // Walk to the ')' matching addEventListener's '(' — the argument list holds
    // exactly this listener's handler, however it is written (arrow, function, ref).
    let depth = 1;
    let i = PASTE_LISTENER_HEAD.lastIndex;
    while (i < html.length && depth > 0) {
      const ch = html[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    const handler = html.slice(PASTE_LISTENER_HEAD.lastIndex, i - 1);
    if (/preventDefault/i.test(handler) && !CLIPBOARD_REINSERT.test(handler)) {
      out.push({ checkId: "paste-blocked", severity: "warning", sc: "3.3.8",
        message: "a paste listener calls preventDefault without re-inserting the clipboard text — people paste passwords and one-time codes; never block paste", line: lineAt(html, lm.index) });
    }
    PASTE_LISTENER_HEAD.lastIndex = i;
  }
  return out;
}

/** True when the document declares a viewport meta — the mobile-intent signal
 *  shared by checkViewportMetaPresent and layout-checks-hover (one definition). */
export function hasViewportMeta(html: string): boolean {
  return /<meta\b[^>]*name\s*=\s*("|')?viewport\1?/i.test(html);
}

// ── 1.3.1 / 2.4.6 Heading hierarchy: no skipped level, no empty heading ──
export function checkHeadingHierarchy(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  let prev = 0;
  let sawAny = false;
  for (const m of html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const level = Number.parseInt(m[1] as string, 10);
    const text = (m[2] ?? "").replace(/<[^>]*>/g, "").trim();
    sawAny = true;
    if (text === "") {
      out.push({ checkId: "heading-empty", severity: "warning", sc: "2.4.6", message: `empty <h${level}>`, line: lineAt(html, m.index) });
    }
    if (prev > 0 && level > prev + 1) {
      out.push({ checkId: "heading-skip", severity: "warning", sc: "1.3.1",
        message: `heading jumps from h${prev} to h${level} (skips a level)`, line: lineAt(html, m.index) });
    }
    prev = level;
  }
  if (sawAny && !/<h1\b/i.test(html)) {
    out.push({ checkId: "heading-no-h1", severity: "warning", sc: "1.3.1", message: "the document has headings but no <h1>", line: 1 });
  }
  return out;
}
