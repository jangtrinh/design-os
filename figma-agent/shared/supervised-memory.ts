export const CORRECTION_SCHEMA_VERSION = 1 as const;
export const PROJECT_RAW_LIMIT = 1_000;
export const EDGE_RAW_LIMIT = 250;
export const RAW_RETENTION_DAYS = 30;

export type CorrectionSource = 'agent' | 'designer' | 'system';
export type CorrectionKind = 'agent-operation' | 'designer-correction' | 'tombstone';

export interface CorrectionEvent {
  v: typeof CORRECTION_SCHEMA_VERSION;
  eventId: string;
  fileKey: string;
  nodeId: string;
  source: CorrectionSource;
  kind: CorrectionKind;
  timestamp: string;
  contentHash: string;
  causalParent?: string;
  unresolved?: boolean;
  traits: Record<string, unknown>;
}

export interface CorrectionConflict {
  eventId: string;
  project: CorrectionEvent;
  edge: CorrectionEvent;
}

export interface CorrectionMerge {
  active: CorrectionEvent[];
  quarantined: CorrectionConflict[];
  tombstonedIds: string[];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Stable non-secret content fingerprint suitable for corruption detection. */
export function correctionContentHash(value: unknown): string {
  const text = canonical(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildCorrectionEvent(
  input: Omit<CorrectionEvent, 'v' | 'contentHash'>,
): CorrectionEvent {
  const body = { ...input, v: CORRECTION_SCHEMA_VERSION };
  return { ...body, contentHash: correctionContentHash(body) };
}

export function hasValidCorrectionHash(event: unknown): event is CorrectionEvent {
  if (!event || typeof event !== 'object') return false;
  const candidate = event as Partial<CorrectionEvent>;
  if (
    candidate.v !== CORRECTION_SCHEMA_VERSION
    || typeof candidate.eventId !== 'string'
    || typeof candidate.fileKey !== 'string'
    || typeof candidate.nodeId !== 'string'
    || typeof candidate.timestamp !== 'string'
    || Number.isNaN(Date.parse(candidate.timestamp))
    || typeof candidate.contentHash !== 'string'
    || !candidate.traits
    || typeof candidate.traits !== 'object'
  ) return false;
  const typed = candidate as CorrectionEvent;
  const { contentHash: _hash, ...body } = typed;
  return typed.contentHash === correctionContentHash(body);
}

function byTimeThenId(a: CorrectionEvent, b: CorrectionEvent): number {
  return a.timestamp.localeCompare(b.timestamp) || a.eventId.localeCompare(b.eventId);
}

export function mergeCorrectionStores(
  projectEvents: readonly CorrectionEvent[],
  edgeEvents: readonly CorrectionEvent[],
): CorrectionMerge {
  const project = new Map(projectEvents.map((event) => [event.eventId, event]));
  const edge = new Map(edgeEvents.map((event) => [event.eventId, event]));
  const quarantined: CorrectionConflict[] = [];
  const merged = new Map<string, CorrectionEvent>();
  for (const id of [...new Set([...project.keys(), ...edge.keys()])].sort()) {
    const durable = project.get(id);
    const cached = edge.get(id);
    if (durable && cached && durable.contentHash !== cached.contentHash) {
      quarantined.push({ eventId: id, project: durable, edge: cached });
      merged.set(id, durable);
    } else {
      merged.set(id, durable ?? cached!);
    }
  }
  const tombstoned = new Set(
    [...merged.values()]
      .filter((event) => event.kind === 'tombstone' && event.causalParent)
      .map((event) => event.causalParent!),
  );
  return {
    active: [...merged.values()]
      .filter((event) => event.kind !== 'tombstone' && !tombstoned.has(event.eventId))
      .sort(byTimeThenId),
    quarantined,
    tombstonedIds: [...tombstoned].sort(),
  };
}

/**
 * Registry-integrity phase 04 (5.4), §3 — the result of a retention pass. `evictedUnresolved`
 * makes the "immortal" bug's fix honest: an unresolved event the hard cap could not make
 * room for is NOT silently kept forever (today's bug) and NOT silently discarded either —
 * the caller exports it (project-side: `design/memory/figma-corrections.overflow.jsonl`;
 * `sync-corrections` reports the count) before it drops out of `kept`.
 */
export interface RetentionResult {
  kept: CorrectionEvent[];
  evictedUnresolved: CorrectionEvent[];
}

/**
 * Enforce a TRUE hard total (`limit`) — unresolved entries can no longer escape it (the
 * "immortality" bug this phase fixes: today, once `unresolved` events alone exceed
 * `limit`, EVERY resolved event is dropped and the store still grows past `limit`
 * unboundedly). Eviction order, per the phase: resolved-and-past-`maxAgeDays` first
 * (unconditional expiry — unchanged from before, never itself an "eviction" the caller
 * needs to export), then resolved (oldest first, competing for the remaining budget),
 * then — ONLY once every resolved event is gone and the cap still isn't met — the
 * OLDEST unresolved events. Unresolved events are never subject to the AGE cutoff (a
 * designer correction awaiting resolution does not expire by the calendar), only to the
 * hard cap once nothing resolved is left to make room.
 */
export function retainCorrectionEvents(
  events: readonly CorrectionEvent[],
  now: Date,
  limit: number,
  maxAgeDays = RAW_RETENTION_DAYS,
): RetentionResult {
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  const unresolved = events.filter((event) => event.unresolved === true).sort(byTimeThenId);
  const resolvedFresh = events
    .filter((event) => event.unresolved !== true && Date.parse(event.timestamp) >= cutoff)
    .sort(byTimeThenId);

  const overBudget = Math.max(0, resolvedFresh.length + unresolved.length - Math.max(0, limit));
  const resolvedEvictCount = Math.min(overBudget, resolvedFresh.length);
  const keptResolved = resolvedFresh.slice(resolvedEvictCount);
  const stillOverBudget = overBudget - resolvedEvictCount;
  const evictedUnresolved = stillOverBudget > 0 ? unresolved.slice(0, stillOverBudget) : [];
  const keptUnresolved = stillOverBudget > 0 ? unresolved.slice(stillOverBudget) : unresolved;

  const kept = [...new Map([...keptResolved, ...keptUnresolved].map((event) => [event.eventId, event])).values()]
    .sort(byTimeThenId);
  return { kept, evictedUnresolved };
}
