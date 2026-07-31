// `figma-agent status` — broker {port,pid,uptime,protocolVersion} from a
// BROKER_HELLO read, plus `plugins` (one row per connected file), `activePlugin`
// (the current routing target's fileName), and a legacy `plugin` object mirroring
// the ACTIVE plugin. Never throws E_NO_PLUGIN: an absent plugin is reported as
// connected:false so `status` stays a diagnosis tool, not another command that
// fails when nobody's listening.
import { PROTOCOL_VERSION } from '../../../shared/protocol.ts';
import { fileMatches } from '../../../shared/file-match.ts';
import type { CommandArgs } from '../figma-agent.ts';
import { fetchBrokerHello, runCommand } from '../transport/broker-client.ts';
import { ensureBroker } from '../transport/broker-discovery.ts';
import { CliError } from '../transport/protocol-helpers.ts';
// Concurrency & jobs (backlog 1.1+2.6+4.3), phase 02 §3 — each row now carries
// `runningJob`/`queueDepth` (broker-status.ts's `buildBrokerHelloData`, given a
// `jobStatusFor`). This CLI is JSON-only (no `--json` flag exists — figma-agent always
// prints one JSON object; unlike the unrelated `ui` kernel CLI), so these fields reach
// the caller simply by being present on `plugins[]` — no separate text renderer to update.
import type { PluginStatusEntryWithJob } from '../transport/broker-status.ts';

export async function run(args: CommandArgs): Promise<unknown> {
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
  const all = Array.isArray(hello.plugins) ? (hello.plugins as PluginStatusEntryWithJob[]) : [];

  // `--file` must not make the diagnosis self-contradictory: the BROKER_HELLO fields
  // below (activePlugin/pluginConnected/pluginInfo) are computed by the broker from
  // FIGMA_AGENT_FILE only, while the STATUS round-trip below now carries `expectedFile`
  // (the global --file flag, set once in figma-agent.ts main()) — so filter `plugins[]`
  // and derive activePlugin/connected LOCALLY instead of trusting the broker's env-only view.
  const wanted = args.str('file');            // status takes the same global flag
  const plugins = wanted ? all.filter((p) => fileMatches(p.fileName, wanted, true)) : all;
  const activePlugin = wanted
    ? plugins[0]?.fileName ?? null                       // the file the caller asked about
    : (hello.activePlugin as string | null | undefined) ?? null;

  // The ACTIVE plugin's liveness (legacy mirror source). `pluginConnected` is true
  // only when a routable target exists (respects --file / FIGMA_AGENT_FILE).
  let connected = wanted ? plugins.length > 0 : hello.pluginConnected === true;
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
      // Raced: the active plugin left between the hello and the STATUS round-trip
      // (E_NO_PLUGIN), or the file the caller named no longer matches what answered
      // (E_WRONG_FILE) — either way `status` stays a diagnosis tool that never fails.
      if (!(err instanceof CliError && (err.code === 'E_NO_PLUGIN' || err.code === 'E_WRONG_FILE'))) throw err;
      connected = false;
      state = 'disconnected';
      lastHeartbeatAge = null;
      scene = null;
    }
  }

  // Legacy compat shim: `plugin` mirrors the ACTIVE plugin so design-os `_status_text`
  // and older consumers (which read `plugin.connected`) keep working unchanged.
  const plugin = { connected, state, lastHeartbeatAge, ...(scene ?? {}) };

  // Keep the full list available when `--file` filtered `plugins[]`, so the user can
  // still see what IS connected even though it doesn't match what they asked about.
  return {
    broker, plugins, activePlugin, plugin, protocolVersion: broker.protocolVersion,
    ...(wanted ? { pluginsAll: all } : {}),
  };
}
