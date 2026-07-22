// `figma-agent status` — broker {port,pid,uptime,protocolVersion} from a
// BROKER_HELLO read, plus `plugins` (one row per connected file), `activePlugin`
// (the current routing target's fileName), and a legacy `plugin` object mirroring
// the ACTIVE plugin. Never throws E_NO_PLUGIN: an absent plugin is reported as
// connected:false so `status` stays a diagnosis tool, not another command that
// fails when nobody's listening.
import { PROTOCOL_VERSION, type PluginStatusEntry } from '../../../shared/protocol.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { fetchBrokerHello, runCommand } from '../transport/broker-client.ts';
import { ensureBroker } from '../transport/broker-discovery.ts';
import { CliError } from '../transport/protocol-helpers.ts';

/** Default bound (ms) for the optional live STATUS enrichment round-trip. */
export const DEFAULT_STATUS_TIMEOUT_MS = 2_000;

/**
 * Resolve + validate `--timeout` for the bounded enrichment. Absent → default 2s.
 * A non-positive or non-integer value is rejected with E_INVALID_ARGS before any
 * broker call (arg-parse only guards NaN, not sign or integrality).
 */
export function resolveStatusTimeout(requested?: number): number {
  if (requested === undefined) return DEFAULT_STATUS_TIMEOUT_MS;
  if (!Number.isInteger(requested) || requested <= 0) {
    throw new CliError('E_INVALID_ARGS', `--timeout must be a positive integer (ms), got "${requested}"`);
  }
  return requested;
}

/** The ACTIVE plugin's resolved liveness after (optionally) a bounded STATUS probe. */
export interface ActivePluginState {
  connected: boolean;
  state: string;
  lastHeartbeatAge: number | null;
  scene: Record<string, unknown> | null;
  /** True when the optional live enrichment timed out — broker facts still stand. */
  enrichTimedOut: boolean;
}

type StatusRunner = (cmd: string, params: unknown, opts?: { timeoutMs?: number }) => Promise<unknown>;

/**
 * Enrich the ACTIVE plugin with a live STATUS round-trip (user, pluginVersion…),
 * BOUNDED by `timeoutMs`. Disconnected-as-data is preserved: an absent plugin returns
 * the hello-level facts untouched. On timeout the broker facts stand and only the
 * optional enrichment degrades (`enrichTimedOut: true`) — status never blocks on a slow
 * plugin. A mid-probe disconnect (E_NO_PLUGIN race) resolves to `disconnected`.
 * Injectable runner keeps this unit-testable without a live socket.
 */
export async function enrichActivePlugin(
  initial: Omit<ActivePluginState, 'enrichTimedOut'>,
  timeoutMs: number,
  runner: StatusRunner = runCommand,
): Promise<ActivePluginState> {
  if (!initial.connected) return { ...initial, enrichTimedOut: false };
  try {
    const s = await runner('STATUS', {}, { timeoutMs });
    const scene = s && typeof s === 'object'
      ? { ...(initial.scene ?? {}), ...(s as Record<string, unknown>) }
      : initial.scene;
    return { ...initial, scene, enrichTimedOut: false };
  } catch (err) {
    if (err instanceof CliError && err.code === 'E_TIMEOUT') {
      return { ...initial, enrichTimedOut: true };
    }
    if (err instanceof CliError && err.code === 'E_NO_PLUGIN') {
      // Raced: the active plugin left between the hello and the STATUS round-trip.
      return { connected: false, state: 'disconnected', lastHeartbeatAge: null, scene: null, enrichTimedOut: false };
    }
    throw err;
  }
}

export async function run(args: CommandArgs): Promise<unknown> {
  const timeoutMs = resolveStatusTimeout(args.num('timeout')); // validates before any broker call
  const ad = await ensureBroker();

  let hello: Record<string, unknown> = {};
  try {
    hello = await fetchBrokerHello(ad.port);
  } catch {
    /* fall back to the advertisement fields below */
  }

  const broker = {
    port: ad.port,
    pid: ad.pid,
    uptimeMs: (hello.uptimeMs as number | undefined) ?? null,
    protocolVersion: (hello.protocolV as number | undefined) ?? PROTOCOL_VERSION,
  };
  const plugins = Array.isArray(hello.plugins) ? (hello.plugins as PluginStatusEntry[]) : [];
  const activePlugin = (hello.activePlugin as string | null | undefined) ?? null;

  // The ACTIVE plugin's liveness (legacy mirror source). `pluginConnected` is true
  // only when a routable target exists (respects FIGMA_AGENT_FILE).
  const connected = hello.pluginConnected === true;
  const initial: Omit<ActivePluginState, 'enrichTimedOut'> = {
    connected,
    state: (hello.pluginState as string | undefined) ?? (connected ? 'connected' : 'disconnected'),
    lastHeartbeatAge: (hello.lastHeartbeatAge as number | null | undefined) ?? null,
    scene: hello.pluginInfo && typeof hello.pluginInfo === 'object'
      ? (hello.pluginInfo as Record<string, unknown>)
      : null,
  };

  const enriched = await enrichActivePlugin(initial, timeoutMs);

  // Legacy compat shim: `plugin` mirrors the ACTIVE plugin so design-os `_status_text`
  // and older consumers (which read `plugin.connected`) keep working unchanged.
  // `enrichTimedOut` is additive — only present when the live probe degraded.
  const plugin = {
    connected: enriched.connected,
    state: enriched.state,
    lastHeartbeatAge: enriched.lastHeartbeatAge,
    ...(enriched.scene ?? {}),
    ...(enriched.enrichTimedOut ? { enrichTimedOut: true } : {}),
  };

  return { broker, plugins, activePlugin, plugin, protocolVersion: broker.protocolVersion };
}
