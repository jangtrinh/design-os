// F1 seat-adaptive bridge selector — unit tests.
// The pure routing table (selectBridge/classifySeat/route) is tested
// exhaustively; the probe HAND (probeSignals) is tested with a stub runner.
// The real seat probe against a live plugin is LIVE-E2E PENDING.
import { describe, it, expect } from 'vitest';
import {
  BRIDGE_FOR_SEAT,
  selectBridge,
  classifySeat,
  route,
  type Seat,
} from '../cli/src/seat/routing.ts';
import { probeSignals, type Runner } from '../cli/src/commands/seat.ts';

describe('selectBridge — the routing table', () => {
  it('maps free → figma-agent-cli', () => {
    expect(selectBridge('free')).toBe('figma-agent-cli');
  });
  it('maps paid → figma-mcp', () => {
    expect(selectBridge('paid')).toBe('figma-mcp');
  });
  it('table is exhaustive over the Seat union', () => {
    const seats: Seat[] = ['free', 'paid'];
    for (const s of seats) {
      expect(BRIDGE_FOR_SEAT[s]).toBe(selectBridge(s));
    }
  });
});

describe('classifySeat — pure classification', () => {
  it('an explicit override always wins (free)', () => {
    const c = classifySeat({ override: 'free', pluginReachable: false, writeOk: false });
    expect(c.seat).toBe('free');
    expect(c.reason).toContain('--seat');
  });
  it('an explicit override always wins (paid)', () => {
    const c = classifySeat({ override: 'paid', pluginReachable: true, writeOk: true });
    expect(c.seat).toBe('paid');
    expect(c.reason).toContain('paid');
  });
  it('plugin unreachable → free, reason explains the fallback + paid override', () => {
    const c = classifySeat({ pluginReachable: false, writeOk: false });
    expect(c.seat).toBe('free');
    expect(c.reason).toContain('not reachable');
    expect(c.reason).toContain('--seat paid');
  });
  it('reachable + writeOk → free, reason confirms editor rights', () => {
    const c = classifySeat({ pluginReachable: true, writeOk: true });
    expect(c.seat).toBe('free');
    expect(c.reason).toContain('editor rights');
  });
  it('reachable + write refused → free, reason notes the refusal', () => {
    const c = classifySeat({ pluginReachable: true, writeOk: false });
    expect(c.seat).toBe('free');
    expect(c.reason).toContain('refused');
  });

  // Concurrency & jobs (backlog 1.1+2.6+4.3), phase 01 §3 — a timeout is INCONCLUSIVE,
  // never the same fact as an explicit refusal; the queue can now genuinely make this
  // mutating probe wait behind another agent's command.
  it('reachable + write TIMED OUT (inconclusive) → free, reason says inconclusive, NOT refused', () => {
    const c = classifySeat({ pluginReachable: true, writeOk: false, writeInconclusive: true });
    expect(c.seat).toBe('free');
    expect(c.reason).toContain('inconclusive');
    expect(c.reason).not.toContain('refused');
  });
});

describe('route — classification composed with the table', () => {
  it('override paid → figma-mcp bridge', () => {
    expect(route({ override: 'paid', pluginReachable: false, writeOk: false })).toEqual({
      seat: 'paid',
      bridge: 'figma-mcp',
      reason: expect.stringContaining('paid'),
    });
  });
  it('probe success → free + figma-agent-cli bridge', () => {
    const r = route({ pluginReachable: true, writeOk: true });
    expect(r.seat).toBe('free');
    expect(r.bridge).toBe('figma-agent-cli');
  });
});

describe('probeSignals — the probe HAND (stubbed runner)', () => {
  it('STATUS throwing → { pluginReachable:false, writeOk:false }', async () => {
    const runner: Runner = async (cmd) => {
      if (cmd === 'STATUS') throw new Error('E_NO_PLUGIN');
      return {};
    };
    expect(await probeSignals(runner)).toEqual({ pluginReachable: false, writeOk: false });
  });

  it('STATUS ok + write round-trips → { pluginReachable:true, writeOk:true }', async () => {
    const runner: Runner = async (cmd) => {
      if (cmd === 'STATUS') return { fileName: 'X' };
      if (cmd === 'EXEC_JS') return { wrote: true };
      return {};
    };
    expect(await probeSignals(runner)).toEqual({ pluginReachable: true, writeOk: true });
  });

  it('STATUS ok + write refused (wrote:false) → { pluginReachable:true, writeOk:false }', async () => {
    const runner: Runner = async (cmd) => {
      if (cmd === 'STATUS') return { fileName: 'X' };
      if (cmd === 'EXEC_JS') return { wrote: false };
      return {};
    };
    expect(await probeSignals(runner)).toEqual({ pluginReachable: true, writeOk: false });
  });

  it('STATUS ok + EXEC_JS throwing → reachable but writeOk:false', async () => {
    const runner: Runner = async (cmd) => {
      if (cmd === 'STATUS') return { fileName: 'X' };
      throw new Error('E_EVAL');
    };
    expect(await probeSignals(runner)).toEqual({ pluginReachable: true, writeOk: false });
  });

  // Concurrency & jobs (backlog 1.1+2.6+4.3), phase 01 §3 — the pre-existing defect
  // this wave's queue turns from latent into visible: a coded E_TIMEOUT must be
  // reported as INCONCLUSIVE, never collapsed into the same "not an editor" signal an
  // explicit refusal produces.
  it('STATUS ok + EXEC_JS times out (coded E_TIMEOUT) → writeInconclusive: true, NOT a bare refusal', async () => {
    const runner: Runner = async (cmd) => {
      if (cmd === 'STATUS') return { fileName: 'X' };
      throw Object.assign(new Error('timed out'), { code: 'E_TIMEOUT' });
    };
    expect(await probeSignals(runner)).toEqual({ pluginReachable: true, writeOk: false, writeInconclusive: true });
  });

  it('STATUS ok + EXEC_JS throws a DIFFERENT coded error → still a plain refusal (no writeInconclusive)', async () => {
    const runner: Runner = async (cmd) => {
      if (cmd === 'STATUS') return { fileName: 'X' };
      throw Object.assign(new Error('boom'), { code: 'E_EVAL' });
    };
    expect(await probeSignals(runner)).toEqual({ pluginReachable: true, writeOk: false });
  });

  it('issues the STATUS probe before the EXEC_JS write (cheapest-first)', async () => {
    const calls: string[] = [];
    const runner: Runner = async (cmd) => {
      calls.push(cmd);
      if (cmd === 'STATUS') return {};
      return { wrote: true };
    };
    await probeSignals(runner);
    expect(calls).toEqual(['STATUS', 'EXEC_JS']);
  });
});
