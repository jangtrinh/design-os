/**
 * An executable boundary pair for every threshold the tell family turns.
 *
 * A number is not pinned by being written down. It is pinned by a pair: a value AT the
 * threshold that must NOT trip, and one PAST it that MUST. Both halves are required —
 * 13 of 63 hand-fired red probes came back green precisely because only the firing half
 * was ever checked, so moving the number broke nothing.
 *
 * Two probe shapes, chosen per threshold by what actually decides it:
 *
 *  - `hex` — for the colour windows, which are pure functions of a hex string. The pair
 *    calls the real predicate, so it cannot drift from the rule.
 *  - `css` — for everything else. The pair is two tiny documents run through the REAL
 *    extractor and the REAL linter, asserting the checkId is absent at the threshold and
 *    present one step past it. End-to-end, so a threshold that is defined but never read
 *    fails the pair rather than passing it.
 *
 * Deliberately NOT a re-implementation of the comparison. A pair that recomputed
 * `value < THRESHOLD` would be tautological — green by construction, and blind to the
 * one thing worth catching, which is a constant nothing consumes.
 */
import { isAiPurple, isAiCyan, isCream, isGrey, isSaturated } from "../src/core/tell-rules.js";
import type { ThresholdKey } from "../src/core/tell-thresholds.js";

/** A colour-window pair: the predicate, a hex at the edge, and a hex past it. */
export interface HexPair {
  kind: "hex";
  predicate: (hex: string) => boolean;
  /** Must return false — at or outside the window. */
  at: string;
  /** Must return true — inside the window. */
  past: string;
  note: string;
}

/** A rule-level pair: two documents, one silent, one firing. */
export interface CssPair {
  kind: "css";
  /** The checkId that must be absent from `at` and present in `past`. */
  checkId: string;
  at: string;
  past: string;
  note: string;
}

export type BoundaryPair = HexPair | CssPair;

const hex = (predicate: (h: string) => boolean, at: string, past: string, note: string): HexPair =>
  ({ kind: "hex", predicate, at, past, note });

const css = (checkId: string, at: string, past: string, note: string): CssPair =>
  ({ kind: "css", checkId, at, past, note });

/** A minimal page wrapping one rule's worth of CSS and markup. */
export function page(styles: string, body: string): string {
  return `<!doctype html><html><head><style>${styles}</style></head><body>${body}</body></html>`;
}

