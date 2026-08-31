/**
 * Tailwind class → design values.
 *
 * React carries its design in three places and only one is CSS: utility classes,
 * CSS-in-JS, and CSS modules. Utilities are the dominant one and they are PURE
 * DATA — `rounded-2xl` means 16px with no evaluation needed. design:os already
 * half-knows this: `off-grid-spacing` is a Tailwind spacing check and
 * `tiny-body-text` reads `text-[Npx]` arbitrary values.
 *
 * The default scale is a FALLBACK, never an assumption. A project's
 * `tailwind.config` can rename or rescale anything, and counting beats guessing:
 * measuring one corpus's breakpoint scale did not merely confirm Tailwind's
 * values, it proved the corpus used `rem` — the accessible choice a guess would
 * have missed.
 */

/** Tailwind's default spacing scale, in px (1 unit = 0.25rem = 4px). */
export function spacingPx(token: string): number | undefined {
  if (token === "px") return 1;
  const n = Number.parseFloat(token);
  return Number.isFinite(n) ? n * 4 : undefined;
}

/** Default font sizes, in px. */
export const TEXT_SIZES: Record<string, number> = {
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20,
  "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128,
};

/** Default border radii, in px. */
export const RADII: Record<string, number> = {
  none: 0, sm: 2, "": 4, md: 6, lg: 8, xl: 12, "2xl": 16, "3xl": 24, full: 999,
};

/** Default font weights. */
export const WEIGHTS: Record<string, number> = {
  thin: 100, extralight: 200, light: 300, normal: 400,
  medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
};

/** Default tracking, in em. */
export const TRACKING: Record<string, number> = {
  tighter: -0.05, tight: -0.025, normal: 0, wide: 0.025, wider: 0.05, widest: 0.1,
};

/** Default leading, as a unitless ratio (the named steps only). */
export const LEADING: Record<string, number> = {
  none: 1, tight: 1.25, snug: 1.375, normal: 1.5, relaxed: 1.625, loose: 2,
};

/** Default border widths, in px. */
export const BORDER_WIDTHS: Record<string, number> = { "": 1, "0": 0, "2": 2, "4": 4, "8": 8 };

/**
 * Tailwind's text-transform utilities, mapped to the CSS values `TextTransform`
 * already names. `normal-case` is the explicit reset and resolves to `none`, so a
 * later utility can undo an earlier one rather than leaving the field undefined.
 */
export const TEXT_TRANSFORMS: Record<string, "uppercase" | "lowercase" | "capitalize" | "none"> = {
  uppercase: "uppercase",
  lowercase: "lowercase",
  capitalize: "capitalize",
  "normal-case": "none",
};

/**
 * The default palette, abbreviated to the hues a tell actually keys on.
 *
 * Not the whole palette: the rules that read colour ask "is this the AI purple",
 * "is this grey on saturated", "is this cream". Shipping 22 hues x 11 steps to
 * answer three questions would be data nobody checks. Unknown colour tokens are
 * returned as unresolvable, which is honest.
 */
export const PALETTE: Record<string, string> = {
  "purple-400": "c084fc", "purple-500": "a855f7", "purple-600": "9333ea", "purple-700": "7e22ce",
  "violet-400": "a78bfa", "violet-500": "8b5cf6", "violet-600": "7c3aed", "violet-700": "6d28d9",
  "indigo-400": "818cf8", "indigo-500": "6366f1", "indigo-600": "4f46e5",
  "fuchsia-500": "d946ef", "cyan-400": "22d3ee", "cyan-300": "67e8f9",
  "gray-400": "9ca3af", "gray-500": "6b7280", "gray-300": "d1d5db",
  "slate-400": "94a3b8", "slate-500": "64748b", "zinc-400": "a1a1aa", "neutral-400": "a3a3a3",
  "stone-100": "f5f5f4", "amber-50": "fffbeb", "orange-50": "fff7ed", "yellow-50": "fefce8",
  white: "ffffff", black: "000000", transparent: "000000",
};

