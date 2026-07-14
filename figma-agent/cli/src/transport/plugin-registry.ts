// Multi-plugin registry (P4): the broker keeps ONE slot per connected plugin
// instance, keyed by a stable instanceId the relay mints once per iframe load.
// This replaces the old single `pluginWs` — two Figma files open at once used to
// evict each other on every PLUGIN_HELLO (the connect/disconnect flapping bug).
// Nothing here touches a socket beyond reading `readyState`, so the whole routing
// / cull / status contract is pure and unit-testable with fake sockets.
import type { PluginScene, PluginStatusEntry } from '../../../shared/protocol.ts';

/** WebSocket.OPEN — inlined so the registry needs no `ws` import (kept pure). */
export const WS_OPEN = 1;

/** The minimal socket surface the registry reads. Real `ws` sockets satisfy it. */
export interface RegistrySocket {
  readyState: number;
}

export interface PluginEntry<S extends RegistrySocket = RegistrySocket> {
  instanceId: string;
  ws: S;
  scene: PluginScene; // { fileName, page, ... } — grows via FILE_INFO
  connectedAt: number; // first HELLO for this instance (survives same-instance re-HELLO)
  lastSeenAt: number; // any inbound frame/pong — LIVENESS only (heartbeat cull)
  lastActiveAt: number; // real interaction (HELLO/FILE_INFO/command traffic) — drives ROUTING recency
}

// HELLO payload keys that are protocol plumbing, not scene identity.
const PROTOCOL_KEYS = new Set(['instanceId', 'pluginVersion', 'protocolV']);

/** Strip protocol keys from a HELLO/FILE_INFO payload → the scene subset. */
export function extractScene(data: Record<string, unknown> | null | undefined): PluginScene {
  const scene: PluginScene = {};
  for (const [k, v] of Object.entries(data ?? {})) if (!PROTOCOL_KEYS.has(k)) scene[k] = v;
  return scene;
}

/**
 * The set of live plugin instances behind the broker. Add/update on PLUGIN_HELLO,
 * merge scene on FILE_INFO, remove on socket close (or cull a dead socket), and
 * pick a routing target by most-recent activity (optionally filtered by fileName).
 */
export class PluginRegistry<S extends RegistrySocket = RegistrySocket> {
  private readonly plugins = new Map<string, PluginEntry<S>>();
  private counter = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Register or update a plugin instance. The id comes from the HELLO payload
   * (`instanceId`, minted once per relay load); a legacy plugin that omits it
   * reuses the id already bound to this socket, else a fresh minted one.
   * NEVER evicts a DIFFERENT instance — that was the whole bug. Returns whether
   * this REPLACED the same instance's prior entry, plus any prior *live* socket
   * the same instance is superseding (a reconnect), so the daemon can close it.
   */
  register(ws: S, data: Record<string, unknown>): { instanceId: string; replaced: boolean; superseded: S | null } {
    const now = this.now();
    const carried = typeof data.instanceId === 'string' && data.instanceId ? data.instanceId : null;
    const id = carried ?? this.instanceForWs(ws) ?? this.mint();
    const existing = this.plugins.get(id);
    const superseded = existing && existing.ws !== ws ? existing.ws : null;
    this.plugins.set(id, {
      instanceId: id,
      ws,
      scene: extractScene(data),
      connectedAt: existing ? existing.connectedAt : now,
      lastSeenAt: now,
      lastActiveAt: now,
    });
    return { instanceId: id, replaced: existing !== undefined, superseded };
  }

  /** Merge a FILE_INFO scene update (page change) into the socket's entry. */
  updateScene(ws: S, data: Record<string, unknown>): boolean {
    const entry = this.getByWs(ws);
    if (!entry) return false;
    entry.scene = { ...entry.scene, ...extractScene(data) };
    entry.lastSeenAt = this.now();
    entry.lastActiveAt = entry.lastSeenAt;
    return true;
  }

  /** Bump liveness (routing recency) for the socket's entry. Returns false if
   *  the socket is not a registered plugin (i.e. it is a CLI client). */
  touch(ws: S): boolean {
    const entry = this.getByWs(ws);
    if (!entry) return false;
    entry.lastSeenAt = this.now();
    return true;
  }

  /** Bump ROUTING recency too — only real interaction frames (command replies, chunks,
   *  FILE_INFO). Heartbeat PONGs must NOT call this: they fire for every connected file
   *  on a timer, which would flip the routing target on heartbeat phase instead of
   *  tracking what the user actually touched. */
  touchActive(ws: S): boolean {
    const entry = this.getByWs(ws);
    if (!entry) return false;
    entry.lastSeenAt = this.now();
    entry.lastActiveAt = entry.lastSeenAt;
    return true;
  }

  getByWs(ws: S): PluginEntry<S> | null {
    for (const e of this.plugins.values()) if (e.ws === ws) return e;
    return null;
  }

  private instanceForWs(ws: S): string | null {
    return this.getByWs(ws)?.instanceId ?? null;
  }

  /** Remove the entry owning this socket (disconnect). Returns its id, or null
   *  if the socket owned no entry (a CLI client, or an already-superseded socket). */
  removeByWs(ws: S): string | null {
    const entry = this.getByWs(ws);
    if (!entry) return null;
    this.plugins.delete(entry.instanceId);
    return entry.instanceId;
  }

  /** Drop every entry whose socket is no longer OPEN. Returns removed ids.
   *  (The daemon culls via socket 'close'; this is the pure equivalent for tests
   *  and a defensive sweep.) Each dead socket removes only ITS entry — no global
   *  eviction. */
  cullClosed(): string[] {
    const removed: string[] = [];
    for (const [id, e] of this.plugins) {
      if (e.ws.readyState !== WS_OPEN) {
        this.plugins.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  /** Live entries (socket OPEN), in insertion order. */
  liveEntries(): PluginEntry<S>[] {
    return [...this.plugins.values()].filter((e) => e.ws.readyState === WS_OPEN);
  }

  /** Count of live plugin instances. */
  size(): number {
    return this.liveEntries().length;
  }

  /**
   * The routing target: the live plugin with the most-recent `lastSeenAt` — "the
   * file the user touched last". An optional case-insensitive fileName-substring
   * filter (FIGMA_AGENT_FILE) restricts candidates; no candidate matches → null.
   * Ties keep the earliest-registered (deterministic insertion order).
   */
  selectTarget(filter?: string | null): PluginEntry<S> | null {
    let candidates = this.liveEntries();
    const f = filter?.trim().toLowerCase();
    if (f) candidates = candidates.filter((e) => String(e.scene.fileName ?? '').toLowerCase().includes(f));
    if (candidates.length === 0) return null;
    return candidates.reduce((best, e) => (e.lastActiveAt > best.lastActiveAt ? e : best));
  }

  /** The per-file list for BROKER_HELLO / `figma-agent status`, most-recent first. */
  statusList(): PluginStatusEntry[] {
    const now = this.now();
    return this.liveEntries()
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((e) => ({
        instanceId: e.instanceId,
        fileName: (e.scene.fileName as string | undefined) ?? null,
        page: (e.scene.page as string | undefined) ?? null,
        state: 'connected' as const,
        lastHeartbeatAge: e.lastSeenAt ? now - e.lastSeenAt : null,
        connectedAt: e.connectedAt,
      }));
  }

  private mint(): string {
    return `p_${++this.counter}_${this.now()}`;
  }
}
