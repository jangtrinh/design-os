/**
 * `component-lint-refused` (FR-027, owner decision D17): a record that the current rulings would write (a new record, a
 * `separate` record or a refreshed code record) is refused by the design-system lint of the registration path. Only the
 * lint family is askable (the markup lint and the owner-promoted token-ban rules answer with one refusal code,
 * `REGISTRY_MARKUP_DRIFT`); a bad name, a bad source reference or a name already held stays a refusal by name.
 *
 * The question is asked once for the whole group and is assigned (one outcome per member): `leave-out` registers nothing
 * against the lint and writes the other records in the one batch, `stop` makes `--apply` write nothing. A member is the
 * record's name with the code file and the slice hash, `<name>#<file>,<hash>`, so a changed component is asked again and
 * one that now passes is no longer a member. A name that still awaits another question is not a member yet.
 */
import type { ClusterOption, MemberChoice } from "./cluster.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import { memberWithIds } from "./fingerprint.js";
import type { AskResult, KindDetection, KindEmitter } from "./kind-emitter.js";

export const LEAVE_OUT_OUTCOME = "leave-out";
export const STOP_OUTCOME = "stop";

export interface LintRefusedCandidate {
  /** The name the record would be registered under. */
  name: string;
  /** The project-relative code file and the hash of the slice the record is built from. */
  file: string;
  sha: string;
  /** The refusal code of the lint family. */
  code: string;
}
export interface LintRefusedInput {
  candidates: LintRefusedCandidate[];
  /** How many components the run would write, the refused ones included: the "of N" of the question. */
  planned: number;
}

export const lintRefusedMemberOf = (c: Pick<LintRefusedCandidate, "name" | "file" | "sha">): string => memberWithIds(c.name, [c.file, c.sha]);

/** `CODE n, CODE m`, sorted by code, for the members given. */
export function codeCounts(items: readonly { code: string }[]): string {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.code, (counts.get(i.code) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([code, n]) => `${code} ${n}`).join(", ");
}

function ask(input: LintRefusedInput, members: readonly string[]): AskResult {
  const wanted = new Set(members);
  const asked = input.candidates.filter((c) => wanted.has(lintRefusedMemberOf(c)));
  const everyone = (outcome: string): Record<string, string> => Object.fromEntries(asked.map((c) => [lintRefusedMemberOf(c), outcome]));
  const options: ClusterOption[] = [
    {
      id: LEAVE_OUT_OUTCOME, label: "Leave them out and write the rest",
      consequence: `${asked.length} component(s) are not registered and are listed by name with their refusal code; the other records are written in one batch`,
      assigns: everyone(LEAVE_OUT_OUTCOME),
    },
    {
      id: STOP_OUTCOME, label: "Stop until they pass the lint",
      consequence: `--apply writes nothing and exits 1 naming the ${asked.length} component(s) until their source or the design system changes`,
      assigns: everyone(STOP_OUTCOME),
    },
    { id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${asked.length} component name(s) with their refusal code; you choose per component` },
  ];
  const memberChoices: Record<string, MemberChoice[]> = {};
  const labels: Record<string, string> = {};
  for (const c of asked) {
    const member = lintRefusedMemberOf(c);
    memberChoices[member] = [
      { id: LEAVE_OUT_OUTCOME, label: `Leave ${c.name} out (${c.code}); it is not registered` },
      { id: STOP_OUTCOME, label: `Stop: ${c.name} must pass the lint before anything is written` },
    ];
    labels[member] = c.name;
  }
  return {
    question: `${asked.length} of ${input.planned} component(s) the registry would write fail the design-system lint (${codeCounts(asked)}). What should happen to them?`,
    options, memberChoices, labels,
  };
}

export function lintRefusedDetection(input: LintRefusedInput): KindDetection {
  const members = input.candidates.map(lintRefusedMemberOf);
  return { kind: "component-lint-refused", members, domain: members, ask: (asked) => ask(input, asked) };
}

export const componentLintRefusedEmitter: KindEmitter = {
  kind: "component-lint-refused",
  detect: (input) => lintRefusedDetection(input as LintRefusedInput),
};
