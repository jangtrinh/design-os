/**
 * CSS value parsers shared by every extractor that reads CSS-shaped syntax —
 * the HTML cascade extractor today, the SFC and Tailwind extractors next.
 *
 * One implementation, not one per consumer: the repo's own scar is a rule
 * patched where it surfaced and re-appearing in the next consumer that shared
 * the blind spot. Pure string math; no DOM, no dependency.
 *
 * Every parser returns `undefined` rather than a guess. A colour invented from a
 * value nobody could read is a finding about a page that does not exist.
 */

export interface ParsedColor {
  /** Lower-case 6-digit hex, no `#`. */
  hex: string;
  /** 0..1; omitted when fully opaque. */
  alpha?: number;
}

const NAMED: Record<string, string> = {
  black: "000000", white: "ffffff", red: "ff0000", green: "008000", blue: "0000ff",
  gray: "808080", grey: "808080", silver: "c0c0c0", transparent: "000000",
};

/** `#abc`, `#aabbcc`, `#aabbccdd`, `rgb()`, `rgba()`, and a few names. */
export function parseColor(raw: string): ParsedColor | undefined {
  const v = raw.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(v);
  if (hex !== null) {
    const h = hex[1] as string;
    if (h.length === 3) return { hex: h.split("").map((c) => c + c).join("") };
    if (h.length === 4) {
      const [r, g, b, a] = h.split("") as [string, string, string, string];
      return { hex: `${r}${r}${g}${g}${b}${b}`, alpha: parseInt(a + a, 16) / 255 };
    }
    if (h.length === 6) return { hex: h };
    if (h.length === 8) return { hex: h.slice(0, 6), alpha: parseInt(h.slice(6), 16) / 255 };
    return undefined;
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgb !== null) {
    const parts = (rgb[1] as string).split(/[,\s/]+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) return undefined;
    const channel = (s: string): number | undefined => {
      const pct = /^([\d.]+)%$/.exec(s);
      const n = pct !== null ? (Number.parseFloat(pct[1] as string) / 100) * 255 : Number.parseFloat(s);
      return Number.isFinite(n) ? Math.max(0, Math.min(255, Math.round(n))) : undefined;
    };
    const rgbVals = parts.slice(0, 3).map(channel);
    if (rgbVals.some((n) => n === undefined)) return undefined;
    const hexStr = (rgbVals as number[]).map((n) => n.toString(16).padStart(2, "0")).join("");
    const alphaRaw = parts[3];
    if (alphaRaw === undefined) return { hex: hexStr };
    const pct = /^([\d.]+)%$/.exec(alphaRaw);
    const a = pct !== null ? Number.parseFloat(pct[1] as string) / 100 : Number.parseFloat(alphaRaw);
    return Number.isFinite(a) ? { hex: hexStr, alpha: a } : { hex: hexStr };
  }

  if (v === "transparent") return { hex: "000000", alpha: 0 };
  const named = NAMED[v];
  return named !== undefined ? { hex: named } : undefined;
}

/** Root font size assumed when converting `rem`. The CSS initial value. */
const ROOT_PX = 16;

/** `16px`, `1rem`, `1.5em`, `0`. Viewport and percentage units are NOT guessed. */
export function parseLengthPx(raw: string, basePx = ROOT_PX): number | undefined {
  const v = raw.trim().toLowerCase();
  if (v === "0") return 0;
  const m = /^(-?[\d.]+)(px|rem|em|pt)$/.exec(v);
  if (m === null) return undefined;
  const n = Number.parseFloat(m[1] as string);
  if (!Number.isFinite(n)) return undefined;
  switch (m[2]) {
    case "px": return n;
    case "rem": return n * ROOT_PX;
    case "em": return n * basePx;
    case "pt": return (n * 96) / 72;
    default: return undefined;
  }
}

export interface ParsedGradient {
  kind: "linear" | "radial" | "conic";
  stops: Array<{ hex: string; position?: number }>;
  angleDeg?: number;
}

/** `linear-gradient(135deg, #a 0%, #b 100%)` and its radial/conic siblings. */
export function parseGradient(raw: string): ParsedGradient | undefined {
  const m = /(linear|radial|conic)-gradient\(([\s\S]*)\)/i.exec(raw.trim());
  if (m === null) return undefined;
  const kind = (m[1] as string).toLowerCase() as ParsedGradient["kind"];
  const args = splitTopLevel(m[2] as string, ",");

  let angleDeg: number | undefined;
  const stops: ParsedGradient["stops"] = [];
  for (const arg of args) {
    const deg = /^(-?[\d.]+)deg$/i.exec(arg.trim());
    if (deg !== null) {
      angleDeg = Number.parseFloat(deg[1] as string);
      continue;
    }
    if (/^(to\s|at\s|circle|ellipse|from\s)/i.test(arg.trim())) continue;
    const parts = splitTopLevel(arg, " ");
    const col = parts.map((p) => parseColor(p)).find((c) => c !== undefined);
    if (col === undefined) continue;
    const pos = parts.map((p) => /^([\d.]+)%$/.exec(p.trim())).find((x) => x !== null);
    stops.push({
      hex: col.hex,
      position: pos !== null && pos !== undefined ? Number.parseFloat(pos[1] as string) / 100 : undefined,
    });
  }
  return stops.length > 0 ? { kind, stops, angleDeg } : undefined;
}

export interface ParsedShadow {
  offsetXPx: number;
  offsetYPx: number;
  blurPx: number;
  spreadPx?: number;
  hex?: string;
  alpha?: number;
  inset?: boolean;
}

/** `0 2px 8px rgba(0,0,0,.2)` — the first shadow of a possibly-multiple list. */
export function parseShadow(raw: string): ParsedShadow | undefined {
  const first = splitTopLevel(raw, ",")[0];
  if (first === undefined || first.trim() === "" || /^none$/i.test(first.trim())) return undefined;
  const inset = /\binset\b/i.test(first);
  const parts = splitTopLevel(first.replace(/\binset\b/i, ""), " ");
  const lengths: number[] = [];
  let color: ParsedColor | undefined;
  for (const p of parts) {
    const px = parseLengthPx(p);
    if (px !== undefined) lengths.push(px);
    else color ??= parseColor(p);
  }
  if (lengths.length < 2) return undefined;
  return {
    offsetXPx: lengths[0] as number,
    offsetYPx: lengths[1] as number,
    blurPx: lengths[2] ?? 0,
    spreadPx: lengths[3],
    hex: color?.hex,
    alpha: color?.alpha,
    inset: inset || undefined,
  };
}

/**
 * Split on a separator, ignoring separators nested inside parentheses.
 *
 * `rgba(0, 0, 0, .2) 0 2px` must not split on the commas inside `rgba(...)`.
 * A naive `.split(",")` here is the classic way a colour becomes three
 * unparseable fragments.
 */
export function splitTopLevel(input: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && ((sep === " " && /\s/.test(ch)) || (sep !== " " && ch === sep))) {
      if (cur.trim() !== "") out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim() !== "") out.push(cur.trim());
  return out;
}
