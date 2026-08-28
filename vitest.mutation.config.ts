/**
 * The vitest projection the mutation audit runs against.
 *
 * Stryker re-runs tests once per mutant, so pointing it at all 4,000+ tests would produce
 * a job nobody waits for and therefore nobody reads. The audit only mutates rule
 * predicates, so it only needs the tests that judge them.
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
    ],
  },
});
