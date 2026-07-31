// `figma-agent job` (concurrency & jobs, backlog 1.1+2.6+4.3, phase 02 §2) — poll, wait,
// cancel, list, or force-release a job the CLI stopped waiting for. The entire point of
// backlog 2.6: a CLI timeout no longer re-dispatches — `broker-client.ts`'s `exchange()`
// prints the jobId and this command's own follow-up on that timeout instead.
//
// Usage:
//   figma-agent job <jobId> [--wait] [--wait-timeout 60000]
//   figma-agent job --list [--file <name>]
//   figma-agent job <jobId> --cancel            (queued only)
//   figma-agent job <jobId> --force-release     (unblock a file a wedged script still holds)
import type { CommandArgs } from '../figma-agent.ts';
import type { JobInfo } from '../../../shared/protocol.ts';
import { CliError, ChunkAssembler, isChunkMsg, parseWireMsg } from '../transport/protocol-helpers.ts';
import { runCommand } from '../transport/broker-client.ts';

const DEFAULT_WAIT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PollReply {
  job: JobInfo;
  /** Present only once the job has reached a terminal state — the stored reply frames,
   *  verbatim and in order (a chunked reply arrives as many). */
  resultFrames?: string[];
  /** Stage-4 fix round (minor 5) — the job table's byte-budget eviction dropped this
   *  (finished) record's held frames to stay under its cap. `resultFrames` is then empty
   *  for a reason DIFFERENT from "no reply was ever stored" — `formatPoll` must say so. */
  resultDropped?: boolean;
  /** Closing round (R1+R2 unified) — present (and > 0) when one or more replies arrived
   *  AFTER this job was already finalized (a watchdog timeout report, a force-release, or
   *  a genuine prior finish) and were discarded rather than stored. The job's own
   *  state/result above is still the FIRST, already-reported outcome — this is purely
   *  informational, so the caller knows a late frame showed up. */
  lateReplyCount?: number;
}

export function isTerminal(state: JobInfo['state']): boolean {
  return state === 'done' || state === 'failed' || state === 'cancelled';
}

async function pollOnce(jobId: string): Promise<PollReply> {
  return (await runCommand('JOB', { mode: 'poll', jobId })) as PollReply;
}

/**
 * Reassemble a finished job's stored reply frames into the `{ok, result}` /
 * `{ok, error}` the ORIGINAL command would have printed — a chunked reply is
 * reassembled with the SAME `ChunkAssembler` every other consumer uses, never a
 * bespoke one-off parser for this call site.
 */
export function unwrapResult(frames: string[]): { ok: boolean; result?: unknown; error?: unknown } {
  if (frames.length === 0) {
    return { ok: false, error: { code: 'E_PLUGIN_ERROR', message: 'job finished with no stored reply' } };
  }
  let parsed: unknown;
  if (frames.length === 1) {
    try {
      parsed = JSON.parse(frames[0]!);
    } catch {
      throw new CliError('E_PLUGIN_ERROR', "the job's stored reply is not valid JSON");
    }
  } else {
    const assembler = new ChunkAssembler();
    let complete: unknown = null;
    for (const raw of frames) {
      const msg = parseWireMsg(raw);
      if (!msg || !isChunkMsg(msg)) throw new CliError('E_CHUNK_LOST', "the job's stored reply frames are not valid chunks");
      const done = assembler.accept(msg);
      if (done) complete = done;
    }
    parsed = complete;
  }
  const p = (parsed ?? {}) as { ok?: boolean; result?: unknown; error?: unknown };
  return { ok: p.ok === true, result: p.result, error: p.error };
}

/** The output for a poll — `{job}` while live, `{job, result}` / `{job, error}` once
 *  the job's own outcome is known. Unwraps the stored reply so the caller gets
 *  exactly what the original command would have printed, plus the job envelope. */
export function formatPoll(reply: PollReply): unknown {
  const { job, resultFrames, resultDropped, lateReplyCount } = reply;
  if (!isTerminal(job.state) || resultFrames === undefined) return { job };
  // Closing round (R1+R2 unified) — merged onto whichever shape below applies; a late
  // reply is orthogonal to the job's own (already-final) outcome, never overriding it.
  const lateNote = typeof lateReplyCount === 'number' && lateReplyCount > 0
    ? { lateReplyCount, lateReplyWarning: `${lateReplyCount} late reply frame(s) arrived after the job was finalized and were discarded` }
    : {};
  // Stage-4 fix round (minor 5) — a dropped result is a DIFFERENT fact from "no reply was
  // ever stored": the job's own success/failure state is still known (it reached a real
  // terminal state), only its OUTPUT was shed under the broker's byte budget. Say so,
  // rather than falling into unwrapResult's generic "no stored reply" message.
  if (resultDropped === true) {
    return {
      job,
      error: {
        code: 'E_PLUGIN_ERROR',
        message: "the job's result exceeded the broker's byte budget and was dropped — its own state (done/failed) is still accurate, but the output is gone",
      },
      ...lateNote,
    };
  }
  const { ok, result, error } = unwrapResult(resultFrames);
  return ok ? { job, result, ...lateNote } : { job, error, ...lateNote };
}

/**
 * `--wait` (opt-in): poll on a fixed cadence until the job reaches a terminal state or
 * `waitTimeoutMs` elapses. RULED: the primitive stays cheap (a bare poll never blocks);
 * `--wait` is the CLI composing repeated polls itself, never a held broker socket. Its
 * own timeout prints the SAME still-running shape a bare poll would — never an error
 * that implies failure. `poll`/`wait` are injection seams (real transport by default) so
 * the cadence/timeout logic is unit-testable without a live broker.
 */
export async function waitForJob(
  jobId: string,
  waitTimeoutMs: number,
  poll: (id: string) => Promise<PollReply> = pollOnce,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<unknown> {
  const deadline = Date.now() + waitTimeoutMs;
  for (;;) {
    const reply = await poll(jobId);
    if (isTerminal(reply.job.state)) return formatPoll(reply);
    if (Date.now() >= deadline) {
      return {
        job: reply.job,
        waiting: true,
        message: `still ${reply.job.state} after ${waitTimeoutMs}ms — poll again: figma-agent job ${jobId} --wait`,
      };
    }
    await wait(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
  }
}

export async function run(args: CommandArgs): Promise<unknown> {
  if (args.bool('list')) {
    const file = args.str('file');
    return runCommand('JOB', { mode: 'list', ...(file !== undefined && { file }) });
  }

  const jobId = args.positionals[0];
  if (!jobId) throw new CliError('E_INVALID_ARGS', 'job requires a <jobId> (or --list)');

  // `--cancel` is QUEUED-only: the plugin sandbox cannot interrupt a running `eval` — the
  // broker's own refusal reason states that plainly rather than promising a future flag.
  if (args.bool('cancel')) return runCommand('JOB', { mode: 'cancel', jobId });

  // The audited exit from a BLOCKED mutation slot (phase 01's watchdog leaves it held on
  // purpose) — never automatic.
  if (args.bool('force-release')) return runCommand('JOB', { mode: 'force-release', jobId });

  if (args.bool('wait')) {
    const waitTimeoutMs = args.num('wait-timeout') ?? DEFAULT_WAIT_TIMEOUT_MS;
    return waitForJob(jobId, waitTimeoutMs);
  }

  return formatPoll(await pollOnce(jobId));
}
