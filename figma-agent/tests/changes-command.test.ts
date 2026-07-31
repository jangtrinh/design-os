// `figma-agent changes` (wave 4.4 phase 02 §1) — pure filtering/parsing + the fs-resolution
// seams, plus one full `run()` pass over a real fixture feed (tmpdir, FIGMA_AGENT_CHANGES_DIR
// override — the established convention, see error-log.test.ts/change-log.test.ts).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from '../cli/src/arg-parse.ts';
import {
  countByActor, filterFrames, limitFrames, parseSince, readEditFeed, resolveFeedFile, run,
  type ActorCounts,
} from '../cli/src/commands/changes.ts';
import { CliError } from '../cli/src/transport/protocol-helpers.ts';
import type { EditFrame } from '../shared/edit-feed.ts';

function frame(over: Partial<EditFrame> = {}): EditFrame {
  return {
    v: 1, ts: 1_700_000_000_000, actor: 'owner', source: 'live', op: 'updated',
    nodeId: 'n1', nodeName: 'Hero', nodeType: 'FRAME', parentName: 'Page frame',
    changedProps: ['x'], origin: 'LOCAL', page: 'Page 1', fileKey: 'key-1',
    ...over,
  };
}

describe('parseSince', () => {
  it('accepts a bare epoch-ms integer string', () => {
    expect(parseSince('1753800000000')).toBe(1753800000000);
  });

  it('accepts an ISO date string', () => {
    expect(parseSince('2026-07-29T00:00:00.000Z')).toBe(Date.parse('2026-07-29T00:00:00.000Z'));
  });

  it('rejects garbage, naming both accepted forms', () => {
    expect(() => parseSince('not-a-date')).toThrow(CliError);
    try {
      parseSince('not-a-date');
    } catch (err) {
      expect((err as CliError).message).toContain('epoch-ms');
      expect((err as CliError).message).toContain('ISO');
    }
  });
});

describe('readEditFeed', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fa-changes-read-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('a missing file reads as empty, not an error', () => {
    const result = readEditFeed(join(dir, 'nope.jsonl'));
    expect(result).toEqual({ frames: [], warnings: 0 });
  });

  it('parses every well-formed line', () => {
    const path = join(dir, 'f.jsonl');
    writeFileSync(path, `${JSON.stringify(frame({ nodeId: 'a' }))}\n${JSON.stringify(frame({ nodeId: 'b' }))}\n`);
    const { frames, warnings } = readEditFeed(path);
    expect(frames.map((f) => f.nodeId)).toEqual(['a', 'b']);
    expect(warnings).toBe(0);
  });

  it('a malformed line is skipped and counted, never fatal — the honest asymmetry vs the kernel\'s strict parser', () => {
    const path = join(dir, 'f.jsonl');
    writeFileSync(path, `${JSON.stringify(frame({ nodeId: 'a' }))}\nNOT JSON\n${JSON.stringify(frame({ nodeId: 'b' }))}\n`);
    const { frames, warnings } = readEditFeed(path);
    expect(frames.map((f) => f.nodeId)).toEqual(['a', 'b']);
    expect(warnings).toBe(1);
  });

  // Stage-4 fix round (M1) — a JSON-VALID but SHAPE-invalid line used to pass straight
  // through (only JSON.parse failures were caught) and crash downstream. Now gated by
  // `isValidEditFrame` the same way.
  it('a JSON object missing required fields (shape-invalid, not JSON-invalid) is skipped and counted', () => {
    const path = join(dir, 'f.jsonl');
    const lines = [
      JSON.stringify({ notAFrame: true }), // valid JSON, wrong shape entirely
      JSON.stringify({ ...frame({ nodeId: 'bad-actor' }), actor: 'nobody' }), // invalid actor
      JSON.stringify(frame({ nodeId: 'ok' })),
    ].join('\n') + '\n';
    writeFileSync(path, lines);
    const { frames, warnings } = readEditFeed(path);
    expect(frames.map((f) => f.nodeId)).toEqual(['ok']);
    expect(warnings).toBe(2);
  });

  // Stage-4 closing round (N3) — feed order is now a READER guarantee: an out-of-order
  // on-disk file (e.g. after M2's promotion-time migration interleaves two files' own
  // append orders) still reads back chronologically.
  it('sorts by ts even when the on-disk lines are out of order', () => {
    const path = join(dir, 'f.jsonl');
    writeFileSync(path, [
      frame({ nodeId: 'c', ts: 300 }),
      frame({ nodeId: 'a', ts: 100 }),
      frame({ nodeId: 'b', ts: 200 }),
    ].map((f) => JSON.stringify(f)).join('\n') + '\n');
    const { frames } = readEditFeed(path);
    expect(frames.map((f) => f.nodeId)).toEqual(['a', 'b', 'c']);
  });

  it('a stable sort keeps equal-ts frames in their original on-disk order', () => {
    const path = join(dir, 'f.jsonl');
    writeFileSync(path, [
      frame({ nodeId: 'first', ts: 100 }),
      frame({ nodeId: 'second', ts: 100 }),
    ].map((f) => JSON.stringify(f)).join('\n') + '\n');
    const { frames } = readEditFeed(path);
    expect(frames.map((f) => f.nodeId)).toEqual(['first', 'second']);
  });
});

