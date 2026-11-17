/**
 * Static preview transform for `ui designmd snapshot`.
 * Inlines CSS, strips scripts/preloads/dev-overlays, cleans reveal styles, and absolutises root-relative URLs.
 */

export interface CssChunk { name: string; body: string; }
export interface SnapshotTransformOptions { unlockScroll?: boolean; }
export interface SnapshotResult {
  html: string;
  removed: {
    scripts: number;
    preloads: number;
    inlineOpacityHides: number;
    inlineTransformTranslates: number;
    cssInlined: number;
    devOverlays: number;
  };
}

const OVERLAY_ATTR_RE = /(?:^|[\s"'])(?:data-nextjs-dialog-overlay|data-parcel-error-overlay|data-v-inspector)(?=[\s=>/])|\bdata-screenshot-ignore\s*=\s*(?:"true"|'true')|\bid\s*=\s*(?:"webpack-dev-server-client-overlay"|'webpack-dev-server-client-overlay')/i;
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function findMatchingClose(html: string, tag: string, from: number): number {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagRe = new RegExp(`<(/?)(?:${escaped})(?=[\\s>/])(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi");
  tagRe.lastIndex = from;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[1] === "/") {
      depth--;
      if (depth === 0) return match.index + match[0].length;
    } else if (!match[0].endsWith("/>")) {
      depth++;
    }
  }
  return -1;
}

function stripTaggedOverlays(html: string): { html: string; count: number } {
  let out = "";
  let copyFrom = 0;
  let searchFrom = 0;
  let count = 0;
  const openTagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  while (searchFrom < html.length) {
    openTagRe.lastIndex = searchFrom;
    const m = openTagRe.exec(html);
    if (!m) break;
    const tag = m[1] ?? "";
    const attrs = m[2] ?? "";
    if (!OVERLAY_ATTR_RE.test(attrs)) { searchFrom = m.index + m[0].length; continue; }
    const start = m.index;
    const afterOpen = start + m[0].length;
    const isVoid = attrs.trimEnd().endsWith("/") || VOID_TAGS.has(tag.toLowerCase());
    const closeEnd = isVoid ? afterOpen : findMatchingClose(html, tag, afterOpen);
    if (closeEnd === -1) { searchFrom = afterOpen; continue; }
    out += html.slice(copyFrom, start);
    copyFrom = closeEnd;
    searchFrom = closeEnd;
    count++;
  }
  return { html: out + html.slice(copyFrom), count };
}

function stripDevOverlays(html: string): { html: string; count: number } {
  let count = 0;
  let out = html.replace(/<(vite-error-overlay|nextjs-portal)\b[^>]*>(?:[\s\S]*?<\/\1>|\s*\/>)/gi, () => {
    count++;
    return "";
  });
  const tagged = stripTaggedOverlays(out);
  out = tagged.html;
  count += tagged.count;
  out = out.replace(/<style\b([^>]*)>/gi, (_m, attrs: string) =>
    `<style${attrs.replace(/\s+data-vite-dev-id=(?:"[^"]*"|'[^']*')/gi, "")}>`,
  );
  return { html: out, count };
}

function injectIntoHeadOrBody(doc: string, block: string): string {
  if (/<\/head>/i.test(doc)) return doc.replace(/<\/head>/i, (headEnd) => `${block}${headEnd}`);
  const bodyMatch = doc.match(/<body\b[^>]*>/i);
  return bodyMatch ? doc.replace(bodyMatch[0], () => `${block}${bodyMatch[0]}`) : block + doc;
}

/** Apply all static snapshot transforms to raw HTML using fetched CSS chunks and origin. */
export function transformSnapshot(
  html: string,
  css: CssChunk[],
  origin: string,
  options?: SnapshotTransformOptions,
): SnapshotResult {
  const removed = { scripts: 0, preloads: 0, inlineOpacityHides: 0, inlineTransformTranslates: 0, cssInlined: 0, devOverlays: 0 };

  let out = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*\/?>/gi, (match) => {
    const hrefMatch = match.match(/href="([^"]+)"/);
    return hrefMatch && /^(\/\/|https?:)/.test(hrefMatch[1] ?? "") ? match : "";
  });

  // Strip <script> tags before overlay cleanup so JS strings cannot trigger overlay matches.
  removed.scripts = (out.match(/<script\b/gi) ?? []).length;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<script\b[^>]*\/>/gi, "");

  const preloadRe = /<link\b[^>]*rel="(?:preload|prefetch|modulepreload|dns-prefetch|preconnect)"[^>]*\/?>/gi;
  removed.preloads = (out.match(/<link\b[^>]*rel="(?:preload|prefetch|modulepreload|dns-prefetch|preconnect)"/gi) ?? []).length;
  out = out.replace(preloadRe, "");

  const overlays = stripDevOverlays(out);
  out = overlays.html;
  removed.devOverlays = overlays.count;

  if (css.length > 0) {
    out = injectIntoHeadOrBody(out, css.map((chunk) => `<style data-source="${chunk.name}">${chunk.body}</style>`).join("\n"));
    removed.cssInlined = css.length;
  }

  if (options?.unlockScroll === true && !out.includes('data-ease-snapshot="unlock-scroll"')) {
    out = injectIntoHeadOrBody(
      out,
      '<style data-ease-snapshot="unlock-scroll">html,body{height:auto!important;min-height:100%!important;max-height:none!important;overflow:visible!important}</style>',
    );
  }

  // Sanitise scroll-reveal inline style sentinels (near-zero opacity + init transforms).
  out = out.replace(/style="([^"]*)"/g, (m, body: string) => {
    let s = body;
    let touched = false;
    s = s.replace(/(?:^|;)\s*opacity\s*:\s*([0-9]*\.?[0-9]+)\s*(?=;|$)/gi, (whole, valueRaw: string) => {
      const v = parseFloat(valueRaw);
      if (Number.isFinite(v) && v < 0.01) {
        removed.inlineOpacityHides++;
        touched = true;
        return "";
      }
      return whole;
    });
    if (/(?:^|;)\s*transform\s*:[^;]*(?:translate|scale|perspective)/i.test(s)) {
      s = s.replace(/(?:^|;)\s*transform\s*:[^;]*(?:translate|scale|perspective)[^;]*(?=;|$)/gi, "");
      removed.inlineTransformTranslates++;
      touched = true;
    }
    if (!touched) return m;
    s = s.replace(/^\s*;\s*/, "").replace(/;\s*;/g, ";").trim();
    return s.length === 0 ? "" : `style="${s}"`;
  });

  // Absolutise root-relative URLs.
  const cleanOrigin = origin.replace(/\/$/, "");
  out = out.replace(/(\s(?:src|href)=")\/(?!\/)/g, `$1${cleanOrigin}/`);
  out = out.replace(/\b(srcset|srcSet)="([^"]+)"/g, (_m, attr: string, val: string) => {
    const fixed = val.split(",").map((part) => part.trim().replace(/^\/(?!\/)/, `${cleanOrigin}/`)).join(", ");
    return `${attr}="${fixed}"`;
  });
  out = out.replace(/\burl\(\/(?!\/)/g, `url(${cleanOrigin}/`);

  return { html: out, removed };
}