export interface Resolved {
  kind: "spacing" | "radius" | "fontSize" | "weight" | "tracking" | "leading" | "borderWidth" | "color" | "align" | "italic" | "transform";
  /** Numeric value, in px or em or a ratio depending on kind. */
  value?: number;
  hex?: string;
  role?: "fg" | "bg" | "border";
  /** Sides, for one-sided border utilities. */
  sides?: Array<"top" | "right" | "bottom" | "left">;
  /** The spacing property, for padding/margin/gap utilities. */
  prop?: string;
  text?: string;
}

/** An arbitrary value: `text-[13px]`, `bg-[#7c3aed]`, `p-[18px]`. */
function arbitrary(raw: string): { px?: number; hex?: string } | undefined {
  const m = /^\[(.+)\]$/.exec(raw);
  if (m === null) return undefined;
  const body = m[1] as string;
  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(body);
  if (hex !== null) return { hex: (hex[1] as string).toLowerCase().slice(0, 6) };
  const px = /^(-?[\d.]+)px$/.exec(body);
  if (px !== null) return { px: Number.parseFloat(px[1] as string) };
  const rem = /^(-?[\d.]+)rem$/.exec(body);
  if (rem !== null) return { px: Number.parseFloat(rem[1] as string) * 16 };
  return undefined;
}

const SIDE_OF: Record<string, Array<"top" | "right" | "bottom" | "left">> = {
  t: ["top"], r: ["right"], b: ["bottom"], l: ["left"],
  x: ["left", "right"], y: ["top", "bottom"],
};

const PROP_OF: Record<string, string[]> = {
  t: ["top"], r: ["right"], b: ["bottom"], l: ["left"],
  x: ["left", "right"], y: ["top", "bottom"],
};

/**
 * Resolve one class token. Returns an empty list for anything unknown, so the
 * caller counts it unresolved rather than inventing a value.
 */
