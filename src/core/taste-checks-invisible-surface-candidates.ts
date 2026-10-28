/**
 * The low-alpha white/black tints an element paints, and WHERE each one paints.
 *
 * Where decides the backdrop it is measured against:
 *  - `fill`  : the element's own background. Seen against what is behind the element.
 *  - `edge`  : a border, a `divide`, an inset shadow or inset ring. Drawn inside the
 *              element's box, over its own surface.
 *  - `outer` : an outer ring, outline or box-shadow. Painted OUTSIDE the border box,
 *              over the element's parent, whatever the element itself is filled with.
 *  - `overlay`: anything a `::before` / `::after` box paints; it sits over its element's own surface.
 *
 * Sources: Tailwind classes, and the computed cascade (rules and inline style, with
 * `var()` resolved). Only surfaces are read, never `color:` or `text-*`.
 */
import type { Element } from "domhandler";
import type { Computed, ComputedStyle } from "./extractors/html/css-cascade.js";
import { parseShadow, splitTopLevel } from "./extractors/html/css-values.js";
import { parsePaintColor } from "./taste-checks-invisible-surface-paint.js";
import { tintUtilities } from "./taste-checks-invisible-surface-tailwind.js";

/** At or above this alpha a tint is a deliberate, visible layer and is never judged. */
export const ALPHA_FLOOR = 0.15;

export type Placement = "fill" | "edge" | "outer" | "overlay";

export interface Candidate {
  tint: "white" | "black";
  alpha: number;
  placement: Placement;
  /** The utility (`border-white/10`) or the declaration (`box-shadow`) that paints it. */
  label: string;
  /** 1-based source line; undefined when the position is unknown. */
  line?: number;
  /** Equal keys are one declaration seen through several elements: reported once. */
  key: string;
  utility: boolean;
}

const FILL_PROPS = ["background", "background-color"];
const EDGE_PROPS = [
  "border", "border-color", "border-top", "border-right", "border-bottom", "border-left",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
];
const OUTLINE_PROPS = ["outline", "outline-color"];

/** `{tint, alpha}` when `hex`/`alpha` is pure white or black under the alpha floor. */
function asTint(hex: string, alpha: number | undefined): { tint: "white" | "black"; alpha: number } | null {
  const a = alpha ?? 1;
  if (!(a > 0 && a < ALPHA_FLOOR)) return null;
  if (hex === "ffffff") return { tint: "white", alpha: a };
  if (hex === "000000") return { tint: "black", alpha: a };
  return null;
}

/** The first colour in a declaration value, as `hex/alpha` text; undefined when it has none. */
function firstColour(value: string): { hex: string; alpha?: number } | undefined {
  for (const token of splitTopLevel(value, " ")) {
    const c = parsePaintColor(token);
    if (c !== undefined) return c;
  }
  return undefined;
}

type Resolve = (value: string, el: Element) => string | undefined;

/**
 * One slot (fill, edge or outline) written through several properties: `border` and
 * `border-color` both set the edge, and which wins depends on source order this scan
 * does not keep. Judge it only when every property that names a colour names the same one.
 */
function slotCandidate(el: Element, style: ComputedStyle, props: string[], placement: Placement, resolve: Resolve, lineAt: (c: Computed) => number): Candidate | null {
  let found: { hex: string; alpha?: number; decl: Computed; prop: string } | undefined;
  for (const prop of props) {
    const decl = style.get(prop);
    if (decl === undefined) continue;
    const value = resolve(decl.value, el);
    const colour = value === undefined ? undefined : firstColour(value);
    if (colour === undefined) continue;
    if (found !== undefined && (found.hex !== colour.hex || (found.alpha ?? 1) !== (colour.alpha ?? 1))) return null;
    found ??= { ...colour, decl, prop };
  }
  const tint = found === undefined ? null : asTint(found.hex, found.alpha);
  if (found === undefined || tint === null) return null;
  const line = lineAt(found.decl);
  return { ...tint, placement, label: found.prop, line, key: `${line}|${found.prop}|${tint.tint}|${tint.alpha}`, utility: false };
}

/** Tints declared by rules and inline style. */
export function styleCandidates(el: Element, style: ComputedStyle | undefined, resolve: Resolve): Candidate[] {
  if (style === undefined) return [];
  const lineAt = (c: Computed): number => c.line;
  const out: Candidate[] = [];
  for (const [props, placement] of [[FILL_PROPS, "fill"], [EDGE_PROPS, "edge"], [OUTLINE_PROPS, "outer"]] as const) {
    const c = slotCandidate(el, style, [...props], placement, resolve, lineAt);
    if (c !== null) out.push(c);
  }
  const shadow = style.get("box-shadow");
  const shadowValue = shadow === undefined ? undefined : resolve(shadow.value, el);
  if (shadow !== undefined && shadowValue !== undefined) {
    for (const one of splitTopLevel(shadowValue, ",")) {
      const s = parseShadow(one);
      const tint = s?.hex === undefined ? null : asTint(s.hex, s.alpha);
      if (s === undefined || tint === null) continue;
      out.push({
        ...tint, placement: s.inset === true ? "edge" : "outer", label: "box-shadow", line: shadow.line,
        key: `${shadow.line}|box-shadow|${tint.tint}|${tint.alpha}|${s.inset === true}`, utility: false,
      });
    }
  }
  return out;
}

/**
 * Tints named by Tailwind utilities. A `dark:` utility describes the dark state, which
 * this scan does not model; and under a dark root it REPLACES the unprefixed utility of
 * the same slot, so that unprefixed half is the inactive one.
 */
export function utilityCandidates(classes: readonly string[], darkRoot: boolean, lineOfToken: (token: string) => number | undefined): Candidate[] {
  const out: Candidate[] = [];
  for (const u of tintUtilities(classes)) {
    if (u.variants.includes("dark")) continue;
    if (darkRoot && classes.some((t) => t.includes(`dark:${u.slot}-`))) continue;
    if (u.alpha >= ALPHA_FLOOR || u.alpha <= 0) continue;
    const placement: Placement = u.slot === "bg" ? "fill" : u.slot === "outline" || (u.slot === "ring" && !u.inset) ? "outer" : "edge";
    out.push({
      tint: u.tint, alpha: u.alpha, placement, label: u.token.replace(/^(?:[\w-]+:)*/, ""),
      line: lineOfToken(u.token), key: u.token, utility: true,
    });
  }
  return out;
}
