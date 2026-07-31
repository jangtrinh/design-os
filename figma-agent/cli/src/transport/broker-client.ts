// Broker client used by every CLI command: ensure broker → connect → send
// RequestMsg → await id-correlated ReplyMsg (reassembling chunked replies).
// Throws CliError {code,message}; timeouts come from shared COMMAND_TIMEOUTS.
import { unlinkSync } from 'node:fs';
import WebSocket from 'ws';
import {
  BROKER_FILE,
  COMMAND_TIMEOUTS,
  DEFAULT_TIMEOUT_MS,
  PROTOCOL_VERSION,
  makeRequestFrame,
  makeRequestId,
  type CommandName,
  type FileContext,
  type JobInfo,
  type WireError,
} from '../../../shared/protocol.ts';
import { ensureBroker } from './broker-discovery.ts';
import { MUTATING_COMMANDS } from '../../../shared/mutating-commands.ts';
import {
  ChunkAssembler,
  CliError,
  isChunkMsg,
  isEventMsg,
  isReplyMsg,
  parseWireMsg,
  rawToString,
  sendWireMsg,
} from './protocol-helpers.ts';

const CONNECT_TIMEOUT_MS = 4_000;
let requestCounter = 0;

let expectedFile: string | undefined;
let lastFileContext: FileContext | undefined;
let projectDir: string | undefined;
let readOnlyGlobal = false;

/** Set once per CLI invocation from the global --file flag; stamped on every request envelope. */
export function setExpectedFile(name: string | undefined): void { expectedFile = name; }
export function getLastFileContext(): FileContext | undefined { return lastFileContext; }

/**
 * Set once per CLI invocation from `--dir` (or cwd); stamped on every request envelope —
 * the SAME choke point `setExpectedFile` uses (registry-integrity phase 01, §1). The broker
 * records fileIdentity → projectDir from this so panel/idle sync applies into the right
 * project instead of the daemon's spawn cwd.
 */
export function setProjectDir(dir: string | undefined): void { projectDir = dir; }

/**
 * Set once per CLI invocation from the global `--read-only` flag (concurrency & jobs,
 * backlog 1.1+2.6+4.3, phase 02 §4). A per-call `runCommand({ readOnly: true })` (used by
 * internal read-only callers riding EXEC_JS, e.g. scan-node/scan-conventions) always
 * wins over this global — see `runCommand`'s own `opts?.readOnly ?? readOnlyGlobal`.
 */
export function setReadOnly(v: boolean): void { readOnlyGlobal = v; }

/**
 * Stage-4 fix round (minor 8, ruling Q4) — `--read-only` is a PARTIAL hardening, not a
 * blanket promise: asserting read-only on a command that mutates BY NAME (e.g. SET_TEXT,
 * CREATE_FRAME) is always a lie, so refuse it outright rather than silently trust the
 * caller. EXEC_JS is the one deliberate exception — it IS the flag's designed use (a
 * read-only script the broker cannot inspect the body of); a script that mutates despite
 * the flag is on the caller, not something this layer can detect by name. A command
 * that's already read-only by nature makes the flag a harmless no-op either way.
 * Pure (no CommandName lookup outside MUTATING_COMMANDS) so it's unit-testable without a
 * live broker.
 */
export function refusesReadOnlyAssertion(wireCmd: CommandName, readOnly: boolean): boolean {
  return readOnly && wireCmd !== 'EXEC_JS' && MUTATING_COMMANDS.includes(wireCmd);
}

function connectWs(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new CliError('E_NO_BROKER', `broker connect timed out on port ${port}`));
    }, CONNECT_TIMEOUT_MS);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(new CliError('E_NO_BROKER', `broker connect failed: ${err.message}`));
    });
  });
}

