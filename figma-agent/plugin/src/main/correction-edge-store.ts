import {
  buildCorrectionEvent,
  EDGE_RAW_LIMIT,
  retainCorrectionEvents,
  type CorrectionEvent,
} from '../../../shared/supervised-memory';

const NAMESPACE = 'ease_design';
/** Legacy single-key value (pre phase-04 §3) — read as a fallback, migrated + cleared the
 *  first time `writeEdgeCorrections` runs post-upgrade. */
const KEY_V1 = 'figma-corrections-v1';
const MANIFEST_KEY = 'figma-corrections-v2-manifest';
const CHUNK_PREFIX = 'figma-corrections-v2-';
/** Registry-integrity phase 04 (5.4), §3 — target chunk size, comfortably under Figma's
 *  100 kB per-`sharedPluginData`-entry cap (FIGMA_ENTRY_BYTE_CAP below) so ordinary growth
 *  never gets anywhere near the hard wall. */
const CHUNK_BYTE_BUDGET = 64_000;
/** Figma's actual per-entry cap — the safety net `writeEdgeCorrections` evicts against if
 *  a chunk ever gets this close (pathological: a single event's own JSON alone this big). */
const FIGMA_ENTRY_BYTE_CAP = 100_000;

const suppressedUntil = new Map<string, number>();
let eventSequence = 0;

function parseEvents(text: string): CorrectionEvent[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed as CorrectionEvent[] : [];
  } catch {
    return [];
  }
}

/** UTF-8 byte length without `Buffer`/`TextEncoder` — the Figma plugin main-thread sandbox
 *  cannot be assumed to expose either, so this is a plain-JS surrogate-pair-aware count
 *  (same "duplicate a small pure helper rather than depend on an unavailable API"
 *  convention this wave already uses for `safeSlug`/`fileIdentity`). */
function utf8ByteLength(str: string): number {
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4; // surrogate pair — one full UTF-16 "character" is 4 UTF-8 bytes
      i += 1; // consume the low surrogate too
    } else bytes += 3;
  }
  return bytes;
}

interface ChunkManifest {
  v: 2;
  chunks: number;
  /**
   * Stage-4 MAJOR7 — a running total of unresolved events this EDGE-side cache has ever
   * had to evict for the hard cap (`EDGE_RAW_LIMIT`), across every `writeEdgeCorrections`
   * call. The plugin has no filesystem to export a durable overflow ledger to (the
   * project-side `sync-corrections` command owns that), so a silently-dropped count here
   * was previously the ONE place this specific class of loss left zero trace — an event
   * evicted here before `sync-corrections` ever synced it is gone with no record at all.
   * Absent (a pre-MAJOR7 manifest) reads as 0, never a crash.
   */
  evictedUnresolved: number;
}

function chunkKey(i: number): string {
  return `${CHUNK_PREFIX}${i}`;
}

