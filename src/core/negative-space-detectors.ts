/**
 * negative-space-detectors.ts - one detector per cliche family (see negative-space-probes.ts for the
 * table that names them). Each reads one file and answers `{ hits, excluded }`.
 *
 * Signals need co-occurrence wherever a lone keyword would misfire: a pill is a radius AND a pastel
 * fill in the same class list or rule block, a tinted icon tile is a size AND a radius AND a tint.
 * A look-alike that is not the cliche (a code sample, a palette token, a vendored library table) is
 * returned in `excluded` with the reason, never silently dropped and never counted.
 *
 * Honest limits: this reads the text of the file, not what a build would emit; a class assembled at
 * runtime is not seen (same as the polyglot extractor). The limits the probes share are listed in
 * negative-space-probes.ts (`NEGATIVE_SPACE_LIMITS`) so a report can print them next to the counts.
 */
import {
  classRecords, clip, cssBlocks, emptyDetection, hasPastelFill, hasPillRadius, hexesIn, isPastelFillClass, isSemanticTintHex, isTintedFillClass,
  parseClass, scanTokens, around,
} from "./negative-space-detector-kit.js";
import type { Detection, Detector, FileCtx } from "./negative-space-detector-kit.js";
import { blankInterpolations, templateLiterals } from "./polyglot-ui-scans.js";

export const MONOSPACE_TOKENS = ["ui-monospace", "monospace", "font-mono", "SFMono", "JetBrains Mono", "Fira Code"] as const;
export const GRADIENT_TOKENS = ["linear-gradient(", "radial-gradient(", "conic-gradient(", "bg-gradient-", "bg-linear-", "bg-radial", "bg-conic"] as const;
export const GLOW_TOKENS = ["shadow-[0_0_", "drop-shadow-[0_0_", "shadow-glow", "ring-glow"] as const;

