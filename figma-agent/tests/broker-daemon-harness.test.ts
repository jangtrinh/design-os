// Closing round (daemon harness ruling) — the ONE test file exercising broker-daemon.ts's
// REAL dispatch closures (admitRequest/routeFromPlugin/advanceQueue/handleClose/
// handleJobCommand/the watchdog interval) end to end, via a real in-process broker + real
// `ws` sockets speaking the actual wire protocol. Everything else in this wave was proven
// via pure-function extraction (file-queue.ts/job-table.ts/protocol-helpers.ts) — these
// closures had ZERO coverage until now, and stage-4's BLOCKER 1/2 both lived exactly here.
//
// Isolation (team-lead ruling, option B — dependency injection, NOT core extraction):
// `runBrokerDaemon`'s optional `options` param — an OS-assigned ephemeral port
// (`ports: [0]`), a tmpdir advertisement path, and an `exit` stub that THROWS instead of
// killing the vitest worker — so this file NEVER touches this machine's real
// /tmp/figma-agent-broker.json, the real 9410-9419 port range, or a real live broker. Also
// redirects the change-log dir (`FIGMA_AGENT_CHANGES_DIR`, existing test convention — see
// change-log.ts's own header) and the bind-cache file (`FIGMA_AGENT_BINDS_FILE`, existing
// override — see project-bind.ts) to the same scratch tmpdir.
//
// `WATCHDOG_TIMEOUT_MS`/`HEARTBEAT_MS`/etc. are `envMs(...)`-derived MODULE-LOAD-TIME
// constants in broker-daemon.ts (not read per-call) — a `beforeEach` env assignment is too
// late for those. Scenario 3 needs a shrunk watchdog, so every test here loads the module
// fresh via `vi.resetModules()` + dynamic `import()` AFTER setting env vars, guaranteeing
// the constants observe this test's own values regardless of import order across the suite.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { makeRequestFrame } from '../shared/protocol.ts';
import type { EventMsg, JobInfo, ReplyErr, ReplyOk, WireMsg } from '../shared/protocol.ts';

type BrokerDaemonModule = typeof import('../cli/src/transport/broker-daemon.ts');

const WATCHDOG_MS_KEY = 'FIGMA_AGENT_WATCHDOG_MS';
const CHANGES_DIR_KEY = 'FIGMA_AGENT_CHANGES_DIR';
const BINDS_FILE_KEY = 'FIGMA_AGENT_BINDS_FILE';

let scratchDir: string;
let advertisePath: string;
let sockets: WebSocket[];

/** Load `broker-daemon.ts` fresh, AFTER the given env vars are set — required for the
 *  module-load-time `envMs(...)` constants (see file header). */
async function loadBrokerDaemon(env: Record<string, string> = {}): Promise<BrokerDaemonModule> {
  process.env[CHANGES_DIR_KEY] = scratchDir;
  process.env[BINDS_FILE_KEY] = join(scratchDir, 'binds.json');
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  vi.resetModules();
  return import('../cli/src/transport/broker-daemon.ts');
}

/** The harness's own exit stub — asserts a startup/shutdown path is ever reachable
 *  WITHOUT killing the vitest worker. `shutdown()`'s caller wraps this in a try/catch
 *  (the daemon's own per-message error handling), so the throw never escapes to the test. */
function testExit(): (code: number) => never {
  return (code: number): never => {
    throw new Error(`__TEST_BROKER_EXIT__ code=${code}`);
  };
}

async function startTestBroker(env: Record<string, string> = {}): Promise<number> {
  const mod = await loadBrokerDaemon(env);
  await mod.runBrokerDaemon({ advertisePath, ports: [0], exit: testExit() });
  const ad = JSON.parse(readFileSync(advertisePath, 'utf8')) as { port: number };
  return ad.port;
}

function connectSocket(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
    sockets.push(ws);
  });
}

