/** Pure local filesystem asset data-URI inliner for `ui designmd snapshot`. */
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

export interface CssUrlMatch { fullMatch: string; url: string; startIndex: number; endIndex: number; }
export interface InlineAssetsOptions { baseDir: string; fallbackBaseDir?: string; maxAssetBytes?: number; }
export interface InlineAssetsResult { html: string; inlinedAssets: number; skippedAssets: number; }

const DEFAULT_MAX_ASSET_BYTES = 5 * 1024 * 1024;
const MAX_URL_TOKEN_LEN = 2048;
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
};
const SKIP_SCHEME_RE = /^(?:#|data:|blob:|javascript:|mailto:|\/\/|https?:)/i;

function isWordBoundaryBeforeUrl(css: string, idx: number): boolean {
  return idx === 0 || !/[a-zA-Z0-9_-]/.test(css[idx - 1] ?? "");
}

/** Strictly O(N) character scanner for CSS `url(...)` expressions (CSS Syntax Level 3). */
export function extractCssUrls(css: string): CssUrlMatch[] {
  const matches: CssUrlMatch[] = [];
  const lower = css.toLowerCase();
  let i = 0;

  while (i < css.length) {
    const idx = lower.indexOf("url(", i);
    if (idx === -1) break;
    if (!isWordBoundaryBeforeUrl(css, idx)) { i = idx + 4; continue; }

    let j = idx + 4;
    while (j < css.length && (css[j] === " " || css[j] === "\t")) j++;
    const limit = Math.min(css.length, idx + MAX_URL_TOKEN_LEN);
    const quote = css[j] === '"' || css[j] === "'" ? css[j] : undefined;
    let url = "";
    let endIndex = -1;

    if (quote !== undefined) {
      j++;
      while (j < limit) {
        const c = css[j] ?? "";
        if (c === "\n" || c === "\r") break;
        if (c === "\\" && j + 1 < limit) { url += css[j + 1] ?? ""; j += 2; continue; }
        if (c === quote) {
          j++;
          while (j < limit && (css[j] === " " || css[j] === "\t")) j++;
          if (css[j] === ")") endIndex = j + 1;
          break;
        }
        url += c;
        j++;
      }
    } else {
      while (j < limit) {
        const c = css[j] ?? "";
        if (c === "\\" && j + 1 < limit) { url += css[j + 1] ?? ""; j += 2; continue; }
        if (c === ")") { endIndex = j + 1; break; }
        if (c === "(" || c === '"' || c === "'" || c === "\n" || c === "\r" || c === ";" || c === "}") break;
        url += c;
        j++;
      }
      url = url.trim();
    }

    if (endIndex !== -1) {
      matches.push({ fullMatch: css.slice(idx, endIndex), url, startIndex: idx, endIndex });
      i = endIndex;
    } else {
      i = Math.max(idx + 4, j);
    }
  }
  return matches;
}

function readContainedAsset(relCandidate: string, baseRoot: string, realRoot: string | null, mime: string, maxBytes: number): string | null {
  if (realRoot === null || isAbsolute(relCandidate)) return null;
  const lexicalTarget = resolve(baseRoot, relCandidate);
  const relLexical = relative(baseRoot, lexicalTarget);
  if (relLexical.length === 0 || relLexical.startsWith("..") || isAbsolute(relLexical)) return null;

  let fd: number | undefined;
  try {
    const realTarget = realpathSync(lexicalTarget);
    const relReal = relative(realRoot, realTarget);
    if (relReal.length === 0 || relReal.startsWith("..") || isAbsolute(relReal)) return null;
    fd = openSync(realTarget, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > maxBytes) return null;
    return `data:${mime};base64,${readFileSync(fd).toString("base64")}`;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}

function resolveLocalAsset(
  rawUrl: string, roots: readonly { base: string; real: string | null }[], maxBytes: number,
): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0 || SKIP_SCHEME_RE.test(trimmed)) return null;
  const hashIdx = trimmed.indexOf("#");
  const fragment = hashIdx !== -1 ? trimmed.slice(hashIdx) : "";
  const noHash = hashIdx !== -1 ? trimmed.slice(0, hashIdx) : trimmed;
  const queryIdx = noHash.indexOf("?");
  const rawPath = queryIdx !== -1 ? noHash.slice(0, queryIdx) : noHash;
  if (rawPath.length === 0) return null;

  let decodedPath = rawPath;
  try { decodedPath = decodeURIComponent(rawPath); } catch { return null; }
  const isRootRel = decodedPath.startsWith("/");
  const relCandidate = isRootRel ? decodedPath.slice(1) : decodedPath;
  const ext = extname(relCandidate).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (mime === undefined || (ext === ".svg" && fragment.length > 0)) return null;

  const ordered = isRootRel && roots.length > 1 ? [roots[roots.length - 1]!, roots[0]!] : roots;
  for (const r of ordered) {
    const uri = readContainedAsset(relCandidate, r.base, r.real, mime, maxBytes);
    if (uri !== null) return uri;
  }
  return null;
}