export const BOUNDARY_PAIRS: Partial<Record<ThresholdKey, BoundaryPair>> = {
  // ── Colour windows ──────────────────────────────────────────────────────────
  PURPLE_MIN_BLUE: hex(isAiPurple, "#6b558c", "#6b55f1",
    "blue at 140 is outside; raising it into the window makes the same hue read violet"),
  PURPLE_MIN_BLUE_OVER_GREEN: hex(isAiPurple, "#6ba0f1", "#6b55f1",
    "green raised until b-g falls to the floor stops it reading violet"),
  PURPLE_MIN_RED: hex(isAiPurple, "#3c55f1", "#6b55f1",
    "red at 60 is navy, not purple"),
  PURPLE_MIN_RED_OVER_GREEN: hex(isAiPurple, "#3b82f6", "#6366f1",
    "SCAR: blue-500 #3b82f6 (r-g = -71) is blue; indigo #6366f1 (r-g = -3) is the tell. " +
    "The original r-g > 30 excluded indigo and the suite stayed green when broken."),

  CYAN_MIN_GREEN: hex(isAiCyan, "#6baaf1", "#6bdbf1", "green at the floor is a pale blue, not cyan"),
  CYAN_MIN_BLUE: hex(isAiCyan, "#6bdbaa", "#6bdbf1", "blue at the floor is a green, not cyan"),
  CYAN_MAX_RED: hex(isAiCyan, "#6edbf1", "#4bdbf1", "red at the ceiling washes the cyan into a pale tint"),

  CREAM_MIN_RED: hex(isCream, "#ebe6dc", "#faf7f0", "red at the floor is a warm grey, not a cream"),
  CREAM_MIN_GREEN: hex(isCream, "#fae1d0", "#faf7f0", "green too low turns the off-white into a peach"),
  CREAM_MIN_BLUE: hex(isCream, "#faf7c8", "#faf7f0", "blue too low turns it into a yellow"),
  CREAM_MIN_WARMTH: hex(isCream, "#faf9fa", "#faf7f0",
    "SCAR: a floor of 12 excluded #FAF7F0 itself (r-b = 10), the canonical reflex cream"),
  CREAM_MAX_WARMTH: hex(isCream, "#fff0c0", "#faf7f0", "past the ceiling it is a tan, not an off-white"),

  GREY_MAX_CHROMA: hex(isGrey, "#8ca0b4", "#8c9096", "chroma at the ceiling reads as a blue-grey, not neutral"),
  GREY_MIN_LIGHTNESS: hex(isGrey, "#4a4e52", "#8c9096", "darker than the floor is a near-black"),
  GREY_MAX_LIGHTNESS: hex(isGrey, "#dcdee0", "#8c9096", "lighter than the ceiling is an off-white"),

  SATURATED_MIN_CHROMA: hex(isSaturated, "#8c9096", "#c8ff62", "chroma below the floor is grey, and grey-on-grey is a contrast question"),
  DARK_SURFACE_MAX_CHANNEL: css("dark-glow",
    page(".s{background:#3c3c20;box-shadow:0 0 40px #9ef5b4}", `<div class="s">x</div>`),
    page(".s{background:#141c17;box-shadow:0 0 40px #9ef5b4}", `<div class="s">x</div>`),
    "#3c3c20 has r and g both AT 60, so it is a mid-tone and a glow on it is not simulated " +
    "light; #141c17 is below the ceiling and is. SCAR: the first version of this pair " +
    "re-implemented `r < 60 && g < 60` inline, so it never read TELL_THRESHOLDS or the rule " +
    "and was green by construction — while being counted as one of the pinned constants. " +
    "A pair that recomputes the comparison pins nothing, which is the whole reason pairs " +
    "run through the real linter."),

  // ── Type ────────────────────────────────────────────────────────────────────
  BODY_COPY_MAX_PX: css("tight-leading",
    page(".t{font-size:21px;line-height:1.0}", `<p class="t">size past the body ceiling is display type</p>`),
    page(".t{font-size:20px;line-height:1.0}", `<p class="t">size at the ceiling is still body copy</p>`),
    "21px is display type, where tight leading is craft; 20px is body copy, where it is a defect"),
  TIGHT_LEADING_MAX: css("tight-leading",
    page(".t{font-size:16px;line-height:1.2}", `<p class="t">leading at the ceiling is fine</p>`),
    page(".t{font-size:16px;line-height:1.19}", `<p class="t">leading past the ceiling collides</p>`),
    "1.2 is the boundary; 1.19 trips"),
  WIDE_TRACKING_MIN_EM: css("wide-tracking",
    page(".t{letter-spacing:0.18em}", `<p class="t">tracking at the floor</p>`),
    page(".t{letter-spacing:0.19em}", `<p class="t">tracking past the floor</p>`),
    "0.18em is allowed; 0.19em is not"),
  NEGATIVE_TRACKING_MAX_EM: css("extreme-negative-tracking",
    page(".t{letter-spacing:-0.05em}", `<p class="t">tight but legible</p>`),
    page(".t{letter-spacing:-0.06em}", `<p class="t">letters begin to touch</p>`),
    "-0.05em holds; -0.06em trips"),
  LINE_LENGTH_MAX_CHARS: css("line-length",
    page("", `<p>${"a".repeat(400)}</p>`),
    page("", `<p>${"a".repeat(401)}</p>`),
    "EXACTLY at the ceiling and exactly one past it. An earlier version used 300 and 440, " +
    "which left the constant free to drift anywhere in [301,439] without reddening — a pair " +
    "with slack in it does not pin a threshold, it pins a neighbourhood"),
  TINY_TEXT_MIN_PX: css("undersized-ui-text",
    page(".t{font-size:12px}", `<button class="t">at the floor</button>`),
    page(".t{font-size:11px}", `<button class="t">below the floor</button>`),
    "12px is legible; 11px is not. A control, because the rule judges LABEL text — " +
    "the first draft of this pair used a <p> and stayed green in both directions, " +
    "which is exactly the shape of pair that pins nothing"),

  // ── Surface ─────────────────────────────────────────────────────────────────
  GLOW_MIN_BLUR_PX: css("dark-glow",
    page(".s{background:#141c17;box-shadow:0 0 19px #9ef5b4}", `<div class="s">x</div>`),
    page(".s{background:#141c17;box-shadow:0 0 20px #9ef5b4}", `<div class="s">x</div>`),
    "19px blur reads as depth; 20px reads as simulated light"),
  CRAMPED_PADDING_MAX_PX: css("cramped-padding",
    page(".s{padding:8px;border-radius:16px}", `<div class="s">x</div>`),
    page(".s{padding:7px;border-radius:16px}", `<div class="s">x</div>`),
    "8px is proportional; 7px crowds the surface"),
  CRAMPED_RADIUS_MIN_PX: css("cramped-padding",
    page(".s{padding:4px;border-radius:11px}", `<div class="s">x</div>`),
    page(".s{padding:4px;border-radius:12px}", `<div class="s">x</div>`),
    "an 11px radius is not rounded enough for the padding to look cramped; 12px is"),
  REPEATED_TEXT_MIN_CHARS: css("repeated-container-text",
    page("", `<div>${"a".repeat(23)}</div>`.repeat(3)),
    page("", `<div>${"a".repeat(24)}</div>`.repeat(3)),
    "23 characters is one below the floor and repeats legitimately; 24 is AT it. Exact, " +
    "for the same reason as LINE_LENGTH_MAX_CHARS — 13-vs-56 left ten values of slack"),
  // ── Content ─────────────────────────────────────────────────────────────────
  METADATA_MAX_CHARS: css(
    "prompt-leak-metadata",
    `<!doctype html><html><head><title>TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT</title></head><body><p>ok</p></body></html>`,
    `<!doctype html><html><head><title>TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT</title></head><body><p>ok</p></body></html>`,
    "a 200-character title is silent; 201 fires — the pair runs the real extractor, so a title\n     that stopped being emitted as metadata would fail here rather than pass",
  ),

};
