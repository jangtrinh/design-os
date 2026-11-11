/**
 * `component-source-match` (FR-027, owner decision D16): a component found in code has exactly the name of a record that
 * is already in the sealed registry from another door (Figma, a synthetic approval, or no provenance at all). The
 * question is asked once for the whole group: are they the same components? It is assigned (one outcome per member):
 * `same` keeps the existing record with its provenance and adds the code reference and the tokens read from code,
 * `separate` registers the code component on its own as `<name> · code`. `review-individually` gives one of the two per name.
 *
 * A member is the name with the id of the existing record's source and the code file, `<name>#<id>,<file>`, so a
 * reorder of the tree asks nothing, and a record re-sealed under another source id or a code file that moved is a new
 * member and is asked again. Nothing is linked by name alone and no record is ever replaced.
 */
import type { ClusterOption, MemberChoice } from "./cluster.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import { memberWithIds } from "./fingerprint.js";
import type { AskResult, KindDetection, KindEmitter } from "./kind-emitter.js";

export const SAME_OUTCOME = "same";
export const SEPARATE_OUTCOME = "separate";
/** The id of the existing record's source when the record has no provenance. */
export const NO_PROVENANCE_ID = "no-provenance";

export interface SourceMatchCandidate {
  name: string;
  /** The existing record's `provenance.sourceRef`, or {@link NO_PROVENANCE_ID}. */
  existingId: string;
  /** The project-relative code file the component is found in. */
  file: string;
  /** Token paths the existing record already holds. */
  existingTokens: string[];
  /** Token paths the code source references. */
  codeTokens: string[];
}
export interface SourceMatchInput { candidates: SourceMatchCandidate[] }

export const sourceMatchMemberOf = (c: Pick<SourceMatchCandidate, "name" | "existingId" | "file">): string => memberWithIds(c.name, [c.existingId, c.file]);

const addedTokens = (c: SourceMatchCandidate): number => c.codeTokens.filter((t) => !c.existingTokens.includes(t)).length;

function ask(candidates: readonly SourceMatchCandidate[], members: readonly string[]): AskResult {
  const wanted = new Set(members);
  const asked = candidates.filter((c) => wanted.has(sourceMatchMemberOf(c)));
  const everyone = (outcome: string): Record<string, string> => Object.fromEntries(asked.map((c) => [sourceMatchMemberOf(c), outcome]));
  const options: ClusterOption[] = [
    {
      id: SAME_OUTCOME, label: "They are the same components",
      consequence: `${asked.length} record(s) keep their provenance and gain a code reference; ${asked.reduce((n, c) => n + addedTokens(c), 0)} token path(s) are added from code`,
      assigns: everyone(SAME_OUTCOME),
    },
    {
      id: SEPARATE_OUTCOME, label: "They are different components",
      consequence: `${asked.length} new record(s) named "<name> · code" are written; the existing records are not touched`,
      assigns: everyone(SEPARATE_OUTCOME),
    },
    { id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${asked.length} component name(s) with their sources; you choose per name` },
  ];
  const memberChoices: Record<string, MemberChoice[]> = {};
  const labels: Record<string, string> = {};
  for (const c of asked) {
    const member = sourceMatchMemberOf(c);
    memberChoices[member] = [
      { id: SAME_OUTCOME, label: `Same component: ${c.name} keeps its record and gains the code reference` },
      { id: SEPARATE_OUTCOME, label: `Different component: register ${c.name} · code on its own` },
    ];
    labels[member] = `${c.name} (${c.existingId === NO_PROVENANCE_ID ? "no provenance" : c.existingId}, ${c.file})`;
  }
  return {
    question: `${asked.length} component(s) found in code have the name of a record that is already in the registry from another source. Are they the same components?`,
    options, memberChoices, labels,
  };
}

export function sourceMatchDetection(input: SourceMatchInput): KindDetection {
  const members = input.candidates.map(sourceMatchMemberOf);
  return { kind: "component-source-match", members, domain: members, ask: (asked) => ask(input.candidates, asked) };
}

export const componentSourceMatchEmitter: KindEmitter = {
  kind: "component-source-match",
  detect: (input) => sourceMatchDetection(input as SourceMatchInput),
};
