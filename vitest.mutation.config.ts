/**
 * The vitest projection the mutation audit runs against.
 *
 * Stryker re-runs tests once per mutant, so pointing it at all 4,000+ tests would produce
 * a job nobody waits for and therefore nobody reads. The audit only mutates rule
 * predicates, so it only needs the tests that judge them.
 *
 * The field corpus is IN that set, and its absence was a measurement bug rather than a
 * cost decision. Without it the score answered "how well do the FIXTURES guard these
 * predicates" while being read as "how well are these predicates guarded" — and the
 * corpus exists precisely because fixtures cannot state what real pages state. It is
 * nine real pages, not four thousand tests, so the sentence above still holds.
 *
 * Two numbers come out of this, and they are not interchangeable. Measured 2026-08-31
 * on 1,772 mutants over the six mutated files:
 *
 *   fixtures only     60.74%   738 killed   418 survived   59 with no coverage   1m30
 *   fixtures + corpus 74.16%   899 killed   293 survived   21 with no coverage   2m46
 *
 * The corpus is worth +13.42 points, and the number that says the most is the last
 * column: 38 mutants that no fixture ever reached are now executed by real pages. Per
 * file the gain runs from +4.4 (role-synthesis) to +25.8 (tell-rules-labels).
 *
 * The old figure quoted in the issue that prompted this, 62.91%, is not comparable —
 * the sources have changed since it was taken. It was re-measured rather than reused.
 *
 * CAVEAT, because the number is otherwise easy to over-read: three `fp-open` rows remain
 * on `showcase-d03-orchestrated-r2`. Those kills defend behavior nobody has yet agreed is
 * correct, so 74.16% is slightly generous and will move when they are adjudicated. Never
 * quote the fixtures-only figure as rule coverage either — it answers a different
 * question, which is the whole reason both are printed.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/tell-lint.test.ts",
      "tests/tell-thresholds-boundary-pairs.test.ts",
      "tests/tell-metamorphic-laws.test.ts",
      "tests/tell-fact-census.test.ts",
      "tests/role-synthesis.test.ts",
      "tests/field-corpus.test.ts",
    ],
  },
});
