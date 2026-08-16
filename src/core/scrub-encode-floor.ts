/**
 * The scrub-encode floor — ONE definition, two consumers.
 *
 * `knowledge/scroll-cinema-direction.md` § "The scrub-encode floor" states this
 * as a table of knobs. Two things in this repo have to agree with that table and
 * with each other:
 *
 *   EMITTER  templates/scrub/build-assets.sh  produces a clip that meets it
 *   LINTER   src/core/scrub-lint.ts           fails a clip that does not
 *
 * A pair that merely coexists drifts (Art II). Both sides read their numbers
 * from here: the linter imports them directly, and `tests/scrub-scaffold.test.ts`
 * asserts the emitted script spells these exact values — so editing one knob in
 * one place turns the suite red instead of silently splitting the floor in two.
 *
 * Provenance: the values are the ones the 021 pilot actually shipped with
 * (`pipeline/encode-wire-archA.sh` in the studio repo), not defaults picked here.
 */
export const SCRUB_ENCODE_FLOOR = {
  /** `-crf` — above 20 the render softness compounds with codec softness. */
  crf: 20,
  /** `-g` — small GOP, NOT all-intra. Blobs make every clip seekable; all-intra
   *  buys nothing and costs several times the bytes. */
  gopFrames: 8,
  /** The linter's tolerance on measured GOP. Above the emitted 8 to leave room
   *  for variable frame rate, where average samples-per-keyframe drifts high. */
  maxGopFrames: 12,
  /** Light sharpening — counters render softness for free. */
  unsharp: "5:5:0.8:5:5:0.0",
  /** Phone floor: a native 9:16 chain encodes narrower... */
  portraitWidth: 720,
  /** ...and with a TIGHTER GOP, because a phone decoder's seek cost scales with
   *  GOP length. */
  portraitGopFrames: 4,
  /** Poster still: wide enough to hold the first frame crisply on a 2x display. */
  posterWidth: 1536,
  /** cwebp quality for the poster. */
  posterQuality: 88,
} as const;
