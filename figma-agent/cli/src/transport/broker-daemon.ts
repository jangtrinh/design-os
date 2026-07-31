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
  BROKER_FILE, BROKER_IDLE_SHUTDOWN_MS, EXEC_JS_MAX_TIMEOUT_MS, HEARTBEAT_INTERVAL_MS, PLUGIN_WAIT_MS,
  PORT_RANGE_END, PORT_RANGE_START, PROTOCOL_VERSION,
  type BrokerAdvertisement, type ErrorCode, type EventMsg, type JobInfo, type ReplyErr, type ReplyOk, type RequestMsg,
  type WireMsg,
} from '../../../shared/protocol.ts';
import { isPidAlive, readAdvertisement, selfBuildMtime, writeAdvertisement } from './broker-discovery.ts';
import {
  ChunkAssembler, deleteConnectionChunk, getConnectionChunks, isChunkMsg, isEventMsg, isReplyMsg, isRequestMsg,
  parseWireMsg, rawToString, sendWireMsg, sweepAbandonedChunks, type ChunkBuffers,
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
import {
  JobTable, isFinishedState, toJobInfo, type JobRecord,
} from './job-table.ts';
import {
  completeSkippingStale, emptyQueue, enqueue as enqueueJob, queuePosition, remove as removeFromQueue,
  type QueueState,
} from './file-queue.ts';
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

// Concurrency & jobs (backlog 1.1+2.6+4.3) — commands implicitly read-only for QUEUEING
// purposes even without an explicit `readOnly` flag on the envelope. A DIFFERENT axis
// from mutating-commands.ts's undo-commit classification: AUDIT_DS is classified
// MUTATING here (deliberately absent from this set) even though it seals no undo step —
// it calls `setCurrentPageAsync` for every page without restoring the original
// (executor-audit.ts), and `figma.currentPage` is shared view state a concurrent
// mutating script reads implicitly. `EXEC_JS` is mutating by default; every read
// implemented through it (scan-node, scan-conventions) must declare `readOnly: true`
// itself — it is never inferred from `cmd` alone.
const IMPLICIT_READ_ONLY = new Set(['STATUS', 'GET_SELECTION', 'EXPORT_PNG', 'SCAN_DESIGN_SYSTEM', 'GET_CORRECTION_MEMORY']);

// A running job with no reply within this window is marked failed(E_TIMEOUT) FOR
// REPORTING ONLY — the file's mutation slot stays blocked (the script may still be
// running; the sandbox cannot interrupt a live `eval`, so advancing would deliberately
// recreate the interleaving this whole wave exists to prevent). Margin above the
// hardest real timeout so the watchdog never fires before a legitimate long EXEC_JS
// would have anyway. Env-overridable (same `envMs` knob pattern as the other three
// above) — closing round's daemon harness shrinks this to observe a real watchdog fire
// in a test's own bounded seconds, never a 125s real sleep.
const WATCHDOG_MARGIN_MS = 5_000;
const WATCHDOG_TIMEOUT_MS = envMs('FIGMA_AGENT_WATCHDOG_MS', EXEC_JS_MAX_TIMEOUT_MS + WATCHDOG_MARGIN_MS);

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
  // Registry-integrity fix round (finding 3): carried through to `admitRequest`'s
  // ADMISSION POINT at flush time — a parked request must teach the binding exactly like
  // a direct one, not silently skip it because a plugin happened to be offline when it
  // was first sent.
  projectDir?: string;
  // Concurrency & jobs (backlog 1.1+2.6+4.3) — a parked request re-enters `admitRequest`
  // at flush time (stage-4 ruling: parking must not exempt the highest-risk interleaving
  // window from the queue), so it needs the SAME classification inputs a fresh request
  // carries. Read at park time (from the envelope), never re-derived by re-parsing
  // `rawText` at flush.
  cmd?: string;
  readOnly?: boolean;
  activity?: string;
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
  // Concurrency & jobs (backlog 1.1+2.6+4.3) — the job table (outlives the CLI socket)
  // and one per-file FIFO mutation queue, keyed by the SAME file-slug identity chain the
  // routing + registry waves already established (fileIdentity → slugged fileName →
  // 'unknown').
  jobs: JobTable;
  queues: Map<string, QueueState>;
  // Buffered chunk frames for a CLI-originated request not yet fully admitted — keyed by
  // CONNECTION first, then by wire request id (stage-4 fix round, minor 6): request ids
  // (`c_<counter>_<ts>`) are unique only WITHIN one CLI process, so two simultaneous CLI
  // processes could mint the same id — a flat `Map<string, ...>` would let their frames
  // merge into one garbled reassembly. Concurrency & jobs §4: a request whose `cmd`/
  // `readOnly` live inside the not-yet-reassembled JSON must not be labelled with a
  // synthetic pseudo-command; it is buffered until `last`, then reassembled and admitted
  // with its REAL envelope. `lastFrameAt` is the abandoned-entry bound (stage-4 fold,
  // phase 02): a CLI that dies mid-send (before `last` arrives) must not leak its buffered
  // frames forever — the park sweeper drops an entry whose last frame is older than one
  // sweep period, reusing the SAME interval rather than a new timer.
  pendingChunks: ChunkBuffers<WebSocket>;
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

/**
 * Concurrency & jobs — `ok` lives on the reply ENVELOPE. For a single frame, read it
 * directly; for a chunked reply, reassemble with the SAME `ChunkAssembler` used
 * elsewhere purely to read `ok` — still envelope-level, still never `params`. Used to
 * classify a finished job as `done` vs `failed` without re-deriving anything the reply
 * did not already carry. Malformed/unreadable frames classify as NOT ok (never silently
 * "succeeded").
 */
function replyOk(frames: readonly string[]): boolean {
  if (frames.length === 0) return false;
  if (frames.length === 1) {
    try {
      return (JSON.parse(frames[0]!) as { ok?: unknown }).ok === true;
    } catch {
      return false;
    }
  }
  try {
    const assembler = new ChunkAssembler();
    let complete: unknown;
    for (const frame of frames) {
      const parsed = parseWireMsg(frame);
      if (!parsed || !isChunkMsg(parsed)) return false;
      const done = assembler.accept(parsed);
      if (done) complete = done;
    }
    return complete !== undefined && typeof complete === 'object' && complete !== null &&
      (complete as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}

function sendReplyErr(ws: WebSocket, id: string, code: ErrorCode, message: string): void {
  const reply: ReplyErr = { id, ok: false, error: { code, message } };
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
  } catch { /* client already gone */ }
}

/** `sendReplyErr`'s success twin — did not exist before concurrency & jobs (backlog
 *  1.1+2.6+4.3); the `JOB` command is the first broker-terminal request that needs to
 *  answer OK directly (PROJECT_BIND rolled its own `sendWireMsg` call inline). */
function sendReplyOk(ws: WebSocket, id: string, result: unknown): void {
  const reply: ReplyOk = { id, ok: true, result };
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
    // Registry-integrity phase 03, §1: carried through so a Figma-Free file (fileKey
    // null) still has a second rung on the identity chain instead of collapsing to
    // 'unknown'. Optional — an older plugin bundle omitting it degrades to today's shape.
    const fileName = typeof data.fileName === 'string' ? data.fileName : undefined;
    const written = appendChangeFrames(changesPath, changes, { page, fileKey, fileName }, Date.now());
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

/**
 * Closing round (daemon harness ruling) — every field defaults to today's real behaviour
 * (the shared /tmp advertisement file, the real 9410-9419 port range, `process.exit`).
 * The ONLY caller that ever overrides these is the in-process daemon harness
 * (tests/broker-daemon-harness.test.ts): a tmpdir advertisement path, `ports: [0]` (an
 * OS-assigned ephemeral bind, so a test broker never fights over — or clobbers — a real
 * one), and an `exit` stub that throws a sentinel instead of killing the test runner.
 * Production callers (figma-agent.ts's `__broker` entry) pass no options at all.
 */
export interface BrokerDaemonOptions {
  advertisePath?: string;
  ports?: readonly number[];
  exit?: (code: number) => never;
}

function defaultPortRange(): number[] {
  const out: number[] = [];
  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) out.push(p);
  return out;
}

export async function runBrokerDaemon(options?: BrokerDaemonOptions): Promise<void> {
  const advertisePath = options?.advertisePath ?? BROKER_FILE;
  const ports = options?.ports ?? defaultPortRange();
  const exit: (code: number) => never = options?.exit ?? ((code: number): never => process.exit(code));

  // Refuse to double-start when a live same-or-newer broker already advertises.
  const existing = readAdvertisement(advertisePath);
  if (existing && existing.pid !== process.pid && isPidAlive(existing.pid) &&
      existing.protocolV === PROTOCOL_VERSION && existing.buildMtime >= selfBuildMtime() - 1) {
    log(`another broker (pid ${existing.pid}) already live — exiting`);
    exit(0);
  }

  let wss: WebSocketServer | null = null;
  let port = 0;
  for (const p of ports) {
    if (wss) break;
    const bound = await tryBind(p, '127.0.0.1');
    if (bound) {
      wss = bound;
      // `.address()` gives back the REAL bound port even for an ephemeral (0) request —
      // `p` itself would stay 0 and every downstream connect/advertise would be wrong.
      const addr = bound.address();
      port = typeof addr === 'object' && addr !== null ? addr.port : p;
    }
  }
  if (!wss) {
    log(`no free port in ${ports.join(',')} — exiting`);
    exit(1);
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
    jobs: new JobTable(), queues: new Map(), pendingChunks: new Map(),
  };
  writeAdvertisement(port, startedAt, advertisePath);
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
    const slug = fileIdentity(fileKey, fileName);
    const bound = resolveProjectDir(slug, st.bindIndex);
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
    log(`SYNC_REQUEST → spawning: ui figma reconcile --apply --file-slug ${slug} --dir ${bound}`);
    // Registry-integrity phase 03 (5.2), §2 — `slug` narrows the kernel calls to THIS
    // file's own targets in a change-log the project may share with another file; `fileName`
    // (nullable → undefined) pins the live scan back to the SAME plugin instance.
    spawnReconcileApply(bound, slug, fileName ?? undefined, (r) => {
      syncInFlight = false;
      log(`SYNC_RESULT ok=${r.ok} — ${r.summary}`);
      sendEvent(ws, 'SYNC_RESULT', { ...r });
    });
  };

  const shutdown = (code: number, reason: string): never => {
    log(`shutdown (${reason})`);
    try {
      // Only remove the advertisement if it is still ours (a newer broker may own it).
      const ad = JSON.parse(readFileSync(advertisePath, 'utf8')) as BrokerAdvertisement;
      if (ad.pid === process.pid) unlinkSync(advertisePath);
    } catch { /* already gone */ }
    try { wss?.close(); } catch { /* ignore */ }
    try { wss6?.close(); } catch { /* ignore */ }
    exit(code);
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

  const errReplyFrame = (id: string, code: ErrorCode, message: string): string =>
    JSON.stringify({ id, ok: false, error: { code, message } } satisfies ReplyErr);

  /** Send every held frame, in order, to the resolved target — one call for a normal
   *  request, N in sequence for a chunked one (the frames are already the full, ordered
   *  wire payload; the broker never reassembles or re-derives them). */
  const sendFrames = (ws: WebSocket, frames: readonly string[]): void => {
    for (const frame of frames) ws.send(frame);
  };

  const dispatchJob = (job: JobRecord, targetWs: WebSocket): void => {
    try {
      sendFrames(targetWs, job.requestFrames);
    } catch (err) {
      const msg = `relay to plugin failed: ${(err as Error).message}`;
      st.jobs.finish(job.jobId, false, [errReplyFrame(job.requestId, 'E_PLUGIN_ERROR', msg)]);
      if (job.from && job.from.readyState === WebSocket.OPEN) sendReplyErr(job.from, job.requestId, 'E_PLUGIN_ERROR', msg);
      st.pending.delete(job.requestId);
      st.dispatchedTo.delete(job.requestId);
      advanceQueue(job);
    }
  };

  /**
   * A job finished (or was dequeued and immediately failed) — pop the next mutating job
   * queued behind it on the SAME file, if any, and dispatch it. `JobRecord.targetInstanceId`
   * is PINNED and never re-resolved by filter/recency at dequeue: a queued mutation must
   * land in the file it was admitted for, never whichever file became most-recent while it
   * waited (risk register: a queued job cannot be re-routed at dequeue). A vanished pinned
   * target FAILS the job instead — recursing to keep draining the queue.
   *
   * Stage-4 fix round (BLOCKER 1) — `completeSkippingStale` (not plain `complete`) so a
   * popped entry already resolved by some OTHER path (cancelled via `job --cancel`,
   * already failed while queued via `handleClose`) is never resurrected: `markRunning` +
   * dispatching a job the caller was told would not run was the exact bug. Defense in
   * depth alongside the explicit dequeue those two paths now also do — this guard is what
   * catches anything that resolves a queued job's state WITHOUT remembering to also call
   * `removeFromQueue`.
   */
  const advanceQueue = (finishedJob: JobRecord): void => {
    const q = st.queues.get(finishedJob.fileSlug) ?? emptyQueue();
    const isStillQueued = (id: string): boolean => {
      const rec = st.jobs.byId(id);
      return rec !== 'unknown' && rec !== 'expired' && rec.state === 'queued';
    };
    const { q: nextQ, next } = completeSkippingStale(q, finishedJob.jobId, isStillQueued);
    st.queues.set(finishedJob.fileSlug, nextQ);
    if (next === null) return;
    const nextJob = st.jobs.byId(next);
    if (nextJob === 'unknown' || nextJob === 'expired') return; // defensive; should not happen
    const entry = st.registry.getByInstanceId(nextJob.targetInstanceId);
    if (!entry || entry.ws.readyState !== WebSocket.OPEN) {
      const msg = 'Figma plugin disconnected while this job was queued';
      const frame = errReplyFrame(nextJob.requestId, 'E_NO_PLUGIN', msg);
      st.jobs.finish(nextJob.jobId, false, [frame]);
      if (nextJob.from && nextJob.from.readyState === WebSocket.OPEN) {
        try { nextJob.from.send(frame); } catch { /* requester vanished */ }
      }
      st.pending.delete(nextJob.requestId);
      st.dispatchedTo.delete(nextJob.requestId);
      advanceQueue(nextJob);
      return;
    }
    st.jobs.markRunning(nextJob.jobId);
    dispatchJob(nextJob, entry.ws);
  };

  /**
   * The one admission point for every real request — a park-then-flush delivery
   * re-enters HERE too (see `flushWaiting`), per the stage-4 ruling: the flush moment
   * (plugin just connected, parked backlog releases) is the highest-risk interleaving
   * window, so it must not be exempt from the queue discipline.
   *
   * Target resolution below is MOVED from the pre-jobs `forwardToPlugin`, not rewritten —
   * parking and the `--file` ambiguity refusal behave identically to before.
   */
  const admitRequest = (
    from: WebSocket, id: string, rawText: string, cmd?: string, expectedFile?: string,
    readOnly = false, projectDir?: string, activity?: string,
  ): void => {
    const filter = resolveRouteFilter(expectedFile, currentFilter());
    let targetWs = st.dispatchedTo.get(id);
    if (targetWs && targetWs.readyState !== WebSocket.OPEN) targetWs = undefined;
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
      const target = hits[0] ?? null;
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
      st.waiting.push({
        id, from, rawText, deadline: Date.now() + PLUGIN_WAIT_TIMEOUT_MS, filter, projectDir,
        cmd, readOnly, activity,
      });
      log(`parked ${id}${cmd ? ` (${cmd})` : ''}${filter.value ? ` [${filter.source}="${filter.value}"]` : ''} — awaiting ${filter.value ? 'matching ' : ''}plugin (${st.waiting.length} queued)`);
      return;
    }

    const targetEntry = st.registry.getByWs(targetWs);
    if (!targetEntry) {
      // Defensive: the socket resolved above but is no longer a registered plugin entry
      // (should not happen synchronously) — never pin a job to an identity we cannot name.
      sendReplyErr(from, id, 'E_NO_PLUGIN', noPluginMessage(st.registry, filter));
      return;
    }

    recordRequestBinding(targetWs, projectDir);
    st.pending.set(id, from);
    st.dispatchedTo.set(id, targetWs);

    const fileSlug = fileIdentity(
      (targetEntry.scene.fileKey as string | null | undefined) ?? null,
      (targetEntry.scene.fileName as string | undefined) ?? null,
    );
    const isReadOnly = readOnly === true || (cmd !== undefined && IMPLICIT_READ_ONLY.has(cmd));
    const job = st.jobs.create({
      requestId: id, cmd: cmd ?? '(unknown)', fileSlug, readOnly: isReadOnly,
      requestFrames: [rawText], from, targetInstanceId: targetEntry.instanceId,
      ...(activity !== undefined && { activity }),
    });
    // JOB_STATE — sent BEFORE any timeout can fire, so a CLI that gives up waiting still
    // knows its own jobId (the entire point of "timeout → poll, never re-dispatch").
    sendEvent(from, 'JOB_STATE', toJobInfo(job) as unknown as Record<string, unknown>);

    if (isReadOnly) {
      st.jobs.markRunning(job.jobId);
      dispatchJob(job, targetWs);
      return;
    }

    // Mutating: per-file FIFO. `startNow` true only when nothing is running for this file.
    const q = st.queues.get(fileSlug) ?? emptyQueue();
    const { q: nextQ, startNow } = enqueueJob(q, job.jobId);
    st.queues.set(fileSlug, nextQ);
    if (startNow) {
      st.jobs.markRunning(job.jobId);
      dispatchJob(job, targetWs);
    } else {
      const pos = queuePosition(nextQ, job.jobId);
      if (pos !== undefined) {
        job.queuePosition = pos;
        sendEvent(from, 'JOB_STATE', toJobInfo(job) as unknown as Record<string, unknown>);
      }
    }
  };

  /**
   * A chunked request larger than CHUNK_LIMIT arrives as ChunkMsg frames carrying no
   * `cmd`/`readOnly`/`expectedFile` — those live inside the reassembled JSON. Buffer until
   * `last`, then reassemble with the SAME `ChunkAssembler` used elsewhere (envelope-level
   * only — the broker still never reads `params`) and admit with the REAL envelope. Never
   * invent a synthetic `CHUNKED` pseudo-command: that would misroute a filtered request,
   * force a large declared-read-only EXEC_JS to queue, and put false metadata in `status`.
   */
  const admitChunk = (from: WebSocket, id: string, rawText: string, last: boolean): void => {
    // A chunk belonging to an ALREADY-admitted job (running or queued) is a continuation
    // of a request already fully classified — never re-admitted as a fresh request. The
    // `existing.from === from` check (stage-4 fix round, minor 6) guards the theoretical
    // collision: a request id minted by a DIFFERENT connection must never be treated as a
    // continuation of this job — it is a fresh, still-unadmitted request on its own
    // per-connection buffer instead.
    const existing = st.jobs.byRequestId(id);
    if (existing !== undefined && existing.from === from) {
      if (existing.state === 'running') {
        const entry = st.registry.getByInstanceId(existing.targetInstanceId);
        if (entry && entry.ws.readyState === WebSocket.OPEN) {
          try { entry.ws.send(rawText); } catch { /* the running-job error path below catches this on the NEXT frame or the reply timeout */ }
        }
      } else {
        // Still queued — the ordered frame set is held and sent verbatim at dequeue.
        existing.requestFrames.push(rawText);
      }
      return;
    }
    const connChunks = getConnectionChunks(st.pendingChunks, from);
    const entry = connChunks.get(id);
    const buffered = entry?.frames ?? [];
    buffered.push(rawText);
    if (!last) { connChunks.set(id, { frames: buffered, lastFrameAt: Date.now() }); return; }
    deleteConnectionChunk(st.pendingChunks, from, id);
    let assembled: RequestMsg;
    try {
      const assembler = new ChunkAssembler();
      let complete: WireMsg | null = null;
      for (const frame of buffered) {
        const parsed = parseWireMsg(frame);
        if (!parsed || !isChunkMsg(parsed)) throw new Error('malformed chunk frame');
        const done = assembler.accept(parsed);
        if (done) complete = done;
      }
      if (complete === null || !isRequestMsg(complete)) throw new Error('chunked payload did not reassemble to a RequestMsg');
      assembled = complete;
    } catch (err) {
      sendReplyErr(from, id, 'E_CHUNK_LOST', `failed to reassemble chunked request: ${(err as Error).message}`);
      return;
    }
    admitRequest(from, id, JSON.stringify(assembled), assembled.cmd, assembled.expectedFile, assembled.readOnly === true, assembled.projectDir, assembled.activity);
  };

  // A plugin (re)registered → try to flush parked requests. Only admit a request once a
  // target exists (matching the filter, if any); otherwise re-park it with its ORIGINAL
  // deadline so a non-matching HELLO never extends the wait window. Re-entering
  // `admitRequest` here (not a raw send) is the fix: the flush moment is the highest-risk
  // interleaving window, so two mutations parked together must still serialise correctly
  // once their plugin connects — the synchronous loop below guarantees that (the first
  // admits and dispatches/marks running, the second admits into the now-non-empty queue).
  const flushWaiting = (): void => {
    if (st.waiting.length === 0) return;
    const queued = st.waiting;
    st.waiting = [];
    let delivered = 0;
    for (const req of queued) {
      if (req.from.readyState !== WebSocket.OPEN) continue; // CLI gone — drop silently
      if (st.registry.selectTarget(req.filter.value, { exact: req.filter.exact })) {
        admitRequest(
          req.from, req.id, req.rawText, req.cmd,
          req.filter.source === 'flag' ? req.filter.value ?? undefined : undefined,
          req.readOnly === true, req.projectDir, req.activity,
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
    if (client && client.readyState === WebSocket.OPEN) {
      try { client.send(rawText); } catch { /* requester vanished */ }
    }
    const job = st.jobs.byRequestId(id);
    if (job && isFinishedState(job.state)) {
      // Closing round (R1+R2 unified, reviewer Q1) — this job is ALREADY terminal
      // (force-released, watchdog-timed-out, or a genuine prior finish): this frame is
      // the actual pollution site the old code had — `job.replyFrames.push(rawText)` ran
      // UNCONDITIONALLY here, mutating the array in place before `finish()`'s own guard
      // ever got a chance to see it, so a late chunk corrupted `replyFrames` regardless
      // of that guard. Never touch `replyFrames` for a terminal job, never re-run
      // finish()/advanceQueue a second time — count + log only, "discarded" stays true.
      job.lateReplyCount = (job.lateReplyCount ?? 0) + 1;
      log(`late reply frame for terminal job ${job.jobId} (${job.state}) discarded, ` +
        `${Buffer.byteLength(rawText, 'utf8')} bytes (lateReplyCount=${job.lateReplyCount})`);
    } else {
      // A chunked reply arrives as MANY frames: accumulate every one, or a poll replays
      // only the last chunk (and `ok` is not even on a ChunkMsg, so it cannot be
      // classified from it alone).
      if (job) job.replyFrames.push(rawText);
      if (final && job) {
        // Finish the JOB even when no client is listening — this is the line that stops
        // a completed result from evaporating when the CLI timed out and exited
        // (`handleClose`'s CLI branch used to drop `pending` before the reply could land).
        const ok = replyOk(job.replyFrames);
        st.jobs.finish(job.jobId, ok, job.replyFrames);
        advanceQueue(job);
      }
    }
    if (final) {
      st.pending.delete(id);
      st.dispatchedTo.delete(id);
    }
  };

  /** `j_<counter>_<ts>` → the embedded mint timestamp, or null for a caller-supplied
   *  id that doesn't even match the shape. Used to tell "never existed" apart from
   *  "this broker restarted since it was minted" on an E_JOB_UNKNOWN (A5). */
  const jobIdMintedAt = (jobId: string): number | null => {
    const m = /^j_\d+_(\d+)$/.exec(jobId);
    return m ? Number(m[1]) : null;
  };

  /**
   * `cmd: 'JOB'` (concurrency & jobs, phase 02 §2) — BROKER-TERMINAL, same precedent as
   * PROJECT_BIND: intercepted in `handleMessage` before `admitRequest`, never reaches a
   * plugin. The one command whose `params` the broker DOES read (the jobId + mode) —
   * restated precisely, not fudged: the broker never interprets the params of a request
   * it RELAYS; a request addressed TO the broker is not a request being relayed.
   */
  const handleJobCommand = (ws: WebSocket, msg: RequestMsg): void => {
    const params = msg.params as { mode?: unknown; jobId?: unknown; file?: unknown } | null;
    const mode = typeof params?.mode === 'string' ? params.mode : 'poll';
    const jobId = typeof params?.jobId === 'string' ? params.jobId : undefined;

    if (mode === 'list') {
      const rawFilter = typeof params?.file === 'string' ? params.file : undefined;
      const fileSlug = rawFilter !== undefined ? fileIdentity(null, rawFilter) : undefined;
      sendReplyOk(ws, msg.id, { jobs: st.jobs.list(fileSlug) });
      return;
    }

    if (!jobId) {
      sendReplyErr(ws, msg.id, 'E_INVALID_ARGS', 'JOB requires a jobId (except --list)');
      return;
    }

    if (mode === 'cancel') {
      const result = st.jobs.cancelQueued(jobId);
      // Stage-4 fix round (BLOCKER 1) — `cancelQueued` only marks the RECORD `cancelled`;
      // it does not touch the file's own QueueState. Without this, the job stayed in
      // `waiting` and the NEXT completion on that file popped and resurrected it
      // (`markRunning` + dispatch) despite the caller being told it was cancelled.
      if (result.ok) {
        const rec = st.jobs.byId(jobId);
        if (rec !== 'unknown' && rec !== 'expired') {
          const q = st.queues.get(rec.fileSlug);
          if (q) st.queues.set(rec.fileSlug, removeFromQueue(q, jobId));
        }
      }
      sendReplyOk(ws, msg.id, result);
      return;
    }

    if (mode === 'force-release') {
      const rec = st.jobs.byId(jobId);
      if (rec === 'unknown') { sendReplyOk(ws, msg.id, { ok: false, reason: `no such job '${jobId}'` }); return; }
      if (rec === 'expired') { sendReplyOk(ws, msg.id, { ok: false, reason: `job '${jobId}' already expired — nothing to release` }); return; }
      const q = st.queues.get(rec.fileSlug);
      if (!q || q.running !== jobId) {
        sendReplyOk(ws, msg.id, { ok: false, reason: `job '${jobId}' is not the one blocking "${rec.fileSlug}"'s mutation slot` });
        return;
      }
      // The audited exit from a BLOCKED slot (phase 01's watchdog leaves it held on
      // purpose): record the override on the job, finish it for reporting if it was
      // still `running` (the watchdog may not have fired yet), then advance the queue —
      // never automatic, and the message states plainly that a later reply is discarded.
      rec.forceReleased = true;
      if (rec.state === 'running') {
        st.jobs.finish(jobId, false, [errReplyFrame(rec.requestId, 'E_TIMEOUT',
          'force-released — the script may still be running; its result (if any) is discarded and unverified')]);
      }
      // Stage-4 fix round (M4, ruling Q1) — "discarded means discarded": if the wedged
      // script DOES eventually reply, `routeFromPlugin` must not forward it to a CLI that
      // is somehow still attached (a very long --timeout). Deleting both here means its
      // `st.pending.get(id)` lookup finds nothing, and `finish()`'s own terminal guard
      // (below) keeps the late frame out of the poll result regardless.
      st.pending.delete(rec.requestId);
      st.dispatchedTo.delete(rec.requestId);
      advanceQueue(rec);
      log(`job ${jobId} (${rec.cmd}) force-released — "${rec.fileSlug}"'s mutation slot freed; any later reply from that script is discarded`);
      sendReplyOk(ws, msg.id, { ok: true });
      return;
    }

    // poll (default) — RULED: poll-once is cheap; `--wait` is the CLI composing repeated polls.
    const rec = st.jobs.byId(jobId);
    if (rec === 'unknown') {
      // The broker distinguishes THREE facts, not one generic "not found":
      // 1. this id was minted by an EARLIER broker incarnation (restarted since) —
      //    comparing the id's own embedded mint timestamp against ITS OWN startedAt (an
      //    id older than this daemon cannot be in this table, since the table was empty
      //    at boot);
      // 2. this id WAS minted by this broker's own lifetime, so it plausibly existed,
      //    but is now unknown because it aged out beyond the bounded tombstone ring
      //    (stage-4 fix round, minor 7 — "check the id" wrongly implied a typo for what
      //    is very likely a genuine job that just outlived this broker's own memory);
      // 3. the id doesn't even match the minted shape — a genuine typo/garbage id.
      const mintedAt = jobIdMintedAt(jobId);
      const restarted = mintedAt !== null && mintedAt < startedAt;
      const message = restarted
        ? `no such job '${jobId}' — this broker restarted since it was minted. Jobs are in-memory: the work may have completed — verify on canvas, do not retry.`
        : mintedAt !== null
          ? `no such job '${jobId}' — it may have aged out beyond this broker's retention ring (a bounded history of past jobs, not "unknown" as in never-existed); the work may have completed — verify on canvas.`
          : `no such job '${jobId}' — check the id`;
      sendReplyErr(ws, msg.id, 'E_JOB_UNKNOWN', message);
      return;
    }
    if (rec === 'expired') {
      sendReplyErr(ws, msg.id, 'E_JOB_EXPIRED', `job '${jobId}' finished but its result aged out of the retention window`);
      return;
    }
    const info = toJobInfo(rec);
    const finished = isFinishedState(rec.state);
    // Stage-4 fix round (minor 5) — `resultDropped` must reach the poll reply: job.ts
    // prints WHY the result is missing instead of the generic "no stored reply" line.
    // Closing round (R1+R2 unified) — `lateReplyCount` (> 0) surfaces the same way: a
    // discarded-but-COUNTED late frame the caller deserves to know about.
    sendReplyOk(ws, msg.id, finished
      ? {
          job: info,
          resultFrames: rec.replyFrames,
          ...(rec.resultDropped === true && { resultDropped: true }),
          ...(rec.lateReplyCount !== undefined && rec.lateReplyCount > 0 && { lateReplyCount: rec.lateReplyCount }),
        }
      : { job: info });
  };

  const handleClose = (ws: WebSocket): void => {
    // Fail only the in-flight requests routed to THIS socket (a plugin, or a
    // superseded orphan) — other plugins' requests are untouched.
    for (const [id, target] of st.dispatchedTo) {
      if (target !== ws) continue;
      const client = st.pending.get(id);
      const msg = 'Figma plugin disconnected mid-request';
      if (client) sendReplyErr(client, id, 'E_NO_PLUGIN', msg);
      // Concurrency & jobs — finish the JOB too (not just reply the client that's still
      // waiting): this is the ONLY place a dispatched job's plugin target vanishing is
      // discovered, so a poll must get a real answer instead of hanging forever.
      //
      // Stage-4 fix round (BLOCKER 2, reviewer ruling Q2: FAIL + DEQUEUE, no reconnect-
      // hold window) — `dispatchedTo` is set at ADMISSION for every job (queued or
      // running), so this loop also catches a job whose pinned target disconnected while
      // it was STILL QUEUED, never yet dispatched. `advanceQueue` only does anything for
      // the file's CURRENTLY RUNNING job (`completeQueue`'s own no-op guard on a
      // running-id mismatch) — for a queued one it silently did nothing, leaving the
      // now-failed entry sitting in `q.waiting` until a LATER completion popped and
      // resurrected it (dispatching a mutation whose CLI already got E_NO_PLUGIN). Ruled:
      // no reconnect grace window — a re-admitted CLI retry re-enters cleanly. So: the
      // RUNNING job still goes through `advanceQueue` (pops + dispatches next); a STILL-
      // QUEUED one is instead removed directly from that file's queue.
      const job = st.jobs.byRequestId(id);
      if (job) {
        st.jobs.finish(job.jobId, false, [errReplyFrame(id, 'E_NO_PLUGIN', msg)]);
        const q = st.queues.get(job.fileSlug);
        if (q && q.running === job.jobId) {
          advanceQueue(job);
        } else if (q) {
          st.queues.set(job.fileSlug, removeFromQueue(q, job.jobId));
        }
      }
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
    for (const [id, client] of st.pending) {
      if (client !== ws) continue;
      st.pending.delete(id);
      // Concurrency & jobs — do NOT delete `dispatchedTo` here: a live job must outlive
      // the CLI socket (the whole point of the job table). My first draft kept that
      // deletion, which orphans the job's plugin association — after which a later
      // plugin disconnect is invisible to the loop above and the job hangs `running`
      // until the watchdog blocks the slot. `routeFromPlugin` deletes it once the reply
      // actually lands, whether or not a client is still listening.
      const job = st.jobs.byRequestId(id);
      if (job) job.from = null; // the record now correctly reflects "the caller left"
    }
    st.waiting = st.waiting.filter((req) => req.from !== ws); // drop its parked requests
  };

  const handleMessage = (ws: WebSocket, text: string): void => {
    const msg = parseWireMsg(text);
    if (!msg) return;
    // Hidden control frame from a newer CLI build replacing this broker.
    if ((msg as { type?: string }).type === 'BROKER_SHUTDOWN_REQUEST') shutdown(0, 'BROKER_SHUTDOWN_REQUEST');
    const isPlugin = st.registry.touch(ws); // any plugin frame = LIVENESS (heartbeat cull)
    if (isChunkMsg(msg)) {
      // Reply-side chunks (plugin → broker) pass straight to routeFromPlugin, which now
      // accumulates every frame onto the job record itself (concurrency & jobs, backlog
      // 1.1+2.6+4.3) — no reassembly needed here.
      //
      // Request-side chunks (CLI → broker) used to pass straight through as an
      // under-classified request (no `cmd`/`expectedFile`/`projectDir` — those live
      // inside the still-unassembled JSON). `admitChunk` fixes that: it buffers frames
      // until `last`, reassembles the envelope with the same `ChunkAssembler` used
      // elsewhere (envelope-level only — the broker still never reads `params`), and
      // THEN admits the request with its real `cmd`/`readOnly`/`expectedFile`/
      // `projectDir` — never a synthetic pseudo-command that would misroute a filtered
      // request or force a declared-read-only EXEC_JS to queue.
      if (isPlugin) { st.registry.touchActive(ws); routeFromPlugin(msg.id, text, msg.last); }
      else admitChunk(ws, msg.id, text, msg.last);
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
      else if (msg.cmd === 'JOB') handleJobCommand(ws, msg);
      // Envelope-only: cmd + readOnly decide queueing. params are never parsed — the
      // pure-relay rule (concurrency & jobs, backlog 1.1+2.6+4.3).
      else admitRequest(ws, msg.id, text, msg.cmd, msg.expectedFile, msg.readOnly === true, msg.projectDir, msg.activity);
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
  // Concurrency & jobs (backlog 1.1+2.6+4.3), phase 02 §3 — per-file job status for
  // `status`. `runningJobId` (the AUTHORITATIVE occupancy signal) comes from `st.queues`
  // itself, never from scanning the job table for `state === 'running'`: a watchdog-
  // timed-out job is marked `failed` for reporting while its file's slot stays blocked on
  // purpose (see `JobTable.summaryFor`'s own doc for why that distinction matters).
  const jobStatusFor = (fileSlug: string): { runningJob: JobInfo | null; queueDepth: number } => {
    const q = st.queues.get(fileSlug) ?? emptyQueue();
    const { running, queueDepth } = st.jobs.summaryFor(fileSlug, q.running);
    return { runningJob: running, queueDepth };
  };

  const brokerHello = (): EventMsg => ({
    type: 'BROKER_HELLO',
    data: buildBrokerHelloData(
      st.registry,
      { port, pid: process.pid, protocolV: PROTOCOL_VERSION, buildMtime: selfBuildMtime(), uptimeMs: Date.now() - startedAt },
      currentFilter(),
      Date.now,
      jobStatusFor,
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
  // Concurrency & jobs (backlog 1.1+2.6+4.3) — the job table's own TTL/cap eviction folds
  // into this SAME interval (no new timer). An expired PARKED request never became a
  // job in the first place (it fails here, directly), so there is nothing to reconcile
  // between the two sweeps.
  const PARK_SWEEP_INTERVAL_MS = Math.min(500, Math.max(100, Math.floor(PLUGIN_WAIT_TIMEOUT_MS / 8)));
  setInterval(() => {
    const now = Date.now();
    // Stage-4 fix round (M3) — these two MUST run every tick, unconditionally: my first
    // draft put them after `if (st.waiting.length === 0) return;`, which is true on
    // almost every tick (parking is the UNCOMMON case — a plugin is connected most of
    // the time), so the job table's TTL/cap eviction and the abandoned-chunk cleanup
    // were effectively dead code. The 10-minute TTL is a promise to `figma-agent job`'s
    // caller; a sweep that never runs breaks it silently.
    st.jobs.sweep();
    sweepAbandonedChunks(st.pendingChunks, now, PARK_SWEEP_INTERVAL_MS);

    if (st.waiting.length === 0) return;
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
  }, PARK_SWEEP_INTERVAL_MS);

  // Watchdog: a RUNNING job with no reply within WATCHDOG_TIMEOUT_MS is marked
  // failed(E_TIMEOUT) FOR REPORTING — the file's mutation slot stays BLOCKED, on
  // purpose. Advancing it would be self-defeating: the plugin sandbox cannot interrupt a
  // running `eval`, so the script may still be executing, and dispatching the next
  // mutation would deliberately recreate the interleaving this whole wave exists to
  // prevent. The only exit is the audited `figma-agent job <id> --force-release`
  // (phase 02) — `status` (phase 02 §3) surfaces the blocked slot + the offending job's
  // age from `st.queues`, not from this job's (now `failed`) state alone.
  setInterval(() => {
    const now = Date.now();
    for (const job of st.jobs.runningJobs()) {
      if (job.startedAt === undefined || now - job.startedAt < WATCHDOG_TIMEOUT_MS) continue;
      const msg = `no reply within ${WATCHDOG_TIMEOUT_MS}ms — the script may still be running; ` +
        `this file's mutation slot stays blocked until 'figma-agent job ${job.jobId} --force-release'`;
      st.jobs.finish(job.jobId, false, [errReplyFrame(job.requestId, 'E_TIMEOUT', msg)]);
      log(`watchdog: job ${job.jobId} (${job.cmd}) timed out — slot for "${job.fileSlug}" stays blocked`);
      // Deliberately NO advanceQueue(job) here — see the comment above.
    }
  }, Math.min(30_000, Math.max(1_000, Math.floor(WATCHDOG_TIMEOUT_MS / 4))));

  // Advertisement refresh (fixed 30s); yield if a different live broker took over.
  setInterval(() => {
    const ad = readAdvertisement(advertisePath);
    if (ad && ad.pid !== process.pid && isPidAlive(ad.pid)) shutdown(0, `replaced by broker pid ${ad.pid}`);
    writeAdvertisement(port, startedAt, advertisePath);
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
