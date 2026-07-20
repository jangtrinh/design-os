import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  const project = parseJsonl(projectPath);
  const edgeReply = await runCommand('GET_CORRECTION_MEMORY', {}, { activity: 'Recall corrections' }) as {
    events?: CorrectionEvent[];
  };
  const edge = edgeReply.events ?? [];
  const invalid = [...project, ...edge].filter((event) => !hasValidCorrectionHash(event));
  if (invalid.length > 0) {
    throw new CliError('E_INVALID_ARGS', `correction memory has ${invalid.length} invalid content hash(es)`);
  }
  const merge = mergeCorrectionStores(project, edge);
  const byId = new Map(edge.map((event) => [event.eventId, event]));
  for (const event of project) byId.set(event.eventId, event);
  const canonical = retainCorrectionEvents([...byId.values()], new Date(), PROJECT_RAW_LIMIT);
  const edgeNext = retainCorrectionEvents(canonical, new Date(), EDGE_RAW_LIMIT);

  mkdirSync(dirname(projectPath), { recursive: true });
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
  };
}
