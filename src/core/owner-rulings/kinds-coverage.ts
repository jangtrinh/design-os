/**
 * The kinds coverage rule (Art II): every registered emitter is run on a fixture that must raise its kind and on one
 * that must not. Pure — the caller supplies the emitter list and a fixture reader, so the same rule runs on the real
 * registry and on injected emitters in a mutation test.
 */
import { CLUSTER_KINDS } from "./cluster-kinds.js";
import type { KindEmitter } from "./kind-emitter.js";

export const MUST_RAISE = "must-raise.json";
export const MUST_NOT_RAISE = "must-not-raise.json";

export interface CoverageInput {
  emitters: readonly KindEmitter[];
  /** The parsed fixture `tests/fixtures/owner-rulings/kinds/<kind>/<file>`, or undefined when it does not exist. */
  readFixture(kind: string, file: typeof MUST_RAISE | typeof MUST_NOT_RAISE): unknown;
}

/** One human-readable line per gap; empty when coverage holds. */
export function kindsCoverageGaps(input: CoverageInput): string[] {
  const gaps: string[] = [];
  for (const e of input.emitters) {
    if (!(CLUSTER_KINDS as readonly string[]).includes(e.kind)) { gaps.push(`emitter for '${e.kind}' has no row in the kinds table`); continue; }
    for (const [file, mustRaise] of [[MUST_RAISE, true], [MUST_NOT_RAISE, false]] as const) {
      const fixture = input.readFixture(e.kind, file);
      if (fixture === undefined) { gaps.push(`kind '${e.kind}' has an emitter and no ${file} fixture`); continue; }
      const raised = e.detect(fixture)?.members.length ?? 0;
      if (mustRaise && raised === 0) gaps.push(`kind '${e.kind}' raises nothing on its ${file} fixture`);
      if (!mustRaise && raised > 0) gaps.push(`kind '${e.kind}' raises ${raised} member(s) on its ${file} fixture`);
    }
  }
  return gaps;
}
