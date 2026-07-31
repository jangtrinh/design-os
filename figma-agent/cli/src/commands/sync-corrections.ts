import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { CommandArgs } from '../figma-agent.ts';
import { CliError } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';
import {
  EDGE_RAW_LIMIT,
  PROJECT_RAW_LIMIT,
  hasValidCorrectionHash,
  mergeCorrectionStores,
  retainCorrectionEvents,
  type CorrectionEvent,
} from '../../../shared/supervised-memory.ts';

function parseJsonl(path: string): CorrectionEvent[] {
  try {
    return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line, index) => {
      try { return JSON.parse(line) as CorrectionEvent; }
      catch { throw new CliError('E_INVALID_ARGS', `${path}:${index + 1} is not valid JSON`); }
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function serializeJsonl(events: readonly CorrectionEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : '');
}

export async function run(args: CommandArgs): Promise<unknown> {
  const root = resolve(args.str('dir') ?? process.cwd());
  const projectPath = resolve(root, 'design/memory/figma-corrections.jsonl');
  const quarantinePath = resolve(root, 'design/memory/figma-corrections.quarantine.json');
  // Registry-integrity phase 04 (5.4), §3 — the durable overflow ledger: an unresolved
  // event the hard cap could not make room for lands HERE (append-only, never deleted)
  // before it drops out of the live store. "Immortal" becomes "archived" — the honest
  // version of the same promise, never a silent loss.
  const overflowPath = resolve(root, 'design/memory/figma-corrections.overflow.jsonl');
  const project = parseJsonl(projectPath);
  const edgeReply = await runCommand('GET_CORRECTION_MEMORY', {}, { activity: 'Recall corrections' }) as {
    events?: CorrectionEvent[];
    // Stage-4 MAJOR7 — the edge cache's own running total of unresolved events it has
    // ever had to evict for its hard cap, BEFORE any of them were necessarily synced
    // here — a count is the honest floor (no filesystem on the plugin side to archive
    // the actual events to); absent on an older plugin build, never a crash.
    evictedUnresolved?: number;
  };
  const edge = edgeReply.events ?? [];
  const edgeEvictedUnresolved = edgeReply.evictedUnresolved ?? 0;
  const invalid = [...project, ...edge].filter((event) => !hasValidCorrectionHash(event));
  if (invalid.length > 0) {
    throw new CliError('E_INVALID_ARGS', `correction memory has ${invalid.length} invalid content hash(es)`);
  }
  const merge = mergeCorrectionStores(project, edge);
  const byId = new Map(edge.map((event) => [event.eventId, event]));
  for (const event of project) byId.set(event.eventId, event);
  const { kept: canonical, evictedUnresolved } = retainCorrectionEvents([...byId.values()], new Date(), PROJECT_RAW_LIMIT);
  // A SECOND, smaller-limit pass narrows to what the edge (plugin) cache can hold — its
  // OWN "evicted" set is NOT a durable loss (those events still live in `canonical`, the
  // project-side store just written below), so it is never sent to the overflow ledger.
  const { kept: edgeNext } = retainCorrectionEvents(canonical, new Date(), EDGE_RAW_LIMIT);

  mkdirSync(dirname(projectPath), { recursive: true });
  // Stage-4 MAJOR5 — the overflow archive is the ONLY durable record of an unresolved
  // event the hard cap evicted; append it BEFORE rewriting the pruned project store. A
  // crash between the two writes must never land on the side that has already dropped
  // these events from the live store with nothing archived — "immortal" would silently
  // become "gone", the exact failure this ledger exists to prevent.
  if (evictedUnresolved.length > 0) {
    appendFileSync(overflowPath, serializeJsonl(evictedUnresolved), 'utf8');
  }
  writeFileSync(projectPath, serializeJsonl(canonical));
  if (merge.quarantined.length > 0) {
    writeFileSync(quarantinePath, `${JSON.stringify(merge.quarantined, null, 2)}\n`);
  }
  await runCommand('SET_CORRECTION_MEMORY', { events: edgeNext }, { activity: 'Sync corrections' });
  return {
    projectPath,
    projectEvents: canonical.length,
    edgeEvents: edgeNext.length,
    activeEvents: merge.active.length,
    quarantined: merge.quarantined.length,
    tombstoned: merge.tombstonedIds.length,
    overflowed: evictedUnresolved.length,
    // Stage-4 MAJOR7 — surfaced honestly even though this command cannot recover those
    // events (they never reached here); an operator seeing this rise unexpectedly is the
    // whole point of no longer discarding it silently.
    edgeEvictedUnresolved,
  };
}
