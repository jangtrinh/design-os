// Persistent WS broker daemon (`figma-agent __broker`): binds the first free
// port in 9410-9419, advertises itself in /tmp, and relays request/reply frames
// between the connected Figma plugins and ephemeral CLI clients (pure relay —
// never interprets `cmd`). Holds a multi-plugin registry (one slot per open file,
// keyed by instanceId) so two files never evict each other; routes each command to
// the most-recently-active file (or the FIGMA_AGENT_FILE-matched one). Design: a
// persistent broker-daemon pattern (one long-lived relay process, hot-swappable
// across CLI rebuilds), adapted from southleft/figma-console-mcp's websocket-server
// pending-request correlation (347-360) / heartbeat (672-685).
import { appendFileSync, readFileSync, unlinkSync } from 'node:fs';
import WebSocket, { WebSocketServer } from 'ws';
import {
  BROKER_FILE, BROKER_IDLE_SHUTDOWN_MS, HEARTBEAT_INTERVAL_MS, PLUGIN_WAIT_MS,
  PORT_RANGE_END, PORT_RANGE_START, PROTOCOL_VERSION,
  type BrokerAdvertisement, type ErrorCode, type EventMsg, type ReplyErr, type ReplyOk, type RequestMsg,
} from '../../../shared/protocol.ts';
import { isPidAlive, readAdvertisement, selfBuildMtime, writeAdvertisement } from './broker-discovery.ts';
import {
  isChunkMsg, isEventMsg, isReplyMsg, isRequestMsg, parseWireMsg, rawToString, sendWireMsg,
} from './protocol-helpers.ts';
import { PluginRegistry, type PluginEntry } from './plugin-registry.ts';
import { buildBrokerHelloData, noPluginMessage } from './broker-status.ts';
import { resolveRouteFilter, type RouteFilter } from './route-filter.ts';
import { appendChangeFrames, changeLogPathFor, migrateStagedChanges, unboundStagingPath } from './change-log.ts';
import { appendEditFrames, editFeedPath, safeSlug } from './edit-feed-log.ts';
import { appendErrorFrame, buildErrorLogFrame, errorLogPath } from './error-log.ts';
import { readIdleMs } from './figma-sync-config.ts';
import { spawnReconcileApply } from './figma-sync-apply.ts';
import {
  fileIdentity, loadBindIndex, needsAliasPromotion, readBindMarker, recordBinding, removeBinding,
  resolveProjectDir, writeBindCache, writeBindMarker, type Binding,
} from './project-bind.ts';
import type { ComponentChange } from '../../../shared/figma-changes.ts';
import type { EditInput, EditSource } from '../../../shared/edit-feed.ts';

const LOG_FILE = '/tmp/figma-agent-broker.log';

/** Read a positive-integer env override, else fall back. Lets manual acceptance
 *  shrink the idle-shutdown / heartbeat / plugin-wait knobs to seconds. */
function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const IDLE_SHUTDOWN_MS = envMs('FIGMA_AGENT_IDLE_SHUTDOWN_MS', BROKER_IDLE_SHUTDOWN_MS);
const HEARTBEAT_MS = envMs('FIGMA_AGENT_HEARTBEAT_MS', HEARTBEAT_INTERVAL_MS);
const PLUGIN_WAIT_TIMEOUT_MS = envMs('FIGMA_AGENT_PLUGIN_WAIT_MS', PLUGIN_WAIT_MS);
// Idle check cadence scales with the (possibly shrunk) idle window so a 5s test
// override actually fires within a few seconds, not the fixed 60s of production.
const IDLE_CHECK_MS = Math.min(60_000, Math.max(500, Math.floor(IDLE_SHUTDOWN_MS / 3)));

// Commands answered instantly with E_NO_PLUGIN when no plugin is connected —
// never parked in the plugin-wait queue (a status probe must not hang 12s).
const WAIT_EXEMPT = new Set(['STATUS']);

/** Optional routing pin: only route to a plugin whose fileName matches (case-
 *  insensitive substring). Read per-call so it reflects the broker's env. */
function currentFilter(): string | null {
  const raw = process.env.FIGMA_AGENT_FILE?.trim();
  return raw ? raw : null;
}

/** A plugin advertises the guard it honours; absence means "older bundle, cannot be trusted with --file". */
function pluginSupportsFileGuard(entry: PluginEntry<WebSocket>): boolean {
  const caps = entry.scene.caps;
  return Array.isArray(caps) && caps.includes('fileGuard');
}

type TrackedWs = WebSocket & { isAlive?: boolean };

/** A request parked until a plugin (re)connects or the wait window elapses. */
interface ParkedRequest {
  id: string;
  from: WebSocket;
  rawText: string;
  deadline: number;
  filter: RouteFilter;
  // Registry-integrity fix round (finding 3): carried through to `forwardToPlugin`'s
  // ADMISSION POINT at flush time — a parked request must teach the binding exactly like
  // a direct one, not silently skip it because a plugin happened to be offline when it
  // was first sent.
  projectDir?: string;
}

