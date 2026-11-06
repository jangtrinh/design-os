/**
 * What a gate finding is ABOUT, for origin attribution (gate-origin.ts): the rule's
 * own `subjects`, else the custom properties its message names, else the selector
 * chain (or `@keyframes` name) of the CSS rule its line sits in.
 */
import type { FloorFindingBase } from "./finding-schema.js";
import { blockAt, chainOf, cssStructure } from "./css-declaration-sites.js";
import type { CssBlock } from "./css-declaration-sites.js";

export interface StyleRegion { startLine: number; endLine: number; css: string; cssStartOffset: number; blocks: CssBlock[]; lineOffsets: number[] }

/** Each <style> region with its line span and block tree, so a CSS finding's line names its rule. */
export function indexStyleRegions(html: string): StyleRegion[] {
  const lineStarts: number[] = [0];
  for (let k = 0; k < html.length; k++) if (html.charCodeAt(k) === 10) lineStarts.push(k + 1);
  const lineOf = (off: number): number => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if ((lineStarts[mid] as number) <= off) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  const out: StyleRegion[] = [];
  for (const m of html.matchAll(/(<style[^>]*>)([\s\S]*?)<\/style>/gi)) {
    const cssStart = (m.index ?? 0) + (m[1] ?? "").length;
    const css = m[2] ?? "";
    out.push({ startLine: lineOf(cssStart), endLine: lineOf(cssStart + css.length), css, cssStartOffset: cssStart, blocks: cssStructure(css).blocks, lineOffsets: lineStarts });
  }
  return out;
}

const MAX_CSS_LINE = 2000; // a minified sheet on one line: a line cannot name a rule

export function subjectsOf(f: FloorFindingBase, regions: StyleRegion[]): string[] {
  if (f.subjects !== undefined && f.subjects.length > 0) return f.subjects;
  // A custom property the finding is ABOUT: `var(--x)`, `'--x'`, or a message that opens with it.
  // A bare `--word` elsewhere is prose — often a CLI flag (`ui autofix --write`), never a subject.
  const text = `${f.message} ${f.actual ?? ""}`;
  const vars = [...new Set([...text.matchAll(/(?:var\(\s*|'|^)(--[A-Za-z0-9_-]+)/g)].map((m) => m[1] as string))].filter((v) => v.length > 2);
  if (vars.length > 0) return vars;
  if (f.line === undefined) return [];
  const region = regions.find((r) => f.line! >= r.startLine && f.line! <= r.endLine);
  if (region === undefined) return [];
  const lineStart = region.lineOffsets[f.line - 1] ?? 0;
  const lineEnd = region.lineOffsets[f.line] ?? region.cssStartOffset + region.css.length;
  if (lineEnd - lineStart > MAX_CSS_LINE) return [];
  const rel = Math.max(0, lineStart - region.cssStartOffset);
  const lineText = region.css.slice(rel, Math.max(rel, lineEnd - region.cssStartOffset));
  const brace = lineText.lastIndexOf("{");
  const firstChar = lineText.length - lineText.trimStart().length;
  const offset = rel + (brace !== -1 ? brace + 1 : firstChar);
  const idx = blockAt(region.blocks, offset);
  if (idx === -1) return [];
  const chain = chainOf(region.blocks, idx);
  const keyframes = chain.find((p) => /^@(?:-webkit-)?keyframes\s/i.test(p));
  if (keyframes !== undefined) return [`@keyframes ${keyframes.replace(/^@(?:-webkit-)?keyframes\s+/i, "").trim()}`];
  return [chain.join(" ")];
}
