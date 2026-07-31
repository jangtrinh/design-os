// Concurrency & jobs (backlog 1.1+2.6+4.3), phase 02 §2 — `figma-agent job`'s own pure
// logic: unwrapping a finished job's stored reply, formatting a poll, and the `--wait`
// cadence/timeout composition (injected poll/wait so no live broker is needed).
import { describe, expect, it, vi } from 'vitest';
import { formatPoll, isTerminal, unwrapResult, waitForJob, type PollReply } from '../cli/src/commands/job.ts';
import { CliError } from '../cli/src/transport/protocol-helpers.ts';
import type { JobInfo } from '../shared/protocol.ts';

function jobInfo(over: Partial<JobInfo> & { state: JobInfo['state'] }): JobInfo {
  return { jobId: 'j_1_1', cmd: 'EXEC_JS', fileSlug: 'fileA', ...over };
}

describe('isTerminal', () => {
  it('done/failed/cancelled are terminal; queued/running are not', () => {
    expect(isTerminal('done')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('queued')).toBe(false);
    expect(isTerminal('running')).toBe(false);
  });
});

describe('unwrapResult', () => {
  it('a single-frame success reply unwraps to {ok:true, result}', () => {
    const frames = [JSON.stringify({ id: 'r1', ok: true, result: { fileName: 'X' } })];
    expect(unwrapResult(frames)).toEqual({ ok: true, result: { fileName: 'X' }, error: undefined });
  });

  it('a single-frame failure reply unwraps to {ok:false, error}', () => {
    const frames = [JSON.stringify({ id: 'r1', ok: false, error: { code: 'E_EVAL', message: 'boom' } })];
    expect(unwrapResult(frames)).toEqual({ ok: false, result: undefined, error: { code: 'E_EVAL', message: 'boom' } });
  });

  it('no frames at all → a stated E_PLUGIN_ERROR, never a silent empty result', () => {
    expect(unwrapResult([])).toEqual({ ok: false, error: { code: 'E_PLUGIN_ERROR', message: 'job finished with no stored reply' } });
  });

  it('an unparseable single frame throws, never fabricates a result', () => {
    expect(() => unwrapResult(['{not valid json'])).toThrow(CliError);
  });
});

describe('formatPoll — resultDropped (stage-4 fix round, minor 5)', () => {
  it('prints WHY the result is missing (byte-budget dropped) instead of the generic no-stored-reply line', () => {
    const reply: PollReply = { job: jobInfo({ state: 'done' }), resultFrames: [], resultDropped: true };
    const out = formatPoll(reply) as { error: { message: string } };
    expect(out.error.message).toContain('byte budget');
    expect(out.error.message).not.toBe('job finished with no stored reply'); // the generic line minor 5 replaces
  });

  it('a normal finished job (resultDropped absent) still unwraps its real result', () => {
    const reply: PollReply = {
      job: jobInfo({ state: 'done' }),
      resultFrames: [JSON.stringify({ id: 'r1', ok: true, result: 'x' })],
    };
    expect(formatPoll(reply)).toEqual({ job: reply.job, result: 'x' });
  });
});

describe('formatPoll — lateReplyCount (closing round, R1+R2 unified)', () => {
  it('a late reply count merges onto a normal successful result, never overriding the outcome', () => {
    const reply: PollReply = {
      job: jobInfo({ state: 'done' }),
      resultFrames: [JSON.stringify({ id: 'r1', ok: true, result: 'x' })],
      lateReplyCount: 2,
    };
    const out = formatPoll(reply) as { result: string; lateReplyCount: number; lateReplyWarning: string };
    expect(out.result).toBe('x'); // the FIRST, already-reported outcome — unchanged
    expect(out.lateReplyCount).toBe(2);
    expect(out.lateReplyWarning).toBe('2 late reply frame(s) arrived after the job was finalized and were discarded');
  });

  it('absent or zero lateReplyCount adds nothing to the reply shape', () => {
    const reply: PollReply = {
      job: jobInfo({ state: 'done' }),
      resultFrames: [JSON.stringify({ id: 'r1', ok: true, result: 'x' })],
    };
    expect(formatPoll(reply)).toEqual({ job: reply.job, result: 'x' });
    expect(formatPoll({ ...reply, lateReplyCount: 0 })).toEqual({ job: reply.job, result: 'x' });
  });

  it('merges onto a resultDropped reply too', () => {
    const reply: PollReply = { job: jobInfo({ state: 'failed' }), resultFrames: [], resultDropped: true, lateReplyCount: 1 };
    const out = formatPoll(reply) as { error: { message: string }; lateReplyCount: number };
    expect(out.error.message).toContain('byte budget');
    expect(out.lateReplyCount).toBe(1);
  });
});

