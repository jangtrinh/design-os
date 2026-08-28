/**
 * Per-kind fact payloads for the DesignFacts IR. Split from fact-model.ts,
 * which owns the shared vocabulary (confidence tiers, kind list, provenance);
 * this file owns what each kind actually carries.
 *
 * Every payload's shape is driven by a rule that needs it, named in its
 * docblock where the reason is not obvious from the field list.
 */
import type { Provenance, FactKind } from "./fact-model.js";

/** Which visual slot a color occupies. A hex alone cannot be judged. */
export type ColorRole = "fg" | "bg" | "border" | "shadow" | "accent";

export interface ColorFact {
  kind: "color";
  /** Lower-case 6-digit hex, no leading `#`. Alpha rides in `alpha`. */
  hex: string;
  /** 0..1. Absent means fully opaque. */
  alpha?: number;
  role: ColorRole;
  /** Design-system token this color is bound to, when the source says so. */
  boundToken?: string;
  at: Provenance;
}

export interface GradientStop {
  hex: string;
  /** 0..1 along the gradient axis, when the source states it. */
  position?: number;
}

export interface GradientFact {
  kind: "gradient";
  gradientKind: "linear" | "radial" | "conic";
  stops: GradientStop[];
  /** Degrees, for linear gradients that declare one. */
  angleDeg?: number;
  at: Provenance;
}

export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize";
export type TextAlign = "start" | "center" | "end" | "justify";

export interface TypographyFact {
  kind: "typography";
  family?: string;
  sizePx?: number;
  weight?: number;
  /** Unitless ratio. A `px` line-height is divided by `sizePx` at emit time. */
  lineHeight?: number;
  /** em, so it is comparable across sizes. */
  letterSpacingEm?: number;
  transform?: TextTransform;
  align?: TextAlign;
  italic?: boolean;
  at: Provenance;
}

export type SpacingProp =
  | "padding-top" | "padding-right" | "padding-bottom" | "padding-left"
  | "margin-top" | "margin-right" | "margin-bottom" | "margin-left"
  | "gap";

export interface SpacingFact {
  kind: "spacing";
  prop: SpacingProp;
  px: number;
  at: Provenance;
}

export type Corner = "top-left" | "top-right" | "bottom-right" | "bottom-left";

export interface RadiusFact {
  kind: "radius";
  px: number;
  /** Omitted means all four corners. */
  corners?: Corner[];
  at: Provenance;
}

export type Side = "top" | "right" | "bottom" | "left";

export interface BorderFact {
  kind: "border";
  /** The sides this border is actually painted on. A one-side border is the
   *  `side-tab` tell; the sides list is what makes that rule expressible. */
  sides: Side[];
  widthPx: number;
  hex?: string;
  at: Provenance;
}

export interface ShadowFact {
  kind: "shadow";
  offsetXPx: number;
  offsetYPx: number;
  blurPx: number;
  spreadPx?: number;
  hex?: string;
  alpha?: number;
  inset?: boolean;
  at: Provenance;
}

export type MotionKind = "transition" | "animation" | "keyframes";

export interface MotionFact {
  kind: "motion";
  motionKind: MotionKind;
  durationMs?: number;
  /** Verbatim easing token or function, e.g. `linear`, `cubic-bezier(...)`. */
  easing?: string;
  /** Properties animated. `["all"]` is itself a finding. */
  props?: string[];
  /** True for infinite/repeatForever. The `pulsing-dot` tell needs it. */
  repeatsForever?: boolean;
  at: Provenance;
}

/** What a run of text is doing on the page. */
export type TextRole = "heading" | "body" | "label" | "unknown";

export interface TextFact {
  kind: "text";
  content: string;
  role: TextRole;
  /** Heading level when role is `heading`. */
  level?: number;
  at: Provenance;
}

/**
 * Structural position. Nesting and rhythm rules (`nested-cards`,
 * `monotonous-spacing`, `edge-flush-cards`, `heading-rhythm`,
 * `repeated-container-text`) REQUIRE this kind: without it, "two radii in one
 * file" is not evidence of nesting, and the prototype that inspired those rules
 * proved the point by reporting "radius 16 inside 12".
 */
export interface StructureFact {
  kind: "structure";
  /** Tag, widget or view name as written: `div`, `Container`, `VStack`. */
  node: string;
  /** 0 at the artifact root. */
  depth: number;
  /** Stable locator for the parent, or undefined at the root. */
  parentRef?: string;
  /** Stable locator for this node; the FloorFinding `nodeRef` is built from it. */
  ref: string;
  /** Role hints an extractor could infer (`card`, `section`, `icon`). */
  roles?: string[];
  at: Provenance;
}


export type DesignFact =
  | ColorFact
  | GradientFact
  | TypographyFact
  | SpacingFact
  | RadiusFact
  | BorderFact
  | ShadowFact
  | MotionFact
  | TextFact
  | StructureFact;

/** Narrow a fact union member by its kind. */
export type FactOf<K extends FactKind> = Extract<DesignFact, { kind: K }>;