/** Resolve on the next parsed frame matching `predicate` (default: any frame). */
function nextFrame<T extends WireMsg | EventMsg>(ws: WebSocket, predicate?: (m: WireMsg) => boolean): Promise<T> {
  return new Promise((resolve) => {
    const handler = (raw: WebSocket.RawData): void => {
      const msg = JSON.parse(raw.toString()) as WireMsg;
      if (!predicate || predicate(msg)) {
        ws.off('message', handler);
        resolve(msg as T);
      }
    };
    ws.on('message', handler);
  });
}

/** Every frame `ws` receives from the moment this is called, for a plain count/order check. */
function collectFrames(ws: WebSocket): { frames: WireMsg[] } {
  const state = { frames: [] as WireMsg[] };
  ws.on('message', (raw) => state.frames.push(JSON.parse(raw.toString()) as WireMsg));
  return state;
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 3_000, stepMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error('waitFor: condition never became true within the deadline');
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}

async function helloPlugin(ws: WebSocket, instanceId: string, fileName: string): Promise<void> {
  ws.send(JSON.stringify({
    type: 'PLUGIN_HELLO',
    data: { instanceId, fileName, fileKey: null, caps: ['fileGuard'] },
  } satisfies EventMsg));
  // BROKER_HELLO arrives on connect, before HELLO is even processed — SYNC_CONFIG is the
  // registration ack this test waits on, so it never races the plugin being registered.
  await nextFrame(ws, (m) => (m as EventMsg).type === 'SYNC_CONFIG');
}

/** Sends FILE_INFO as the plugin — triggers `promotePendingBind` on the broker side when
 *  a real fileKey shows up for the first time on an already-bound name-slug. */
function sendFileInfo(ws: WebSocket, fileName: string, fileKey: string): void {
  ws.send(JSON.stringify({
    type: 'FILE_INFO',
    data: { fileName, fileKey, page: 'Page 1', selectionName: null, selectionCount: 0 },
  } satisfies EventMsg));
}

/** Send a mutating request and wait for its JOB_STATE — returns the minted jobId, whether
 *  it started running immediately or was queued behind another job on the same file. */
async function sendMutatingJob(ws: WebSocket, reqId: string): Promise<string> {
  ws.send(JSON.stringify(makeRequestFrame(reqId, 'SET_TEXT', { nodeId: '1:1', text: 'x' })));
  const jobState = await nextFrame<EventMsg>(ws, (m) => (m as EventMsg).type === 'JOB_STATE');
  return (jobState.data as unknown as JobInfo).jobId;
}

async function pollJob(ws: WebSocket, jobId: string, reqId: string): Promise<{ job: JobInfo; resultFrames?: string[]; resultDropped?: boolean; lateReplyCount?: number }> {
  ws.send(JSON.stringify(makeRequestFrame(reqId, 'JOB', { mode: 'poll', jobId })));
  const reply = await nextFrame<ReplyOk | ReplyErr>(ws, (m) => (m as ReplyOk | ReplyErr).id === reqId);
  if (!reply.ok) throw new Error(`poll failed: ${JSON.stringify(reply.error)}`);
  return reply.result as { job: JobInfo; resultFrames?: string[]; resultDropped?: boolean; lateReplyCount?: number };
}

interface EditInputLike {
  op: 'created' | 'updated' | 'deleted';
  nodeId: string;
  nodeName: string | null;
  nodeType: string;
  parentName: string | null;
  changedProps: string[];
  origin: 'LOCAL' | 'REMOTE';
  page: string;
  actor: 'owner' | 'agent' | 'ambiguous';
}

/** Sends an EDIT_FEED batch as the plugin — no reply is expected (best-effort append). */
function sendEditFeed(
  ws: WebSocket, edits: readonly EditInputLike[], meta: { fileKey: string | null; fileName: string; source?: 'live' | 'gapfill' },
): void {
  ws.send(JSON.stringify({
    type: 'EDIT_FEED',
    data: { edits, fileKey: meta.fileKey, fileName: meta.fileName, source: meta.source ?? 'live' },
  } satisfies EventMsg));
}

/** Closing round (N4) — simulates a stale plugin build that doesn't yet send `fileName`
 *  in this payload AT ALL (not even `undefined` — the key is simply absent), the way a
 *  build predating this field would. */
