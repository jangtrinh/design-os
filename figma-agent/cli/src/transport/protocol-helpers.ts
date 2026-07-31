// Wire-protocol helpers shared by broker daemon + broker client:
// typed guards, chunked send (>512KB), chunk reassembly, raw-frame decoding.
// Protocol constants/types live in shared/protocol.ts (frozen contract).
import {
  CHUNK_LIMIT,
  type ChunkMsg,
  type ErrorCode,
  type EventMsg,
  type ReplyMsg,
  type RequestMsg,
  type WireMsg,
} from '../../../shared/protocol.ts';

/** Error carrying a protocol error code; the CLI prints it as {error:{code,message}}. */
export class CliError extends Error {
  readonly code: ErrorCode;
  /** Set when EXEC_JS --undo-group rolled the script's changes back (WireError.rolledBack). */
  readonly rolledBack?: boolean;
  /**
   * Concurrency & jobs (backlog 1.1+2.6+4.3) — set on an E_TIMEOUT once the broker has
   * confirmed the request became a job (a JOB_STATE was seen before the timeout fired).
   * The one signal `runWithWarmRetry` needs to stop retrying a timeout: the CLI never
   * re-dispatches once a job exists, because the job survives and its result is
   * retrievable (`figma-agent job <id>`) — retrying would double-dispatch instead.
   */
  readonly jobId?: string;
  constructor(code: ErrorCode, message: string, opts?: { rolledBack?: boolean; jobId?: string }) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    if (opts?.rolledBack) this.rolledBack = opts.rolledBack;
    if (opts?.jobId !== undefined) this.jobId = opts.jobId;
  }
}

/** ws 'message' payloads arrive as Buffer | ArrayBuffer | Buffer[] — normalize to utf8 text. */
export function rawToString(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw as Buffer[]).toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return (raw as Buffer).toString('utf8');
}

export function parseWireMsg(text: string): WireMsg | null {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === 'object' ? (value as WireMsg) : null;
  } catch {
    return null;
  }
}

// ── Type guards (check most-specific shape first at call sites) ─────
export function isChunkMsg(m: WireMsg): m is ChunkMsg {
  const c = m as ChunkMsg;
  return typeof c.id === 'string' && typeof c.seq === 'number' && typeof c.chunk === 'string';
}

export function isReplyMsg(m: WireMsg): m is ReplyMsg {
  const r = m as ReplyMsg;
  return typeof r.id === 'string' && typeof (r as { ok?: unknown }).ok === 'boolean';
}

export function isRequestMsg(m: WireMsg): m is RequestMsg {
  const r = m as RequestMsg;
  return typeof r.id === 'string' && typeof r.cmd === 'string';
}

export function isEventMsg(m: WireMsg): m is EventMsg {
  return typeof (m as EventMsg).type === 'string' && !('id' in m);
}

/** Minimal structural socket type so both ws server-side and client sockets fit. */
interface Sendable {
  send(data: string): void;
}

/**
 * Send a wire message, splitting into {id,seq,last,chunk} frames when the
 * serialized form exceeds CHUNK_LIMIT (both directions per protocol §2).
 */
export function sendWireMsg(ws: Sendable, msg: RequestMsg | ReplyMsg | EventMsg): void {
  const full = JSON.stringify(msg);
  if (full.length <= CHUNK_LIMIT || !('id' in msg)) {
    ws.send(full);
    return;
  }
  const totalChunks = Math.ceil(full.length / CHUNK_LIMIT);
  for (let seq = 0; seq < totalChunks; seq++) {
    const frame: ChunkMsg = {
      id: msg.id,
      seq,
      last: seq === totalChunks - 1,
      chunk: full.slice(seq * CHUNK_LIMIT, (seq + 1) * CHUNK_LIMIT),
    };
    ws.send(JSON.stringify(frame));
  }
}

/**
 * Reassembles chunked messages by id. WS frames are TCP-ordered, so the
 * `last` frame arrives last; missing frames at that point → E_CHUNK_LOST.
 */
