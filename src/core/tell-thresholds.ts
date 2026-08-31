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

const t = (value: number, unit: ThresholdUnit, owner: string, provenance: string): Threshold =>
  ({ value, unit, owner, provenance });

export const TELL_THRESHOLDS = {
  // ── Colour windows ──────────────────────────────────────────────────────────
  // Every one of these is a channel value in 0–255. They decide which hexes belong
  // to a named family, and they are where the green probes clustered.

  PURPLE_MIN_BLUE: t(140, "channel", "isAiPurple",
    "Navy and dark plum fail this on their own, which is the point — they are not the tell."),
  PURPLE_MIN_BLUE_OVER_GREEN: t(60, "channel", "isAiPurple",
    "Blue must dominate green by this much before the hue reads violet rather than blue."),
  PURPLE_MIN_RED: t(60, "channel", "isAiPurple",
    "Excludes near-black blues, which are navy, not purple."),
  PURPLE_MIN_RED_OVER_GREEN: t(-20, "channel", "isAiPurple",
    "SCAR: the first set required r-g > 30, which excluded indigo #6366f1 (r-g = -3) — " +
    "squarely the family this rule exists to catch. The miss surfaced only when the guard " +
    "was deliberately broken and the suite stayed green. -20 admits indigo while still " +
    "rejecting royal blue #4169e1 (-40) and blue-500 #3b82f6 (-71)."),

  CYAN_MIN_GREEN: t(170, "channel", "isAiCyan", "Cyan needs both green and blue high."),
  CYAN_MIN_BLUE: t(170, "channel", "isAiCyan", "Paired with CYAN_MIN_GREEN."),
  CYAN_MAX_RED: t(110, "channel", "isAiCyan", "Red must stay low or the colour reads as a pale tint."),

  CREAM_MIN_RED: t(235, "channel", "isCream", "Cream is a near-white; red is the highest channel."),
  CREAM_MIN_GREEN: t(225, "channel", "isCream", "Green trails red slightly in a warm off-white."),
  CREAM_MIN_BLUE: t(200, "channel", "isCream", "Blue is the suppressed channel — that suppression is the warmth."),
  CREAM_MIN_WARMTH: t(8, "channel", "isCream",
    "SCAR: a floor of 12 silently excluded #FAF7F0, the canonical reflex cream this rule " +
    "exists to catch, whose r-b is 10."),
  CREAM_MAX_WARMTH: t(48, "channel", "isCream",
    "Past this the colour is a tan or a beige, not an off-white pretending to be neutral."),

  GREY_MAX_CHROMA: t(24, "channel", "isGrey", "max-min channel spread below which a colour reads neutral."),
  GREY_MIN_LIGHTNESS: t(90, "channel", "isGrey", "Darker than this is a near-black, judged by contrast instead."),
  GREY_MAX_LIGHTNESS: t(205, "channel", "isGrey", "Lighter than this is an off-white, judged by isCream instead."),

  SATURATED_MIN_CHROMA: t(60, "channel", "isSaturated",
    "max-min spread at which grey text over the colour starts to read washed out."),

  DARK_SURFACE_MAX_CHANNEL: t(60, "channel", "dark-glow",
    "Red and green both below this is a dark surface — the ground a glow is simulated on."),

  // ── Type ────────────────────────────────────────────────────────────────────

  BODY_COPY_MAX_PX: t(20, "px", "tight-leading",
    "Above this the run is display type, where tight leading is craft rather than a defect."),
  TIGHT_LEADING_MAX: t(1.2, "ratio", "tight-leading", "Below this, body copy lines start to collide."),
  WIDE_TRACKING_MIN_EM: t(0.18, "em", "wide-tracking",
    "Wide tracking is correct for small all-caps and wrong elsewhere; the rule already exempts uppercase."),
  NEGATIVE_TRACKING_MAX_EM: t(-0.05, "em", "extreme-negative-tracking",
    "Past this, letters touch before the headline reads tighter."),
  HIERARCHY_MIN_STEP: t(1.25, "ratio", "flat-type-hierarchy",
    "A step smaller than this does not read as a rank change."),
  DISPLAY_FLOOR_PX: t(24, "px", "flat-type-hierarchy",
    "SCAR: measured on a real React app, 27 of 27 hits were 12/14/16px UI chrome — the " +
    "text-xs/sm/base scale, which is interface text and not a broken heading hierarchy. " +
    "A set with nothing above display size has no hierarchy to judge."),
  OVERSIZED_H1_RATIO: t(3, "ratio", "oversized-h1", "An h1 more than 3x the next size has nothing between it and the rest."),
  LINE_LENGTH_MAX_CHARS: t(400, "chars", "line-length", "A body run longer than this has no container constraint visible to this tier."),
  TINY_TEXT_MIN_PX: t(12, "px", "undersized-ui-text", "Interface text below 12px is not reliably legible."),

  // ── Surface ─────────────────────────────────────────────────────────────────

  BORDER_FRAME_MIN_PX: t(3, "px", "side-tab / heavy-frame",
    "At or above this a border reads as a deliberate frame rather than a hairline divider."),
  HAIRLINE_MAX_PX: t(1, "px", "hairline-with-heavy-shadow", "A 1px border is a hairline."),
  HEAVY_SHADOW_MIN_BLUR_PX: t(16, "px", "hairline-with-heavy-shadow",
    "A blur this large under a hairline border is two idioms fighting."),
  GLOW_MIN_BLUR_PX: t(20, "px", "dark-glow", "Below this the shadow reads as depth, not as simulated light."),
  ROUNDED_MIN_PX: t(4, "px", "side-tab", "The smallest radius that reads as intentionally rounded."),
  CARD_RADIUS_MIN_PX: t(8, "px", "heavy-frame", "A card corner rather than a chamfer."),
  CRAMPED_PADDING_MAX_PX: t(8, "px", "cramped-padding", "Padding below this on a rounded surface crowds its own content."),
  CRAMPED_RADIUS_MIN_PX: t(12, "px", "cramped-padding", "Below this the surface is not rounded enough for padding to look cramped."),
  ENOUGH_SPACINGS_TO_JUDGE: t(8, "count", "single-spacing-value",
    "Fewer spacing declarations than this is a fragment, not a spacing system."),
  REPEATED_TEXT_MIN_CHARS: t(24, "chars", "repeated-container-text",
    "Shorter strings repeat legitimately — labels, units, single words."),
  REPEATED_TEXT_MIN_COUNT: t(3, "count", "repeated-container-text",
    "Twice is a pair; three times is a template."),
  SHALLOW_CARD_MAX_DEPTH: t(2, "count", "cards-without-margin", "Top-level cards, where a missing margin actually shows."),

  // ── Labels and icons ────────────────────────────────────────────────────────

  ICON_TILE_MAX_RADIUS_PX: t(16, "px", "icon-tile-stack", "Above this the surface is a card, not an icon tile."),
  ICON_TILE_MIN_COUNT: t(5, "count", "icon-tile-stack", "Repetition, not a pair."),
  KICKER_MAX_CHARS: t(32, "chars", "kicker-above-heading", "A kicker is a label; longer runs are sentences."),
  KICKER_MAX_PX: t(14, "px", "kicker-above-heading", "Kickers are set small — that smallness is part of the device."),
  EYEBROW_MAX_CHARS: t(40, "chars", "hero-eyebrow-chip", "An eyebrow chip carries a phrase, not a sentence."),
  EYEBROW_MAX_LINE_GAP: t(6, "count", "hero-eyebrow-chip", "Lines between the chip and the h1 before they stop reading as a pair."),
  PILL_RADIUS_PX: t(999, "px", "pill detection", "The conventional fully-rounded radius."),
  CHIP_RADIUS_MIN_PX: t(12, "px", "hero-eyebrow-chip", "Rounded enough to read as a chip."),

  METADATA_MAX_CHARS: t(200, "chars", "prompt-leak-metadata",
    "Measured over 699 real titles: median 43, longest legitimate 120, and NOTHING between 120 and 1000. The gap makes the number free — anything in 150-900 classifies that corpus identically. 200 sits near the legitimate side, past the longest real title and past what a search result displays."),

  // ── Motion ──────────────────────────────────────────────────────────────────

  FAST_LOOP_MAX_MS: t(1200, "ms", "pulsing-dot", "A forever-loop faster than this reads as an alert that never resolves."),
  SLOW_LOOP_MIN_MS: t(4000, "ms", "ambient-drift", "A forever-loop slower than this is ambient motion with no message."),
  HALO_MAX_LINE_GAP: t(8, "count", "radial-halo", "Lines from the h1 within which a radial gradient is hero ornament."),

  // ── Colour / alpha ──────────────────────────────────────────────────────────

  INVISIBLE_TEXT_MAX_ALPHA: t(0.1, "alpha", "invisible-text", "Below this the text is effectively not there."),
  OPAQUE_MIN_ALPHA: t(0.95, "alpha", "contrast resolution",
    "A background this opaque can be treated as the blend result; below it the blend is not knowable."),
  OWN_BACKGROUND_MIN_ALPHA: t(0.5, "alpha", "role synthesis",
    "Below this a background does not establish the element as its own surface."),

  // ── Voice ───────────────────────────────────────────────────────────────────

  EM_DASH_MIN_WORDS: t(60, "count", "em-dash-rate",
    "SCAR: a rate needs a denominator. Short runs produce meaningless rates, so the rule " +
    "refuses to judge below this word count."),
  EM_DASH_MIN_COUNT: t(3, "count", "em-dash-rate", "Two dashes in a long document is punctuation, not a habit."),
  EM_DASH_MAX_RATE: t(2.5, "per-100-words", "em-dash-rate", "Above this the dash is a tic."),
} as const;

export type ThresholdKey = keyof typeof TELL_THRESHOLDS;

/** The numeric value, for use inside a rule predicate. */
export function thr(key: ThresholdKey): number {
  return TELL_THRESHOLDS[key].value;
}