function readManifest(): ChunkManifest | undefined {
  const raw = figma.root.getSharedPluginData(NAMESPACE, MANIFEST_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<ChunkManifest>;
    if (parsed.v === 2 && typeof parsed.chunks === 'number' && Number.isInteger(parsed.chunks) && parsed.chunks >= 0) {
      // Stage-4 MAJOR7 — additive field: a manifest written before this fix has no
      // `evictedUnresolved` at all; read it as 0, never a crash, never a fabricated count.
      const evictedUnresolved =
        typeof parsed.evictedUnresolved === 'number'
        && Number.isInteger(parsed.evictedUnresolved) && parsed.evictedUnresolved >= 0
          ? parsed.evictedUnresolved
          : 0;
      return { v: 2, chunks: parsed.chunks, evictedUnresolved };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Stage-4 MAJOR7 — the running total of unresolved events this edge cache has ever
 *  evicted (see `ChunkManifest.evictedUnresolved`). 0 when no manifest exists yet (legacy
 *  v1-only store, or a project that has never evicted anything). */
export function readEvictedUnresolvedCount(): number {
  return readManifest()?.evictedUnresolved ?? 0;
}

/** Split events into JSON-array chunks, each within `CHUNK_BYTE_BUDGET` bytes — split
 *  strictly on EVENT boundaries (never mid-JSON), so every chunk parses independently as
 *  its own complete array. A single event whose own JSON exceeds the budget still gets
 *  its own (oversized) chunk — never silently dropped or truncated here; the byte-cap
 *  safety net in `writeEdgeCorrections` is what evicts if that ever threatens Figma's real
 *  100 kB wall. */
function splitIntoChunks(events: readonly CorrectionEvent[]): string[] {
  const chunks: string[] = [];
  let current: CorrectionEvent[] = [];
  let currentBytes = 2; // "[" + "]"
  for (const event of events) {
    const eventBytes = utf8ByteLength(JSON.stringify(event));
    const commaBeforeAdd = current.length > 0 ? 1 : 0;
    if (current.length > 0 && currentBytes + commaBeforeAdd + eventBytes > CHUNK_BYTE_BUDGET) {
      chunks.push(JSON.stringify(current));
      current = [];
      currentBytes = 2;
    }
    const comma = current.length > 0 ? 1 : 0;
    current.push(event);
    currentBytes += comma + eventBytes;
  }
  if (current.length > 0) chunks.push(JSON.stringify(current));
  return chunks;
}

function readChunked(manifest: ChunkManifest): CorrectionEvent[] {
  const events: CorrectionEvent[] = [];
  for (let i = 0; i < manifest.chunks; i++) {
    events.push(...parseEvents(figma.root.getSharedPluginData(NAMESPACE, chunkKey(i))));
  }
  return events;
}

/** Clear chunk keys in `[startInclusive, endExclusive)` — an empty string deletes a
 *  `sharedPluginData` entry (Figma's own convention), used when a write needs FEWER
 *  chunks than the prior write left behind. */
function clearChunkRange(startInclusive: number, endExclusive: number): void {
  for (let i = startInclusive; i < endExclusive; i++) figma.root.setSharedPluginData(NAMESPACE, chunkKey(i), '');
}

export function readEdgeCorrections(): CorrectionEvent[] {
  const manifest = readManifest();
  if (manifest !== undefined) return readChunked(manifest);
  // No v2 manifest yet — fall back to the legacy v1 single-key value (migrated + cleared
  // the next time writeEdgeCorrections runs; reading never mutates).
  return parseEvents(figma.root.getSharedPluginData(NAMESPACE, KEY_V1));
}

/**
 * Registry-integrity phase 04 (5.4), §3 — chunked write with byte accounting. Retention
 * (the hard cap) runs FIRST; the resulting set is chunked at `CHUNK_BYTE_BUDGET`; if any
 * chunk would still exceed Figma's real per-entry cap (`FIGMA_ENTRY_BYTE_CAP` — a
 * pathological single oversized event, essentially never in ordinary operation), the
 * oldest events are evicted and the set re-chunked until it fits — "a write that would
 * exceed the budget triggers eviction first," never a wedge the plugin cannot recover
 * from. Always writes the v2 manifest + clears any legacy v1 key in the SAME call
 * (lazy, write-triggered migration — reading never mutates, so a store that never writes
 * again stays on v1 until it does, and reads it losslessly either way via
 * `readEdgeCorrections`).
 */
export function writeEdgeCorrections(events: readonly CorrectionEvent[]): CorrectionEvent[] {
  // Stage-4 MAJOR7 — plugin-side eviction is a CACHE drop, not necessarily a durable loss
  // (the project-side `sync-corrections` pass usually catches it via its OWN retention +
  // overflow ledger) — but an event evicted HERE before it is ever synced project-side is
  // gone with zero trace either way. There is no filesystem here to export a durable
  // ledger to, so the honest floor is a COUNT, carried in the v2 manifest and surfaced via
  // `GET_CORRECTION_MEMORY` → `sync-corrections`'s own report (never a panel UI — this is
  // an audit signal, not an interactive queue).
  const priorManifest = readManifest();
  let { kept, evictedUnresolved } = retainCorrectionEvents(events, new Date(), EDGE_RAW_LIMIT);
  let chunks = splitIntoChunks(kept);
  // Stage-4 N5 — the byte-cap safety net (a pathological single oversized event forcing
  // further shrinkage) evicts the OLDEST remaining event same as `retainCorrectionEvents`
  // does, but was NOT counted toward `evictedUnresolved` — an unresolved event dropped
  // HERE is exactly the same class of loss MAJOR7 exists to surface, just via a
  // different eviction path. Only UNRESOLVED drops count (a resolved event isn't the
  // "immortal" concern this counter tracks).
  let byteCapEvictedUnresolved = 0;
  while (kept.length > 0 && chunks.some((c) => utf8ByteLength(c) > FIGMA_ENTRY_BYTE_CAP)) {
    if (kept[0]!.unresolved === true) byteCapEvictedUnresolved += 1;
    kept = kept.slice(1); // oldest first — `retainCorrectionEvents` already sorts kept this way
    chunks = splitIntoChunks(kept);
  }

  for (let i = 0; i < chunks.length; i++) figma.root.setSharedPluginData(NAMESPACE, chunkKey(i), chunks[i]!);
  if (priorManifest !== undefined && priorManifest.chunks > chunks.length) {
    clearChunkRange(chunks.length, priorManifest.chunks);
  }
  const totalEvictedUnresolved = (priorManifest?.evictedUnresolved ?? 0) + evictedUnresolved.length + byteCapEvictedUnresolved;
  figma.root.setSharedPluginData(
    NAMESPACE, MANIFEST_KEY,
    JSON.stringify({ v: 2, chunks: chunks.length, evictedUnresolved: totalEvictedUnresolved } satisfies ChunkManifest),
  );
  if (figma.root.getSharedPluginData(NAMESPACE, KEY_V1) !== '') {
    figma.root.setSharedPluginData(NAMESPACE, KEY_V1, '');
  }
  return kept;
}

function eventId(prefix: string, nodeId: string): string {
  eventSequence += 1;
  return `${prefix}-${Date.now()}-${eventSequence}-${nodeId.replace(/[^a-z0-9]/gi, '-')}`;
}

export function isDesignerCorrectionCandidate(
  changeType: string,
  properties: readonly string[],
): boolean {
  if (changeType !== 'PROPERTY_CHANGE' || properties.length === 0) return false;
  return !properties.includes('parent') && !properties.includes('relativeTransform');
}

export function beginAgentMutation(nodeIds: readonly string[]): void {
  const until = Date.now() + 2_000;
  for (const nodeId of nodeIds) suppressedUntil.set(nodeId, until);
}

export function recordAgentMutation(nodeId: string, traits: Record<string, unknown>): CorrectionEvent {
  const event = buildCorrectionEvent({
    eventId: eventId('agent', nodeId),
    fileKey: figma.fileKey ?? 'local-file',
    nodeId,
    source: 'agent',
    kind: 'agent-operation',
    timestamp: new Date().toISOString(),
    traits,
  });
  writeEdgeCorrections([...readEdgeCorrections(), event]);
  return event;
}

export function recordDesignerCorrection(
  nodeId: string,
  traits: Record<string, unknown>,
): CorrectionEvent | null {
  const changeType = typeof traits.changeType === 'string' ? traits.changeType : '';
  const properties = Array.isArray(traits.properties)
    ? traits.properties.filter((value): value is string => typeof value === 'string')
    : [];
  if (!isDesignerCorrectionCandidate(changeType, properties)) return null;
  if ((suppressedUntil.get(nodeId) ?? 0) >= Date.now()) return null;
  const events = readEdgeCorrections();
  const parent = [...events].reverse()
    .find((event) => event.nodeId === nodeId && event.kind === 'agent-operation');
  if (!parent) return null;
  const event = buildCorrectionEvent({
    eventId: eventId('correction', nodeId),
    fileKey: figma.fileKey ?? 'local-file',
    nodeId,
    source: 'designer',
    kind: 'designer-correction',
    timestamp: new Date().toISOString(),
    causalParent: parent.eventId,
    unresolved: true,
    traits,
  });
  writeEdgeCorrections([...events, event]);
  return event;
}
