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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
