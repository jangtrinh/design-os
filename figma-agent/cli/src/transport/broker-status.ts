// Pure builders for the broker's status surface: the BROKER_HELLO data object
// (`figma-agent status` reads it) and the E_NO_PLUGIN message. Kept out of
// broker-daemon.ts so both are unit-testable without a live socket.
import type { PluginRegistry, RegistrySocket } from './plugin-registry.ts';
import type { PluginStatusEntry } from '../../../shared/protocol.ts';
import type { RouteFilter } from './route-filter.ts';

/** Daemon-owned fields the registry can't know (identity + uptime). */
export interface BrokerMeta {
  port: number;
  pid: number;
  protocolV: number;
  buildMtime: number;
  uptimeMs: number;
}

/**
 * The BROKER_HELLO `data`. Carries the full `plugins` list + `activePlugin` (the
 * current routing target's fileName) AND a legacy single-plugin mirror
 * (`pluginConnected` / `pluginState` / `lastHeartbeatAge` / `pluginInfo`) of the
 * ACTIVE plugin. The mirror is a COMPAT SHIM: design-os `_status_text` and older
 * consumers read `plugin.connected` (built from these fields in status.ts), so
 * they keep working unchanged through the single→multi plugin move.
 */
export function buildBrokerHelloData(
  registry: PluginRegistry<RegistrySocket>,
  meta: BrokerMeta,
  filter: string | null | undefined,
  now: () => number = Date.now,
): Record<string, unknown> {
  const plugins: PluginStatusEntry[] = registry.statusList();
  const target = registry.selectTarget(filter);
  const connected = target !== null;
  return {
    port: meta.port,
    pid: meta.pid,
    protocolV: meta.protocolV,
    buildMtime: meta.buildMtime,
    uptimeMs: meta.uptimeMs,
    plugins,
    activePlugin: target ? (target.scene.fileName as string | undefined) ?? null : null,
    // ── legacy compat shim (mirrors the ACTIVE plugin) ──
    pluginConnected: connected,
    pluginState: connected ? 'connected' : 'disconnected',
    lastHeartbeatAge: target && target.lastSeenAt ? now() - target.lastSeenAt : null,
    pluginInfo: target ? target.scene : null,
  };
}

/**
 * The E_NO_PLUGIN message. With a routing filter set (`--file` or FIGMA_AGENT_FILE) AND
 * other files connected, name the KNOB THE CALLER ACTUALLY USED and list the connected
 * files (so the user sees why routing refused); otherwise the plain "no plugin connected"
 * nudge. Naming FIGMA_AGENT_FILE for a `--file` miss would be wrong advice — the caller
 * never set that env var.
 */
export function noPluginMessage(registry: PluginRegistry<RegistrySocket>, filter?: RouteFilter | null): string {
  const f = filter?.value?.trim();
  const live = registry.statusList();
  if (f && live.length > 0) {
    const names = live.map((p) => p.fileName ?? '(unnamed)').join(', ');
    const knob = filter?.source === 'flag' ? `--file "${f}"` : `FIGMA_AGENT_FILE="${f}"`;
    const fix = filter?.source === 'flag'
      ? 'Open that file\'s panel, or drop --file.'
      : 'Open that file\'s panel, or unset FIGMA_AGENT_FILE.';
    return `no Figma plugin matching ${knob} — connected files: [${names}]. ${fix}`;
  }
  return 'no Figma plugin connected — open the figma-agent plugin in Figma';
}