export class ChunkAssembler {
  private readonly parts = new Map<string, { chunks: string[]; received: number }>();

  /** Returns the fully reassembled message when `last` arrives, else null. */
  accept(msg: ChunkMsg): WireMsg | null {
    let entry = this.parts.get(msg.id);
    if (!entry) {
      entry = { chunks: [], received: 0 };
      this.parts.set(msg.id, entry);
    }
    if (entry.chunks[msg.seq] === undefined) entry.received++;
    entry.chunks[msg.seq] = msg.chunk;
    if (!msg.last) return null;

    this.parts.delete(msg.id);
    const total = msg.seq + 1;
    if (entry.received !== total) {
      throw new CliError('E_CHUNK_LOST', `chunked message ${msg.id}: received ${entry.received}/${total} frames`);
    }
    const parsed = parseWireMsg(entry.chunks.join(''));
    if (!parsed) {
      throw new CliError('E_CHUNK_LOST', `chunked message ${msg.id}: reassembled JSON is invalid`);
    }
    return parsed;
  }
}

/**
 * Concurrency & jobs (backlog 1.1+2.6+4.3), stage-4 fold — a CLI-originated chunked
 * request's frames are buffered (broker-daemon.ts's `admitChunk`) until `last` arrives;
 * a CLI that dies mid-send must not leak that buffer forever. Pure: given each entry's
 * `lastFrameAt` and `now`, which ids are abandoned (no frame in over `boundMs`) — the
 * caller (the SAME park-sweeper interval, no new timer) does the actual `Map.delete`.
 * A still-in-progress send keeps refreshing `lastFrameAt` on every frame and survives.
 */
export function abandonedChunkIds(
  pendingChunks: ReadonlyMap<string, { lastFrameAt: number }>,
  now: number,
  boundMs: number,
): string[] {
  const ids: string[] = [];
  for (const [id, entry] of pendingChunks) {
    if (now - entry.lastFrameAt > boundMs) ids.push(id);
  }
  return ids;
}

/**
 * Stage-4 fix round (minor 6) — chunk buffering keyed per CONNECTION (the socket in
 * hand), not by the process-unique request id alone. Request ids are `c_<counter>_<ts>`,
 * unique only WITHIN one CLI process — two simultaneous CLI processes could in principle
 * mint the same id, and a flat `Map<string, ...>` keyed by that id alone would let their
 * chunk payloads merge into one garbled reassembly. `Conn` is a type param (a real
 * WebSocket in the broker, anything with reference identity in a test) so this stays
 * pure and testable without a socket.
 */
export type ChunkBuffers<Conn> = Map<Conn, Map<string, { frames: string[]; lastFrameAt: number }>>;

/** Get-or-create the per-connection inner buffer map. */
export function getConnectionChunks<Conn>(
  buffers: ChunkBuffers<Conn>,
  conn: Conn,
): Map<string, { frames: string[]; lastFrameAt: number }> {
  let inner = buffers.get(conn);
  if (!inner) {
    inner = new Map();
    buffers.set(conn, inner);
  }
  return inner;
}

/** Drop one id's buffer (fully reassembled, or explicitly abandoned) — and drop the
 *  connection's own outer entry once it has nothing buffered left, so a closed
 *  connection never leaves an empty inner Map sitting in the outer table forever. */
export function deleteConnectionChunk<Conn>(buffers: ChunkBuffers<Conn>, conn: Conn, id: string): void {
  const inner = buffers.get(conn);
  if (!inner) return;
  inner.delete(id);
  if (inner.size === 0) buffers.delete(conn);
}

/** Sweep EVERY connection's own buffer for abandoned entries (reusing `abandonedChunkIds`
 *  per inner map), then prune any connection left holding nothing. */
export function sweepAbandonedChunks<Conn>(buffers: ChunkBuffers<Conn>, now: number, boundMs: number): void {
  for (const [conn, inner] of buffers) {
    for (const id of abandonedChunkIds(inner, now, boundMs)) inner.delete(id);
    if (inner.size === 0) buffers.delete(conn);
  }
}