interface BrokerState {
  registry: PluginRegistry<WebSocket>; // one slot per connected plugin instance
  cliClients: Set<WebSocket>;
  pending: Map<string, WebSocket>; // request id → CLI client awaiting the reply
  dispatchedTo: Map<string, WebSocket>; // request id → plugin ws (pins chunk streams to ONE plugin)
  waiting: ParkedRequest[]; // requests parked for a not-yet-connected plugin
  lastBusyAt: number;
  // Registry-integrity phase 01 (5.1): fileIdentity → Binding, filled from `bind` (durable
  // markers, loaded at startup) and from a live RequestMsg.projectDir (source: 'request').
  bindIndex: Map<string, Binding>;
  // Every project dir the broker has EVER learned a binding for — mirrors the /tmp cache
  // 1:1, kept in memory so a repeat isn't a disk write every time.
  knownProjectDirs: Set<string>;
}

function log(line: string): void {
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} [${process.pid}] ${line}\n`);
  } catch { /* logging is best-effort */ }
}

function tryBind(port: number, host: string): Promise<WebSocketServer | null> {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ host, port });
    wss.once('listening', () => resolve(wss));
    wss.once('error', () => resolve(null)); // EADDRINUSE / EAFNOSUPPORT → skip
  });
}

function sendReplyErr(ws: WebSocket, id: string, code: ErrorCode, message: string): void {
  const reply: ReplyErr = { id, ok: false, error: { code, message } };
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
  } catch { /* client already gone */ }
}

/**
 * Extract a DOC_CHANGE batch's fields and append every frame to the change log.
 * Best-effort: malformed data or an fs error is swallowed (logged) — capture must
 * never break the relay. `ts` is stamped here (broker append time), near-real-time.
 */
function appendDocChange(changesPath: string, data: Record<string, unknown>): void {
  try {
    const changes = Array.isArray(data.changes) ? (data.changes as ComponentChange[]) : [];
    if (changes.length === 0) return;
    const page = typeof data.page === 'string' ? data.page : '';
    const fileKey = typeof data.fileKey === 'string' ? data.fileKey : null;
    const written = appendChangeFrames(changesPath, changes, { page, fileKey }, Date.now());
    if (written > 0) log(`DOC_CHANGE: appended ${written} change frame(s) → ${changesPath}`);
  } catch (err) {
    log(`DOC_CHANGE append failed: ${(err as Error).message}`);
  }
}

/**
 * Owner-edit change feed (wave 4.4 P1): append the plugin's widened, actor-labelled
 * batch to its OWN per-file feed — never figma.changes.jsonl (spec A6). Best-effort,
 * same contract as appendDocChange: a log failure must never disrupt the relay. Unlike
 * the component log's single fixed path, this one is resolved PER BATCH (one file per
 * fileKey/fileName slug), so there is no startup-time equivalent of `changesPath`.
 */
function appendEditFeed(data: Record<string, unknown>): void {
  try {
    const edits = Array.isArray(data.edits) ? (data.edits as EditInput[]) : [];
    if (edits.length === 0) return;
    const fileKey = typeof data.fileKey === 'string' ? data.fileKey : null;
    const fileName = typeof data.fileName === 'string' ? data.fileName : null;
    const source: EditSource = data.source === 'gapfill' ? 'gapfill' : 'live';
    const path = editFeedPath(fileKey, fileName);
    const { written, droppedInvalid } = appendEditFrames(path, edits, { fileKey, fileName: fileName ?? '', source }, Date.now());
    // droppedInvalid is logged even at 0 alongside a non-zero write, and always when
    // itself non-zero, so a malformed batch never disappears silently (post-review fix).
    if (written > 0 || droppedInvalid > 0) {
      log(`EDIT_FEED: appended ${written} edit frame(s), dropped ${droppedInvalid} invalid → ${path}`);
    }
  } catch (err) {
    log(`EDIT_FEED append failed: ${(err as Error).message}`);
  }
}

/** Count of `appendErrorLog` failures since the broker started — logged alongside every
 *  failure (not just the latest one) so a repeatedly-failing write (e.g. a read-only
 *  design/ dir) is visible as a trend, not a single easy-to-miss line. */
let errorLogAppendFailures = 0;

/**
 * Append one relayed `ReplyErr` to the error log (backlog 4.6). Best-effort, same
 * contract as appendDocChange/appendEditFeed: a log failure must never disrupt the
 * relay. Still a pure relay — this reads the reply envelope the broker already parsed
 * (`isReplyMsg`), never `cmd`/`params` semantics; `cmd`/`activity` on the envelope are
 * values ui-relay.ts already had and chose to echo back, not something the broker
 * derives or interprets for a routing decision.
 */
function appendErrorLog(errorsPath: string, reply: ReplyErr, fallbackFileName: string | null): void {
  try {
    const frame = buildErrorLogFrame(reply, fallbackFileName, Date.now());
    appendErrorFrame(errorsPath, frame);
  } catch (err) {
    errorLogAppendFailures += 1;
    log(`ERROR_LOG append failed (${errorLogAppendFailures} total): ${(err as Error).message}`);
  }
}

export async function runBrokerDaemon(): Promise<void> {
  // Refuse to double-start when a live same-or-newer broker already advertises.
  const existing = readAdvertisement();
  if (existing && existing.pid !== process.pid && isPidAlive(existing.pid) &&
      existing.protocolV === PROTOCOL_VERSION && existing.buildMtime >= selfBuildMtime() - 1) {
    log(`another broker (pid ${existing.pid}) already live — exiting`);
    process.exit(0);
  }

  let wss: WebSocketServer | null = null;
  let port = 0;
  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END && !wss; p++) {
    wss = await tryBind(p, '127.0.0.1');
    if (wss) port = p;
  }
  if (!wss) {
    log(`no free port in ${PORT_RANGE_START}-${PORT_RANGE_END} — exiting`);
    process.exit(1);
  }
  // Also bind the IPv6 loopback on the same port: Figma's Chromium may resolve
  // `localhost` to ::1 first, which an IPv4-only listener silently refuses.
  const wss6 = await tryBind(port, '::1');
  if (!wss6) log('IPv6 loopback (::1) bind unavailable — IPv4 only');

  const startedAt = Date.now();
  // Registry-integrity phase 01: rebuild the binding index from the /tmp restart-survival
  // cache + each survivor project's own marker, then immediately rewrite the cache with
  // only the dirs that still look like projects — a stale entry is dropped, never trusted.
  const { index: bindIndex, usableDirs } = loadBindIndex();
  writeBindCache(usableDirs);
  const st: BrokerState = {
    registry: new PluginRegistry<WebSocket>(), cliClients: new Set(), pending: new Map(),
    dispatchedTo: new Map(), waiting: [], lastBusyAt: Date.now(),
    bindIndex, knownProjectDirs: new Set(usableDirs),
  };
  writeAdvertisement(port, startedAt);
  log(`broker listening on 127.0.0.1:${port}${wss6 ? ' + [::1]:' + port : ''} (${bindIndex.size} project binding(s) loaded)`);

  // Error log writer (backlog 4.6): resolved once, one line per ReplyErr the broker relays.
  const errorsPath = errorLogPath();

  // Live-sync idle-commit (spec 004 P4): the idle window sent to each plugin, and a
  // debounce so a double-click never launches two overlapping `ui figma reconcile
  // --apply` processes.
  const idleMs = readIdleMs();
  let syncInFlight = false;

  /** Send one unsolicited EventMsg to a single socket (best-effort). */
  const sendEvent = (ws: WebSocket, type: EventMsg['type'], data: Record<string, unknown>): void => {
    try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, data } satisfies EventMsg)); }
    catch { /* socket already gone */ }
  };

  // PEERS (panel IA v2): the target is RECENCY-based, so registration and disconnection
  // are not the only things that move it — a scene update or a reply landing both bump
  // `lastActiveAt` too. Broadcasting only on register/remove would leave a panel claiming
  // "command target" after the target has actually moved. De-duplicated by signature so a
  // busy command stream does not spam the socket.
  let lastPeersSig = '';
  const broadcastPeers = (): void => {
    const target = st.registry.selectTarget(currentFilter());
    const entries = st.registry.liveEntries();
    const sig = `${entries.length}|${target?.instanceId ?? ''}`;
    if (sig === lastPeersSig) return; // nothing a panel would render differently
    lastPeersSig = sig;
    for (const entry of entries) {
      sendEvent(entry.ws, 'PEERS', {
        count: entries.length,
        isActiveTarget: target?.instanceId === entry.instanceId,
      });
    }
  };

  // SYNC_REQUEST → run the deterministic kernel apply, then report SYNC_RESULT back to
  // the requesting plugin. Registry-write logic stays in `ui` (Art I) — the broker only
  // spawns it. Debounced: a click mid-apply is ignored (the panel just waits).
  //
  // Registry-integrity phase 01 (5.1), §3: the project comes from the FILE that triggered
  // this sync (this plugin's own scene), never the broker's spawn cwd. Unbound → refuse
  // loudly instead of guessing — applying into the wrong project silently corrupts a
  // registry, which is worse than not applying at all. The feed keeps accruing either way.
  const handleSyncRequest = (ws: WebSocket): void => {
    if (syncInFlight) { sendEvent(ws, 'SYNC_RESULT', { ok: false, summary: 'a sync is already running' }); return; }
    const scene = st.registry.getByWs(ws)?.scene;
    const fileName = (scene?.fileName as string | undefined) ?? null;
    const fileKey = (scene?.fileKey as string | null | undefined) ?? null;
    const bound = resolveProjectDir(fileIdentity(fileKey, fileName), st.bindIndex);
    if (bound === null) {
      const label = fileName ?? '(unnamed file)';
      const summary = `No project bound for "${label}" — run: figma-agent bind --file "${label}" --dir <project>`;
      log(`SYNC_REQUEST refused — unbound: ${label}`);
      // Fix round (finding 2): a stable `code` (E_UNBOUND), not an ad-hoc boolean — one
      // canonical signal the panel's state machine (and any future consumer) matches on.
      sendEvent(ws, 'SYNC_RESULT', { ok: false, code: 'E_UNBOUND', fileName: label, summary });
      return;
    }
    syncInFlight = true;
    log(`SYNC_REQUEST → spawning: ui figma reconcile --apply --dir ${bound}`);
    spawnReconcileApply(bound, (r) => {
      syncInFlight = false;
      log(`SYNC_RESULT ok=${r.ok} — ${r.summary}`);
      sendEvent(ws, 'SYNC_RESULT', { ...r });
    });
  };

  const shutdown = (code: number, reason: string): never => {
    log(`shutdown (${reason})`);
    try {
      // Only remove the advertisement if it is still ours (a newer broker may own it).
      const ad = JSON.parse(readFileSync(BROKER_FILE, 'utf8')) as BrokerAdvertisement;
      if (ad.pid === process.pid) unlinkSync(BROKER_FILE);
    } catch { /* already gone */ }
    try { wss?.close(); } catch { /* ignore */ }
    try { wss6?.close(); } catch { /* ignore */ }
    process.exit(code);
  };

  const broadcastToClients = (text: string): void => {
    for (const client of st.cliClients) {
      try { if (client.readyState === WebSocket.OPEN) client.send(text); }
      catch { /* skip dead client */ }
    }
  };

  // Registry-integrity phase 01 (5.1), §2: "bind must index both aliases." A bind made
  // while the named file was NOT connected records the slug alone (`pendingKey: true`);
  // the first FILE_INFO whose scene matches that slug fills in the real fileKey — both in
  // the live index (so lookup-by-key starts working immediately) and in the project's own
  // durable marker (so a restart doesn't lose the promotion). No-op when nothing is pending.
  //
  // Fix round (finding 4, part 1 — alias asymmetry): the guard used to bail whenever
  // `fileKey` had ANY entry, including a weaker `source: 'request'` alias left over from
  // an earlier unbound interaction with this same file. An explicit bind must ALWAYS win
  // over that — "explicit > implicit, always" — so the only reason to skip is that this
  // EXACT promotion (same projectDir, source:'bind') already happened.
  const promotePendingBind = (ws: WebSocket): void => {
    const scene = st.registry.getByWs(ws)?.scene;
    const fileName = scene?.fileName as string | undefined;
    const fileKey = scene?.fileKey as string | null | undefined;
    if (!fileName || !fileKey) return;
    const slug = fileIdentity(null, fileName);
    const existing = st.bindIndex.get(slug);
    if (!existing || existing.source !== 'bind') return; // only promote an EXPLICIT bind's slug
    const target: Binding = { projectDir: existing.projectDir, source: 'bind', at: existing.at };
    if (!needsAliasPromotion(st.bindIndex.get(fileKey), target)) return; // already promoted, no-op
    recordBinding(st.bindIndex, fileKey, target);
    const marker = readBindMarker(existing.projectDir);
    const entry = marker?.bindings.find((b) => b.fileNameSlug === slug);
    if (marker && entry && (entry.fileKey !== fileKey || entry.pendingKey === true)) {
      entry.fileKey = fileKey;
      delete entry.pendingKey;
      writeBindMarker(existing.projectDir, marker);
      log(`BIND promoted: "${fileName}" → ${existing.projectDir} (fileKey learned)`);
    }
  };

  // Registry-integrity phase 01 (5.1), §2: a RequestMsg carrying `projectDir` teaches the
  // broker fileIdentity → projectDir, but ONLY from the ROUTED plugin's own scene — never
  // from the request's `expectedFile` guess (the risk register's exact mitigation: a
  // request must never record a binding for the wrong file just because the broker routed
  // elsewhere). `source: 'request'` so an explicit `bind` always outranks it.
  const recordRequestBinding = (targetWs: WebSocket, projectDir?: string): void => {
    if (!projectDir) return;
    const scene = st.registry.getByWs(targetWs)?.scene;
    if (!scene) return;
    const identity = fileIdentity(
      (scene.fileKey as string | null | undefined) ?? null,
      (scene.fileName as string | undefined) ?? null,
    );
    recordBinding(st.bindIndex, identity, { projectDir, source: 'request', at: Date.now() });
    if (!st.knownProjectDirs.has(projectDir)) {
      st.knownProjectDirs.add(projectDir);
      writeBindCache([...st.knownProjectDirs]);
    }
  };

  // `figma-agent bind` (registry-integrity phase 01, fix round) — BROKER-LOCAL, never
  // forwarded to a plugin (no file's Figma tab is involved), intercepted in `isRequestMsg`
  // before `forwardToPlugin`. Answers directly with a ReplyOk carrying fileKey/pendingKey/
  // migratedCount — the ORIGINAL fire-and-forget BIND event could never report any of
  // that back to the CLI, which is the bug this conversion fixes.
  const handleProjectBind = (ws: WebSocket, msg: RequestMsg): void => {
    const params = msg.params as
      { fileName?: unknown; projectDir?: unknown; unbind?: unknown; removedFileKeys?: unknown } | null;
    const fileName = typeof params?.fileName === 'string' ? params.fileName : null;
    const projectDir = typeof params?.projectDir === 'string' ? params.projectDir : null;
    if (!fileName || !projectDir) {
      sendReplyErr(ws, msg.id, 'E_INVALID_ARGS', 'PROJECT_BIND needs fileName and projectDir');
      return;
    }
    const slug = fileIdentity(null, fileName);
    const reply = (result: Record<string, unknown>): void => {
      sendWireMsg(ws, { id: msg.id, ok: true, result } satisfies ReplyOk);
    };

    if (params?.unbind === true) {
      // Fix round (finding 4, part 2 — alias asymmetry): walk by the binding's OWN
      // identity, not just the one key (`slug`) the caller passed. `bind.ts` reads the
      // marker BEFORE rewriting it and tells us every fileKey that entry carried, so a
      // stale fileKey alias can never survive an unbind just because the caller only
      // addressed the file by name.
      const removedFileKeys = Array.isArray(params.removedFileKeys)
        ? params.removedFileKeys.filter((k): k is string => typeof k === 'string')
        : [];
      removeBinding(st.bindIndex, [slug, ...removedFileKeys]);
      log(`BIND removed: "${fileName}" (${projectDir})${removedFileKeys.length > 0 ? ` [+${removedFileKeys.length} alias(es)]` : ''}`);
      reply({ fileName, projectDir, removed: true });
      return;
    }

    const at = Date.now();
    recordBinding(st.bindIndex, slug, { projectDir, source: 'bind', at });
    const hit = st.registry.matching(fileName, { exact: true })[0];
    const fileKey = (hit?.scene.fileKey as string | null | undefined) ?? null;
    if (fileKey) recordBinding(st.bindIndex, fileKey, { projectDir, source: 'bind', at });
    if (!st.knownProjectDirs.has(projectDir)) {
      st.knownProjectDirs.add(projectDir);
      writeBindCache([...st.knownProjectDirs]);
    }
    // Fix round (finding 1 — BLOCKER): migrate whatever staged while this file was
    // unbound into the now-bound component log, exactly once — `migrateStagedChanges` is
    // idempotent, so a re-bind of an already-migrated file finds nothing left staged.
    const migratedCount = migrateStagedChanges(unboundStagingPath(slug), changeLogPathFor(projectDir));
    log(`BIND recorded: "${fileName}" → ${projectDir}${fileKey ? ` (fileKey ${fileKey})` : ' (pending fileKey)'}${migratedCount > 0 ? `, migrated ${migratedCount} staged frame(s)` : ''}`);
    reply({ fileName, projectDir, fileKey, pendingKey: fileKey === null, migratedCount });
  };

  const forwardToPlugin = (
    from: WebSocket, id: string, rawText: string, cmd?: string, expectedFile?: string, projectDir?: string,
  ): void => {
    const filter = resolveRouteFilter(expectedFile, currentFilter());
    // Pin a multi-chunk request to the plugin its first frame went to: selecting
    // "most-recent" per chunk could split one payload across two files.
    let targetWs = st.dispatchedTo.get(id);
    if (targetWs && targetWs.readyState !== WebSocket.OPEN) targetWs = undefined;
    let target: PluginEntry<WebSocket> | null = null;
    if (!targetWs) {
      const hits = st.registry.matching(filter.value, { exact: filter.exact });
      // An explicit --file that matches two open files is AMBIGUOUS: same-named files are
      // indistinguishable here (fileKey is null for a non-org plugin), and guessing by recency
      // is how a command lands in the file the caller did not name.
      if (filter.source === 'flag' && hits.length > 1) {
        const ids = hits.map((e) => `${e.scene.fileName ?? '(unnamed)'}#${e.instanceId}`).join(', ');
        sendReplyErr(from, id, 'E_INVALID_ARGS',
          `--file "${filter.value}" matches ${hits.length} connected files [${ids}] — close one panel, or rename the files apart`);
        return;
      }
      target = hits[0] ?? null;
      targetWs = target?.ws;
      // A plugin that predates the guard would ignore expectedFile and run anyway; refuse BEFORE
      // forwarding rather than discovering it from a reply that has already mutated a file.
      if (filter.source === 'flag' && target && !pluginSupportsFileGuard(target)) {
        sendReplyErr(from, id, 'E_PLUGIN_STALE',
          `the plugin open in "${target.scene.fileName ?? '?'}" predates --file support — rebuild (npm run build) and reopen the panel`);
        return;
      }
    }

    if (!targetWs) {
      // No (matching) plugin. Park the request (bounded) so a just-respawned broker
      // gives the plugin's reconnect loop time to land — unless the command is exempt
      // (STATUS) or waiting is disabled. With a filter set, park until a MATCHING
      // plugin appears (same wait window). Fixes the respawn↔reconnect race AND lets
      // a pinned file connect after the command was issued.
      const parkable = !(cmd && WAIT_EXEMPT.has(cmd)) && PLUGIN_WAIT_TIMEOUT_MS > 0;
      if (!parkable) {
        sendReplyErr(from, id, 'E_NO_PLUGIN', noPluginMessage(st.registry, filter));
        return;
      }
      st.waiting.push({ id, from, rawText, deadline: Date.now() + PLUGIN_WAIT_TIMEOUT_MS, filter, projectDir });
      log(`parked ${id}${cmd ? ` (${cmd})` : ''}${filter.value ? ` [${filter.source}="${filter.value}"]` : ''} — awaiting ${filter.value ? 'matching ' : ''}plugin (${st.waiting.length} queued)`);
      return;
    }
    recordRequestBinding(targetWs, projectDir);
    st.pending.set(id, from);
    st.dispatchedTo.set(id, targetWs);
    try { targetWs.send(rawText); }
    catch (err) {
      st.pending.delete(id);
      st.dispatchedTo.delete(id);
      sendReplyErr(from, id, 'E_PLUGIN_ERROR', `relay to plugin failed: ${(err as Error).message}`);
    }
  };

  // A plugin (re)registered → try to flush parked requests. Only forward a request
  // once a target exists (matching the filter, if any); otherwise re-park it with
  // its ORIGINAL deadline so a non-matching HELLO never extends the wait window.
  const flushWaiting = (): void => {
    if (st.waiting.length === 0) return;
    const queued = st.waiting;
    st.waiting = [];
    let delivered = 0;
    for (const req of queued) {
      if (req.from.readyState !== WebSocket.OPEN) continue; // CLI gone — drop silently
      if (st.registry.selectTarget(req.filter.value, { exact: req.filter.exact })) {
        forwardToPlugin(
          req.from, req.id, req.rawText, undefined,
          req.filter.source === 'flag' ? req.filter.value ?? undefined : undefined,
          req.projectDir,
        );
        delivered++;
      } else {
        st.waiting.push(req); // still no matching plugin — keep parked, deadline intact
      }
    }
    if (delivered > 0) log(`flushed ${delivered} parked request(s)`);
  };

  const routeFromPlugin = (id: string, rawText: string, final: boolean): void => {
    const client = st.pending.get(id);
    if (!client) return;
    try { if (client.readyState === WebSocket.OPEN) client.send(rawText); }
    catch { /* requester vanished */ }
    if (final) { st.pending.delete(id); st.dispatchedTo.delete(id); }
  };

  const handleClose = (ws: WebSocket): void => {
    // Fail only the in-flight requests routed to THIS socket (a plugin, or a
    // superseded orphan) — other plugins' requests are untouched.
    for (const [id, target] of st.dispatchedTo) {
      if (target !== ws) continue;
      const client = st.pending.get(id);
      if (client) sendReplyErr(client, id, 'E_NO_PLUGIN', 'Figma plugin disconnected mid-request');
      st.pending.delete(id);
      st.dispatchedTo.delete(id);
    }
    const removedId = st.registry.removeByWs(ws);
    if (removedId !== null) {
      const remaining = st.registry.size();
      log(`plugin [${removedId}] disconnected (${remaining} still connected)`);
      // Only announce PLUGIN_GONE when the LAST plugin leaves — a CLI waiting on a
      // still-connected file must not be told the bridge is gone.
      if (remaining === 0) broadcastToClients(JSON.stringify({ type: 'PLUGIN_GONE', data: {} } satisfies EventMsg));
      broadcastPeers(); // a surviving panel's peer count/target may have just changed (no-op if none left)
      return;
    }
    // A CLI client.
    st.cliClients.delete(ws);
    for (const [id, client] of st.pending) if (client === ws) { st.pending.delete(id); st.dispatchedTo.delete(id); }
    st.waiting = st.waiting.filter((req) => req.from !== ws); // drop its parked requests
  };

  const handleMessage = (ws: WebSocket, text: string): void => {
    const msg = parseWireMsg(text);
    if (!msg) return;
    // Hidden control frame from a newer CLI build replacing this broker.
    if ((msg as { type?: string }).type === 'BROKER_SHUTDOWN_REQUEST') shutdown(0, 'BROKER_SHUTDOWN_REQUEST');
    const isPlugin = st.registry.touch(ws); // any plugin frame = LIVENESS (heartbeat cull)
    if (isChunkMsg(msg)) {
      // Pass-through both ways — the broker never reassembles chunks. KNOWN LIMIT: a
      // request larger than CHUNK_LIMIT (IMPORT_PAYLOAD, big HTML_TO_FIGMA) arrives here
      // as ChunkMsg frames, which carry no `expectedFile` — those route by env pin /
      // most-recent as today. The plugin-side guard still fires after ui-relay
      // reassembles and forwards `expectedFile` to main, so the worst case is
      // E_WRONG_FILE instead of correct routing, never a silent wrong-file mutation.
      //
      // Registry-integrity fix round (finding 3, scoped decision — flagged, not silently
      // dropped): the SAME structural gap means a chunked request's `projectDir` is
      // equally unavailable here — `id,cmd,params,v` serialize BEFORE `projectDir` in
      // `makeRequestFrame`, and `params` (the huge payload) dominates the string, so the
      // field can land in ANY chunk, not reliably the first. Recovering it would mean the
      // broker reassembling chunks, which this design deliberately does not do. A chunked
      // request's binding is not recorded; the very next non-chunked request from the same
      // CLI on the same file (nearly always seconds later) still teaches it normally via
      // the direct-request path below.
      if (isPlugin) { st.registry.touchActive(ws); routeFromPlugin(msg.id, text, msg.last); }
      else forwardToPlugin(ws, msg.id, text);
    } else if (isReplyMsg(msg)) {
      if (isPlugin) {
        st.registry.touchActive(ws);
        broadcastPeers();
        routeFromPlugin(msg.id, text, true);
        // Error log writer (backlog 4.6): every FAILED reply the broker relays, logged
        // regardless of whether a CLI is still around to read it live.
        if (!msg.ok) {
          const fallbackFileName = (st.registry.getByWs(ws)?.scene.fileName as string | undefined) ?? null;
          appendErrorLog(errorsPath, msg, fallbackFileName);
        }
      }
    } else if (isRequestMsg(msg)) {
      if (msg.cmd === 'PROJECT_BIND') handleProjectBind(ws, msg);
      else forwardToPlugin(ws, msg.id, text, msg.cmd, msg.expectedFile, msg.projectDir);
    } else if (isEventMsg(msg)) {
      if (msg.type === 'PLUGIN_HELLO') {
        // Multi-plugin: register this instance in its OWN slot — never evict another
        // file's plugin (the connect/disconnect flapping bug). A same-instance
        // reconnect supersedes its own stale socket, which we close here.
        st.cliClients.delete(ws);
        const { instanceId, replaced, superseded } = st.registry.register(ws, msg.data);
        if (superseded) { try { superseded.close(); } catch { /* already gone */ } }
        st.lastBusyAt = Date.now();
        log(`plugin registered [${instanceId}]${replaced ? ' (replaced — same instance re-hello)' : ''}: ${JSON.stringify(msg.data)}`);
        // Live-sync (spec 004 P4): hand this plugin the idle window so its debounce
        // timer matches the project's design/figma-sync.json.
        sendEvent(ws, 'SYNC_CONFIG', { idleMs });
        flushWaiting(); // deliver any requests parked during the reconnect gap
        broadcastPeers();
      } else if (msg.type === 'PING') {
        // App-level heartbeat from the plugin — answer so it knows the socket lives.
        if (isPlugin) {
          try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PONG', data: { t: Date.now() } } satisfies EventMsg)); }
          catch { /* plugin vanished */ }
        }
      } else if (msg.type === 'FILE_INFO') {
        // page change → refresh scene + fan out; the scene update can also move the
        // routing target (recency-based), so peers must be told too.
        if (isPlugin) {
          st.registry.updateScene(ws, msg.data);
          broadcastToClients(text);
          broadcastPeers();
          promotePendingBind(ws); // registry-integrity phase 01 §2 — fill a pending fileKey on first sight
        }
      } else if (msg.type === 'DOC_CHANGE') {
        // Live-sync capture: append the plugin's coalesced batch to the change log.
        // Broker-side append (not CLI) because the broker is the long-lived process —
        // it catches edits even when no CLI command is running. Best-effort: a log
        // write failure must never disrupt the relay.
        //
        // Fix round (finding 1 — BLOCKER): an unbound batch used to fall into the
        // broker's own cwd-derived change log, which the bound project's reconcile
        // NEVER reads — that history was stranded forever the moment a bind eventually
        // happened. It stages instead (never a project's design/) and `handleProjectBind`
        // migrates it in, once, the moment this identity gets bound.
        if (isPlugin) {
          const scene = st.registry.getByWs(ws)?.scene;
          const data = msg.data as Record<string, unknown>;
          const fileName = (scene?.fileName as string | undefined) ?? null;
          const identity = fileIdentity(typeof data.fileKey === 'string' ? data.fileKey : null, fileName);
          const bound = resolveProjectDir(identity, st.bindIndex);
          if (bound) {
            appendDocChange(changeLogPathFor(bound), data);
          } else {
            // Staged by NAME slug specifically (not the fileKey-preferring `identity`
            // above) — a file that connects mid-way through its unbound life must not
            // split its staged history across two paths; `handleProjectBind` migrates
            // by this exact same slug.
            appendDocChange(unboundStagingPath(safeSlug(fileName ?? '')), data);
          }
        }
      } else if (msg.type === 'EDIT_FEED') {
        // Owner-edit change feed (wave 4.4 P1): same broker-side, best-effort append,
        // to its own per-file feed — see appendEditFeed.
        if (isPlugin) appendEditFeed(msg.data);
      } else if (msg.type === 'SYNC_REQUEST') {
        // Live-sync commit (spec 004 P4): the panel's "Sync now" click → run the
        // deterministic kernel apply and report the result back to this plugin.
        if (isPlugin) handleSyncRequest(ws);
      } else if (isPlugin) {
        broadcastToClients(text); // other plugin events fan out to CLI clients
      }
    }
  };

  // Single source for the greeting + `figma-agent status` broker block. Carries
  // the full plugins[] list + activePlugin AND a legacy single-plugin mirror
  // (pluginConnected/state/lastHeartbeatAge/pluginInfo of the ACTIVE plugin) so
  // the CLI reports connection health — and older consumers keep working — with
  // no plugin round-trip. See broker-status.ts for the compat-shim rationale.
  const brokerHello = (): EventMsg => ({
    type: 'BROKER_HELLO',
    data: buildBrokerHelloData(
      st.registry,
      { port, pid: process.pid, protocolV: PROTOCOL_VERSION, buildMtime: selfBuildMtime(), uptimeMs: Date.now() - startedAt },
      currentFilter(),
    ),
  });

  const onConnection = (ws: WebSocket, req: import('node:http').IncomingMessage): void => {
    const tracked = ws as TrackedWs;
    tracked.isAlive = true;
    st.cliClients.add(ws); // provisional; promoted to plugin on PLUGIN_HELLO
    st.lastBusyAt = Date.now();
    log(`connection from ${req.socket.remoteAddress ?? '?'} (clients: ${st.cliClients.size})`);
    ws.on('pong', () => { tracked.isAlive = true; st.registry.touch(ws); }); // pong from a plugin bumps its liveness
    ws.on('error', (err) => log(`ws error: ${err.message}`));
    ws.on('message', (raw) => {
      try { handleMessage(ws, rawToString(raw)); }
      catch (err) { log(`handleMessage failed: ${(err as Error).message}`); }
    });
    ws.on('close', () => handleClose(ws));
    try { ws.send(JSON.stringify(brokerHello())); } catch { /* ignore */ }
  };
  wss.on('connection', onConnection);
  wss6?.on('connection', onConnection);

  // Heartbeat: WS-ping on the heartbeat cadence; drop sockets that missed the
  // previous pong (broker→client liveness; browsers auto-pong at the WS layer).
  setInterval(() => {
    const allClients = [...wss!.clients, ...(wss6 ? wss6.clients : [])];
    for (const ws of allClients) {
      const tracked = ws as TrackedWs;
      if (tracked.isAlive === false) { log('terminating unresponsive client (missed pong)'); tracked.terminate(); continue; }
      tracked.isAlive = false;
      tracked.ping();
    }
  }, HEARTBEAT_MS);

  // Sweep parked requests: fail any that outlived their plugin-wait window, and
  // drop those whose CLI already hung up. Runs at ~4Hz relative to the window.
  setInterval(() => {
    if (st.waiting.length === 0) return;
    const now = Date.now();
    const survivors: ParkedRequest[] = [];
    for (const req of st.waiting) {
      if (req.from.readyState !== WebSocket.OPEN) continue; // CLI gone — drop silently
      if (now >= req.deadline) {
        // The request's OWN filter, not the env pin — otherwise a timed-out --file
        // request blames FIGMA_AGENT_FILE (or prints the generic message) instead of
        // naming the flag the caller actually used.
        sendReplyErr(req.from, req.id, 'E_NO_PLUGIN', noPluginMessage(st.registry, req.filter));
      } else {
        survivors.push(req);
      }
    }
    st.waiting = survivors;
  }, Math.min(500, Math.max(100, Math.floor(PLUGIN_WAIT_TIMEOUT_MS / 8))));

  // Advertisement refresh (fixed 30s); yield if a different live broker took over.
  setInterval(() => {
    const ad = readAdvertisement();
    if (ad && ad.pid !== process.pid && isPidAlive(ad.pid)) shutdown(0, `replaced by broker pid ${ad.pid}`);
    writeAdvertisement(port, startedAt);
  }, HEARTBEAT_INTERVAL_MS);

  // Idle shutdown: no plugin AND no CLI clients for the idle window (env-overridable).
  setInterval(() => {
    if (st.registry.size() > 0 || st.cliClients.size > 0) st.lastBusyAt = Date.now();
    else if (Date.now() - st.lastBusyAt > IDLE_SHUTDOWN_MS) shutdown(0, `idle for ${IDLE_SHUTDOWN_MS}ms`);
  }, IDLE_CHECK_MS);

  process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
  process.on('SIGINT', () => shutdown(0, 'SIGINT'));
  process.on('uncaughtException', (err) => log(`uncaughtException: ${err.stack ?? err.message}`));
}
