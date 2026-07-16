// The CLI half of the activity feed: every command that the plugin cannot identify
// from its wire `cmd` must SAY what it is doing (RequestMsg.activity).
//
// This matters most for EXEC_JS, which is injected code: a bare scan-node, both of
// mirror-verify's scans, its rebuild-removal and an ad-hoc script are all the same
// `cmd` on the wire. Without a label the panel can only ever log "exec js" four
// times and the user learns nothing — the whole reason the field exists.
import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION, makeRequestFrame } from '../shared/protocol.ts';
import { scanNodeSpec } from '../cli/src/commands/scan-node.ts';
import { execute as mirrorVerify } from '../cli/src/commands/mirror-verify.ts';

interface Call { cmd: string; params: unknown; opts?: { timeoutMs?: number; activity?: string } }

const SPEC = { type: 'FRAME', name: 'Card', width: 100, height: 40 };

/** Records every wire call; answers each command with a plausible reply. */
function recorder(calls: Call[]) {
  return async (cmd: string, params: unknown, opts?: { timeoutMs?: number; activity?: string }) => {
    calls.push({ cmd, params, opts });
    if (cmd === 'IMPORT_PAYLOAD') return { id: '9:9', name: 'Card', warnings: [] };
    const code = (params as { code?: string }).code ?? '';
    return code.includes('remove') ? { result: { removed: true } } : { result: SPEC, ms: 1 };
  };
}

describe('makeRequestFrame — the label is additive, never a behaviour change', () => {
  it('carries the label when one is given', () => {
    expect(makeRequestFrame('c_1', 'EXEC_JS', { code: '1' }, 'Scan · 1:23'))
      .toEqual({ id: 'c_1', cmd: 'EXEC_JS', params: { code: '1' }, v: PROTOCOL_VERSION, activity: 'Scan · 1:23' });
  });

  it('BACKWARD-COMPAT: an unlabelled frame is byte-identical to the pre-label wire', () => {
    // Not `activity: undefined` — the KEY must be absent, so the serialized frame an
    // old broker/plugin sees is exactly the one it has always seen.
    const frame = makeRequestFrame('c_1', 'STATUS', {});
    expect('activity' in frame).toBe(false);
    expect(JSON.stringify(frame)).toBe(JSON.stringify({ id: 'c_1', cmd: 'STATUS', params: {}, v: PROTOCOL_VERSION }));
  });

  it('treats a blank label as no label — never ships an empty row to the panel', () => {
    expect('activity' in makeRequestFrame('c_1', 'STATUS', {}, '   ')).toBe(false);
  });
});

describe('scan-node — labels the wait with the node it is scanning', () => {
  it('defaults the label to "Scan · <nodeId>"', async () => {
    const calls: Call[] = [];
    await scanNodeSpec('1:23', 30_000, recorder(calls));
    expect(calls[0]?.cmd).toBe('EXEC_JS');
    expect(calls[0]?.opts?.activity).toBe('Scan · 1:23');
  });

  it('lets its caller override the label — mirror-verify scans twice, differently', async () => {
    const calls: Call[] = [];
    await scanNodeSpec('1:23', 30_000, recorder(calls), 'Mirror-verify · scan rebuild');
    expect(calls[0]?.opts?.activity).toBe('Mirror-verify · scan rebuild');
  });
});

describe('mirror-verify — one label per phase, so the feed reads as a sequence', () => {
  it('names all four phases distinctly, in order', async () => {
    const calls: Call[] = [];
    await mirrorVerify('1:23', { keep: false, timeoutMs: 30_000 }, recorder(calls));
    expect(calls.map((c) => c.opts?.activity)).toEqual([
      'Mirror-verify · scan original',
      'Mirror-verify · rebuild',
      'Mirror-verify · scan rebuild',
      'Mirror-verify · remove scratch',
    ]);
  });

  it('keeps the labels attached to the right commands', async () => {
    const calls: Call[] = [];
    await mirrorVerify('1:23', { keep: false, timeoutMs: 30_000 }, recorder(calls));
    expect(calls.map((c) => c.cmd)).toEqual(['EXEC_JS', 'IMPORT_PAYLOAD', 'EXEC_JS', 'EXEC_JS']);
  });

  it('skips the scratch-removal phase (and its label) when --keep is passed', async () => {
    const calls: Call[] = [];
    await mirrorVerify('1:23', { keep: true, timeoutMs: 30_000 }, recorder(calls));
    expect(calls.map((c) => c.opts?.activity)).not.toContain('Mirror-verify · remove scratch');
  });
});
