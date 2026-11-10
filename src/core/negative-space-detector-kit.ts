/**
 * negative-space-detector-kit.ts - the shared vocabulary of the negative-space probes: what a probe
 * sees of one file (`FileCtx`), what it answers (`Detection`), and the small readers every detector
 * leans on (token scan with element exclusion, class-token parsing, pastel/tint judgement).
 *
 * A probe never fails a file: it returns hits (the cliche is present), and `excluded` entries
 * (an occurrence the probe saw and deliberately did not count, each with the reason), so a zero is
 * always a zero over a stated set of files and a stated list of skipped look-alikes (Art VIII).
 */
import { evaluateTokenBansDetailed } from "./adherence-rules.js";
import type { TokenBanRule } from "./adherence-rules.js";
import { createLineIndex } from "./line-index.js";
import { extractUiRecords, uiSourceExtension } from "./polyglot-ui-extractor.js";
import type { UiRecord } from "./polyglot-ui-extractor.js";
import { blankDelimited, blankInterpolations, classTokens, spaces, templateLiterals } from "./polyglot-ui-scans.js";

/** Stylesheet types the harvest reads on top of the UI-source walk. */
export const STYLE_EXTENSIONS = [".css", ".scss", ".less"] as const;
export type FileKind = "ui" | "style" | "json";
/** What a path is to the harvest: token JSON, a stylesheet, or (everything else it reads) UI source. */
export function fileKindOf(path: string): FileKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  return STYLE_EXTENSIONS.some((e) => lower.endsWith(e)) ? "style" : "ui";
}

export interface Hit { file: string; line: number; excerpt: string }
export interface Exclusion { file: string; line: number; reason: string }
export interface Detection { hits: Hit[]; excluded: Exclusion[] }
export interface FileCtx {
  /** Path relative to the walked root, `/`-separated. */
  file: string;
  source: string;
  kind: FileKind;
  json: boolean;
  /** Extractor records (stylesheets: one per rule block); empty for JSON files. */
  records: UiRecord[];
  lineOf: (offset: number) => number;
  lines: string[];
}
export type Detector = (f: FileCtx) => Detection;

const RULE_BLOCK = /([^{}]*)\{([^{}]*)\}/g;
const SCRIPT_EXT = new Set([".jsx", ".tsx", ".js", ".ts"]);
const looksDeclared = /[\w-]\s*:\s*[^;\s]/;

/** A stylesheet as records: one per innermost rule block, selector included, at the line the rule starts. */
function styleRecords(file: string, source: string, lineOf: (offset: number) => number): UiRecord[] {
  let text = blankDelimited(source, "/*", "*/", spaces);
  if (!file.toLowerCase().endsWith(".css")) text = text.replace(/(^|\n)[ \t]*\/\/[^\n]*/g, (m) => spaces(m));
  return [...text.matchAll(RULE_BLOCK)].map((m) => {
    const lead = (m[1] ?? "").length - (m[1] ?? "").trimStart().length;
    return { file, line: lineOf((m.index ?? 0) + lead), styles: `${(m[1] ?? "").trim()}{${m[2] ?? ""}}`, classes: [], markup: "" };
  });
}

/**
 * CSS-in-JS text without braces (`styled.div` + a template literal holding `border-radius: 999px; background: #dcfce7`):
 * the extractor only reads brace blocks, so these literals become records of their own.
 */
function declarationLiterals(file: string, source: string, lineOf: (offset: number) => number): UiRecord[] {
  if (!SCRIPT_EXT.has(uiSourceExtension(file) ?? "")) return [];
  return templateLiterals(blankInterpolations(source))
    .filter((t) => !/[{}]/.test(t.value) && looksDeclared.test(t.value))
    .map((t) => ({ file, line: lineOf(t.at), styles: t.value, classes: [], markup: "" }));
}

/** `@apply rounded-full bg-green-100;` in a record's style text, as a record whose classes the class detectors judge. */
function applyRecords(records: UiRecord[]): UiRecord[] {
  return records.flatMap((r) => [...r.styles.matchAll(/@apply\s+([^;}]+)/g)].map((m) => ({
    file: r.file, line: r.line, styles: "", markup: "",
    classes: classTokens((m[1] ?? "").replace(/!important/g, " ")).map((t) => t.replace(/^!/, "")).filter((t) => t !== ""),
  }))).filter((r) => r.classes.length > 0);
}

export function makeFileCtx(file: string, source: string): FileCtx {
  const kind = fileKindOf(file);
  const lineOf = createLineIndex(source).lineOf;
  const base = kind === "json" ? [] : kind === "style" ? styleRecords(file, source, lineOf) : [...extractUiRecords(file, source), ...declarationLiterals(file, source, lineOf)];
  const records = [...base, ...applyRecords(base)];
  return { file, source, kind, json: kind === "json", records, lineOf, lines: source.split("\n") };
}

export const clip = (s: string, max = 90): string => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};
export const emptyDetection = (): Detection => ({ hits: [], excluded: [] });

/** Text around the first occurrence of `needle` on a 1-based line (a minified bundle is one very long line). */
export function around(f: FileCtx, line: number, needle: string): string {
  const text = f.lines[line - 1] ?? "";
  const at = Math.max(0, text.toLowerCase().indexOf(needle.toLowerCase()));
  return clip(text.slice(Math.max(0, at - 30), at + needle.length + 40));
}

/**
 * Literal, case-insensitive scan through the same evaluator a promoted `token-ban` rule uses, so a
 * probe that counts 0 and the ban it proposes can never disagree about the same text.
 * `count` is token occurrences: a token that contains another (`ui-monospace`, `monospace`) counts twice.
 */
