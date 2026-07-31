// Concurrency & jobs (backlog 1.1+2.6+4.3), phase 01 §3 — the per-file FIFO mutation queue.
import { describe, expect, it } from 'vitest';
import {
  complete, completeSkippingStale, emptyQueue, enqueue, queuePosition, remove, type QueueState,
} from '../cli/src/transport/file-queue.ts';

describe('enqueue', () => {
  it('starts immediately when nothing is running', () => {
    const { q, startNow } = enqueue(emptyQueue(), 'job-a');
    expect(startNow).toBe(true);
    expect(q.running).toBe('job-a');
    expect(q.waiting).toEqual([]);
  });

  it('queues behind the running job, preserving FIFO order across several arrivals', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    let r = enqueue(q, 'job-b'); q = r.q;
    expect(r.startNow).toBe(false);
    r = enqueue(q, 'job-c'); q = r.q;
    expect(r.startNow).toBe(false);
    expect(q.running).toBe('job-a');
    expect(q.waiting).toEqual(['job-b', 'job-c']); // FIFO — arrival order preserved
  });
});

describe('complete', () => {
  it('advances to the next waiting job, in FIFO order', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    ({ q } = enqueue(q, 'job-b'));
    ({ q } = enqueue(q, 'job-c'));
    const r = complete(q, 'job-a');
    expect(r.next).toBe('job-b');
    expect(r.q.running).toBe('job-b');
    expect(r.q.waiting).toEqual(['job-c']);
  });

  it('reports next: null when nothing is waiting', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    const r = complete(q, 'job-a');
    expect(r.next).toBeNull();
    expect(r.q.running).toBeNull();
  });

  it('completing a job that is not the running one is a no-op', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    ({ q } = enqueue(q, 'job-b'));
    const r = complete(q, 'job-unknown');
    expect(r.next).toBeNull();
    expect(r.q).toEqual(q); // untouched
  });
});

describe('completeSkippingStale — stage-4 BLOCKER 1: never resurrect a cancelled/failed queued entry', () => {
  it('reproduces the bug with plain complete(): a stale (invalid) entry comes back as `next`', () => {
    // This is the DEFECT itself, proven with today's plain complete() — B still gets
    // popped even though it was already cancelled while queued (marked invalid here).
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    ({ q } = enqueue(q, 'job-b')); // will be "cancelled" — but plain complete() doesn't know that
    const r = complete(q, 'job-a');
    expect(r.next).toBe('job-b'); // the bug: B comes back even though it's no longer valid
  });

  it('skips a stale (cancelled) entry and dispatches the one after it', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    ({ q } = enqueue(q, 'job-b')); // cancelled while queued
    ({ q } = enqueue(q, 'job-c')); // still genuinely queued
    const isValid = (id: string): boolean => id !== 'job-b';
    const r = completeSkippingStale(q, 'job-a', isValid);
    expect(r.next).toBe('job-c'); // B skipped entirely — never dispatched
    expect(r.q.running).toBe('job-c');
    expect(r.q.waiting).toEqual([]);
  });

  it('skips MULTIPLE consecutive stale entries', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    ({ q } = enqueue(q, 'job-b')); // stale
    ({ q } = enqueue(q, 'job-c')); // stale
    ({ q } = enqueue(q, 'job-d')); // valid
    const isValid = (id: string): boolean => id === 'job-d';
    const r = completeSkippingStale(q, 'job-a', isValid);
    expect(r.next).toBe('job-d');
    expect(r.q.running).toBe('job-d');
  });

  it('every remaining entry stale → drains to an empty, idle queue (next: null)', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    ({ q } = enqueue(q, 'job-b'));
    ({ q } = enqueue(q, 'job-c'));
    const r = completeSkippingStale(q, 'job-a', () => false);
    expect(r.next).toBeNull();
    expect(r.q.running).toBeNull();
    expect(r.q.waiting).toEqual([]);
  });

  it('a valid first candidate dispatches immediately — behaves exactly like complete()', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    ({ q } = enqueue(q, 'job-b'));
    const r = completeSkippingStale(q, 'job-a', () => true);
    expect(r.next).toBe('job-b');
    expect(r.q.running).toBe('job-b');
  });

  it('completing an unknown/stale finishedJobId is still a no-op (delegates to complete()\'s own guard)', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    const r = completeSkippingStale(q, 'job-unknown', () => true);
    expect(r.next).toBeNull();
    expect(r.q).toEqual(q);
  });
});

describe('remove (cancel-queued)', () => {
  it('removes a queued job without disturbing the order of the rest', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    ({ q } = enqueue(q, 'job-b'));
    ({ q } = enqueue(q, 'job-c'));
    q = remove(q, 'job-b');
    expect(q.running).toBe('job-a');
    expect(q.waiting).toEqual(['job-c']);
  });

  it('never removes the RUNNING job — cancelling a running job is refused elsewhere', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    const untouched = remove(q, 'job-a'); // job-a is running, not waiting
    expect(untouched.running).toBe('job-a');
  });

  it('removing an unknown id is a no-op', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    expect(remove(q, 'nope')).toEqual(q);
  });
});

describe('queuePosition', () => {
  it('is 1-based for a waiting job, undefined for the running one or an absent one', () => {
    let q: QueueState = emptyQueue();
    ({ q } = enqueue(q, 'job-a'));
    ({ q } = enqueue(q, 'job-b'));
    ({ q } = enqueue(q, 'job-c'));
    expect(queuePosition(q, 'job-b')).toBe(1);
    expect(queuePosition(q, 'job-c')).toBe(2);
    expect(queuePosition(q, 'job-a')).toBeUndefined(); // running, not queued
    expect(queuePosition(q, 'nope')).toBeUndefined();
  });
});

describe('two file slugs are fully independent', () => {
  it('a queue for file A never affects file B\'s queue', () => {
    let qa: QueueState = emptyQueue();
    let qb: QueueState = emptyQueue();
    ({ q: qa } = enqueue(qa, 'a1'));
    ({ q: qa } = enqueue(qa, 'a2'));
    ({ q: qb } = enqueue(qb, 'b1'));
    expect(qa.running).toBe('a1');
    expect(qa.waiting).toEqual(['a2']);
    expect(qb.running).toBe('b1'); // both files' first job starts immediately — no cross-file wait
    expect(qb.waiting).toEqual([]);
  });
});

describe('a read never occupies `running` — enforced by the caller, verified by contract', () => {
  it('emptyQueue starts idle, and only enqueue (never called for a read) changes that', () => {
    const q = emptyQueue();
    expect(q.running).toBeNull();
    expect(q.waiting).toEqual([]);
  });
});
