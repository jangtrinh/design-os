// Concurrency & jobs (backlog 1.1+2.6+4.3), phase 01 §2 — the job table.
// Pure: an injected clock (and jobId minter) makes TTL/cap eviction deterministic
// without a socket or a real timer.
import { describe, expect, it } from 'vitest';
import {
  JobTable, JOB_TTL_MS, JOB_FINISHED_CAP, JOB_FRAME_BYTES_CAP,
  type CreateJobInput,
} from '../cli/src/transport/job-table.ts';

function clock(startAt = 0): { now: () => number; advance: (ms: number) => void } {
  let t = startAt;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

function input(over: Partial<CreateJobInput> = {}): CreateJobInput {
  return {
    requestId: 'r1', cmd: 'EXEC_JS', fileSlug: 'fileA', readOnly: false,
    requestFrames: ['{"id":"r1"}'], from: null, targetInstanceId: 'p1',
    ...over,
  };
}

describe('JobTable — ids', () => {
  it('mints broker-unique jobIds (j_<counter>_<ts>), never reusing a request id', () => {
    const t = new JobTable();
    const a = t.create(input({ requestId: 'r1' }));
    const b = t.create(input({ requestId: 'r2' }));
    expect(a.jobId).not.toBe(b.jobId);
    expect(a.jobId).toMatch(/^j_\d+_\d+$/);
  });
});

describe('JobTable — byId: three distinct answers', () => {
  it('a finished job is retrievable until JOB_TTL_MS, then answers "expired" (not "unknown")', () => {
    const c = clock();
    const t = new JobTable(c.now);
    const rec = t.create(input());
    t.finish(rec.jobId, true, ['{"ok":true}']);
    expect(t.byId(rec.jobId)).not.toBe('unknown');
    expect(t.byId(rec.jobId)).not.toBe('expired');

    c.advance(JOB_TTL_MS - 1);
    t.sweep();
    expect(t.byId(rec.jobId)).not.toBe('expired'); // still inside the TTL

    c.advance(2);
    t.sweep();
    expect(t.byId(rec.jobId)).toBe('expired');
  });

  it('an id that never existed answers "unknown" — the two codes must not collapse', () => {
    const t = new JobTable();
    expect(t.byId('j_does_not_exist')).toBe('unknown');
  });

  it('a queued/running job is never evicted, TTL or otherwise', () => {
    const c = clock();
    const t = new JobTable(c.now);
    const rec = t.create(input());
    c.advance(JOB_TTL_MS * 10);
    t.sweep();
    const found = t.byId(rec.jobId);
    expect(found).not.toBe('unknown');
    expect(found).not.toBe('expired');
    expect((found as { state: string }).state).toBe('queued');
  });
});

describe('JobTable — the finished cap', () => {
  it('evicts the oldest FINISHED job past JOB_FINISHED_CAP, even inside its TTL', () => {
    const t = new JobTable();
    const ids: string[] = [];
    for (let i = 0; i < JOB_FINISHED_CAP + 5; i++) {
      const rec = t.create(input({ requestId: `r${i}` }));
      t.finish(rec.jobId, true, ['{}']);
      ids.push(rec.jobId);
    }
    // The oldest 5 are evicted (still fresh — the cap is hard, not TTL-gated).
    for (let i = 0; i < 5; i++) expect(t.byId(ids[i]!)).toBe('expired');
    // The newest JOB_FINISHED_CAP survive.
    expect(t.byId(ids[ids.length - 1]!)).not.toBe('expired');
  });

  it('never evicts a queued or running job to enforce the cap', () => {
    const t = new JobTable();
    const running = t.create(input({ requestId: 'keep-me' }));
    t.markRunning(running.jobId);
    for (let i = 0; i < JOB_FINISHED_CAP + 20; i++) {
      const rec = t.create(input({ requestId: `r${i}` }));
      t.finish(rec.jobId, true, ['{}']);
    }
    const found = t.byId(running.jobId);
    expect(found).not.toBe('unknown');
    expect(found).not.toBe('expired');
    expect((found as { state: string }).state).toBe('running');
  });
});

describe('JobTable — the byte budget', () => {
  it('drops the OLDEST finished records\' held frames first once over budget, marking resultDropped', () => {
    const t = new JobTable();
    const big = 'x'.repeat(Math.ceil(JOB_FRAME_BYTES_CAP / 2) + 1024);
    const first = t.create(input({ requestId: 'r1' }));
    t.finish(first.jobId, true, [big]);
    const second = t.create(input({ requestId: 'r2' }));
    t.finish(second.jobId, true, [big]); // pushes the table over JOB_FRAME_BYTES_CAP

    const firstRec = t.byId(first.jobId) as { resultDropped?: boolean; replyFrames: string[] };
    expect(firstRec.resultDropped).toBe(true);
    expect(firstRec.replyFrames).toEqual([]);
    // The record's metadata (state/jobId) survives even though its frames were shed.
    expect(t.byId(first.jobId)).not.toBe('unknown');
  });
});

describe('JobTable — cancelQueued', () => {
  it('cancels a QUEUED job', () => {
    const t = new JobTable();
    const rec = t.create(input());
    const r = t.cancelQueued(rec.jobId);
    expect(r.ok).toBe(true);
    expect((t.byId(rec.jobId) as { state: string }).state).toBe('cancelled');
  });

  it('refuses a RUNNING job, naming the sandbox reason', () => {
    const t = new JobTable();
    const rec = t.create(input());
    t.markRunning(rec.jobId);
    const r = t.cancelQueued(rec.jobId);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/sandbox/i);
    expect((t.byId(rec.jobId) as { state: string }).state).toBe('running'); // untouched
  });

  it('refuses an unknown id', () => {
    const t = new JobTable();
    expect(t.cancelQueued('nope').ok).toBe(false);
  });
});

