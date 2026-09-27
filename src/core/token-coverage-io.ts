/**
 * token-coverage-io.ts — filesystem glue for the token-coverage check: find
 * the project's token file and gather every CSS source (the HTML itself, plus
 * locally linked stylesheets) an artifact pulls in. Impure by necessity; the
 * classification logic itself stays pure (token-coverage-extract/classify.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tryDiscoverDesignSystem } from "./design-system.js";
import { parseTokenFile } from "./token-model.js";
import { resolveTokens } from "./token-resolve.js";
import { scoreCssSources } from "./token-coverage.js";
import type { TokenCoverageResult } from "./token-coverage.js";

export interface CssSource {
  text: string;
  isHtmlSource: boolean;
}

/**
 * The design-dir contract first (walks up from `startDir` looking for
 * design/design.tokens.json, stopping at a .git boundary — same walk `ui gate
 * coverage` and `ui ds-usage-lint` use), then this project's own brand/
 * convention (brand/design/design.tokens.json), walked the same way — an
 * artifact several directories below the repo root (e.g. acceptance/<set>/)
 * must still find the project's calibration tokens at the repo root. Returns
 * undefined when neither exists — auto-detection failing is a normal answer,
 * not an error.
 */
export function resolveProjectTokensPath(startDir: string): string | undefined {
  const ds = tryDiscoverDesignSystem(startDir);
  if (ds !== undefined && existsSync(ds.tokens)) return ds.tokens;

  let cur = resolve(startDir);
  for (let level = 0; level < 5; level++) {
    const brandTokens = resolve(cur, "brand", "design", "design.tokens.json");
    if (existsSync(brandTokens)) return brandTokens;
    if (existsSync(resolve(cur, ".git"))) break; // stop at repo root, same boundary as discoverDesignSystem
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return undefined;
}

function extractLinkedStylesheetPaths(html: string, baseDir: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (rel === undefined || href === undefined || !/stylesheet/i.test(rel)) continue;
    // Read-only local files: skip remote (http(s)://, protocol-relative //) and data: URLs.
    if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(href) || href.startsWith("data:")) continue;
    out.push(resolve(baseDir, href));
  }
  return out;
}

/**
 * Every CSS source an HTML file's own markup pulls in: the HTML text itself
 * (inline style="" attributes and <style> blocks both live inside it — see
 * extractDeclarations) plus every local linked stylesheet, read best-effort —
 * a missing or unreadable linked file is skipped, never a hard error, so the
 * check still judges everything it COULD read.
 */
export function collectCssSources(htmlPath: string, html: string): CssSource[] {
  const baseDir = dirname(resolve(htmlPath));
  const sources: CssSource[] = [{ text: html, isHtmlSource: true }];
  for (const cssPath of extractLinkedStylesheetPaths(html, baseDir)) {
    try {
      sources.push({ text: readFileSync(cssPath, "utf8"), isHtmlSource: false });
    } catch {
      // unreadable/missing linked stylesheet — skip, don't fail the read.
    }
  }
  return sources;
}

/**
 * `ui gate`'s auto-detected token-coverage check (A2): resolve the project's
 * token file for `htmlPath`'s directory and score it, or return undefined
 * when no token file is auto-detectable, or when the auto-detected file is
 * unreadable/invalid — best-effort, same posture as "not found" (an EXPLICIT
 * `--tokens` path stays the caller's job to validate loudly; this one was
 * never asked for).
 */
export function autoScoreTokenCoverage(htmlPath: string, html: string): TokenCoverageResult | undefined {
  const tokensPath = resolveProjectTokensPath(dirname(resolve(htmlPath)));
  if (tokensPath === undefined) return undefined;
  try {
    const resolved = resolveTokens(parseTokenFile(JSON.parse(readFileSync(tokensPath, "utf8"))));
    return scoreCssSources(collectCssSources(htmlPath, html), resolved);
  } catch {
    return undefined;
  }
}