function buildRoots(opts: InlineAssetsOptions): { base: string; real: string | null }[] {
  const out: { base: string; real: string | null }[] = [];
  for (const dir of [opts.baseDir, opts.fallbackBaseDir]) {
    if (!dir) continue;
    const base = resolve(dir);
    if (out.some((r) => r.base === base)) continue;
    try { out.push({ base, real: realpathSync(base) }); } catch { out.push({ base, real: null }); }
  }
  return out;
}

function createInliner(opts: InlineAssetsOptions) {
  const roots = buildRoots(opts);
  const maxBytes = opts.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES;
  let inlinedAssets = 0;
  let skippedAssets = 0;
  const cache = new Map<string, string | null>();
  const tryInline = (rawUrl: string): string | null => {
    const trimmed = rawUrl.trim();
    if (trimmed.length === 0 || SKIP_SCHEME_RE.test(trimmed)) return null;
    const cached = cache.get(trimmed);
    const dataUri = cached !== undefined ? cached : resolveLocalAsset(trimmed, roots, maxBytes);
    if (cached === undefined) cache.set(trimmed, dataUri);
    if (dataUri === null) { skippedAssets++; return null; }
    inlinedAssets++;
    return dataUri;
  };
  const rewriteCss = (css: string): string => {
    const urls = extractCssUrls(css);
    let next = css;
    for (let k = urls.length - 1; k >= 0; k--) {
      const m = urls[k]!;
      const dataUri = tryInline(m.url);
      if (dataUri !== null) next = `${next.slice(0, m.startIndex)}url("${dataUri}")${next.slice(m.endIndex)}`;
    }
    return next;
  };
  return { tryInline, rewriteCss, stats: () => ({ inlinedAssets, skippedAssets }) };
}

export function inlineLocalCssAssets(css: string, opts: InlineAssetsOptions): InlineAssetsResult {
  const inliner = createInliner(opts);
  return { html: inliner.rewriteCss(css), ...inliner.stats() };
}

export function inlineLocalSnapshotAssets(html: string, opts: InlineAssetsOptions): InlineAssetsResult {
  const { tryInline, rewriteCss, stats } = createInliner(opts);
  let out = html.replace(/(\b(?:src|poster)\s*=\s*)(["'])([^"']*)\2/gi, (m, pre: string, q: string, val: string) => {
    const dataUri = tryInline(val);
    return dataUri !== null ? `${pre}${q}${dataUri}${q}` : m;
  });
  out = out.replace(/<image\b[^>]*>/gi, (tag) =>
    tag.replace(/(\b(?:xlink:href|href)\s*=\s*)(["'])([^"']*)\2/gi, (m, pre: string, q: string, val: string) => {
      const dataUri = tryInline(val);
      return dataUri !== null ? `${pre}${q}${dataUri}${q}` : m;
    }),
  );
  out = out.replace(/(\b(?:srcset|srcSet)\s*=\s*)(["'])([^"']*)\2/g, (_m, pre: string, q: string, val: string) => {
    const fixed = val.split(",").map((part) => {
      const lead = /^(\s*)(\S+)([\s\S]*)$/.exec(part);
      if (!lead) return part;
      const dataUri = tryInline(lead[2] ?? "");
      return dataUri !== null ? `${lead[1]}${dataUri}${lead[3]}` : part;
    }).join(",");
    return `${pre}${q}${fixed}${q}`;
  });
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, body: string, close: string) =>
    `${open}${rewriteCss(body)}${close}`,
  );
  out = out.replace(/(\bstyle\s*=\s*)(["'])([^"']*)\2/gi, (_m, pre: string, q: string, val: string) =>
    `${pre}${q}${rewriteCss(val)}${q}`,
  );
  return { html: out, ...stats() };
}