describe('resolveFeedFile', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fa-changes-resolve-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('no --file, exactly one feed on disk → resolves it', () => {
    writeFileSync(join(dir, 'vsf-pcp.jsonl'), '');
    const resolved = resolveFeedFile(dir, undefined);
    expect(resolved.slug).toBe('vsf-pcp');
  });

  it('no --file, zero feeds → an error, never a crash on a missing dir', () => {
    expect(() => resolveFeedFile(join(dir, 'does-not-exist'), undefined)).toThrow(CliError);
  });

  it('no --file, multiple feeds → an error listing every feed that exists', () => {
    writeFileSync(join(dir, 'vsf-pcp.jsonl'), '');
    writeFileSync(join(dir, 'platform-design-system.jsonl'), '');
    try {
      resolveFeedFile(dir, undefined);
      expect.unreachable();
    } catch (err) {
      expect((err as CliError).message).toContain('vsf-pcp');
      expect((err as CliError).message).toContain('platform-design-system');
    }
  });

  it('--file exact slug match (case-insensitive) wins outright', () => {
    writeFileSync(join(dir, 'vsf-pcp.jsonl'), '');
    expect(resolveFeedFile(dir, 'VSF-PCP').slug).toBe('vsf-pcp');
  });

  it('--file substring match, unique, resolves', () => {
    writeFileSync(join(dir, 'vsf-pcp.jsonl'), '');
    writeFileSync(join(dir, 'platform-design-system.jsonl'), '');
    expect(resolveFeedFile(dir, 'platform').slug).toBe('platform-design-system');
  });

  it('unknown --file lists the feeds that DO exist (the spec\'s courtesy)', () => {
    writeFileSync(join(dir, 'vsf-pcp.jsonl'), '');
    writeFileSync(join(dir, 'platform-design-system.jsonl'), '');
    try {
      resolveFeedFile(dir, 'Nope');
      expect.unreachable();
    } catch (err) {
      expect((err as CliError).message).toContain('vsf-pcp');
      expect((err as CliError).message).toContain('platform-design-system');
    }
  });

  it('an ambiguous --file substring (matches more than one) errors rather than guessing', () => {
    writeFileSync(join(dir, 'vsf-pcp.jsonl'), '');
    writeFileSync(join(dir, 'vsf-pcp-2.jsonl'), '');
    expect(() => resolveFeedFile(dir, 'vsf')).toThrow(CliError);
  });
});

describe('filterFrames — since + actor compose', () => {
  const frames = [
    frame({ nodeId: 'a', ts: 100, actor: 'owner', page: 'P1' }),
    frame({ nodeId: 'b', ts: 200, actor: 'agent', page: 'P1' }),
    frame({ nodeId: 'c', ts: 300, actor: 'owner', page: 'P2' }),
  ];

  it('since alone', () => {
    expect(filterFrames(frames, { since: 200 }).map((f) => f.nodeId)).toEqual(['b', 'c']);
  });

  it('actor alone', () => {
    expect(filterFrames(frames, { actor: 'owner' }).map((f) => f.nodeId)).toEqual(['a', 'c']);
  });

  it('since + actor compose (AND, not OR)', () => {
    expect(filterFrames(frames, { since: 150, actor: 'owner' }).map((f) => f.nodeId)).toEqual(['c']);
  });

  it('page filters independently', () => {
    expect(filterFrames(frames, { page: 'P2' }).map((f) => f.nodeId)).toEqual(['c']);
  });

  it('no filter returns everything', () => {
    expect(filterFrames(frames, {})).toHaveLength(3);
  });
});

describe('countByActor — matches the FILTERED set', () => {
  it('counts owner/agent/ambiguous + total', () => {
    const frames = [
      frame({ actor: 'owner' }), frame({ actor: 'owner' }), frame({ actor: 'agent' }), frame({ actor: 'ambiguous' }),
    ];
    const counts: ActorCounts = countByActor(frames);
    expect(counts).toEqual({ owner: 2, agent: 1, ambiguous: 1, total: 4 });
  });

  it('counts the filtered set, not the whole feed', () => {
    const frames = [frame({ actor: 'owner', ts: 1 }), frame({ actor: 'agent', ts: 2 })];
    const filtered = filterFrames(frames, { actor: 'owner' });
    expect(countByActor(filtered)).toEqual({ owner: 1, agent: 0, ambiguous: 0, total: 1 });
  });
});

