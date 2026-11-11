/**
 * `component-source-changed` (FR-027, owner decision D18): a component the surface reads has the name of a registry
 * record that already has a code source (a `code` provenance, or the `code` reference of a linked record), and the
 * source reference or the slice hash the record holds differs from the one the tree holds now. A file that moved counts
 * (the same name in another file), unless both files export the name: that is the collision question and it comes first.
 *
 * The question is asked once per group and is assigned (one outcome per member). A member names what it kept by id:
 * the name with the recorded source reference and hash and the current source reference and hash, `<name>#<id>,…`, so a
 * reorder of the tree asks nothing and every further change asks again. `refresh` rewrites the record from the current
 * source through one narrow function; `keep` leaves it untouched and lists it as stale. `review-individually` gives one
 * of the two per component.
 */
import type { ClusterOption, MemberChoice } from "./cluster.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import { memberWithIds } from "./fingerprint.js";
import type { AskResult, KindDetection, KindEmitter } from "./kind-emitter.js";

export const REFRESH_OUTCOME = "refresh";
export const KEEP_OUTCOME = "keep";

export interface SourceChangedCandidate {
  /** The exact name of the record that holds the code source. */
  name: string;
  /** What the record holds: `file:start-end` and the slice hash. */
  heldRef: string;
  heldSha: string;
  /** What the tree holds now. */
  nowRef: string;
  nowSha: string;
  /** True for a record linked to a record of another door: only its `code` reference and its tokens are rewritten. */
  linked: boolean;
  /** Token paths the record holds, and token paths the code references now. */
  heldTokens: string[];
  codeTokens: string[];
}
/** True when the recorded slice hash is the current one: the component only moved. */
export const onlyMoved = (c: Pick<SourceChangedCandidate, "heldSha" | "nowSha">): boolean => c.heldSha === c.nowSha;
export interface SourceChangedInput { candidates: SourceChangedCandidate[] }

export const sourceChangedMemberOf = (c: Pick<SourceChangedCandidate, "name" | "heldRef" | "heldSha" | "nowRef" | "nowSha">): string =>
  memberWithIds(c.name, [c.heldRef, c.heldSha, c.nowRef, c.nowSha]);

/** The token paths a refresh adds, removes from a code record, and leaves on a linked record that the code no longer references. */
export function tokenMovement(c: Pick<SourceChangedCandidate, "linked" | "heldTokens" | "codeTokens">): { added: string[]; removed: string[]; kept: string[] } {
  const added = c.codeTokens.filter((t) => !c.heldTokens.includes(t));
  const gone = c.heldTokens.filter((t) => !c.codeTokens.includes(t));
  return { added, removed: c.linked ? [] : gone, kept: c.linked ? gone : [] };
}

function ask(candidates: readonly SourceChangedCandidate[], members: readonly string[]): AskResult {
  const wanted = new Set(members);
  const asked = candidates.filter((c) => wanted.has(sourceChangedMemberOf(c)));
  const everyone = (outcome: string): Record<string, string> => Object.fromEntries(asked.map((c) => [sourceChangedMemberOf(c), outcome]));
  const sum = (pick: (m: ReturnType<typeof tokenMovement>) => string[]): number => asked.reduce((n, c) => n + pick(tokenMovement(c)).length, 0);
  const moved = asked.filter(onlyMoved).length;
  const options: ClusterOption[] = [
    {
      id: REFRESH_OUTCOME, label: "Refresh the records from the source as it is now",
      consequence: `${asked.length} record(s) get a new code reference${moved > 0 ? ` (${moved} only moved, content unchanged)` : ""}; ${sum((m) => m.added)} token path(s) are added; ${sum((m) => m.removed)} token path(s) are removed from code records; ${sum((m) => m.kept)} token path(s) the code no longer references stay on linked records`,
      assigns: everyone(REFRESH_OUTCOME),
    },
    {
      id: KEEP_OUTCOME, label: "Keep the records as they are",
      consequence: `${asked.length} record(s) stay as they are and are listed as stale until their source changes again`,
      assigns: everyone(KEEP_OUTCOME),
    },
    { id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${asked.length} component name(s) with their recorded and current sources; you choose per component` },
  ];
  const memberChoices: Record<string, MemberChoice[]> = {};
  const labels: Record<string, string> = {};
  for (const c of asked) {
    const member = sourceChangedMemberOf(c);
    memberChoices[member] = [
      { id: REFRESH_OUTCOME, label: `Refresh ${c.name}: its record takes the source now at ${c.nowRef}${onlyMoved(c) ? " (content unchanged, only moved)" : ""}` },
      { id: KEEP_OUTCOME, label: `Keep ${c.name} as registered at ${c.heldRef} (listed as stale)` },
    ];
    labels[member] = c.name; // the sheet prints `<label> (<member id>)`, and the id already names both sources and both hashes
  }
  return {
    question: `${asked.length} component(s) are registered from a source that has changed since. Should their records be refreshed from the source as it is now?`,
    options, memberChoices, labels,
  };
}

export function sourceChangedDetection(input: SourceChangedInput): KindDetection {
  const members = input.candidates.map(sourceChangedMemberOf);
  return { kind: "component-source-changed", members, domain: members, ask: (asked) => ask(input.candidates, asked) };
}

export const componentSourceChangedEmitter: KindEmitter = {
  kind: "component-source-changed",
  detect: (input) => sourceChangedDetection(input as SourceChangedInput),
};