function sendEditFeedWithoutFileName(ws: WebSocket, edits: readonly EditInputLike[], fileKey: string | null): void {
  ws.send(JSON.stringify({ type: 'EDIT_FEED', data: { edits, fileKey, source: 'live' } } satisfies EventMsg));
}

async function bindProject(
  ws: WebSocket, fileName: string, projectDir: string, reqId: string,
): Promise<{ migratedCount: number; migratedEditCount: number; fileKey: string | null }> {
  ws.send(JSON.stringify(makeRequestFrame(reqId, 'PROJECT_BIND', { fileName, projectDir })));
  const reply = await nextFrame<ReplyOk | ReplyErr>(ws, (m) => (m as ReplyOk | ReplyErr).id === reqId);
  if (!reply.ok) throw new Error(`bind failed: ${JSON.stringify((reply as ReplyErr).error)}`);
  return reply.result as { migratedCount: number; migratedEditCount: number; fileKey: string | null };
}

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'fa-broker-harness-'));
  advertisePath = join(scratchDir, 'broker.json');
  sockets = [];
});

afterEach(async () => {
  // The daemon's OWN designed shutdown path: closes wss/wss6 for real. The `exit` stub's
  // throw is caught by `handleMessage`'s own per-connection try/catch (broker-daemon.ts's
  // `ws.on('message', ...)` wrapper) — it never escapes to this test.
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'BROKER_SHUTDOWN_REQUEST' })); } catch { /* already gone */ }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  for (const ws of sockets) { try { ws.terminate(); } catch { /* already closed */ } }
  rmSync(scratchDir, { recursive: true, force: true });
});

describe('daemon harness — cancel-then-complete never dispatches the cancelled job (BLOCKER 1)', () => {
  it('a QUEUED job cancelled via `job --cancel` is never resurrected when the running job finishes', async () => {
    const port = await startTestBroker();
    const plugin = await connectSocket(port);
    await helloPlugin(plugin, 'plugin-1', 'F1');
    const pluginFrames = collectFrames(plugin);

    const cliA = await connectSocket(port);
    const jobA = await sendMutatingJob(cliA, 'req-a');
    await waitFor(() => pluginFrames.frames.some((f) => (f as { id?: string }).id === 'req-a'));

    const cliB = await connectSocket(port);
    const jobB = await sendMutatingJob(cliB, 'req-b'); // QUEUED — plugin busy with job A

    // Cancel the still-queued job B.
    cliB.send(JSON.stringify(makeRequestFrame('req-cancel', 'JOB', { mode: 'cancel', jobId: jobB })));
    const cancelReply = await nextFrame<ReplyOk>(cliB, (m) => (m as ReplyOk).id === 'req-cancel');
    expect(cancelReply.ok).toBe(true);
    expect((cancelReply.result as { ok: boolean }).ok).toBe(true);

    // The plugin answers job A's ORIGINAL request — this is what used to resurrect the
    // cancelled job B via advanceQueue's pop.
    plugin.send(JSON.stringify({ id: 'req-a', ok: true, result: { fileName: 'F1' } } satisfies ReplyOk));
    await new Promise((resolve) => setTimeout(resolve, 200)); // let routeFromPlugin/advanceQueue settle

    // Job B was never dispatched — the plugin received EXACTLY one request frame (job A's).
    const requestFrames = pluginFrames.frames.filter((f) => 'cmd' in (f as Record<string, unknown>));
    expect(requestFrames).toHaveLength(1);
    expect((requestFrames[0] as { id: string }).id).toBe('req-a');

    // Job B's own record still reads 'cancelled', not resurrected into 'running'/'queued'.
    const polled = await pollJob(cliB, jobB, 'req-poll-b');
    expect(polled.job.state).toBe('cancelled');
    expect(jobA).not.toBe(jobB);
  });
});

