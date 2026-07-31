// Concurrency & jobs (backlog 1.1+2.6+4.3), phase 02 §1 — the CLI learns its jobId
// BEFORE it can time out. `exchange()` is exported specifically so this wiring is
// testable with a fake socket (EventEmitter + a stubbed `send`) — no live broker needed.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { exchange } from '../cli/src/transport/broker-client.ts';
import { CliError } from '../cli/src/transport/protocol-helpers.ts';
import type { JobInfo } from '../shared/protocol.ts';

/** The minimal surface `exchange` touches: EventEmitter (on/emit) + a stubbed `send`. */
function fakeWs(): EventEmitter & { send: (text: string) => void; sent: string[] } {
  const emitter = new EventEmitter() as EventEmitter & { send: (text: string) => void; sent: string[] };
  emitter.sent = [];
  emitter.send = (text: string) => { emitter.sent.push(text); };
  return emitter;
}

function jobStateEvent(job: Partial<JobInfo> & { jobId: string }): string {
  return JSON.stringify({ type: 'JOB_STATE', data: job });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('exchange — timeout after a JOB_STATE was seen', () => {
  it('carries the jobId and the exact follow-up command in the message', async () => {
    const ws = fakeWs();
    const promise = exchange(ws, 'EXEC_JS', {}, 5_000, 'Run script');
    // Swallow the unhandled-rejection warning until we actually await below.
    promise.catch(() => { /* asserted via rejects below */ });

    ws.emit('message', Buffer.from(jobStateEvent({ jobId: 'j_7_123', state: 'queued', cmd: 'EXEC_JS', fileSlug: 'fileA' })));
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(promise).rejects.toMatchObject({
      code: 'E_TIMEOUT',
      jobId: 'j_7_123',
      message: expect.stringContaining('figma-agent job j_7_123 --wait'),
    });
  });

  it('never re-dispatches — exchange only ever sends the ORIGINAL request frame once', async () => {
    const ws = fakeWs();
    const promise = exchange(ws, 'EXEC_JS', {}, 5_000);
    promise.catch(() => { /* asserted below */ });
    ws.emit('message', Buffer.from(jobStateEvent({ jobId: 'j_1_1', state: 'running', cmd: 'EXEC_JS', fileSlug: 'fileA' })));
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(promise).rejects.toThrow();
    expect(ws.sent).toHaveLength(1); // the original request — nothing sent again on timeout
  });
});

describe('exchange — timeout with NO JOB_STATE seen (older broker)', () => {
  it('falls back to the plain message, with no jobId', async () => {
    const ws = fakeWs();
    const promise = exchange(ws, 'EXEC_JS', {}, 5_000);
    promise.catch(() => { /* asserted below */ });
    await vi.advanceTimersByTimeAsync(5_000);
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).code).toBe('E_TIMEOUT');
    expect((err as CliError).jobId).toBeUndefined();
    expect((err as CliError).message).toBe('EXEC_JS timed out after 5000ms');
  });
});

describe('exchange — JOB_STATE does not settle the promise on its own', () => {
  it('a JOB_STATE keeps the request waiting; the real reply still resolves it', async () => {
    const ws = fakeWs();
    const promise = exchange(ws, 'STATUS', {}, 5_000);
    ws.emit('message', Buffer.from(jobStateEvent({ jobId: 'j_2_2', state: 'running', cmd: 'STATUS', fileSlug: 'fileA' })));
    // The reply carries the SAME request id `exchange` minted — read it back from what was sent.
    const sentId = (JSON.parse(ws.sent[0]!) as { id: string }).id;
    ws.emit('message', Buffer.from(JSON.stringify({ id: sentId, ok: true, result: { ok: true } })));
    await expect(promise).resolves.toEqual({ ok: true });
  });
});