describe('formatPoll', () => {
  it('a live (queued/running) job never carries result/error, just {job}', () => {
    expect(formatPoll({ job: jobInfo({ state: 'running' }) })).toEqual({ job: jobInfo({ state: 'running' }) });
  });

  it('a terminal job with no resultFrames still just reports {job} (defensive)', () => {
    expect(formatPoll({ job: jobInfo({ state: 'done' }) })).toEqual({ job: jobInfo({ state: 'done' }) });
  });

  it('a finished success unwraps to {job, result}', () => {
    const reply: PollReply = {
      job: jobInfo({ state: 'done' }),
      resultFrames: [JSON.stringify({ id: 'r1', ok: true, result: { n: 42 } })],
    };
    expect(formatPoll(reply)).toEqual({ job: reply.job, result: { n: 42 } });
  });

  it('a finished failure unwraps to {job, error}, never printed as a success', () => {
    const reply: PollReply = {
      job: jobInfo({ state: 'failed' }),
      resultFrames: [JSON.stringify({ id: 'r1', ok: false, error: { code: 'E_EVAL', message: 'script stopped' } })],
    };
    expect(formatPoll(reply)).toEqual({ job: reply.job, error: { code: 'E_EVAL', message: 'script stopped' } });
  });
});

describe('waitForJob — cadence + timeout composition (injected poll/wait, no live broker)', () => {
  it('returns immediately once the job reaches a terminal state', async () => {
    const poll = vi.fn(async (): Promise<PollReply> => ({
      job: jobInfo({ state: 'done' }),
      resultFrames: [JSON.stringify({ id: 'r1', ok: true, result: 'x' })],
    }));
    const wait = vi.fn(async () => {});
    const out = await waitForJob('j_1_1', 60_000, poll, wait);
    expect(out).toEqual({ job: jobInfo({ state: 'done' }), result: 'x' });
    expect(wait).not.toHaveBeenCalled(); // done on the FIRST poll — never slept at all
  });

  it('polls repeatedly while running, then resolves once terminal', async () => {
    let calls = 0;
    const poll = vi.fn(async (): Promise<PollReply> => {
      calls++;
      if (calls < 3) return { job: jobInfo({ state: 'running' }) };
      return { job: jobInfo({ state: 'done' }), resultFrames: [JSON.stringify({ id: 'r1', ok: true, result: 'y' })] };
    });
    const wait = vi.fn(async () => {});
    const out = await waitForJob('j_1_1', 60_000, poll, wait);
    expect(poll).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2); // slept between poll 1→2 and 2→3, never after the terminal one
    expect(out).toEqual({ job: jobInfo({ state: 'done' }), result: 'y' });
  });

  it('its own timeout prints the STILL-RUNNING shape — never an error implying failure', async () => {
    const realNow = Date.now;
    let t = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => t);
    try {
      const poll = vi.fn(async (): Promise<PollReply> => ({ job: jobInfo({ state: 'running' }) }));
      const wait = vi.fn(async () => { t += 100_000; }); // jump straight past the wait-timeout
      const out = await waitForJob('j_1_1', 5_000, poll, wait);
      expect(out).toMatchObject({
        job: jobInfo({ state: 'running' }),
        waiting: true,
        message: expect.stringContaining('figma-agent job j_1_1 --wait'),
      });
      // Never shaped like an error — no `error`/`ok:false` field anywhere in the output.
      expect(out).not.toHaveProperty('error');
      expect(out).not.toHaveProperty('ok');
    } finally {
      Date.now = realNow;
    }
  });
});
