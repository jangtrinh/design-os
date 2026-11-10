/**
 * Detections + rulings -> open questions, per-member outcomes and stale rulings (FR-006).
 *
 * The ruling that governs a member is the last ruling in store order, of the same kind, whose `covers` holds it: an
 * owner who answers again changes their mind, and the later answer wins member by member. A question is open for the
 * members no ruling governs, and only the detection's own `ask` decides its wording and options.
 */
import { buildCluster } from "./cluster.js";
import type { Cluster } from "./cluster.js";
import type { ClusterKind } from "./cluster-kinds.js";
import { sortedUnique } from "./fingerprint.js";
import type { KindDetection } from "./kind-emitter.js";
import { outcomeOf } from "./ruling-store.js";
import type { Ruling } from "./ruling-store.js";

export interface Resolution {
  /** One cluster per detection that still has ungoverned members. */
  open: Cluster[];
  /** Per kind, member -> outcome (via `outcomeOf`), for every member of the detection's domain that a ruling governs. */
  outcomes: Partial<Record<ClusterKind, Record<string, string>>>;
  /** Rulings of a kind that was detected in this call whose covered members are all missing from its domain. */
  stale: Ruling[];
}

export function governingRuling(rulings: readonly Ruling[], kind: ClusterKind, member: string): Ruling | undefined {
  for (let i = rulings.length - 1; i >= 0; i--) {
    const r = rulings[i]!;
    if (r.kind === kind && r.covers.includes(member)) return r;
  }
  return undefined;
}

/** Per kind, member -> the ruling that governs it (the last one in store order). Built once, so a lookup is O(1). */
export type RulingIndex = Map<ClusterKind, Map<string, Ruling>>;

export function indexRulings(rulings: readonly Ruling[]): RulingIndex {
  const index: RulingIndex = new Map();
  for (const r of rulings) {
    let per = index.get(r.kind);
    if (per === undefined) { per = new Map(); index.set(r.kind, per); }
    for (const m of r.covers) per.set(m, r);
  }
  return index;
}

/** The outcome each member of `kind` has under the stored rulings alone, for the members of `kind` the index governs. */
export function governedOutcomes(index: RulingIndex, kind: ClusterKind): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [m, r] of index.get(kind) ?? []) out[m] = outcomeOf(r, m);
  return out;
}

export function resolveDetections(detections: readonly KindDetection[], rulings: readonly Ruling[]): Resolution {
  const index = indexRulings(rulings);
  const open: Cluster[] = [];
  const outcomes: Resolution["outcomes"] = {};
  const domains = new Map<ClusterKind, Set<string>>();
  for (const detection of detections) {
    // One spelling of a member everywhere: rulings store NFC, so a detection is compared in NFC, de-duplicated.
    const d = { ...detection, members: sortedUnique(detection.members), domain: sortedUnique(detection.domain) };
    const governing = index.get(d.kind);
    const unruled = d.members.filter((m) => governing?.has(m) !== true);
    if (unruled.length > 0) {
      const asked = d.ask(unruled);
      open.push(buildCluster({ kind: d.kind, question: asked.question, members: unruled, options: asked.options, evidence: asked.evidence, ...(unruled.length < d.members.length ? { delta: true as const } : {}) }));
    }
    const per: Record<string, string> = { ...(outcomes[d.kind] ?? {}) };
    const seen = domains.get(d.kind) ?? new Set<string>();
    for (const m of [...d.domain, ...d.members]) {
      seen.add(m);
      const r = governing?.get(m);
      if (r !== undefined) per[m] = outcomeOf(r, m);
    }
    domains.set(d.kind, seen);
    outcomes[d.kind] = per;
  }
  const stale = rulings.filter((r) => {
    const domain = domains.get(r.kind);
    return domain !== undefined && !r.covers.some((m) => domain.has(m));
  });
  return { open, outcomes, stale };
}
