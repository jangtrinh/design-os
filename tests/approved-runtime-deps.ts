/**
 * The runtime-dependency allowlist.
 *
 * design:os shipped zero runtime dependencies until 2026-08-26, when the owner
 * ratified a deliberate reversal: the `tell` family needs a resolved CSS
 * cascade, and a hand-rolled CSS parser is not a thing this repo should own.
 * Four packages were approved by name.
 *
 * The guard is NOT deleted — it is narrowed. A fifth dependency, or a swap of
 * one of these four, still turns this red, so the reversal stays a decision
 * somebody made rather than a door left open.
 */
export const APPROVED_RUNTIME_DEPS = [
  "css-select",
  "css-tree",
  "domutils",
  "htmlparser2",
] as const;
