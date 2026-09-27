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
import { loadLinkedCss } from "./html-css-loader.js";
import type { FloorFindingBase } from "./finding-schema.js";

export interface CssSource {
  text: string;
  isHtmlSource: boolean;
}

export interface CssSourceCollection {
  sources: CssSource[];
  /** Linked stylesheets or their one-level @imports that could not be read — never silence (PR-FU3 C1). */
  errors: FloorFindingBase[];
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

/**
 * Every CSS source an HTML file's own markup pulls in: the HTML text itself
 * (inline style="" attributes and <style> blocks both live inside it — see
 * extractDeclarations) plus every local linked stylesheet (one level of
 * @import deep), read through the shared `html-css-loader` (PR-FU3) — the
 * same resolver every other linter now uses. An unreadable linked file is
 * NEVER skipped in silence: it comes back as an error finding the caller
 * must surface (PR-FU3 C1), replacing this module's former best-effort skip.
 */
export function collectCssSources(htmlPath: string, html: string): CssSourceCollection {
  const { sheets, errors } = loadLinkedCss(htmlPath, html);
  const sources: CssSource[] = [{ text: html, isHtmlSource: true }];
  for (const s of sheets) sources.push({ text: s.text, isHtmlSource: false });
  return { sources, errors };
}

/**
 * Score `htmlPath`'s CSS against the token file at `tokensPath` — no
 * auto-detection, no swallowed errors (PR-FU3-r2 A5). This is the caller's
 * loud path: an EXPLICIT `--tokens` value must grade against THAT file, and a
 * bad path/JSON/DTCG-shape must surface as a real error, never a silent
 * "no coverage check ran" that looks identical to "nothing to grade against".
 * `html` is expected to already be the caller's inlined, link-free document.
 */
export function scoreTokenCoverage(htmlPath: string, html: string, tokensPath: string): TokenCoverageResult {
  const resolved = resolveTokens(parseTokenFile(JSON.parse(readFileSync(tokensPath, "utf8"))));
  return scoreCssSources(collectCssSources(htmlPath, html).sources, resolved);
}

/**
 * `ui gate`'s auto-detected token-coverage check (A2): resolve the project's
 * token file for `htmlPath`'s directory and score it, or return undefined
 * when no token file is auto-detectable, or when the auto-detected file is
 * unreadable/invalid — best-effort, same posture as "not found" (an EXPLICIT
 * `--tokens` path stays the caller's job to validate loudly via
 * `scoreTokenCoverage` above; this one was never asked for). `html` is
 * expected to already be `ui gate`'s inlined, link-free document, so no
 * linked stylesheet remains to (re-)report errors for here — the caller
 * already surfaced those from its own inlining pass.
 */
export function autoScoreTokenCoverage(htmlPath: string, html: string): TokenCoverageResult | undefined {
  const tokensPath = resolveProjectTokensPath(dirname(resolve(htmlPath)));
  if (tokensPath === undefined) return undefined;
  try {
    return scoreTokenCoverage(htmlPath, html, tokensPath);
  } catch {
    return undefined;
  }
}