describe('daemon harness — plugin disconnect fails a queued job, reconnect never re-dispatches it (BLOCKER 2)', () => {
  it('E_NO_PLUGIN reaches the CLI for both the running and queued job; a same-instanceId reconnect gets nothing', async () => {
    const port = await startTestBroker();
    const plugin = await connectSocket(port);
    await helloPlugin(plugin, 'plugin-2', 'F2');
    const pluginFrames = collectFrames(plugin);

    const cliA = await connectSocket(port);
    await sendMutatingJob(cliA, 'req-a2'); // dispatched immediately — RUNNING
    await waitFor(() => pluginFrames.frames.some((f) => (f as { id?: string }).id === 'req-a2'));

    const cliB = await connectSocket(port);
    const jobB = await sendMutatingJob(cliB, 'req-b2'); // QUEUED behind job A

    const errA = nextFrame<ReplyErr>(cliA, (m) => (m as ReplyErr).id === 'req-a2');
    const errB = nextFrame<ReplyErr>(cliB, (m) => (m as ReplyErr).id === 'req-b2');
    plugin.terminate(); // the disconnect
    const [replyA, replyB] = await Promise.all([errA, errB]);
    expect(replyA.ok).toBe(false);
    expect(replyA.error.code).toBe('E_NO_PLUGIN');
    expect(replyB.ok).toBe(false);
    expect(replyB.error.code).toBe('E_NO_PLUGIN');

    // Job B's own record reads 'failed' — never left dangling in a resurrectable state.
    const polledB = await pollJob(cliB, jobB, 'req-poll-b2');
    expect(polledB.job.state).toBe('failed');

    // Reconnect with the SAME instanceId — no parked/queued work exists to flush.
    const plugin2 = await connectSocket(port);
    await helloPlugin(plugin2, 'plugin-2', 'F2');
    const plugin2Frames = collectFrames(plugin2);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const dispatched = plugin2Frames.frames.filter((f) => 'cmd' in (f as Record<string, unknown>));
    expect(dispatched).toHaveLength(0);
  });
});

describe('daemon harness — a watchdog-failed job answered late returns the timeout outcome + lateReplyCount, never E_CHUNK_LOST (closing round R1+R2)', () => {
  it('the late reply is discarded and counted, the ORIGINAL E_TIMEOUT outcome survives', async () => {
    const port = await startTestBroker({ [WATCHDOG_MS_KEY]: '150' }); // real watchdog, shrunk
    const plugin = await connectSocket(port);
    await helloPlugin(plugin, 'plugin-3', 'F3');
    const pluginFrames = collectFrames(plugin);

    const cliA = await connectSocket(port);
    const jobA = await sendMutatingJob(cliA, 'req-a3');
    await waitFor(() => pluginFrames.frames.some((f) => (f as { id?: string }).id === 'req-a3'));
    // Plugin stays silent — the watchdog interval (min cadence 1s, regardless of how small
    // WATCHDOG_TIMEOUT_MS is set) is what finishes this job, not a script reply.

    const cliPoll = await connectSocket(port);
    let seq = 0;
    await waitFor(async () => {
      const p = await pollJob(cliPoll, jobA, `req-poll-a3-${seq++}`);
      return p.job.state === 'failed';
    }, 5_000, 150);

    // The late reply — the plugin finally answers the ORIGINAL request, after the watchdog
    // already finished it. This must be discarded, never corrupt replyFrames.
    plugin.send(JSON.stringify({ id: 'req-a3', ok: true, result: { fileName: 'F3' } } satisfies ReplyOk));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const final = await pollJob(cliPoll, jobA, 'req-poll-a3-final');
    expect(final.job.state).toBe('failed'); // the ORIGINAL watchdog outcome, not flipped to done
    expect(final.lateReplyCount).toBeGreaterThan(0);
    expect(final.resultFrames).toBeDefined();
    // The stored reply is the ORIGINAL single E_TIMEOUT frame — parses clean, never a
    // corrupted multi-frame reassembly (the actual old bug: [timeoutErr, realReply] read
    // back as a broken chunk sequence → E_CHUNK_LOST).
    expect(final.resultFrames).toHaveLength(1);
    const parsed = JSON.parse(final.resultFrames![0]!) as ReplyErr;
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe('E_TIMEOUT');
  });
});

