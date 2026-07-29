// Wave 4.4 P1 — the broker's edit-feed fs layer: append-only JSONL, ONE FILE PER
// PROJECT FILE (fileKey|fileName slug), deliberately separate from change-log.ts so the
// two logs can never converge (spec A6). Mirrors tests/change-log.test.ts's shape.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EDIT_FEED_DIRNAME, appendEditFrames, editFeedDir, editFeedPath,
} from '../cli/src/transport/edit-feed-log.ts';
import { EDIT_FEED_SCHEMA_VERSION, type EditInput } from '../shared/edit-feed.ts';

const edit = (over: Partial<EditInput> = {}): EditInput => ({
  op: 'updated', nodeId: 'n1', nodeName: 'Hero card', nodeType: 'FRAME',
  parentName: 'Page frame', changedProps: ['x'], origin: 'LOCAL', page: 'Page 1',
  actor: 'owner', ...over,
});

let dir: string;
const prevEnv = process.env['FIGMA_AGENT_CHANGES_DIR'];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fa-edit-feed-'));
  process.env['FIGMA_AGENT_CHANGES_DIR'] = dir;
});
afterEach(() => {
  if (prevEnv === undefined) delete process.env['FIGMA_AGENT_CHANGES_DIR'];
  else process.env['FIGMA_AGENT_CHANGES_DIR'] = prevEnv;
  rmSync(dir, { recursive: true, force: true });
});

const readLines = (path: string): string[] =>
  readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0);

describe('editFeedDir / editFeedPath — shares the change-log base dir + env override', () => {
  it('lives under <changeLogDir()>/changes, honouring FIGMA_AGENT_CHANGES_DIR', () => {
    expect(editFeedDir()).toBe(join(dir, EDIT_FEED_DIRNAME));
  });

  it('slugs by fileKey when present', () => {
    expect(editFeedPath('ABC123key', 'ignored')).toBe(join(dir, EDIT_FEED_DIRNAME, 'abc123key.jsonl'));
  });

  it('slugs by fileName when fileKey is absent', () => {
    expect(editFeedPath(null, 'VSF - PCP')).toBe(join(dir, EDIT_FEED_DIRNAME, 'vsf-pcp.jsonl'));
  });

  it('falls back to "unknown" when neither fileKey nor fileName is usable', () => {
    expect(editFeedPath(null, null)).toBe(join(dir, EDIT_FEED_DIRNAME, 'unknown.jsonl'));
    expect(editFeedPath('', '')).toBe(join(dir, EDIT_FEED_DIRNAME, 'unknown.jsonl'));
  });
});

describe('appendEditFrames — one JSONL line per edit, own schema version', () => {
  it('writes a well-formed frame line for each edit and creates the dir', () => {
    const path = editFeedPath('KEY1', null);
    const { written, droppedInvalid } = appendEditFrames(
      path,
      [edit({ nodeId: 'a' }), edit({ nodeId: 'b', op: 'deleted', nodeName: null, parentName: null, origin: 'REMOTE', actor: 'ambiguous' })],
      { fileKey: 'KEY1', fileName: 'Some File', source: 'live' },
      42,
    );
    expect(written).toBe(2);
    expect(droppedInvalid).toBe(0);
    const lines = readLines(path);
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first).toMatchObject({
      v: EDIT_FEED_SCHEMA_VERSION, ts: 42, op: 'updated', nodeId: 'a', actor: 'owner',
      source: 'live', page: 'Page 1', fileKey: 'KEY1',
    });
    const second = JSON.parse(lines[1]);
    expect(second).toMatchObject({ op: 'deleted', nodeId: 'b', origin: 'REMOTE', actor: 'ambiguous', nodeName: null });
  });

  it('appends across calls (append-only, never truncates)', () => {
    const path = editFeedPath('KEY1', null);
    appendEditFrames(path, [edit({ nodeId: 'a' })], { fileKey: 'KEY1', fileName: '', source: 'live' }, 1);
    appendEditFrames(path, [edit({ nodeId: 'b' })], { fileKey: 'KEY1', fileName: '', source: 'live' }, 2);
    expect(readLines(path).map((l) => JSON.parse(l).nodeId)).toEqual(['a', 'b']);
  });

  it('skips malformed entries but keeps the valid ones, and COUNTS the drops (post-review)', () => {
    const path = editFeedPath('KEY1', null);
    const batch = [
      edit({ nodeId: 'ok' }),
      { op: 'updated', actor: 'owner' } as unknown as EditInput, // no nodeId
      { nodeId: 'x', op: 'bogus', actor: 'owner' } as unknown as EditInput, // bad op
      { nodeId: 'y', op: 'updated', actor: 'nobody' } as unknown as EditInput, // bad actor
      { nodeId: 'z', op: 'updated', actor: 'owner', changedProps: [42] } as unknown as EditInput, // bad changedProps element
      null as unknown as EditInput,
    ];
    const { written, droppedInvalid } = appendEditFrames(path, batch, { fileKey: 'KEY1', fileName: '', source: 'live' }, 1);
    expect(written).toBe(1);
    expect(droppedInvalid).toBe(5); // the five malformed entries never disappear silently
    expect(readLines(path)).toHaveLength(1);
    expect(JSON.parse(readLines(path)[0]).nodeId).toBe('ok');
  });

  it('writes nothing (no file) for an empty batch', () => {
    const path = editFeedPath('KEY1', null);
    const { written, droppedInvalid } = appendEditFrames(path, [], { fileKey: 'KEY1', fileName: '', source: 'live' }, 1);
    expect(written).toBe(0);
    expect(droppedInvalid).toBe(0);
  });

  it('two different files get two different feed files', () => {
    const pathA = editFeedPath('KEY_A', null);
    const pathB = editFeedPath('KEY_B', null);
    expect(pathA).not.toBe(pathB);
    appendEditFrames(pathA, [edit({ nodeId: 'a' })], { fileKey: 'KEY_A', fileName: '', source: 'live' }, 1);
    appendEditFrames(pathB, [edit({ nodeId: 'b' })], { fileKey: 'KEY_B', fileName: '', source: 'live' }, 1);
    expect(readLines(pathA)).toHaveLength(1);
    expect(readLines(pathB)).toHaveLength(1);
  });

  it('stamps the batch source (gapfill vs live) onto every frame', () => {
    const path = editFeedPath('KEY1', null);
    appendEditFrames(path, [edit({ nodeId: 'a' })], { fileKey: 'KEY1', fileName: '', source: 'gapfill' }, 1);
    expect(JSON.parse(readLines(path)[0]).source).toBe('gapfill');
  });
});