describe('limitFrames — newest N kept, oldest dropped (a log reads chronologically)', () => {
  const frames = [frame({ nodeId: 'a' }), frame({ nodeId: 'b' }), frame({ nodeId: 'c' })];

  it('--limit 2 keeps the LAST 2 (newest)', () => {
    expect(limitFrames(frames, 2).map((f) => f.nodeId)).toEqual(['b', 'c']);
  });

  it('--limit 0 means all', () => {
    expect(limitFrames(frames, 0)).toEqual(frames);
  });

  it('a limit larger than the set returns everything, unchanged', () => {
    expect(limitFrames(frames, 100)).toEqual(frames);
  });
});

describe('run — full envelope over a real fixture feed', () => {
  let dir: string;
  const prevEnv = process.env['FIGMA_AGENT_CHANGES_DIR'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fa-changes-run-'));
    process.env['FIGMA_AGENT_CHANGES_DIR'] = dir;
    mkdirSync(join(dir, 'changes'), { recursive: true });
    const lines = [
      frame({ nodeId: 'a', ts: 100, actor: 'owner', op: 'deleted', nodeName: 'Subtitle', nodeType: 'TEXT', parentName: 'Roles / Detail', changedProps: [] }),
      frame({ nodeId: 'b', ts: 200, actor: 'agent' }),
      'NOT JSON', // malformed — must be skipped + counted, never fatal
      frame({ nodeId: 'c', ts: 300, actor: 'owner' }),
    ].map((l) => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') + '\n';
    writeFileSync(join(dir, 'changes', 'vsf-pcp.jsonl'), lines);
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env['FIGMA_AGENT_CHANGES_DIR'];
    else process.env['FIGMA_AGENT_CHANGES_DIR'] = prevEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads the sole feed, renders a sentence, reports counts + warnings', async () => {
    const out = await run(parseArgs([])) as {
      file: string; feedPath: string; since: number | null; counts: ActorCounts;
      changes: Array<{ sentence: string; nodeId: string }>; warnings?: number;
    };
    expect(out.file).toBe('vsf-pcp');
    expect(out.feedPath).toContain('vsf-pcp.jsonl');
    expect(out.since).toBeNull();
    expect(out.counts).toEqual({ owner: 2, agent: 1, ambiguous: 0, total: 3 });
    expect(out.warnings).toBe(1);
    const deleted = out.changes.find((c) => c.nodeId === 'a')!;
    expect(deleted.sentence).toBe('Deleted text "Subtitle" in "Roles / Detail"');
  });

  it('--owner-only is sugar for --actor owner', async () => {
    const out = await run(parseArgs(['--owner-only'])) as { changes: Array<{ actor: string }> };
    expect(out.changes.every((c) => c.actor === 'owner')).toBe(true);
    expect(out.changes).toHaveLength(2);
  });

  it('--owner-only + a conflicting --actor is an error, not a silent precedence rule', async () => {
    await expect(run(parseArgs(['--owner-only', '--actor', 'agent']))).rejects.toThrow(CliError);
  });

  it('--since filters by epoch ms', async () => {
    const out = await run(parseArgs(['--since', '150'])) as { changes: Array<{ nodeId: string }> };
    expect(out.changes.map((c) => c.nodeId)).toEqual(['b', 'c']);
  });

  it('--file for an unknown name lists the feeds that DO exist', async () => {
    await expect(run(parseArgs(['--file', 'Nope']))).rejects.toThrow(CliError);
    try {
      await run(parseArgs(['--file', 'Nope']));
      expect.unreachable();
    } catch (err) {
      expect((err as CliError).message).toContain('vsf-pcp');
    }
  });

  it('rejects a non-finite --limit (minor 7)', async () => {
    await expect(run(parseArgs(['--limit', 'Infinity']))).rejects.toThrow(CliError);
  });
});

describe('run — fileName provenance (minor 9b)', () => {
  let dir: string;
  const prevEnv = process.env['FIGMA_AGENT_CHANGES_DIR'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fa-changes-filename-'));
    process.env['FIGMA_AGENT_CHANGES_DIR'] = dir;
    mkdirSync(join(dir, 'changes'), { recursive: true });
    writeFileSync(
      join(dir, 'changes', 'vsf-pcp.jsonl'),
      `${JSON.stringify(frame({ nodeId: 'a', fileName: 'VSF - PCP' }))}\n`,
    );
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env['FIGMA_AGENT_CHANGES_DIR'];
    else process.env['FIGMA_AGENT_CHANGES_DIR'] = prevEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('each output entry carries the frame\'s own fileName', async () => {
    const out = await run(parseArgs([])) as { changes: Array<{ fileName: string | null }> };
    expect(out.changes[0]!.fileName).toBe('VSF - PCP');
  });
});
