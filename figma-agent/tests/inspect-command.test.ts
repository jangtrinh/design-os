import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { inspectTarget } from '../cli/src/commands/inspect';

describe('inspect command', () => {
  it('returns structure and a required screenshot contract', async () => {
    const out = join(tmpdir(), `inspect-command-${Date.now()}.png`);
    const runner = async (cmd: string): Promise<unknown> => {
      if (cmd === 'EXEC_JS') return { result: { type: 'FRAME', name: 'Card' }, console: [], ms: 1 };
      if (cmd === 'EXPORT_PNG') return { base64: Buffer.from('png').toString('base64'), w: 10, h: 20 };
      throw new Error(`unexpected ${cmd}`);
    };
    const result = await inspectTarget({ explicit: '1:2', out }, runner) as {
      targetSource: string;
      structure: { type: string };
      visualArtifact: { required: boolean; path: string };
    };
    expect(result.targetSource).toBe('explicit');
    expect(result.structure.type).toBe('FRAME');
    expect(result.visualArtifact.required).toBe(true);
    expect(readFileSync(result.visualArtifact.path, 'utf8')).toBe('png');
  });

  it('falls back from empty selection to the most recent edited node', async () => {
    const out = join(tmpdir(), `inspect-recent-${Date.now()}.png`);
    const runner = async (cmd: string): Promise<unknown> => {
      if (cmd === 'GET_SELECTION') return { selection: [] };
      if (cmd === 'GET_CORRECTION_MEMORY') return {
        events: [
          { nodeId: 'old', timestamp: '2026-07-01T00:00:00.000Z' },
          { nodeId: 'recent', timestamp: '2026-07-02T00:00:00.000Z' },
        ],
      };
      if (cmd === 'EXEC_JS') return { result: { type: 'FRAME', name: 'Recent' }, console: [], ms: 1 };
      if (cmd === 'EXPORT_PNG') return { base64: Buffer.from('png').toString('base64'), w: 10, h: 20 };
      throw new Error(`unexpected ${cmd}`);
    };
    const result = await inspectTarget({ out }, runner) as {
      nodeId: string;
      targetSource: string;
    };
    expect(result).toMatchObject({ nodeId: 'recent', targetSource: 'recent' });
  });
});