/** Families named without a generic keyword; searched only inside a font declaration, so a word in copy never counts. */
const NAMED_FAMILY = /(?:font-family|fontFamily|\bfont)\s*:\s*[^;}\n]*?\b(Menlo|Consolas|Monaco|Courier New|Courier)\b/gi;
const STYLED_EXEMPT = /styled(?:\.(pre|code)|\(\s*["']?(pre|code)["']?\s*\))(?:<[^>`]*>)?\s*$/;

/** Line ranges of template literals tagged `styled.pre` / `styled.code`: the CSS-in-JS twin of the <pre> and <code> exemption. */
function styledExemptRanges(f: FileCtx): { from: number; to: number; tag: string }[] {
  if (!/styled/.test(f.source)) return [];
  return templateLiterals(blankInterpolations(f.source)).flatMap((t) => {
    const m = STYLED_EXEMPT.exec(f.source.slice(Math.max(0, t.at - 80), t.at - 1));
    return m === null ? [] : [{ from: f.lineOf(t.at), to: f.lineOf(t.at + t.value.length), tag: (m[1] ?? m[2]) as string }];
  });
}

export const detectMonospace: Detector = (f) => {
  const d = scanTokens(f, MONOSPACE_TOKENS, ["code", "pre"]);
  for (const m of f.source.matchAll(NAMED_FAMILY)) {
    const line = f.lineOf(m.index ?? 0);
    d.hits.push({ file: f.file, line, excerpt: around(f, line, m[1] as string) });
  }
  const ranges = styledExemptRanges(f);
  if (ranges.length === 0) return d;
  const inside = (line: number): string | undefined => ranges.find((r) => line >= r.from && line <= r.to)?.tag;
  const kept: typeof d.hits = [];
  for (const h of d.hits) {
    const tag = inside(h.line);
    if (tag === undefined) kept.push(h);
    else d.excluded.push({ file: f.file, line: h.line, reason: `inside styled.${tag}` });
  }
  d.hits = kept;
  return d;
};
export const detectGradient: Detector = (f) => scanTokens(f, GRADIENT_TOKENS);

const isPillClass = (b: string): boolean => b === "rounded-full" || /^rounded-\[(?:999|9999)\d*px\]$/.test(b);

export const detectPastelPill: Detector = (f) => {
  const d = emptyDetection();
  if (f.json) {
    for (const { hex, index } of hexesIn(f.source)) {
      if (isSemanticTintHex(hex)) d.excluded.push({ file: f.file, line: f.lineOf(index), reason: "color token definition in tokens JSON" });
    }
    return d;
  }
  for (const r of classRecords(f)) {
    const fill = r.resting.find(isPastelFillClass);
    if (r.resting.some(isPillClass) && fill !== undefined) d.hits.push({ file: f.file, line: r.line, excerpt: clip(`rounded-full ${fill}`) });
  }
  for (const rec of f.records) {
    for (const body of cssBlocks(rec)) {
      const bg = /background(?:-color)?\s*:\s*([^;]*)/i.exec(body)?.[1] ?? "";
      if (hasPillRadius(body) && hasPastelFill(bg)) d.hits.push({ file: f.file, line: rec.line, excerpt: clip(body) });
    }
  }
  return d;
};

const TAG_ENUM = /["'`]uppercase["'`]\s*,\s*["'`]lowercase["'`]\s*,\s*["'`]capitalize["'`]/;
const CHIP_TEXT = /<[a-z][a-z0-9]*\b[^>]*class\s*=\s*["'][^"']*\b(?:badge|chip|tag|pill)\b[^"']*["'][^>]*>\s*([A-Z][A-Z0-9_-]{1,11})\s*</g;
export const detectUppercaseTag: Detector = (f) => {
  const d = emptyDetection();
  const vendored = TAG_ENUM.test(f.source);
  for (const r of classRecords(f)) {
    if (!r.raw.some((t) => parseClass(t).base === "uppercase")) continue;
    // a lone "uppercase" string next to "lowercase","capitalize" is the tailwind-merge config's value list, not a class
    if (vendored && r.raw.length === 1) d.excluded.push({ file: f.file, line: r.line, reason: "vendored tailwind-merge config" });
    else d.hits.push({ file: f.file, line: r.line, excerpt: clip(r.raw.join(" ")) });
  }
  for (const rec of f.records) {
    for (const m of rec.styles.matchAll(/text-transform\s*:\s*uppercase/gi)) d.hits.push({ file: f.file, line: rec.line, excerpt: clip(m[0]) });
  }
  for (const m of f.source.matchAll(CHIP_TEXT)) d.hits.push({ file: f.file, line: f.lineOf(m.index ?? 0), excerpt: clip(`${m[1] ?? ""} in a badge/chip/tag element`) });
  return d;
};

const CARD_HEADER_CLASS = /(?:^|[-_])card[-_]?(?:header|hdr)$/i;
export const detectCardHeaderBar: Detector = (f) => {
  const d = emptyDetection();
  for (const r of classRecords(f)) {
    const t = r.raw.find((x) => CARD_HEADER_CLASS.test(parseClass(x).base));
    if (t !== undefined) d.hits.push({ file: f.file, line: r.line, excerpt: clip(t) });
  }
  for (const rec of f.records) {
    for (const m of rec.styles.matchAll(/\.[\w-]*card[-_]?(?:header|hdr)\b/gi)) d.hits.push({ file: f.file, line: rec.line, excerpt: clip(`selector ${m[0]}`) });
  }
  for (const m of f.source.matchAll(/<Card\.Header\b|<CardHeader\b/g)) d.hits.push({ file: f.file, line: f.lineOf(m.index ?? 0), excerpt: m[0] });
  return d;
};

const SUBTITLE_AFTER_H1 = /<\/h1\s*>\s*(?:<!--[\s\S]*?-->\s*)?(?:<p\b|<[a-z][a-z0-9]*\b[^>]*class\s*=\s*["'][^"']*\b(?:sub-?title|page-?(?:sub|desc)\w*|header-?(?:sub|desc)\w*|lead)\b)/gi;
export const detectPageSubtitle: Detector = (f) => ({
  hits: [...f.source.matchAll(SUBTITLE_AFTER_H1)].map((m) => ({ file: f.file, line: f.lineOf(m.index ?? 0), excerpt: clip(m[0]) })),
  excluded: [],
});

// A class name that says "secondary text" by one of its dash-separated words (`row-description`, `card-sub`, `hint`);
// `bg-secondary` and `text-subtle` do not qualify because the word must stand alone.
const ROW_DESCRIPTION = /<[a-z][a-z0-9]*\b[^>]*class\s*=\s*["'][^"']*(?<![A-Za-z0-9])(?:sub-title|subtitle|subtext|sub|description|desc|caption|hint|helper)(?![A-Za-z0-9])[^"']*["'][^>]*>([^<>{}]+)</gi;
export const detectVerboseRowDescription: Detector = (f) => ({
  hits: [...f.source.matchAll(ROW_DESCRIPTION)]
    .filter((m) => (m[1] ?? "").trim().length > 40)
    .map((m) => ({ file: f.file, line: f.lineOf(m.index ?? 0), excerpt: clip(`${(m[1] ?? "").trim().length} chars: ${m[1] ?? ""}`) })),
  excluded: [],
});

const isRowMarker = (b: string): boolean => /(?:^|-)(?:row|list-item)(?:-|$)/.test(b);
export const detectFilledActionInRow: Detector = (f) => {
  const d = emptyDetection();
  const records = classRecords(f);
  if (!records.some((r) => r.resting.some(isRowMarker))) return d; // no row anywhere in this file: a filled button is not "in a row"
  for (const r of records) {
    if (r.resting.includes("bg-primary") && r.resting.includes("text-primary-foreground")) d.hits.push({ file: f.file, line: r.line, excerpt: clip(r.raw.join(" ")) });
  }
  return d;
};

const KPI_CONTEXT = /sparkline|\bkpi\b|stat-?cards?|[+\-−]\s?\d{1,3}(?:\.\d+)?%/i;
export const detectKpiStatGrid: Detector = (f) => {
  const d = emptyDetection();
  if (!KPI_CONTEXT.test(f.source)) return d;
  for (const r of classRecords(f)) {
    const t = r.resting.find((b) => /^grid-cols-[34]$/.test(b));
    if (t !== undefined) d.hits.push({ file: f.file, line: r.line, excerpt: clip(`${t} with a KPI/delta signal in the file`) });
  }
  return d;
};

const TILE_PX = (n: number): boolean => n >= 32 && n <= 48;
const sizeUnits = (b: string): number | undefined => {
  const m = /^(?:size|h|w)-(\d{1,2})$/.exec(b);
  return m === null ? undefined : Number(m[1]) * 4;
};
export const detectTintedIconTile: Detector = (f) => {
  const d = emptyDetection();
  for (const r of classRecords(f)) {
    const sized = r.resting.some((b) => /^size-\d{1,2}$/.test(b) && TILE_PX(sizeUnits(b) ?? 0))
      || (r.resting.some((b) => /^h-\d{1,2}$/.test(b) && TILE_PX(sizeUnits(b) ?? 0)) && r.resting.some((b) => /^w-\d{1,2}$/.test(b) && TILE_PX(sizeUnits(b) ?? 0)))
      || r.resting.some((b) => /^size-\[(\d+)px\]$/.test(b) && TILE_PX(Number(/\d+/.exec(b)?.[0])));
    const square = r.resting.some((b) => /^rounded-(?:md|lg|xl|2xl|3xl)$/.test(b) || /^rounded-\[\d{1,2}px\]$/.test(b));
    const tint = r.resting.find(isTintedFillClass);
    if (sized && square && tint !== undefined) d.hits.push({ file: f.file, line: r.line, excerpt: clip(r.raw.join(" ")) });
  }
  for (const rec of f.records) {
    for (const body of cssBlocks(rec)) {
      const px = (p: string): number => Number(new RegExp(`(?:^|[;\\s])${p}\\s*:\\s*(\\d+)px`, "i").exec(body)?.[1] ?? 0);
      const bg = /background(?:-color)?\s*:\s*([^;]*)/i.exec(body)?.[1] ?? "";
      if (TILE_PX(px("width")) && TILE_PX(px("height")) && /border-radius/i.test(body) && !hasPillRadius(body) && hasPastelFill(bg)) {
        d.hits.push({ file: f.file, line: rec.line, excerpt: clip(body) });
      }
    }
  }
  return d;
};

const COLOURED_SHADOW = /^(?:drop-)?shadow-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?$/;
const DROP_SHADOW_GLOW = /drop-shadow\(\s*0(?:px)?\s+0(?:px)?\s+[1-9]/gi;
const SPREAD_RING = /box-shadow\s*:[^;}]*?(?<![\w.])(?:inset\s+)?0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+(?:[2-9]|[1-9]\d)(?:\.\d+)?px/i;
const GLOW_CSS = /(?<=(?:box-shadow\s*:|,)\s*)(?:inset\s+)?0(?:px)?\s+0(?:px)?\s+[1-9]\d*(?:\.\d+)?px/gi;
/** True when every selector of the rule is a focus selector (`:focus*`, or a class or attribute name containing `focus`). */
function isFocusRule(styles: string): boolean {
  const selectors = (styles.split("{")[0] ?? "").split(",").map((x) => x.trim()).filter((x) => x !== "");
  return selectors.length > 0 && selectors.every((x) => /:focus|[.[][\w-]*focus/i.test(x));
}
export const detectGlowOrRing: Detector = (f) => {
  const d: Detection = scanTokens(f, GLOW_TOKENS);
  for (const m of f.source.matchAll(GLOW_CSS)) d.hits.push({ file: f.file, line: f.lineOf(m.index ?? 0), excerpt: around(f, f.lineOf(m.index ?? 0), "box-shadow") });
  for (const rec of f.records) {
    // a rule whose every selector is a focus selector is accessibility, not decoration
    if (isFocusRule(rec.styles)) continue;
    for (const m of rec.styles.matchAll(DROP_SHADOW_GLOW)) d.hits.push({ file: f.file, line: rec.line, excerpt: clip(`filter ${m[0]}…`) });
    const ring = SPREAD_RING.exec(rec.styles);
    if (ring !== null) d.hits.push({ file: f.file, line: rec.line, excerpt: clip(ring[0].replace(/\s+/g, " ")) });
  }
  for (const r of classRecords(f)) {
    // a focus ring (focus:/focus-visible:/focus-within: variant) is accessibility, not decoration; only a resting ring on a round element counts
    const ring = r.resting.find((b) => /^ring-(?:[2-8])$/.test(b));
    if (ring !== undefined && r.resting.some(isPillClass)) d.hits.push({ file: f.file, line: r.line, excerpt: clip(r.raw.join(" ")) });
    const coloured = r.resting.find((b) => COLOURED_SHADOW.test(b));
    if (coloured !== undefined) d.hits.push({ file: f.file, line: r.line, excerpt: clip(`coloured shadow ${coloured}`) });
  }
  return d;
};

const BILLING = /\bupgrade (?:to )?(?:pro|premium|plus|plan)\b|\bcredits? (?:left|remaining|balance|usage|meter)\b|\breferral\b|\bquota\b|\busage meter\b/gi;
export const detectBillingChrome: Detector = (f) => ({
  hits: [...f.source.matchAll(BILLING)].map((m) => ({ file: f.file, line: f.lineOf(m.index ?? 0), excerpt: around(f, f.lineOf(m.index ?? 0), m[0]) })),
  excluded: [],
});