describe('daemon harness — EDIT_FEED routes through the binding index, never the broker\'s spawn cwd (backlog 5.7)', () => {
  it('an unbound batch stages; PROJECT_BIND migrates it into the bound project\'s OWN edit feed; a later batch lands there directly', async () => {
    const port = await startTestBroker();
    const plugin = await connectSocket(port);
    await helloPlugin(plugin, 'plugin-edit-1', 'Platform - Design System');

    const slug = 'platform-design-system'; // safeSlug('Platform - Design System')
    const stagingPath = join(scratchDir, 'changes', 'unbound', `${slug}.jsonl`);
    // The broker's own cwd-derived default — a Platform DS edit landing HERE (VSF-PCP's
    // tree, in the real live-traced incident) is the exact misattribution 5.7 fixes.
    const cwdDefaultPath = join(scratchDir, 'changes', `${slug}.jsonl`);

    // Unbound: sent before any bind exists for this identity.
    sendEditFeed(plugin, [
      { op: 'deleted', nodeId: 'n1', nodeName: 'Subtitle', nodeType: 'TEXT', parentName: 'Roles / Detail', changedProps: [], origin: 'LOCAL', page: 'Screens', actor: 'owner' },
    ], { fileKey: null, fileName: 'Platform - Design System' });
    await waitFor(() => existsSync(stagingPath));
    expect(readFileSync(stagingPath, 'utf8').trim().split('\n')).toHaveLength(1);
    expect(existsSync(cwdDefaultPath)).toBe(false); // never the broker's own cwd default

    const boundProjectDir = mkdtempSync(join(tmpdir(), 'fa-bound-project-'));
    try {
      const cli = await connectSocket(port);
      const bindResult = await bindProject(cli, 'Platform - Design System', boundProjectDir, 'req-bind-1');
      expect(bindResult.migratedEditCount).toBe(1);

      const boundFeedPath = join(boundProjectDir, 'design', 'changes', `${slug}.jsonl`);
      expect(existsSync(boundFeedPath)).toBe(true); // migrated into the REAL bound project
      expect(existsSync(stagingPath)).toBe(false); // staging cleaned up after migration

      // A second, now-bound batch — lands DIRECTLY in the bound project, never staged,
      // never the broker's cwd default.
      sendEditFeed(plugin, [
        { op: 'updated', nodeId: 'n2', nodeName: 'CTA', nodeType: 'TEXT', parentName: 'Hero', changedProps: ['characters'], origin: 'LOCAL', page: 'Screens', actor: 'owner' },
      ], { fileKey: null, fileName: 'Platform - Design System' });
      await waitFor(() => readFileSync(boundFeedPath, 'utf8').trim().split('\n').length === 2);
      expect(existsSync(cwdDefaultPath)).toBe(false); // still never touches the cwd default
      expect(existsSync(stagingPath)).toBe(false); // never re-created
    } finally {
      rmSync(boundProjectDir, { recursive: true, force: true });
    }
  });
});

