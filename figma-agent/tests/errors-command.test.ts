// `figma-agent errors` (backlog 4.6, folded into wave 4.4 P2) — pure parsing/filtering +
// one full `run()` pass over a real fixture log (tmpdir, FIGMA_AGENT_CHANGES_DIR override —
// same convention as changes-command.test.ts/error-log.test.ts).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from '../cli/src/arg-parse.ts';
import { filterErrors, limitErrors, readErrorLog, run } from '../cli/src/commands/errors.ts';
import { CliError } from '../cli/src/transport/protocol-helpers.ts';
import type { ErrorLogFrame } from '../cli/src/transport/error-log.ts';

function errFrame(over: Partial<ErrorLogFrame> = {}): ErrorLogFrame {
  return {
    ts: 100, cmd: 'SET_TEXT', activity: 'Build hero', code: 'E_EVAL',
    message: 'script stopped: runtime error', fileName: 'VSF - PCP', requestId: 'r1',
    ...over,
  };
}

describe('readErrorLog', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'fa-errors-read-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('a missing file reads as empty, not an error', () => {
    expect(readErrorLog(join(dir, 'nope.jsonl'))).toEqual({ frames: [], warnings: 0 });
  });

  it('a malformed line is skipped and counted, never fatal', () => {
    const path = join(dir, 'f.jsonl');
    writeFileSync(path, `${JSON.stringify(errFrame({ requestId: 'a' }))}\nNOT JSON\n${JSON.stringify(errFrame({ requestId: 'b' }))}\n`);
    const { frames, warnings } = readErrorLog(path);
    expect(frames.map((f) => f.requestId)).toEqual(['a', 'b']);
    expect(warnings).toBe(1);
  });
});

describe('filterErrors', () => {
  const frames = [
    errFrame({ requestId: 'a', ts: 100, fileName: 'VSF - PCP' }),
    errFrame({ requestId: 'b', ts: 200, fileName: 'Platform - Design System' }),
    errFrame({ requestId: 'c', ts: 300, fileName: null }),
  ];

  it('since alone', () => {
    expect(filterErrors(frames, { since: 200 }).map((f) => f.requestId)).toEqual(['b', 'c']);
  });

  it('file is a case-insensitive substring against each entry\'s own fileName', () => {
    expect(filterErrors(frames, { file: 'platform' }).map((f) => f.requestId)).toEqual(['b']);
  });

  it('a null fileName never matches a --file filter', () => {
    expect(filterErrors(frames, { file: 'vsf' }).map((f) => f.requestId)).toEqual(['a']);
  });

  it('since + file compose', () => {
    expect(filterErrors(frames, { since: 150, file: 'vsf' }).map((f) => f.requestId)).toEqual([]);
  });
});

describe('limitErrors', () => {
  const frames = [errFrame({ requestId: 'a' }), errFrame({ requestId: 'b' }), errFrame({ requestId: 'c' })];

  it('keeps the newest N', () => {
    expect(limitErrors(frames, 2).map((f) => f.requestId)).toEqual(['b', 'c']);
  });

  it('0 means all', () => {
    expect(limitErrors(frames, 0)).toEqual(frames);
  });
});

describe('run — full envelope over a real fixture log', () => {
  let dir: string;
  const prevEnv = process.env['FIGMA_AGENT_CHANGES_DIR'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fa-errors-run-'));
    process.env['FIGMA_AGENT_CHANGES_DIR'] = dir;
    const lines = [
      errFrame({ requestId: 'a', ts: 100, fileName: 'VSF - PCP' }),
      errFrame({ requestId: 'b', ts: 200, fileName: 'Platform - Design System' }),
      'NOT JSON', // malformed — must be skipped + counted, never fatal
    ].map((l) => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') + '\n';
    writeFileSync(join(dir, 'figma-errors.jsonl'), lines);
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env['FIGMA_AGENT_CHANGES_DIR'];
    else process.env['FIGMA_AGENT_CHANGES_DIR'] = prevEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads the log, reports count + warnings, the FULL untruncated message', async () => {
    const out = await run(parseArgs([])) as {
      logPath: string; since: number | null; count: number; errors: ErrorLogFrame[]; warnings?: number;
    };
    expect(out.logPath).toContain('figma-errors.jsonl');
    expect(out.since).toBeNull();
    expect(out.count).toBe(2);
    expect(out.errors).toHaveLength(2);
    expect(out.errors[0]!.message).toBe('script stopped: runtime error');
    expect(out.warnings).toBe(1);
  });

  it('--since filters by epoch ms', async () => {
    const out = await run(parseArgs(['--since', '150'])) as { errors: ErrorLogFrame[] };
    expect(out.errors.map((e) => e.requestId)).toEqual(['b']);
  });

  it('--file filters by the entry\'s own fileName', async () => {
    const out = await run(parseArgs(['--file', 'platform'])) as { errors: ErrorLogFrame[] };
    expect(out.errors.map((e) => e.requestId)).toEqual(['b']);
  });

  // Stage-4 fix round (minor 6) — `--file` FILTERS a single shared log; "this file has
  // zero logged errors" is a legitimate, GOOD outcome (unlike `changes`' unknown `--file`,
  // which picks among several per-file FEEDS and really can be a typo). A plain
  // informational `note` replaces the old throw.
  it('--file matching nothing returns count:0 + a note listing the fileNames that DO have errors logged — never throws', async () => {
    const out = await run(parseArgs(['--file', 'Nope'])) as { count: number; errors: ErrorLogFrame[]; note?: string };
    expect(out.count).toBe(0);
    expect(out.errors).toEqual([]);
    expect(out.note).toContain('VSF - PCP');
    expect(out.note).toContain('Platform - Design System');
  });

  it('a --file that matches something carries no note at all', async () => {
    const out = await run(parseArgs(['--file', 'platform'])) as { note?: string };
    expect(out.note).toBeUndefined();
  });

  it('rejects a non-finite --limit (minor 7)', async () => {
    await expect(run(parseArgs(['--limit', 'Infinity']))).rejects.toThrow(CliError);
  });
});

describe('run — M1 shape guard: a JSON-valid but shape-invalid line is skipped and counted, never crashes', () => {
  let dir: string;
  const prevEnv = process.env['FIGMA_AGENT_CHANGES_DIR'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fa-errors-shape-'));
    process.env['FIGMA_AGENT_CHANGES_DIR'] = dir;
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env['FIGMA_AGENT_CHANGES_DIR'];
    else process.env['FIGMA_AGENT_CHANGES_DIR'] = prevEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  it('a JSON object missing required fields never reaches the caller as a frame', async () => {
    const lines = [
      JSON.stringify({ notAFrame: true }), // JSON-valid, shape-invalid
      JSON.stringify(errFrame({ requestId: 'ok' })),
    ].join('\n') + '\n';
    writeFileSync(join(dir, 'figma-errors.jsonl'), lines);
    const out = await run(parseArgs([])) as { count: number; errors: ErrorLogFrame[]; warnings?: number };
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]!.requestId).toBe('ok');
    expect(out.warnings).toBe(1);
  });
});