describe('JobTable — summaryFor (per-file view for `status`)', () => {
  it('counts only the named file\'s queue, and reports the job the CALLER says is running', () => {
    const t = new JobTable();
    const a = t.create(input({ requestId: 'a', fileSlug: 'fileA' }));
    t.markRunning(a.jobId);
    t.create(input({ requestId: 'b', fileSlug: 'fileA' })); // queued
    t.create(input({ requestId: 'c', fileSlug: 'fileA' })); // queued
    t.create(input({ requestId: 'd', fileSlug: 'fileB' })); // a different file entirely

    const summaryA = t.summaryFor('fileA', a.jobId);
    expect(summaryA.running?.jobId).toBe(a.jobId);
    expect(summaryA.queueDepth).toBe(2);

    const summaryB = t.summaryFor('fileB', null);
    expect(summaryB.running).toBeNull();
    expect(summaryB.queueDepth).toBe(1);

    const summaryIdle = t.summaryFor('fileC', null);
    expect(summaryIdle.running).toBeNull();
    expect(summaryIdle.queueDepth).toBe(0);
  });

  it('a watchdog-timed-out job (state now "failed") still reports as running when the CALLER\'s queue pointer says so', () => {
    // Phase 01's watchdog marks a stalled job failed() FOR REPORTING while the file's
    // mutation slot stays blocked on purpose — summaryFor must trust the caller's own
    // queue pointer, never re-derive "is it running" from the record's own state.
    const t = new JobTable();
    const a = t.create(input({ requestId: 'a', fileSlug: 'fileA' }));
    t.markRunning(a.jobId);
    t.finish(a.jobId, false, ['{}']); // watchdog: now "failed", but still THE blocking job

    const summary = t.summaryFor('fileA', a.jobId);
    expect(summary.running?.jobId).toBe(a.jobId);
    expect(summary.running?.state).toBe('failed');
  });
});

describe('JobTable — markRunning / finish', () => {
  it('markRunning stamps startedAt and clears queuePosition', () => {
    const c = clock(1000);
    const t = new JobTable(c.now);
    const rec = t.create(input());
    rec.queuePosition = 1;
    t.markRunning(rec.jobId);
    const found = t.byId(rec.jobId) as { state: string; startedAt?: number; queuePosition?: number };
    expect(found.state).toBe('running');
    expect(found.startedAt).toBe(1000);
    expect(found.queuePosition).toBeUndefined();
  });

  it('finish stores every reply frame verbatim and in order', () => {
    const t = new JobTable();
    const rec = t.create(input());
    t.finish(rec.jobId, true, ['{"seq":0}', '{"seq":1}']);
    const found = t.byId(rec.jobId) as { replyFrames: string[]; state: string };
    expect(found.replyFrames).toEqual(['{"seq":0}', '{"seq":1}']);
    expect(found.state).toBe('done');
  });

  it('a failed finish records state "failed", not "done"', () => {
    const t = new JobTable();
    const rec = t.create(input());
    t.finish(rec.jobId, false, ['{"ok":false}']);
    expect((t.byId(rec.jobId) as { state: string }).state).toBe('failed');
  });

  // Stage-4 fix round (MAJOR 4) — a late reply (watchdog already marked the job
  // failed(E_TIMEOUT) for reporting, or it was force-released) must never flip a
  // TERMINAL record's state or pollute its `replyFrames` with a second, contradicting
  // answer — a poll must keep returning the FIRST (already-reported) outcome.
  describe('finish — a terminal record ignores a second finish() (MAJOR 4)', () => {
    it('a job finished twice keeps its FIRST state and replyFrames — the second call is a no-op for the live record', () => {
      const t = new JobTable();
      const rec = t.create(input());
      t.finish(rec.jobId, false, ['{"first":true}']); // e.g. the watchdog's timeout report
      t.finish(rec.jobId, true, ['{"second":true}']); // the real (late) reply arrives after
      const found = t.byId(rec.jobId) as { state: string; replyFrames: string[] };
      expect(found.state).toBe('failed'); // NOT flipped to "done" by the late reply
      expect(found.replyFrames).toEqual(['{"first":true}']); // NOT overwritten
    });

    it('the late frame is DISCARDED entirely — never stored, only counted (closing round R1+R2)', () => {
      const t = new JobTable();
      const rec = t.create(input());
      t.finish(rec.jobId, false, ['{"first":true}']);
      t.finish(rec.jobId, true, ['{"second":true}']);
      const found = t.byId(rec.jobId) as { replyFrames: string[]; lateReplyCount?: number };
      expect(found.lateReplyCount).toBe(1);
      expect(found.replyFrames).not.toContain('{"second":true}');
      expect(found).not.toHaveProperty('lateReplyFrames'); // no payload ever stored
    });

    it('multiple late replies all increment lateReplyCount, never storing any payload', () => {
      const t = new JobTable();
      const rec = t.create(input());
      t.finish(rec.jobId, false, ['{"first":true}']);
      t.finish(rec.jobId, true, ['{"late-1":true}']);
      t.finish(rec.jobId, true, ['{"late-2":true}']);
      const found = t.byId(rec.jobId) as { lateReplyCount?: number };
      expect(found.lateReplyCount).toBe(2);
    });

    it('a cancelled (terminal) job also ignores a late finish()', () => {
      const t = new JobTable();
      const rec = t.create(input());
      t.cancelQueued(rec.jobId);
      t.finish(rec.jobId, true, ['{"late":true}']);
      const found = t.byId(rec.jobId) as { state: string; replyFrames: string[]; lateReplyCount?: number };
      expect(found.state).toBe('cancelled');
      expect(found.replyFrames).toEqual([]); // cancelQueued never set a real reply
      expect(found.lateReplyCount).toBe(1);
    });

    it('does NOT double-count the finished-cap bookkeeping (a late finish never re-pushes finishedOrder)', () => {
      // Verified indirectly: finishing the SAME job JOB_FINISHED_CAP+1 times must not
      // evict anything else early — if the late finish re-pushed to finishedOrder, the
      // cap would trigger on this one job's own repeated (phantom) entries.
      const t = new JobTable();
      const rec = t.create(input({ requestId: 'r0' }));
      t.finish(rec.jobId, false, ['{}']);
      for (let i = 0; i < 250; i++) t.finish(rec.jobId, true, [`{"late":${i}}`]); // all late, all ignored
      const other = t.create(input({ requestId: 'r1' }));
      t.finish(other.jobId, true, ['{}']);
      expect(t.byId(other.jobId)).not.toBe('expired'); // not wrongly evicted by phantom cap pressure
    });
  });
});

