// Batch B — bounded `status --timeout`.
// Disconnected-as-data is preserved; a slow plugin degrades ONLY the optional live
// enrichment (enrichTimedOut) instead of blocking; a mid-probe disconnect resolves
// to `disconnected`; other errors propagate.
import { describe, expect, it, vi } from 'vitest';
import {
  enrichActivePlugin,
  resolveStatusTimeout,
  DEFAULT_STATUS_TIMEOUT_MS,
} from '../cli/src/commands/status';
import { CliError } from '../cli/src/transport/protocol-helpers';

const CONNECTED = { connected: true, state: 'connected', lastHeartbeatAge: 10, scene: { fileName: 'F' } };

describe('resolveStatusTimeout', () => {
  it('defaults to 2000ms', () => {
    expect(resolveStatusTimeout(undefined)).toBe(DEFAULT_STATUS_TIMEOUT_MS);
    expect(DEFAULT_STATUS_TIMEOUT_MS).toBe(2_000);
  });

  it('accepts an explicit positive integer', () => {
    expect(resolveStatusTimeout(500)).toBe(500);
  });

  it.each([0, -1, 3.5])('rejects non-positive/non-integer %s with E_INVALID_ARGS', (bad) => {
    expect(() => resolveStatusTimeout(bad)).toThrowError(/E_INVALID_ARGS|positive integer/);
  });
});

describe('enrichActivePlugin', () => {
  it('disconnected → returns hello facts untouched, no probe', async () => {
    const runner = vi.fn(async () => ({}));
    const out = await enrichActivePlugin(
      { connected: false, state: 'disconnected', lastHeartbeatAge: null, scene: null },
      2_000,
      runner as never,
    );
    expect(out.connected).toBe(false);
    expect(out.enrichTimedOut).toBe(false);
    expect(runner).not.toHaveBeenCalled();
  });

  it('connected → merges the live STATUS scene, passing the bound as timeoutMs', async () => {
    const runner = vi.fn(async (_cmd: string, _p: unknown, opts?: { timeoutMs?: number }) => {
      expect(opts?.timeoutMs).toBe(1_500);
      return { user: 'jang', pluginVersion: '0.1.0' };
    });
    const out = await enrichActivePlugin(CONNECTED, 1_500, runner as never);
    expect(out.scene).toMatchObject({ fileName: 'F', user: 'jang', pluginVersion: '0.1.0' });
    expect(out.enrichTimedOut).toBe(false);
  });

  it('timeout → broker facts stand, enrichTimedOut:true (never throws)', async () => {
    const runner = vi.fn(async () => {
      throw new CliError('E_TIMEOUT', 'STATUS timed out after 2000ms');
    });
    const out = await enrichActivePlugin(CONNECTED, 2_000, runner as never);
    expect(out.connected).toBe(true);
    expect(out.enrichTimedOut).toBe(true);
    expect(out.scene).toEqual({ fileName: 'F' }); // unchanged hello facts
  });

  it('mid-probe disconnect (E_NO_PLUGIN race) → disconnected', async () => {
    const runner = vi.fn(async () => {
      throw new CliError('E_NO_PLUGIN', 'plugin left');
    });
    const out = await enrichActivePlugin(CONNECTED, 2_000, runner as never);
    expect(out.connected).toBe(false);
    expect(out.state).toBe('disconnected');
    expect(out.scene).toBeNull();
    expect(out.enrichTimedOut).toBe(false);
  });

  it('propagates unexpected errors', async () => {
    const runner = vi.fn(async () => {
      throw new CliError('E_NO_BROKER', 'broker died');
    });
    await expect(enrichActivePlugin(CONNECTED, 2_000, runner as never)).rejects.toThrow(/E_NO_BROKER|broker died/);
  });
});