describe('daemon harness — pendingKey→fileKey promotion merges the edit feed, never splits it (stage-4 fix round, M2)', () => {
  it('a name-slug-keyed feed migrates into the fileKey-keyed feed the moment FILE_INFO reveals a real fileKey', async () => {
    const port = await startTestBroker();
    const plugin = await connectSocket(port);
    await helloPlugin(plugin, 'plugin-edit-2', 'Platform - Design System');

    const slug = 'platform-design-system';
    const realFileKey = 'REAL-FILE-KEY-123';
    const boundProjectDir = mkdtempSync(join(tmpdir(), 'fa-bound-project-m2-'));
    try {
      // A real project always already has SOME design/ dir — resolveProjectDir's own
      // isUsable() treats a project without one as "stopped looking like a project"
      // (never a fallback guess), so the fixture pre-creates it the way a genuine bind
      // target would already have one.
      mkdirSync(join(boundProjectDir, 'design'), { recursive: true });
      // Bind BY NAME while the plugin's own fileKey is still unknown (null) — the common
      // "bind before the file has a real key" case (a Figma-Free file, or simply binding
      // before this session ever sent FILE_INFO with one).
      const cli = await connectSocket(port);
      await bindProject(cli, 'Platform - Design System', boundProjectDir, 'req-bind-m2');

      const slugFeedPath = join(boundProjectDir, 'design', 'changes', `${slug}.jsonl`);
      const keyFeedPath = join(boundProjectDir, 'design', 'changes', `${realFileKey}.jsonl`);

      // Still routes by name-slug — fileKey isn't known to this batch yet either.
      sendEditFeed(plugin, [
        { op: 'deleted', nodeId: 'n1', nodeName: 'Subtitle', nodeType: 'TEXT', parentName: 'Roles / Detail', changedProps: [], origin: 'LOCAL', page: 'Screens', actor: 'owner' },
      ], { fileKey: null, fileName: 'Platform - Design System' });
      await waitFor(() => existsSync(slugFeedPath));
      expect(readFileSync(slugFeedPath, 'utf8').trim().split('\n')).toHaveLength(1);

      // FILE_INFO reveals the real fileKey for the first time — triggers promotePendingBind.
      sendFileInfo(plugin, 'Platform - Design System', realFileKey);
      await waitFor(() => existsSync(keyFeedPath));

      // The name-slug feed is GONE (migrated away), never left to silently diverge.
      expect(existsSync(slugFeedPath)).toBe(false);
      expect(readFileSync(keyFeedPath, 'utf8').trim().split('\n')).toHaveLength(1);

      // A THIRD batch, now carrying the real fileKey (as a live plugin would from here on) —
      // lands in the SAME fileKey feed, never re-creating the name-slug one.
      sendEditFeed(plugin, [
        { op: 'updated', nodeId: 'n2', nodeName: 'CTA', nodeType: 'TEXT', parentName: 'Hero', changedProps: ['characters'], origin: 'LOCAL', page: 'Screens', actor: 'owner' },
      ], { fileKey: realFileKey, fileName: 'Platform - Design System' });
      await waitFor(() => readFileSync(keyFeedPath, 'utf8').trim().split('\n').length === 2);
      expect(existsSync(slugFeedPath)).toBe(false); // never re-created
    } finally {
      rmSync(boundProjectDir, { recursive: true, force: true });
    }
  });
});

describe('daemon harness — EDIT_FEED with no data.fileName falls back to the registry scene, never "unknown" (closing round, N4)', () => {
  it('a payload missing fileName entirely still routes to the bound project\'s real slug, not unknown.jsonl', async () => {
    const port = await startTestBroker();
    const plugin = await connectSocket(port);
    // HELLO gives the registry a real fileName — this is what N4's fallback reads.
    await helloPlugin(plugin, 'plugin-edit-n4', 'Platform - Design System');

    const slug = 'platform-design-system';
    const boundProjectDir = mkdtempSync(join(tmpdir(), 'fa-bound-project-n4-'));
    mkdirSync(join(boundProjectDir, 'design'), { recursive: true });
    try {
      const cli = await connectSocket(port);
      await bindProject(cli, 'Platform - Design System', boundProjectDir, 'req-bind-n4');

      const boundFeedPath = join(boundProjectDir, 'design', 'changes', `${slug}.jsonl`);
      const unknownFeedPath = join(boundProjectDir, 'design', 'changes', 'unknown.jsonl');

      // The stale-build payload — no `fileName` key at all.
      sendEditFeedWithoutFileName(plugin, [
        { op: 'deleted', nodeId: 'n1', nodeName: 'Subtitle', nodeType: 'TEXT', parentName: 'Roles / Detail', changedProps: [], origin: 'LOCAL', page: 'Screens', actor: 'owner' },
      ], null);
      await waitFor(() => existsSync(boundFeedPath));

      expect(readFileSync(boundFeedPath, 'utf8').trim().split('\n')).toHaveLength(1);
      expect(existsSync(unknownFeedPath)).toBe(false); // never the permanent-loss bucket
    } finally {
      rmSync(boundProjectDir, { recursive: true, force: true });
    }
  });
});
