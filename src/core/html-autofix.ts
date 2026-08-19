/**
 * Deterministic HTML autofix rules — pure string/regex transforms, zero deps.
 *
 * The registered rules run in sequence; each returns the (possibly modified) HTML and a
 * boolean indicating whether it fired. runAutofix threads the HTML through all
 * five and returns the final string plus a findings list.
 *
 * Ported from EaseUI autofixer-rules.ts with two changes:
 *   - AutofixFinding drops the redundant `applied` field (every entry fired).
 *   - fixImgOnerror's injected fallback script uses picsum → SVG only;
 *     the /api/unsplash/search fetch step is removed (dead endpoint in ease-design).
 */
import { getImageFallbackScriptInline } from "./html-img-fallback-script.js";
import { fixHoverMediaGuard, fixTableTabularNums, fixFocusOutlineRestore } from "./html-autofix-floor-repairs.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutofixFinding {
  ruleId: string;
  description: string;
}

export interface AutofixResult {
  html: string;
  findings: AutofixFinding[];
}

// ─── Rule implementations ─────────────────────────────────────────────────────

/**
 * viewport-meta: insert viewport meta tag when absent and a <head> tag exists.
 * Guards against double-apply via the presence check on the regex match.
 */
export function fixViewportMeta(html: string): { html: string; applied: boolean } {
  if (/<meta[^>]*name=["']viewport["'][^>]*>/i.test(html)) {
    return { html, applied: false };
  }
  const headMatch = html.match(/<head[^>]*>/i);
  if (!headMatch) return { html, applied: false };

  const insertPos = headMatch.index! + headMatch[0].length;
  const tag = '\n<meta name="viewport" content="width=device-width, initial-scale=1.0">';
  const fixed = html.slice(0, insertPos) + tag + html.slice(insertPos);
  return { html: fixed, applied: true };
}

/**
 * Sentinel string that appears in the injected IIFE definition but NOT in the
 * onerror attribute. Used to detect whether the fallback script block is already
 * present so we do not inject it twice.
 *
 * The onerror attr calls `window.__imgFallback(this)` — a call site.
 * The IIFE defines `window.__imgFallback=function` — the definition marker.
 * Checking for the definition (not just the symbol name) is idempotent-safe.
 */
const IIFE_DEFINITION_MARKER = "window.__imgFallback=function";

/**
 * img-onerror: add onerror fallback to every <img> that lacks one.
 * If any img is modified and the fallback IIFE is not yet defined in the page,
 * inject the IIFE script block before </body>. Cascade: picsum → SVG.
 */
export function fixImgOnerror(html: string): { html: string; applied: boolean } {
  let applied = false;
  const fallback = `onerror="this.onerror=null;if(window.__imgFallback)window.__imgFallback(this);else this.src='https://picsum.photos/seed/fallback/800/600';"`;
  let fixed = html.replace(
    /<img(?![^>]*onerror)([^>]*?)(\s*\/?>)/gi,
    (_match, attrs: string, close: string) => {
      applied = true;
      return `<img${attrs} ${fallback}${close}`;
    },
  );

  // Guard: check for the IIFE *definition* marker, not the symbol name.
  // The onerror attribute contains the call site (`window.__imgFallback(this)`)
  // but never the definition (`window.__imgFallback=function`), so this check
  // is true only when the IIFE block is genuinely absent.
  if (applied && !fixed.includes(IIFE_DEFINITION_MARKER)) {
    const bodyEnd = fixed.lastIndexOf("</body>");
    if (bodyEnd !== -1) {
      const script = getImageFallbackScriptInline();
      fixed = fixed.slice(0, bodyEnd) + "\n" + script + "\n" + fixed.slice(bodyEnd);
    }
  }

  return { html: fixed, applied };
}

/**
 * lucide-createicons: insert lucide.createIcons() before </body> when Lucide
 * icons are used but the initialisation call is absent.
 *
 * Evidence of Lucide usage requires at least one of:
 *   - A data-lucide= attribute (icon element)
 *   - A lucide script/CDN source URL (script tag loading the library)
 * A bare substring match on "lucide" is intentionally avoided to prevent false
 * positives on prose text or CSS class names that contain the word.
 */
export function fixLucideCreateIcons(html: string): { html: string; applied: boolean } {
  const usesLucide =
    /data-lucide\s*=/i.test(html) ||
    /src\s*=\s*["'][^"']*lucide[^"']*["']/i.test(html);
  if (!usesLucide) return { html, applied: false };

  const hasCreateIcons = /lucide\.createIcons\s*\(\s*\)/i.test(html);
  if (hasCreateIcons) return { html, applied: false };

  const bodyEnd = html.lastIndexOf("</body>");
  if (bodyEnd === -1) return { html, applied: false };

  const script = "\n<script>lucide.createIcons();</script>\n";
  const fixed = html.slice(0, bodyEnd) + script + html.slice(bodyEnd);
  return { html: fixed, applied: true };
}

/**
 * cdn-urls: replace versioned Lucide unpkg URLs with @latest.
 * Already-@latest URLs are left untouched (idempotent).
 */
export function fixCdnUrls(html: string): { html: string; applied: boolean } {
  let applied = false;
  const fixed = html.replace(
    /https:\/\/unpkg\.com\/lucide@[\d.]+\//g,
    (match) => {
      const latest = "https://unpkg.com/lucide@latest/";
      if (match !== latest) {
        applied = true;
        return latest;
      }
      return match;
    },
  );
  return { html: fixed, applied };
}

/**
 * duplicate-ids: append -N suffix to the 2nd+ occurrence of any duplicated
 * id="..." value. First occurrence is unchanged.
 *
 * Idempotence: the suffix candidate is incremented until it does not collide
 * with any id already present in the document (original or previously assigned
 * during this pass). This prevents a second run from finding new duplicates
 * that were introduced by a naive rename of the first run.
 */
export function fixDuplicateIds(html: string): { html: string; applied: boolean } {
  // Only REAL id attributes count: scan a mask with style/script/comment regions
  // blanked (a CSS [id="x"] selector or an id in a script string is not an
  // element), and anchor the attribute name so data-*-id never matches. The
  // chart goldens' data-focal-id and a [id="dlg"] selector both burned this.
  const blankKeepLen = (m: string): string => " ".repeat(m.length);
  const mask = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, blankKeepLen)
    .replace(/<!--[\s\S]*?-->/g, blankKeepLen);
  const ID_ATTR = /(?<![-\w:])id=(["'])([^"']+)\1/g;

  // Collect the full set of existing ids before any rewriting.
  const existingIds = new Set<string>();
  for (const m of mask.matchAll(ID_ATTR)) {
    existingIds.add(m[2] ?? "");
  }

  const seenCounts = new Map<string, number>();
  const edits: Array<{ start: number; end: number; text: string }> = [];

  for (const m of mask.matchAll(ID_ATTR)) {
    const quote = m[1] ?? '"';
    const id = m[2] ?? "";
    const count = seenCounts.get(id) ?? 0;
    seenCounts.set(id, count + 1);
    if (count === 0) continue; // first occurrence — keep as-is

    // Find the lowest suffix N (starting at count) such that `id-N` is not
    // already present in the document, and remember it so later duplicates in
    // this same pass won't reuse it.
    let n = count;
    while (existingIds.has(`${id}-${n}`)) {
      n++;
    }
    const newId = `${id}-${n}`;
    existingIds.add(newId);
    edits.push({ start: m.index, end: m.index + m[0].length, text: `id=${quote}${newId}${quote}` });
  }

  // Positions come from the mask; edits land on the original (lengths match).
  let fixed = html;
  for (const e of edits.reverse()) fixed = fixed.slice(0, e.start) + e.text + fixed.slice(e.end);
  return { html: fixed, applied: edits.length > 0 };
}

// ─── Rule registry + orchestrator ────────────────────────────────────────────

const RULES = [
  { id: "viewport-meta",     fn: fixViewportMeta,     desc: "Added viewport meta tag" },
  { id: "img-onerror",       fn: fixImgOnerror,       desc: "Added image fallback handlers" },
  { id: "lucide-createicons",fn: fixLucideCreateIcons, desc: "Added lucide.createIcons() call" },
  { id: "cdn-urls",          fn: fixCdnUrls,          desc: "Fixed outdated CDN URLs" },
  { id: "duplicate-ids",     fn: fixDuplicateIds,     desc: "Fixed duplicate element IDs" },
  // Floor repairs — CSS/attribute-only fixes for linted floors; each is gated by
  // its own checker (see html-autofix-floor-repairs.ts) and never touches copy.
  { id: "hover-media-guard",     fn: fixHoverMediaGuard,     desc: "Wrapped raw :hover rules in @media (hover: hover)" },
  { id: "table-tabular-nums",    fn: fixTableTabularNums,    desc: "Added tabular figures to numeric table columns" },
  { id: "focus-outline-restore", fn: fixFocusOutlineRestore, desc: "Restored the focus ring (removed outline-killing declarations)" },
] as const;

/** Apply every rule in order. Returns fixed HTML + list of rules that fired. */
export function runAutofix(html: string): AutofixResult {
  let current = html;
  const findings: AutofixFinding[] = [];

  for (const rule of RULES) {
    const { html: fixed, applied } = rule.fn(current);
    current = fixed;
    if (applied) {
      findings.push({ ruleId: rule.id, description: rule.desc });
    }
  }

  return { html: current, findings };
}
