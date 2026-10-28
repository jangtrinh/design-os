/**
 * Tailwind utility → colour, for mode-invisible-surface.
 *
 * The CSS cascade knows nothing about utility classes, so this is the one place
 * the check reads them: what a `bg-*` class paints (to composite under a tint),
 * and which classes ARE a low-alpha white/black tint (`border-white/10`).
 *
 * Utilities without a colour this module can name resolve to UNKNOWN_PAINT, never
 * to a guess. Palette steps use luma bounds, not points: the five neutral families
 * agree to within 0.02 and get a point; the chromatic families disagree widely at
 * the middle shades (blue-600 0.37, yellow-600 0.56), so those shades keep wide
 * bounds and only the pale and deep ends decide anything.
 */
import { NO_PAINT, UNKNOWN_PAINT, parsePaintColor, paintOfColor, withAlpha } from "./taste-checks-invisible-surface-paint.js";
import type { Paint } from "./taste-checks-invisible-surface-paint.js";

const NEUTRAL_LUMA: Record<string, number> = {
  "50": 0.98, "100": 0.96, "200": 0.9, "300": 0.83, "400": 0.63, "500": 0.44,
  "600": 0.33, "700": 0.25, "800": 0.15, "900": 0.09, "950": 0.03,
};

/** Luma bounds across the chromatic families of the default palette, per shade (computed from its hex values, widened ~0.03). */
const CHROMATIC_LUMA: Record<string, readonly [number, number]> = {
  "50": [0.92, 1], "100": [0.87, 0.99], "200": [0.79, 0.96], "300": [0.67, 0.91],
  "400": [0.48, 0.83], "500": [0.36, 0.73], "600": [0.26, 0.6], "700": [0.19, 0.46],
  "800": [0.13, 0.4], "900": [0.08, 0.32], "950": [0.02, 0.22],
};

const NEUTRAL_FAMILY = "(?:slate|gray|grey|zinc|neutral|stone)";
const CHROMATIC_FAMILY = "(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";

/** Theme-token names (shadcn/ui): read from the document's own `--<name>` when it defines one, UNKNOWN otherwise. */
const THEME_SURFACE = new Set(["background", "card", "popover", "muted", "secondary", "accent"]);

