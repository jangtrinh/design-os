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

export function retainCorrectionEvents(
  events: readonly CorrectionEvent[],
  now: Date,
  limit: number,
  maxAgeDays = RAW_RETENTION_DAYS,
): CorrectionEvent[] {
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  const protectedEvents = events.filter((event) => event.unresolved === true);
  const candidates = events
    .filter((event) => event.unresolved !== true && Date.parse(event.timestamp) >= cutoff)
    .sort(byTimeThenId);
  const kept = candidates.slice(Math.max(0, candidates.length - Math.max(0, limit - protectedEvents.length)));
  return [...new Map([...protectedEvents, ...kept].map((event) => [event.eventId, event])).values()]
    .sort(byTimeThenId);
}
