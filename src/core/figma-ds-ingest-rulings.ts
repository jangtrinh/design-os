/**
 * What the ingest reads from the owner's rulings: whether a detection is fully ruled, and the outcome of a member.
 * A dependent question is only raised once its parent is ruled, so each stage of the ingest asks this first.
 */
import type { ClusterKind } from "./owner-rulings/cluster-kinds.js";
import type { KindDetection } from "./owner-rulings/kind-emitter.js";
import { governedOutcomes, indexRulings } from "./owner-rulings/resolve-detections.js";
import type { Ruling } from "./owner-rulings/ruling-store.js";

const nfc = (s: string): string => s.normalize("NFC");

export interface RulingView {
  /** True when every member of the detection has a governing ruling (a detection with no members is ruled). */
  ruled(d: KindDetection): boolean;
  /** The outcome the governing ruling gives a member of `kind`, or undefined when none governs it. */
  outcome(kind: ClusterKind, member: string): string | undefined;
}

export function rulingView(rulings: readonly Ruling[]): RulingView {
  const index = indexRulings(rulings);
  const cache = new Map<ClusterKind, Record<string, string>>();
  const outcomes = (kind: ClusterKind): Record<string, string> => {
    let o = cache.get(kind);
    if (o === undefined) { o = governedOutcomes(index, kind); cache.set(kind, o); }
    return o;
  };
  return {
    ruled: (d) => d.members.every((m) => index.get(d.kind)?.has(nfc(m)) === true),
    outcome: (kind, member) => outcomes(kind)[nfc(member)],
  };
}

/** The members of `kind` whose outcome is `outcome`, among `members`. */
export function withOutcome(view: RulingView, kind: ClusterKind, members: readonly string[], outcome: string): Set<string> {
  return new Set(members.filter((m) => view.outcome(kind, m) === outcome));
}