/** `bg-*` utilities that are not a colour: size, position, repeat, clip, opacity, `none`. */
const NON_COLOUR_BG = /^(?:cover|contain|auto|center|(?:left|right)?-?(?:top|bottom)|left|right|(?:no-)?repeat(?:-[xy]|-round|-space)?|fixed|local|scroll|clip-[\w-]+|origin-[\w-]+|blend-[\w-]+|size-.+|position-.+|none|opacity-\d+|\[(?:length|position|size|percentage|image):.*)$/;

/** Parses a Tailwind opacity modifier: `10`, `[0.08]`, `[8%]` → 0..1; undefined when malformed. */
function modifierAlpha(raw: string): number | undefined {
  const bracket = /^\[([\d.]+)(%?)\]$/.exec(raw);
  const n = bracket !== null ? Number.parseFloat(bracket[1] as string) / (bracket[2] === "%" ? 100 : 1) : Number.parseFloat(raw) / 100;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
}

/**
 * What a bare `bg-*` utility (variants already stripped) paints. `theme` resolves a
 * theme-token name for the element in question; undefined when it cannot.
 * Returns undefined for a utility that is not a colour at all.
 */
function utilityPaint(u: string, theme: (name: string) => Paint | undefined): Paint | undefined {
  if (NON_COLOUR_BG.test(u)) return undefined;
  const mod = /\/(\d{1,3}|\[[\d.]+%?\])$/.exec(u);
  const base = mod === null ? u : u.slice(0, mod.index);
  const alpha = mod === null ? undefined : modifierAlpha(mod[1] as string);
  if (mod !== null && alpha === undefined) return UNKNOWN_PAINT;
  const tinted = (p: Paint): Paint => (alpha === undefined ? p : withAlpha(p, p.alpha * alpha));

  if (base === "transparent") return NO_PAINT;
  if (base === "white") return tinted({ lo: 1, hi: 1, alpha: 1, chromatic: false });
  if (base === "black") return tinted({ lo: 0, hi: 0, alpha: 1, chromatic: false });
  const neutral = new RegExp(`^${NEUTRAL_FAMILY}-(\\d{2,3})$`).exec(base)?.[1];
  if (neutral !== undefined) {
    const luma = NEUTRAL_LUMA[neutral];
    return luma === undefined ? UNKNOWN_PAINT : tinted({ lo: luma, hi: luma, alpha: 1, chromatic: false });
  }
  const chromatic = new RegExp(`^${CHROMATIC_FAMILY}-(\\d{2,3})$`).exec(base)?.[1];
  if (chromatic !== undefined) {
    const bounds = CHROMATIC_LUMA[chromatic];
    return bounds === undefined ? UNKNOWN_PAINT : tinted({ lo: bounds[0], hi: bounds[1], alpha: 1, chromatic: true });
  }
  const arbitrary = /^\[(.+)\]$/.exec(base)?.[1];
  if (arbitrary !== undefined) {
    const colour = parsePaintColor(arbitrary.replace(/_/g, " "));
    return colour === undefined ? UNKNOWN_PAINT : tinted(paintOfColor(colour));
  }
  if (THEME_SURFACE.has(base)) {
    const themed = theme(base);
    return themed === undefined ? UNKNOWN_PAINT : tinted(themed);
  }
  return UNKNOWN_PAINT; // bg-primary, bg-gradient-to-r, bg-[url(...)], anything this module cannot name
}

/** Breakpoint, dark and similar variants that may repaint a surface the scan cannot evaluate. */
const REPAINTING_VARIANT = /^(?:dark|sm|md|lg|xl|2xl|min-.+|max-.+|print|motion-.+|contrast-.+|portrait|landscape|rtl|ltr)$/;

/**
 * The background a class list sets, or undefined when it sets none. An unprefixed
 * utility is the resting state; a `dark:` or breakpoint variant may replace it, which
 * the scan cannot evaluate, so it makes the surface unreadable. `hover:`/`focus:` are
 * transient states and are ignored.
 */
export function classBackground(classes: readonly string[], theme: (name: string) => Paint | undefined): Paint | undefined {
  let out: Paint | undefined;
  let opacity: number | undefined;
  for (const token of classes) {
    const m = /^((?:[\w-]+:)*)bg-(.+)$/.exec(token);
    if (m === null) continue;
    const variants = (m[1] as string).split(":").filter(Boolean);
    if (variants.length > 0) {
      if (!variants.some((v) => REPAINTING_VARIANT.test(v))) continue;
      out = UNKNOWN_PAINT;
      continue;
    }
    const rest = m[2] as string;
    const op = /^opacity-(\d{1,3})$/.exec(rest);
    if (op !== null) { opacity = modifierAlpha(op[1] as string); continue; }
    const paint = utilityPaint(rest, theme);
    if (paint === undefined) continue;
    out = out === undefined || (out.lo === paint.lo && out.hi === paint.hi && out.alpha === paint.alpha) ? paint : UNKNOWN_PAINT;
  }
  if (out !== undefined && opacity !== undefined && out.alpha === 1 && out !== UNKNOWN_PAINT) out = withAlpha(out, opacity);
  return out;
}

/** Where on the element a tint utility paints. */
export type TintSlot = "bg" | "border" | "divide" | "ring" | "outline";

export interface TintUtility {
  token: string;
  slot: TintSlot;
  tint: "white" | "black";
  alpha: number;
  /** `ring-inset`: the ring paints inside the border box, over the element's own surface. */
  inset: boolean;
  variants: string[];
}

const TINT_UTILITY = /^((?:[\w-]+:)*)(bg|border|ring|divide|outline)-(white|black)\/(\d{1,3}|\[[\d.]+%?\])$/;

/** Every `bg|border|ring|divide|outline-white|black/<alpha>` utility in a class list. */
export function tintUtilities(classes: readonly string[]): TintUtility[] {
  const out: TintUtility[] = [];
  for (const token of classes) {
    const m = TINT_UTILITY.exec(token);
    if (m === null) continue;
    const alpha = modifierAlpha(m[4] as string);
    if (alpha === undefined) continue;
    const slot = m[2] as TintSlot;
    out.push({
      token, slot, tint: m[3] as "white" | "black", alpha,
      inset: slot === "ring" && classes.includes("ring-inset"),
      variants: (m[1] as string).split(":").filter(Boolean),
    });
  }
  return out;
}