describe('JobTable — byRequestId', () => {
  it('finds a job by its request id (the join routeFromPlugin uses)', () => {
    const t = new JobTable();
    const rec = t.create(input({ requestId: 'find-me' }));
    expect(t.byRequestId('find-me')?.jobId).toBe(rec.jobId);
    expect(t.byRequestId('nope')).toBeUndefined();
  });
});

describe('JobTable — summaryFor is wire-safe', () => {
  it('the running JobInfo never carries the record\'s own `from` socket (JSON.stringify-able)', () => {
    const t = new JobTable();
    const fakeWs = { readyState: 1 } as unknown as import('ws').default;
    const rec = t.create(input({ requestId: 'r1', from: fakeWs }));
    t.markRunning(rec.jobId);
    const { running } = t.summaryFor('fileA', rec.jobId);
    expect(running).not.toBeNull();
    expect('from' in (running as object)).toBe(false);
    expect(() => JSON.stringify(running)).not.toThrow();
  });
});

describe('JobTable — runningJobs (the watchdog\'s sweep target)', () => {
  it('returns only RUNNING jobs, across every file', () => {
    const t = new JobTable();
    const a = t.create(input({ requestId: 'a', fileSlug: 'fileA' }));
    t.markRunning(a.jobId);
    t.create(input({ requestId: 'b', fileSlug: 'fileB' })); // queued, not running
    const c = t.create(input({ requestId: 'c', fileSlug: 'fileB' }));
    t.finish(c.jobId, true, ['{}']); // done, not running

    const running = t.runningJobs();
    expect(running.map((r) => r.jobId)).toEqual([a.jobId]);
  });
});

describe('JobTable — list (`figma-agent job --list`, phase 02 §2)', () => {
  it('newest first, across every state', () => {
    const c = clock();
    const t = new JobTable(c.now);
    const a = t.create(input({ requestId: 'a' })); c.advance(10);
    const b = t.create(input({ requestId: 'b' })); c.advance(10);
    const cc = t.create(input({ requestId: 'c' }));
    expect(t.list().map((j) => j.jobId)).toEqual([cc.jobId, b.jobId, a.jobId]);
  });

  it('filters to one file when a fileSlug is given', () => {
    const t = new JobTable();
    const a = t.create(input({ requestId: 'a', fileSlug: 'fileA' }));
    t.create(input({ requestId: 'b', fileSlug: 'fileB' }));
    expect(t.list('fileA').map((j) => j.jobId)).toEqual([a.jobId]);
  });

  it('is wire-safe — no entry carries a `from` socket field', () => {
    const t = new JobTable();
    t.create(input({ requestId: 'a' }));
    for (const job of t.list()) expect('from' in job).toBe(false);
  });
});
