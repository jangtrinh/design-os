// scripts/lib/identity-tokens.mjs
//
// R4 (Stage-6 amendment item 4 / Fable B6) — ONE shared word-boundary identity-
// token matcher. Extracted from checks-candidates.mjs's PR-009 fix ("do not
// revert to `.includes()`") so every consumer that scans for short or ordinary-
// word identity tokens (candidate IDs, "control"/"treatment", brief IDs, family
// names, asset IDs) applies the SAME false-positive-safe rule.
//
// Why this exists: a bare `.includes()` over short tokens guarantees false
// errors — 8-hex codenames and CSS hex colors contain candidate-ID digrams
// ("a1", "d2"), and ordinary English contains "controls". checks-judging.mjs
// reproduced exactly the bug PR-009 already fixed once, because the fix lived
// only in checks-candidates.mjs and was never propagated to the second
// consumer — the repo's own "a missing-rule bug is fixed at the shared layer"
// lesson repeating itself. This module is the shared layer.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary regex for a short/ordinary-word identity token: matches "P2"
 * or "control" only when NOT embedded inside a longer alphanumeric run, so
 * 8-hex codenames (`a1b2c3d4`), CSS hex colors (`#1a1a1a`), and ordinary
 * English words (`controls`, `# controlled vocabulary`) never false-positive,
 * while `control`, `treatment`, ` A1 `, `"P2"`, and `PA-MED-1-wide-1` do fire.
 */
export function boundaryTokenRegex(token, flags = "i") {
  return new RegExp(`\\b${escapeRegExp(token)}\\b`, flags);
}

/**
 * Scan `text` for a set of boundary-matched tokens (short/ordinary-word
 * identity tokens) and a set of plain-substring tokens (long/distinctive
 * values — manifest paths, source URLs — where a partial occurrence is still
 * a leak and boundary semantics would only weaken the check).
 *
 * Returns the list of tokens that matched, in input order, deduplicated.
 */
export function scanIdentityTokens(text, { boundaryTokens = [], substringTokens = [], flags = "i" } = {}) {
  const hits = [];
  const seen = new Set();
  for (const token of boundaryTokens) {
    if (typeof token !== "string" || token.length === 0 || seen.has(token)) continue;
    if (boundaryTokenRegex(token, flags).test(text)) {
      hits.push(token);
      seen.add(token);
    }
  }
  const lower = text.toLowerCase();
  for (const token of substringTokens) {
    if (typeof token !== "string" || token.length === 0 || seen.has(token)) continue;
    if (lower.includes(token.toLowerCase())) {
      hits.push(token);
      seen.add(token);
    }
  }
  return hits;
}
