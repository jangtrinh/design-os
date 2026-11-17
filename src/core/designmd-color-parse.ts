/**
 * Deterministic CSS color parser → lowercase #rrggbb hex.
 *
 * Supports hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA), rgb()/rgba() (comma &
 * CSS Color 4 space syntax), hsl()/hsla() (comma & space syntax with angles),
 * shadcn/Tailwind bare HSL channel triplets ("222.2 47.4% 11.2%"), and
 * oklch(L C H [/ alpha]). Pure arithmetic — no DOM, no network.
 */
import { oklchToHex } from "./color-convert.js";

const BARE_HSL_RE =
  /^([+-]?\d+(?:\.\d+)?(?:deg|rad|turn)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%(?:\s*\/\s*[\d.%]+)?$/i;

function byteToHex(n: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(n)));
  return clamped.toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`;
}

/** Expand 3-digit hex string (without `#`) to lowercase `#rrggbb`. */
export function expandShortHex(short: string): string {
  return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`.toLowerCase();
}

function parseAngleDeg(raw: string): number | undefined {
  const t = raw.trim().toLowerCase();
  if (t === "none") return 0;
  const m = t.match(/^([+-]?(?:\d+\.?\d*|\.\d+))(deg|rad|turn)?$/);
  if (!m) return undefined;
  const val = Number(m[1]);
  if (!Number.isFinite(val)) return undefined;
  const unit = m[2] ?? "deg";
  if (unit === "rad") return (val * 180) / Math.PI;
  if (unit === "turn") return val * 360;
  return val;
}

function parseRgbChannel(raw: string): number | undefined {
  const t = raw.trim();
  if (t.endsWith("%")) {
    const pct = Number(t.slice(0, -1));
    return Number.isFinite(pct) ? (pct / 100) * 255 : undefined;
  }
  const num = Number(t);
  return Number.isFinite(num) ? num : undefined;
}

function parsePercent(raw: string): number | undefined {
  const t = raw.trim();
  if (!t.endsWith("%")) return undefined;
  const pct = Number(t.slice(0, -1));
  return Number.isFinite(pct) ? pct : undefined;
}

function hslToHex(hDeg: number, sPct: number, lPct: number): string {
  const h = ((hDeg % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, sPct)) / 100;
  const l = Math.max(0, Math.min(100, lPct)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return color * 255;
  };
  return rgbToHex(f(0), f(8), f(4));
}

function splitCssFnArgs(inner: string): string[] | undefined {
  const slashIdx = inner.indexOf("/");
  const main = (slashIdx === -1 ? inner : inner.slice(0, slashIdx)).trim();
  if (main.length === 0) return undefined;
  const parts = main.includes(",") ? main.split(",") : main.split(/\s+/);
  return parts.map(p => p.trim()).filter(p => p.length > 0);
}

function parseRgbFn(inner: string): string | undefined {
  const parts = splitCssFnArgs(inner);
  if (!parts || (parts.length !== 3 && parts.length !== 4)) return undefined;
  const r = parseRgbChannel(parts[0]!);
  const g = parseRgbChannel(parts[1]!);
  const b = parseRgbChannel(parts[2]!);
  if (r === undefined || g === undefined || b === undefined) return undefined;
  return rgbToHex(r, g, b);
}

function parseHslFn(inner: string): string | undefined {
  const parts = splitCssFnArgs(inner);
  if (!parts || (parts.length !== 3 && parts.length !== 4)) return undefined;
  const h = parseAngleDeg(parts[0]!);
  const s = parsePercent(parts[1]!);
  const l = parsePercent(parts[2]!);
  if (h === undefined || s === undefined || l === undefined) return undefined;
  return hslToHex(h, s, l);
}

function parseOklchFn(inner: string): string | undefined {
  const parts = splitCssFnArgs(inner);
  if (!parts || parts.length !== 3) return undefined;
  const rawL = parts[0]!;
  const rawC = parts[1]!;
  const rawH = parts[2]!;

  const l = rawL.endsWith("%") ? Number(rawL.slice(0, -1)) / 100 : Number(rawL);
  const c = rawC.endsWith("%") ? (Number(rawC.slice(0, -1)) / 100) * 0.4 : Number(rawC);
  const h = parseAngleDeg(rawH);
  if (!Number.isFinite(l) || !Number.isFinite(c) || h === undefined) return undefined;
  if (l < 0 || l > 1 || c < 0) return undefined;
  return oklchToHex(l, c, ((h % 360) + 360) % 360).toLowerCase();
}

const NON_COLOR_PROP_RE =
  /(?:spac|radi|size|width|height|layout|gap|inset|offset|weight|motion|duration|transition|delay|z-index|leading|tracking|scale|opacity)/i;

/**
 * Resolve a bare shadcn/Tailwind HSL channel triplet (`222.2 47.4% 11.2%`)
 * to `#rrggbb` when `0 <= h <= 360` and `0 <= s,l <= 100`.
 */
export function resolveBareHslToHex(rawValue: string): string | undefined {
  const m = rawValue.trim().match(BARE_HSL_RE);
  if (!m) return undefined;
  const rawHue = m[1]!;
  const h = parseAngleDeg(rawHue);
  const s = Number(m[2]);
  const l = Number(m[3]);
  if (h === undefined || !Number.isFinite(s) || !Number.isFinite(l)) return undefined;
  if (h < 0 || h > 360 || s < 0 || s > 100 || l < 0 || l > 100) return undefined;
  return hslToHex(h, s, l);
}

/**
 * Resolve a CSS color literal (hex, rgb/rgba, hsl/hsla, bare shadcn HSL
 * triplet, or oklch) to a lowercase 6-digit `#rrggbb` hex string.
 */
export function resolveCssColorToHex(rawValue: string, propName?: string): string | undefined {
  const trimmed = rawValue.replace(/!important$/i, "").trim();
  if (trimmed.length === 0) return undefined;

  const hex6 = trimmed.match(/^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/);
  if (hex6) return `#${hex6[1]!.toLowerCase()}`;

  const hex3 = trimmed.match(/^#([0-9a-fA-F]{3})([0-9a-fA-F])?$/);
  if (hex3) return expandShortHex(hex3[1]!);

  const fnMatch = trimmed.match(/^([a-zA-Z]+)\(([^)]+)\)$/);
  if (fnMatch) {
    const fn = fnMatch[1]!.toLowerCase();
    const inner = fnMatch[2]!;
    if (fn === "rgb" || fn === "rgba") return parseRgbFn(inner);
    if (fn === "hsl" || fn === "hsla") return parseHslFn(inner);
    if (fn === "oklch") return parseOklchFn(inner);
    return undefined;
  }

  if (propName !== undefined && NON_COLOR_PROP_RE.test(propName)) return undefined;
  return resolveBareHslToHex(trimmed);
}
