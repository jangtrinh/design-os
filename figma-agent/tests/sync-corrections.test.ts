// Registry-integrity phase 04 (5.4), §3 — `figma-agent sync-corrections`'s own half of
// the true hard cap: an unresolved event the PROJECT_RAW_LIMIT pass evicts is exported to
// `design/memory/figma-corrections.overflow.jsonl` (append-only, never deleted) before it
// drops out of the live store, and the command reports the count. `runCommand` (the
// broker round trip) is mocked — everything under test here is the command's own
// retention + overflow-export wiring, not the transport.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// Stage-4 MAJOR5 ordering tests spy on the real `appendFileSync`/`writeFileSync` (still
// delegating to the real implementation) — `vi.spyOn` cannot redefine a live ESM named
// export, so the whole module is mocked instead (same pattern as log-rotate.test.ts).
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, appendFileSync: vi.fn(actual.appendFileSync), writeFileSync: vi.fn(actual.writeFileSync) };
});
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../cli/src/transport/broker-client.ts', () => ({
  runCommand: vi.fn(),
}));

import { runCommand } from '../cli/src/transport/broker-client.ts';

const appendMock = vi.mocked(appendFileSync);
const writeMock = vi.mocked(writeFileSync);
import { parseArgs } from '../cli/src/arg-parse.ts';
import { run } from '../cli/src/commands/sync-corrections.ts';
import { buildCorrectionEvent, type CorrectionEvent } from '../shared/supervised-memory.ts';

let dir: string;

function event(eventId: string, minutesAgo: number, unresolved = false): CorrectionEvent {
  return buildCorrectionEvent({
    eventId, fileKey: 'file-1', nodeId: '1:2', source: 'designer', kind: 'designer-correction',
    timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(), unresolved, traits: {},
  });
}

function projectLedgerPath(): string {
  return join(dir, 'design', 'memory', 'figma-corrections.jsonl');
}
function overflowPath(): string {
  return join(dir, 'design', 'memory', 'figma-corrections.overflow.jsonl');
}
function writeProjectLedger(events: readonly CorrectionEvent[]): void {
  mkdirSync(join(dir, 'design', 'memory'), { recursive: true });
  writeFileSync(projectLedgerPath(), events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fa-sync-corrections-'));
  vi.mocked(runCommand).mockReset();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  appendMock.mockClear();
  writeMock.mockClear();
});

describe('sync-corrections — no overflow under the cap', () => {
  it('reports overflowed: 0 and writes no overflow file when everything fits', async () => {
    writeProjectLedger([event('a', 5), event('b', 4, true)]);
    vi.mocked(runCommand).mockResolvedValue({ events: [] });
    const result = await run(parseArgs(['--dir', dir])) as { overflowed: number; edgeEvictedUnresolved: number };
    expect(result.overflowed).toBe(0);
    expect(result.edgeEvictedUnresolved).toBe(0); // no reply field at all → defaults to 0
    expect(existsSync(overflowPath())).toBe(false);
  });
});

// Stage-4 MAJOR7 — the edge (plugin) cache's own eviction count travels through
// GET_CORRECTION_MEMORY's reply and must land, unmodified, in this command's report —
// the one place an operator can see it happened at all.
describe('sync-corrections — MAJOR7: the edge cache eviction count is surfaced honestly', () => {
  it('passes GET_CORRECTION_MEMORY.evictedUnresolved straight through to the report', async () => {
    writeProjectLedger([event('a', 5)]);
    vi.mocked(runCommand).mockResolvedValue({ events: [], evictedUnresolved: 7 });
    const result = await run(parseArgs(['--dir', dir])) as { edgeEvictedUnresolved: number };
    expect(result.edgeEvictedUnresolved).toBe(7);
  });
});