export function resolveClass(raw: string, overrides: Partial<Record<string, number>> = {}): Resolved[] {
  const token = raw.replace(/^(?:hover|focus|active|sm|md|lg|xl|2xl|dark|group-hover):/, "");
  const out: Resolved[] = [];

  // padding / margin
  const box = /^(p|m)([trblxy])?-(.+)$/.exec(token);
  if (box !== null) {
    const arb = arbitrary(box[3] as string);
    const px = arb?.px ?? overrides[box[3] as string] ?? spacingPx(box[3] as string);
    if (px === undefined) return out;
    const base = box[1] === "p" ? "padding" : "margin";
    const sides = box[2] === undefined ? ["top", "right", "bottom", "left"] : (PROP_OF[box[2]] ?? []);
    for (const side of sides) out.push({ kind: "spacing", value: px, prop: `${base}-${side}` });
    return out;
  }

  const gap = /^gap(?:-[xy])?-(.+)$/.exec(token);
  if (gap !== null) {
    const px = arbitrary(gap[1] as string)?.px ?? spacingPx(gap[1] as string);
    if (px !== undefined) out.push({ kind: "spacing", value: px, prop: "gap" });
    return out;
  }

  // radius
  const radius = /^rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?$|^rounded-(\[.+\])$/.exec(token);
  if (radius !== null) {
    const arb = radius[1] !== undefined ? arbitrary(radius[1]) : undefined;
    const named = token === "rounded" ? "" : token.replace(/^rounded-/, "");
    const px = arb?.px ?? RADII[named];
    if (px !== undefined) out.push({ kind: "radius", value: px });
    return out;
  }

  // border width, with an optional side
  const border = /^border(?:-([trblxy]))?(?:-(\d+|\[.+\]))?$/.exec(token);
  if (border !== null) {
    const arb = border[2] !== undefined ? arbitrary(border[2]) : undefined;
    const px = arb?.px ?? BORDER_WIDTHS[border[2] ?? ""];
    if (px !== undefined && px > 0) {
      out.push({
        kind: "borderWidth",
        value: px,
        sides: border[1] === undefined ? ["top", "right", "bottom", "left"] : (SIDE_OF[border[1]] ?? []),
      });
    }
    return out;
  }

  // font size / tracking / leading / weight / alignment / italic
  const text = /^text-(.+)$/.exec(token);
  if (text !== null) {
    const key = text[1] as string;
    const arb = arbitrary(key);
    if (arb?.px !== undefined) out.push({ kind: "fontSize", value: arb.px });
    else if (arb?.hex !== undefined) out.push({ kind: "color", hex: arb.hex, role: "fg" });
    else if (TEXT_SIZES[key] !== undefined) out.push({ kind: "fontSize", value: TEXT_SIZES[key] });
    else if (key === "left" || key === "start") out.push({ kind: "align", text: "start" });
    else if (key === "center") out.push({ kind: "align", text: "center" });
    else if (key === "right" || key === "end") out.push({ kind: "align", text: "end" });
    else if (key === "justify") out.push({ kind: "align", text: "justify" });
    else if (PALETTE[key] !== undefined) out.push({ kind: "color", hex: PALETTE[key] as string, role: "fg" });
    return out;
  }

  const bg = /^bg-(.+)$/.exec(token);
  if (bg !== null) {
    const key = bg[1] as string;
    const arb = arbitrary(key);
    const hex = arb?.hex ?? PALETTE[key];
    if (hex !== undefined) out.push({ kind: "color", hex, role: "bg" });
    return out;
  }

  const borderColor = /^border-(.+)$/.exec(token);
  if (borderColor !== null) {
    const hex = arbitrary(borderColor[1] as string)?.hex ?? PALETTE[borderColor[1] as string];
    if (hex !== undefined) out.push({ kind: "color", hex, role: "border" });
    return out;
  }

  const font = /^font-(.+)$/.exec(token);
  if (font !== null && WEIGHTS[font[1] as string] !== undefined) {
    out.push({ kind: "weight", value: WEIGHTS[font[1] as string] });
    return out;
  }

  const tracking = /^tracking-(.+)$/.exec(token);
  if (tracking !== null) {
    const key = tracking[1] as string;
    const em = TRACKING[key] ?? (/^\[(-?[\d.]+)em\]$/.exec(key) !== null
      ? Number.parseFloat(/^\[(-?[\d.]+)em\]$/.exec(key)?.[1] as string)
      : undefined);
    if (em !== undefined) out.push({ kind: "tracking", value: em });
    return out;
  }

  const leading = /^leading-(.+)$/.exec(token);
  if (leading !== null) {
    const key = leading[1] as string;
    const ratio = LEADING[key] ?? (Number.isFinite(Number.parseFloat(key)) ? Number.parseFloat(key) / 4 : undefined);
    if (ratio !== undefined) out.push({ kind: "leading", value: ratio });
    return out;
  }

  if (token === "italic") out.push({ kind: "italic", value: 1 });

  // text-transform. Bare tokens, like `italic` — no `text-` prefix to key on.
  //
  // These are not cosmetic to resolve. `wide-tracking` already EXEMPTS uppercase
  // text, because wide tracking on small all-caps is correct typography; that
  // exemption simply never fired, because this resolver dropped the token and the
  // rule saw `transform: undefined`. An exemption that cannot fire does not read
  // as NOT-EVALUATED — it reads as a false positive, silently, because `needs` is
  // kind-granular and `typography` was present all along.
  const transform = TEXT_TRANSFORMS[token];
  if (transform !== undefined) out.push({ kind: "transform", text: transform });
  return out;
}

/** True for a token that looks like a Tailwind utility but resolved to nothing. */
export function looksLikeUtility(token: string): boolean {
  return /^(?:p|m|gap|rounded|border|text|bg|font|tracking|leading|shadow|w|h|flex|grid|items|justify)[-a-z0-9[\]#./]*$/i.test(
    token,
  );
}
