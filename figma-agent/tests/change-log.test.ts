// spec 004 P1 — the broker's change-log fs layer: append-only JSONL, one frame
// per line, cursor = line count. Mirrors the design-memory ledger; this is the
// on-disk contract reconcile (P2/P4) walks.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CHANGE_LOG_FILENAME, appendChangeFrames, changeLogDir, changeLogLineCount, changeLogPath,
} from '../cli/src/transport/change-log.ts';
import { CHANGE_LOG_SCHEMA_VERSION, type ComponentChange } from '../shared/figma-changes.ts';

const change = (over: Partial<ComponentChange>): ComponentChange => ({
  op: 'updated', nodeId: 'n1', nodeName: 'Button', nodeType: 'COMPONENT',
  changedProps: ['fills'], origin: 'LOCAL', ...over,
});

let dir: string;
let path: string;
const prevEnv = process.env['FIGMA_AGENT_CHANGES_DIR'];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fa-changes-'));
  process.env['FIGMA_AGENT_CHANGES_DIR'] = dir;
  path = changeLogPath();
});
afterEach(() => {
  if (prevEnv === undefined) delete process.env['FIGMA_AGENT_CHANGES_DIR'];
  else process.env['FIGMA_AGENT_CHANGES_DIR'] = prevEnv;
  rmSync(dir, { recursive: true, force: true });
});

const readLines = (): string[] => readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0);

describe('changeLogDir / changeLogPath — env override', () => {
  it('honours FIGMA_AGENT_CHANGES_DIR and names the file', () => {
    expect(changeLogDir()).toBe(dir);
    expect(changeLogPath()).toBe(join(dir, CHANGE_LOG_FILENAME));
  });
  it('defaults to <cwd>/design when the env is unset', () => {
    delete process.env['FIGMA_AGENT_CHANGES_DIR'];
    expect(changeLogDir()).toBe(join(process.cwd(), 'design'));
  });
});

describe('appendChangeFrames — one JSONL line per change', () => {
  it('writes a well-formed frame line for each change and creates the dir', () => {
    const written = appendChangeFrames(
      path,
      [change({ nodeId: 'a' }), change({ nodeId: 'b', op: 'deleted', nodeName: null, origin: 'REMOTE' })],
      { page: 'Components', fileKey: 'KEY1' },
      42,
    );
    expect(written).toBe(2);
    const lines = readLines();
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]);
    expect(first).toMatchObject({
      v: CHANGE_LOG_SCHEMA_VERSION, ts: 42, op: 'updated', nodeId: 'a',
      scopeHint: 'local', page: 'Components', fileKey: 'KEY1',
    });
    const second = JSON.parse(lines[1]);
    expect(second).toMatchObject({ op: 'deleted', nodeId: 'b', origin: 'REMOTE', scopeHint: 'global', nodeName: null });
  });

  it('appends across calls (append-only, never truncates)', () => {
    appendChangeFrames(path, [change({ nodeId: 'a' })], { page: 'P', fileKey: null }, 1);
    appendChangeFrames(path, [change({ nodeId: 'b' })], { page: 'P', fileKey: null }, 2);
    expect(readLines().map((l) => JSON.parse(l).nodeId)).toEqual(['a', 'b']);
  });

  it('skips malformed entries but keeps the valid ones (untrusted wire input)', () => {
    const batch = [
      change({ nodeId: 'ok' }),
      { op: 'updated' } as unknown as ComponentChange, // no nodeId
      { nodeId: 'x', op: 'bogus' } as unknown as ComponentChange, // bad op
      null as unknown as ComponentChange,
    ];
    const written = appendChangeFrames(path, batch, { page: 'P', fileKey: null }, 1);
    expect(written).toBe(1);
    expect(readLines()).toHaveLength(1);
    expect(JSON.parse(readLines()[0]).nodeId).toBe('ok');
  });

  it('writes nothing (no file) for an empty batch', () => {
    const written = appendChangeFrames(path, [], { page: 'P', fileKey: null }, 1);
    expect(written).toBe(0);
  });
});

describe('changeLogLineCount — reconcile cursor', () => {
  it('is 0 when the log is absent', () => {
    expect(changeLogLineCount(path)).toBe(0);
  });
  it('counts non-blank lines and advances with each append', () => {
    expect(changeLogLineCount(path)).toBe(0);
    appendChangeFrames(path, [change({ nodeId: 'a' }), change({ nodeId: 'b' })], { page: 'P', fileKey: null }, 1);
    expect(changeLogLineCount(path)).toBe(2);
    appendChangeFrames(path, [change({ nodeId: 'c' })], { page: 'P', fileKey: null }, 2);
    expect(changeLogLineCount(path)).toBe(3);
    expect(existsSync(path)).toBe(true);
  });
});
