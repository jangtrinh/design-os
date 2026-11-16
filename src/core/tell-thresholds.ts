/**
 * Every tuning knob the tell family turns, in one place, with its provenance.
 *
 * The problem this solves is measured, not theoretical. Of 63+ deliberate red probes
 * fired while building the family, **13 came back green** — the guard existed but
 * nothing asserted where it sat, so moving the number broke nothing and the suite
 * certified a rule that no longer worked. Two of those were colour windows in this very
 * file's neighbours: the purple window excluded indigo `#6366f1`, and the cream window
 * excluded `#FAF7F0`, the canonical reflex cream the rule exists to catch.
 *
 * A number here is not pinned by being written down. It is pinned by
 * `BOUNDARY_PAIRS` in `tell-boundary-pairs.ts`, which supplies an executable pair per
 * constant — a value AT the threshold that must NOT trip, and one PAST it that MUST.
 * The meta-test fails for any constant lacking a pair, so an unguarded threshold is a
 * structurally detectable state rather than a probe someone hopefully remembers to run.
 * That is the same shape as `partition()`, which already throws when a rule lands in
 * neither bucket.
 *
 * What does NOT belong here: presence checks (`px > 0`), geometric definitions
 * (`sides.length >= 4` means "all four sides"), and array-length guards that only say
 * "there is not enough here to compare". Those are not knobs; turning them does not
 * retune a rule, it breaks it. Classified out deliberately — a table that absorbs every
 * integer in the codebase teaches nothing.
 */

export type ThresholdUnit =
  | "px" | "ratio" | "em" | "ms" | "count" | "channel" | "chars" | "alpha" | "per-100-words";

export interface Threshold {
  readonly value: number;
  readonly unit: ThresholdUnit;
  /** The rule or helper whose verdict this number decides. */
  readonly owner: string;
  /** Where the value came from. `unknown` is allowed and preferred over invention. */
  readonly provenance: string;
}