export function scanTokens(f: FileCtx, tokens: readonly string[], excludeElements?: readonly string[]): Detection {
  const rule: TokenBanRule = { id: "probe", kind: "token-ban", severity: "error", message: "probe", source: "probe", tokens: [...tokens], ...(excludeElements !== undefined && { excludeElements: [...excludeElements] }) };
  const { findings, excluded } = evaluateTokenBansDetailed([rule], f.source);
  return {
    hits: findings.map((x) => ({ file: f.file, line: x.line, excerpt: around(f, x.line, x.token) })),
    excluded: excluded.map((x) => ({ file: f.file, line: x.line, reason: `inside <${x.element}>` })),
  };
}

export interface ParsedClass { variants: string[]; base: string }
/** `md:hover:bg-red-100` -> variants [md, hover], base bg-red-100 (a colon inside `[...]` is not a variant). */
export function parseClass(token: string): ParsedClass {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === ":" && depth === 0) last = i;
  }
  return last === -1 ? { variants: [], base: token } : { variants: token.slice(0, last).split(":"), base: token.slice(last + 1) };
}
const RESPONSIVE = new Set(["sm", "md", "lg", "xl", "2xl"]);
export interface ClassRecord { line: number; raw: string[]; resting: string[] }
/** One entry per class list: `resting` holds the base of every token that applies at rest (no hover/focus/dark variant). */
export function classRecords(f: FileCtx): ClassRecord[] {
  return f.records.filter((r) => r.classes.length > 0).map((r) => ({
    line: r.line,
    raw: r.classes,
    resting: r.classes.map(parseClass).filter((p) => p.variants.every((v) => RESPONSIVE.has(v))).map((p) => p.base),
  }));
}
/** CSS declaration bodies (`a:b; c:d`) of every brace-free block in a record's style text (a brace-less record is one body). */
export const cssBlocks = (r: UiRecord): string[] => {
  if (r.styles.trim() === "") return [];
  return r.styles.includes("{") ? [...r.styles.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1] ?? "") : [r.styles];
};

const CHROMA = "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PASTEL_FILL = new RegExp(`^bg-(?:${CHROMA})-(?:50|100|200)$|^bg-(?:${CHROMA})-\\d{2,3}/(?:5|10|15|20|25)$`);
const BRAND_TINT = /^bg-(?:primary|accent|secondary|muted|brand)\/(?:5|10|15|20|25)$/;
const ARBITRARY_HEX_FILL = /^bg-\[(#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3}))\]$/i;
/** `bg-[#dcfce7]`: an arbitrary light, clearly coloured fill is a tint exactly like the 50/100/200 steps. */
const isArbitraryTint = (base: string): boolean => {
  const hex = ARBITRARY_HEX_FILL.exec(base)?.[1];
  return hex !== undefined && (isPastelHex(hex) || isSemanticTintHex(hex));
};
export const isPastelFillClass = (base: string): boolean => PASTEL_FILL.test(base) || isArbitraryTint(base);
export const isTintedFillClass = (base: string): boolean => PASTEL_FILL.test(base) || BRAND_TINT.test(base) || isArbitraryTint(base);

const HEX_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-z])/gi;
/** Light (>= 0.85) and clearly coloured (saturation >= 0.5): a semantic tint, not white, grey or a brand colour. */
export function isPastelHex(hex: string): boolean {
  let h = hex.slice(1).toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  return isPastelUnit(r, g, b);
}
function isPastelUnit(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  return d > 0 && l >= 0.85 && d / (1 - Math.abs(2 * l - 1)) >= 0.5;
}
const RGB_RE = /rgba?\(\s*(\d{1,3}(?:\.\d+)?)[\s,]+(\d{1,3}(?:\.\d+)?)[\s,]+(\d{1,3}(?:\.\d+)?)/gi;
const HSL_RE = /hsla?\(\s*-?\d+(?:\.\d+)?(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%/gi;
/** A fill value that is a light, clearly coloured `#hex`, `rgb()` or `hsl()`; a `var()` reference is not judged (a listed limit). */
export function hasPastelFill(value: string): boolean {
  if (hexesIn(value).some((h) => isPastelHex(h.hex))) return true;
  for (const m of value.matchAll(RGB_RE)) if (isPastelUnit(Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255)) return true;
  for (const m of value.matchAll(HSL_RE)) if (Number(m[2]) >= 85 && Number(m[1]) >= 50) return true;
  return false;
}
/** The Tailwind 50 and 100 steps of the chromatic scales: the semantic tints a token file might define. */
const SEMANTIC_TINTS = new Set(
  ("fee2e2 ffedd5 fef3c7 fef9c3 ecfccb dcfce7 d1fae5 ccfbf1 cffafe e0f2fe dbeafe e0e7ff ede9fe f3e8ff fae8ff fce7f3 ffe4e6 "
    + "fef2f2 fff7ed fffbeb fefce8 f7fee7 f0fdf4 ecfdf5 f0fdfa ecfeff f0f9ff eff6ff eef2ff f5f3ff faf5ff fdf4ff fdf2f8 fff1f2").split(" "),
);
export const isSemanticTintHex = (hex: string): boolean => SEMANTIC_TINTS.has(hex.slice(1).toLowerCase());
export const hexesIn = (text: string): { hex: string; index: number }[] => [...text.matchAll(HEX_RE)].map((m) => ({ hex: m[0], index: m.index ?? 0 }));

/** True when a declaration body sets a radius of 999 or more in px, em or rem (a pill). */
export const hasPillRadius = (decls: string): boolean => {
  const m = /border-radius\s*:\s*([^;]+)/i.exec(decls);
  return m !== null && [...(m[1] ?? "").matchAll(/(\d+(?:\.\d+)?)(?:px|r?em)\b/g)].some((p) => Number(p[1]) >= 999);
};