// Exported (not just internal to `runCommand`) so the JOB_STATE → timeout-hint wiring
// is unit-testable with a fake socket (EventEmitter + a stubbed `send`), without needing
// a live broker connection — `runCommand`'s own `ensureBroker`/`connectWs` calls are real
// network I/O and are not the seam this behaviour needs.
export function exchange(
  ws: WebSocket,
  cmd: CommandName,
  params: unknown,
  timeoutMs: number,
  activity?: string,
  readOnly?: boolean,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = makeRequestId(++requestCounter);
    const assembler = new ChunkAssembler();
    let settled = false;
    // Concurrency & jobs (backlog 1.1+2.6+4.3) — the LAST JOB_STATE seen before the reply
    // (or the timeout) lands. Remembered, not acted on immediately: the request keeps
    // waiting for its real reply exactly as before: JOB_STATE only tells the CLI its own
    // jobId in case the timeout fires first.
    let lastJob: JobInfo | undefined;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new CliError(
        'E_TIMEOUT',
        lastJob
          ? `${cmd} still running after ${timeoutMs}ms — job ${lastJob.jobId} was NOT cancelled. ` +
            `Get the result with: figma-agent job ${lastJob.jobId} --wait`
          : `${cmd} timed out after ${timeoutMs}ms`,
        { jobId: lastJob?.jobId },
      ))),
      timeoutMs,
    );

    ws.on('message', (raw) => {
      let msg = parseWireMsg(rawToString(raw));
      if (!msg) return;
      try {
        if (isChunkMsg(msg)) {
          if (msg.id !== id) return;
          const complete = assembler.accept(msg);
          if (!complete) return; // more frames coming
          msg = complete;
        }
      } catch (err) {
        finish(() => reject(err));
        return;
      }
      if (isEventMsg(msg)) {
        const { type, data } = msg;
        if (type === 'PLUGIN_GONE') {
          finish(() => reject(new CliError('E_NO_PLUGIN', 'Figma plugin disconnected while waiting for the reply')));
        } else if (type === 'BROKER_HELLO' && data.protocolV !== undefined && data.protocolV !== PROTOCOL_VERSION) {
          finish(() => reject(new CliError('E_VERSION_MISMATCH', `broker speaks protocol v${String(data.protocolV)}, CLI expects v${PROTOCOL_VERSION}`)));
        } else if (type === 'JOB_STATE') {
          // Keep waiting — this frame is not the reply, only the jobId the timeout
          // handler above needs so "the CLI never re-dispatches" is actually true.
          lastJob = data as unknown as JobInfo;
        }
        return;
      }
      if (isReplyMsg(msg) && msg.id === id) {
        const reply = msg;
        if (reply.fileContext) lastFileContext = reply.fileContext;
        finish(() => {
          if (reply.ok) resolve(reply.result);
          else reject(new CliError(reply.error.code, reply.error.message, { rolledBack: (reply.error as WireError).rolledBack }));
        });
      }
    });
    ws.on('close', () => finish(() => reject(new CliError('E_NO_BROKER', 'broker connection closed before the reply arrived'))));
    ws.on('error', (err) => finish(() => reject(new CliError('E_NO_BROKER', `broker socket error: ${err.message}`))));

    try {
      sendWireMsg(ws, makeRequestFrame(id, cmd, params, activity, expectedFile, projectDir, readOnly));
    } catch (err) {
      finish(() => reject(new CliError('E_NO_BROKER', `failed to send request: ${(err as Error).message}`)));
    }
  });
}

/**
 * Connect, read the broker's BROKER_HELLO greeting (port, pid, uptime, protocol,
 * plugin liveness), and close — no plugin round-trip. Used by `figma-agent
 * status` to report broker + connection health even when the plugin is absent.
 */
export function fetchBrokerHello(port: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new CliError('E_NO_BROKER', `broker hello timed out on port ${port}`));
    }, CONNECT_TIMEOUT_MS);
    const done = (fn: () => void): void => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      fn();
    };
    ws.on('message', (raw) => {
      const msg = parseWireMsg(rawToString(raw));
      if (msg && isEventMsg(msg) && msg.type === 'BROKER_HELLO') done(() => resolve(msg.data));
    });
    ws.once('error', (err) => done(() => reject(new CliError('E_NO_BROKER', `broker hello failed: ${err.message}`))));
    ws.once('close', () => { clearTimeout(timer); reject(new CliError('E_NO_BROKER', 'broker closed before hello')); });
  });
}

/**
 * Run one command through the broker. Connect failure after a valid
 * advertisement forces one rediscovery (broker may have just died).
 *
 * `opts.activity` is the intent label the panel's activity feed shows instead of
 * the wire `cmd` (see RequestMsg.activity) — pass it from any command whose `cmd`
 * does not say what the user is actually waiting for.
 *
 * `opts.readOnly` (concurrency & jobs, backlog 1.1+2.6+4.3) is a per-call declaration
 * that ALWAYS wins over the global `--read-only` flag (`setReadOnly`) — the choke point
 * for internal callers that ride EXEC_JS but are themselves read-only regardless of
 * whatever the caller's own CLI invocation declared (scan-node, scan-conventions).
 * `undefined` (the default) falls back to the global flag's current value.
 */
export async function runCommand(
  cmd: string,
  params: unknown,
  opts?: { timeoutMs?: number; activity?: string; readOnly?: boolean },
): Promise<unknown> {
  const wireCmd = cmd as CommandName;
  const readOnlyRequested = opts?.readOnly ?? readOnlyGlobal;
  // Fail before ever touching the broker — a lying --read-only assertion is a caller bug,
  // not something worth spawning/connecting to discover (stage-4 fix round, minor 8).
  if (refusesReadOnlyAssertion(wireCmd, readOnlyRequested)) {
    throw new CliError(
      'E_INVALID_ARGS',
      `--read-only cannot be asserted on ${wireCmd} — it mutates by design; drop the flag or use EXEC_JS for a script the broker cannot inspect`,
    );
  }
  let ad = await ensureBroker();
  let ws: WebSocket;
  try {
    ws = await connectWs(ad.port);
  } catch {
    try {
      unlinkSync(BROKER_FILE); // advertisement lied — drop it and respawn
    } catch {
      /* already gone */
    }
    ad = await ensureBroker();
    ws = await connectWs(ad.port);
  }

  const timeoutMs = opts?.timeoutMs ?? COMMAND_TIMEOUTS[wireCmd] ?? DEFAULT_TIMEOUT_MS;
  try {
    return await exchange(ws, wireCmd, params, timeoutMs, opts?.activity, readOnlyRequested);
  } finally {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
}