export const TELL_THRESHOLDS = {
  // ── Colour windows ──────────────────────────────────────────────────────────
  // Every one of these is a channel value in 0–255. They decide which hexes belong
  // to a named family, and they are where the green probes clustered.

  PURPLE_MIN_BLUE: { value: 140, unit: "channel" as const, owner: "isAiPurple",
    provenance: "Navy and dark plum fail this on their own, which is the point — they are not the tell." },
  PURPLE_MIN_BLUE_OVER_GREEN: { value: 60, unit: "channel" as const, owner: "isAiPurple",
    provenance: "Blue must dominate green by this much before the hue reads violet rather than blue." },
  PURPLE_MIN_RED: { value: 60, unit: "channel" as const, owner: "isAiPurple",
    provenance: "Excludes near-black blues, which are navy, not purple." },
  PURPLE_MIN_RED_OVER_GREEN: { value: -20, unit: "channel" as const, owner: "isAiPurple",
    provenance: "SCAR: the first set required r-g > 30, which excluded indigo #6366f1 (r-g = -3) — squarely the family this rule exists to catch. The miss surfaced only when the guard was deliberately broken and the suite stayed green. -20 admits indigo while still rejecting royal blue #4169e1 (-40) and blue-500 #3b82f6 (-71)." },

  CYAN_MIN_GREEN: { value: 170, unit: "channel" as const, owner: "isAiCyan", provenance: "Cyan needs both green and blue high." },
  CYAN_MIN_BLUE: { value: 170, unit: "channel" as const, owner: "isAiCyan", provenance: "Paired with CYAN_MIN_GREEN." },
  CYAN_MAX_RED: { value: 110, unit: "channel" as const, owner: "isAiCyan", provenance: "Red must stay low or the colour reads as a pale tint." },

  CREAM_MIN_RED: { value: 235, unit: "channel" as const, owner: "isCream", provenance: "Cream is a near-white; red is the highest channel." },
  CREAM_MIN_GREEN: { value: 225, unit: "channel" as const, owner: "isCream", provenance: "Green trails red slightly in a warm off-white." },
  CREAM_MIN_BLUE: { value: 200, unit: "channel" as const, owner: "isCream", provenance: "Blue is the suppressed channel — that suppression is the warmth." },
  CREAM_MIN_WARMTH: { value: 8, unit: "channel" as const, owner: "isCream",
    provenance: "SCAR: a floor of 12 silently excluded #FAF7F0, the canonical reflex cream this rule exists to catch, whose r-b is 10." },
  CREAM_MAX_WARMTH: { value: 48, unit: "channel" as const, owner: "isCream",
    provenance: "Past this the colour is a tan or a beige, not an off-white pretending to be neutral." },

  GREY_MAX_CHROMA: { value: 24, unit: "channel" as const, owner: "isGrey", provenance: "max-min channel spread below which a colour reads neutral." },
  GREY_MIN_LIGHTNESS: { value: 90, unit: "channel" as const, owner: "isGrey", provenance: "Darker than this is a near-black, judged by contrast instead." },
  GREY_MAX_LIGHTNESS: { value: 205, unit: "channel" as const, owner: "isGrey", provenance: "Lighter than this is an off-white, judged by isCream instead." },

  SATURATED_MIN_CHROMA: { value: 60, unit: "channel" as const, owner: "isSaturated",
    provenance: "max-min spread at which grey text over the colour starts to read washed out." },

  DARK_SURFACE_MAX_CHANNEL: { value: 60, unit: "channel" as const, owner: "dark-glow",
    provenance: "Red and green both below this is a dark surface — the ground a glow is simulated on." },

  // ── Type ────────────────────────────────────────────────────────────────────

  BODY_COPY_MAX_PX: { value: 20, unit: "px" as const, owner: "tight-leading",
    provenance: "Above this the run is display type, where tight leading is craft rather than a defect." },
  TIGHT_LEADING_MAX: { value: 1.2, unit: "ratio" as const, owner: "tight-leading", provenance: "Below this, body copy lines start to collide." },
  WIDE_TRACKING_MIN_EM: { value: 0.18, unit: "em" as const, owner: "wide-tracking",
    provenance: "Wide tracking is correct for small all-caps and wrong elsewhere; the rule already exempts uppercase." },
  NEGATIVE_TRACKING_MAX_EM: { value: -0.05, unit: "em" as const, owner: "extreme-negative-tracking",
    provenance: "Past this, letters touch before the headline reads tighter." },
  HIERARCHY_MIN_STEP: { value: 1.25, unit: "ratio" as const, owner: "flat-type-hierarchy",
    provenance: "A step smaller than this does not read as a rank change." },
  DISPLAY_FLOOR_PX: { value: 24, unit: "px" as const, owner: "flat-type-hierarchy",
    provenance: "SCAR: measured on a real React app, 27 of 27 hits were 12/14/16px UI chrome — the text-xs/sm/base scale, which is interface text and not a broken heading hierarchy. A set with nothing above display size has no hierarchy to judge." },
  OVERSIZED_H1_RATIO: { value: 3, unit: "ratio" as const, owner: "oversized-h1", provenance: "An h1 more than 3x the next size has nothing between it and the rest." },
  LINE_LENGTH_MAX_CHARS: { value: 400, unit: "chars" as const, owner: "line-length", provenance: "A body run longer than this has no container constraint visible to this tier." },
  TINY_TEXT_MIN_PX: { value: 12, unit: "px" as const, owner: "undersized-ui-text", provenance: "Interface text below 12px is not reliably legible." },

  // ── Surface ─────────────────────────────────────────────────────────────────

  BORDER_FRAME_MIN_PX: { value: 3, unit: "px" as const, owner: "side-tab / heavy-frame",
    provenance: "At or above this a border reads as a deliberate frame rather than a hairline divider." },
  HAIRLINE_MAX_PX: { value: 1, unit: "px" as const, owner: "hairline-with-heavy-shadow", provenance: "A 1px border is a hairline." },
  HEAVY_SHADOW_MIN_BLUR_PX: { value: 16, unit: "px" as const, owner: "hairline-with-heavy-shadow",
    provenance: "A blur this large under a hairline border is two idioms fighting." },
  GLOW_MIN_BLUR_PX: { value: 20, unit: "px" as const, owner: "dark-glow", provenance: "Below this the shadow reads as depth, not as simulated light." },
  ROUNDED_MIN_PX: { value: 4, unit: "px" as const, owner: "side-tab", provenance: "The smallest radius that reads as intentionally rounded." },
  CARD_RADIUS_MIN_PX: { value: 8, unit: "px" as const, owner: "heavy-frame", provenance: "A card corner rather than a chamfer." },
  CRAMPED_PADDING_MAX_PX: { value: 8, unit: "px" as const, owner: "cramped-padding", provenance: "Padding below this on a rounded surface crowds its own content." },
  CRAMPED_RADIUS_MIN_PX: { value: 12, unit: "px" as const, owner: "cramped-padding", provenance: "Below this the surface is not rounded enough for padding to look cramped." },
  ENOUGH_SPACINGS_TO_JUDGE: { value: 8, unit: "count" as const, owner: "single-spacing-value",
    provenance: "Fewer spacing declarations than this is a fragment, not a spacing system." },
  REPEATED_TEXT_MIN_CHARS: { value: 24, unit: "chars" as const, owner: "repeated-container-text",
    provenance: "Shorter strings repeat legitimately — labels, units, single words." },
  REPEATED_TEXT_MIN_COUNT: { value: 3, unit: "count" as const, owner: "repeated-container-text",
    provenance: "Twice is a pair; three times is a template." },
  SHALLOW_CARD_MAX_DEPTH: { value: 2, unit: "count" as const, owner: "cards-without-margin", provenance: "Top-level cards, where a missing margin actually shows." },

  // ── Labels and icons ────────────────────────────────────────────────────────

  ICON_TILE_MAX_RADIUS_PX: { value: 16, unit: "px" as const, owner: "icon-tile-stack", provenance: "Above this the surface is a card, not an icon tile." },
  ICON_TILE_MIN_COUNT: { value: 5, unit: "count" as const, owner: "icon-tile-stack", provenance: "Repetition, not a pair." },
  KICKER_MAX_CHARS: { value: 32, unit: "chars" as const, owner: "kicker-above-heading", provenance: "A kicker is a label; longer runs are sentences." },
  KICKER_MAX_PX: { value: 14, unit: "px" as const, owner: "kicker-above-heading", provenance: "Kickers are set small — that smallness is part of the device." },
  EYEBROW_MAX_CHARS: { value: 40, unit: "chars" as const, owner: "hero-eyebrow-chip", provenance: "An eyebrow chip carries a phrase, not a sentence." },
  EYEBROW_MAX_LINE_GAP: { value: 6, unit: "count" as const, owner: "hero-eyebrow-chip", provenance: "Lines between the chip and the h1 before they stop reading as a pair." },
  PILL_RADIUS_PX: { value: 999, unit: "px" as const, owner: "pill detection", provenance: "The conventional fully-rounded radius." },
  CHIP_RADIUS_MIN_PX: { value: 12, unit: "px" as const, owner: "hero-eyebrow-chip", provenance: "Rounded enough to read as a chip." },

  METADATA_MAX_CHARS: { value: 200, unit: "chars" as const, owner: "prompt-leak-metadata",
    provenance: "Measured over 699 real titles: median 43, longest legitimate 120, and NOTHING between 120 and 1000. The gap makes the number free — anything in 150-900 classifies that corpus identically. 200 sits near the legitimate side, past the longest real title and past what a search result displays." },

  // ── Motion ──────────────────────────────────────────────────────────────────

  FAST_LOOP_MAX_MS: { value: 1200, unit: "ms" as const, owner: "pulsing-dot", provenance: "A forever-loop faster than this reads as an alert that never resolves." },
  SLOW_LOOP_MIN_MS: { value: 4000, unit: "ms" as const, owner: "ambient-drift", provenance: "A forever-loop slower than this is ambient motion with no message." },
  HALO_MAX_LINE_GAP: { value: 8, unit: "count" as const, owner: "radial-halo", provenance: "Lines from the h1 within which a radial gradient is hero ornament." },

  // ── Colour / alpha ──────────────────────────────────────────────────────────

  INVISIBLE_TEXT_MAX_ALPHA: { value: 0.1, unit: "alpha" as const, owner: "invisible-text", provenance: "Below this the text is effectively not there." },
  OPAQUE_MIN_ALPHA: { value: 0.95, unit: "alpha" as const, owner: "contrast resolution",
    provenance: "A background this opaque can be treated as the blend result; below it the blend is not knowable." },
  OWN_BACKGROUND_MIN_ALPHA: { value: 0.5, unit: "alpha" as const, owner: "role synthesis",
    provenance: "Below this a background does not establish the element as its own surface." },

  // ── Voice ───────────────────────────────────────────────────────────────────

  EM_DASH_MIN_WORDS: { value: 60, unit: "count" as const, owner: "em-dash-rate",
    provenance: "SCAR: a rate needs a denominator. Short runs produce meaningless rates, so the rule refuses to judge below this word count." },
  EM_DASH_MIN_COUNT: { value: 3, unit: "count" as const, owner: "em-dash-rate", provenance: "Two dashes in a long document is punctuation, not a habit." },
  EM_DASH_MAX_RATE: { value: 2.5, unit: "per-100-words" as const, owner: "em-dash-rate", provenance: "Above this the dash is a tic." },
} as const;

export type ThresholdKey = keyof typeof TELL_THRESHOLDS;

const _checkThresholds: Record<ThresholdKey, Threshold> = TELL_THRESHOLDS;
void _checkThresholds;

/** The numeric value, for use inside a rule predicate. */
export function thr(key: ThresholdKey): number {
  return TELL_THRESHOLDS[key].value;
}
