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

export async function run(_args: CommandArgs): Promise<unknown> {
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
  let connected = hello.pluginConnected === true;
  let state = (hello.pluginState as string | undefined) ?? (connected ? 'connected' : 'disconnected');
  let lastHeartbeatAge = (hello.lastHeartbeatAge as number | null | undefined) ?? null;
  let scene: Record<string, unknown> | null =
    hello.pluginInfo && typeof hello.pluginInfo === 'object' ? (hello.pluginInfo as Record<string, unknown>) : null;

  // Enrich the ACTIVE plugin with a live STATUS round-trip (user, pluginVersion…).
  if (connected) {
    try {
      const s = await runCommand('STATUS', {});
      if (s && typeof s === 'object') scene = { ...(scene ?? {}), ...(s as Record<string, unknown>) };
    } catch (err) {
      if (!(err instanceof CliError && err.code === 'E_NO_PLUGIN')) throw err;
      // Raced: the active plugin left between the hello and the STATUS round-trip.
      connected = false;
      state = 'disconnected';
      lastHeartbeatAge = null;
      scene = null;
    }
  }

  // Legacy compat shim: `plugin` mirrors the ACTIVE plugin so design-os `_status_text`
  // and older consumers (which read `plugin.connected`) keep working unchanged.
  const plugin = { connected, state, lastHeartbeatAge, ...(scene ?? {}) };

  return { broker, plugins, activePlugin, plugin, protocolVersion: broker.protocolVersion };
}