describe('sync-corrections — the true hard cap, project-side overflow export', () => {
  it('an unresolved event the PROJECT_RAW_LIMIT cap cannot hold is exported to the overflow ledger, never silently lost', async () => {
    // 1001 unresolved events > PROJECT_RAW_LIMIT (1000) — the oldest one must overflow.
    const events = Array.from({ length: 1001 }, (_, i) => event(`u${i}`, 1001 - i, true));
    writeProjectLedger(events);
    vi.mocked(runCommand).mockResolvedValue({ events: [] });
    const result = await run(parseArgs(['--dir', dir])) as { overflowed: number; projectEvents: number };
    expect(result.overflowed).toBe(1);
    expect(result.projectEvents).toBe(1000);
    expect(existsSync(overflowPath())).toBe(true);
    const overflowed = readFileSync(overflowPath(), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as CorrectionEvent);
    expect(overflowed).toHaveLength(1);
    expect(overflowed[0]!.eventId).toBe('u0'); // the OLDEST unresolved event
  });

  it('the overflow ledger is append-only — a second overflowing run adds to it, never overwrites', async () => {
    writeProjectLedger(Array.from({ length: 1001 }, (_, i) => event(`u${i}`, 1001 - i, true)));
    vi.mocked(runCommand).mockResolvedValue({ events: [] });
    await run(parseArgs(['--dir', dir]));
    const afterFirst = readFileSync(overflowPath(), 'utf8').trim().split('\n');
    expect(afterFirst).toHaveLength(1);

    // A second run with a DIFFERENT overflowing event (simulate a fresh over-cap state).
    writeProjectLedger(Array.from({ length: 1001 }, (_, i) => event(`v${i}`, 2001 - i, true)));
    await run(parseArgs(['--dir', dir]));
    const afterSecond = readFileSync(overflowPath(), 'utf8').trim().split('\n');
    expect(afterSecond.length).toBe(2); // the first overflow line is still there, plus the new one
  });

  // Stage-4 MAJOR5 — the overflow archive is the ONLY durable record of an evicted
  // unresolved event; it must be written BEFORE the pruned project store, so a crash
  // between the two never lands on the side that already dropped the event with nothing
  // archived. Ordering, not just final contents — a content-only assertion cannot catch
  // the writes happening in the wrong order.
  it('stage-4 MAJOR5: appendFileSync(overflow) is actually called BEFORE writeFileSync(project store) — ordering, not just final contents', async () => {
    writeProjectLedger(Array.from({ length: 1001 }, (_, i) => event(`u${i}`, 1001 - i, true)));
    vi.mocked(runCommand).mockResolvedValue({ events: [] });
    // Clear the fixture setup's own writeFileSync call (to this SAME path) so only calls
    // made BY `run()` itself are counted below.
    appendMock.mockClear();
    writeMock.mockClear();
    await run(parseArgs(['--dir', dir]));

    const appendCallIdx = appendMock.mock.calls.findIndex((args) => String(args[0]) === overflowPath());
    const writeCallIdx = writeMock.mock.calls.findIndex((args) => String(args[0]) === projectLedgerPath());
    expect(appendCallIdx).toBeGreaterThanOrEqual(0);
    expect(writeCallIdx).toBeGreaterThanOrEqual(0);
    // `invocationCallOrder` is a single counter shared across every mock in the run, so it
    // is directly comparable between these two DIFFERENT mocked functions.
    expect(appendMock.mock.invocationCallOrder[appendCallIdx]!).toBeLessThan(
      writeMock.mock.invocationCallOrder[writeCallIdx]!,
    );
  });

  it('stage-4 MAJOR5: a crash right at the project-store write still leaves the overflow event archived', async () => {
    writeProjectLedger(Array.from({ length: 1001 }, (_, i) => event(`u${i}`, 1001 - i, true)));
    vi.mocked(runCommand).mockResolvedValue({ events: [] });
    writeMock.mockImplementationOnce(() => {
      throw new Error('simulated crash right after the overflow archive');
    });
    await expect(run(parseArgs(['--dir', dir]))).rejects.toThrow(/simulated crash/);
    // Even though the command threw before the project store was ever rewritten, the
    // evicted event is already durably archived — never silently gone.
    expect(existsSync(overflowPath())).toBe(true);
    const overflowed = readFileSync(overflowPath(), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as CorrectionEvent);
    expect(overflowed).toHaveLength(1);
    expect(overflowed[0]!.eventId).toBe('u0');
  });
});
