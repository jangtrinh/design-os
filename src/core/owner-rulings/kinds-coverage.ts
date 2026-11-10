/**
 * The kinds coverage rule (AC-14, staged): a kind that has an emitter must have a fixture that must raise it and one
 * that must not (Art II); an emitter file for a kind that is not in the table is itself a gap. Pure — the caller lists
 * the files, so the same rule runs on the real tree and on a doctored listing in a mutation test.
 */
import { CLUSTER_KINDS } from "./cluster-kinds.js";

export const EMITTER_FILE = /^kind-(.+)\.ts$/;
export const MUST_RAISE = "must-raise.json";
export const MUST_NOT_RAISE = "must-not-raise.json";

export interface CoverageInput {
  /** The kinds the table declares. Defaults to the real table; a test passes a doctored one. */
  kinds?: readonly string[];
  /** Base names of the files in `src/core/owner-rulings/`. */
  emitterFiles: readonly string[];
  /** Paths `<kind>/<file>` of the fixtures under `tests/fixtures/owner-rulings/kinds/`. */
  fixtureFiles: readonly string[];
}

/** One human-readable line per gap; empty when coverage holds. */
export function kindsCoverageGaps(input: CoverageInput): string[] {
  const kinds = input.kinds ?? CLUSTER_KINDS;
  const gaps: string[] = [];
  const emitted = input.emitterFiles.map((f) => EMITTER_FILE.exec(f)?.[1]).filter((k): k is string => k !== undefined);
  for (const kind of emitted) {
    if (!kinds.includes(kind)) gaps.push(`emitter kind-${kind}.ts has no row in the kinds table`);
  }
  for (const kind of kinds.filter((k) => emitted.includes(k))) {
    for (const file of [MUST_RAISE, MUST_NOT_RAISE]) {
      if (!input.fixtureFiles.includes(`${kind}/${file}`)) gaps.push(`kind '${kind}' has an emitter and no ${file} fixture`);
    }
  }
  return gaps;
}
