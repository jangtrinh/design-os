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

export function resolveDetections(detections: readonly KindDetection[], rulings: readonly Ruling[]): Resolution {
  const open: Cluster[] = [];
  const outcomes: Resolution["outcomes"] = {};
  for (const d of detections) {
    const unruled = d.members.filter((m) => governingRuling(rulings, d.kind, m) === undefined);
    if (unruled.length > 0) {
      const asked = d.ask(unruled);
      open.push(buildCluster({ kind: d.kind, question: asked.question, members: unruled, options: asked.options, evidence: asked.evidence, ...(unruled.length < d.members.length ? { delta: true as const } : {}) }));
    }
    const per: Record<string, string> = { ...(outcomes[d.kind] ?? {}) };
    for (const m of new Set([...d.domain, ...d.members])) {
      const r = governingRuling(rulings, d.kind, m);
      if (r !== undefined) per[m] = outcomeOf(r, m);
    }
    outcomes[d.kind] = per;
  }
  const detected = new Set(detections.map((d) => d.kind));
  const stale = rulings.filter((r) => {
    if (!detected.has(r.kind)) return false;
    const domain = new Set(detections.filter((d) => d.kind === r.kind).flatMap((d) => [...d.domain, ...d.members]));
    return !r.covers.some((m) => domain.has(m));
  });
  return { open, outcomes, stale };
}
