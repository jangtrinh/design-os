// Concurrency & jobs (backlog 1.1+2.6+4.3), phase 01 §3 — the per-file FIFO mutation
// queue. One `QueueState` per file slug (the identity chain routing + registry already
// established: fileKey → slugged fileName → 'unknown', see file-identity.ts). Pure: no
// socket, no JobTable reference — the daemon wires jobIds through it and does the actual
// dispatch/bookkeeping.
//
// A read-only request NEVER touches this module at all — classification (readOnly vs
// mutating) happens one layer up, in broker-daemon.ts's admission point, from the
// envelope alone (`readOnly === true`, or `cmd` in the implicit read set). This module
// only ever sees jobIds it has been told are mutating.
export interface QueueState {
  running: string | null;
  waiting: string[]; // jobIds, oldest first
}

export function emptyQueue(): QueueState {
  return { running: null, waiting: [] };
}

/** A mutating job arrives. `startNow` is true only when nothing is currently running for
 *  this file — the caller dispatches immediately in that case; otherwise the job stays
 *  `queued` and the raw frame held in the job record is what a later dequeue re-sends. */
export function enqueue(q: QueueState, jobId: string): { q: QueueState; startNow: boolean } {
  if (q.running === null) return { q: { running: jobId, waiting: q.waiting }, startNow: true };
  return { q: { running: q.running, waiting: [...q.waiting, jobId] }, startNow: false };
}

/**
 * The running job finished (or failed/was force-released) — pop the next waiting job, if
 * any. The caller is responsible for actually marking `next` running (`JobTable.markRunning`)
 * and dispatching its held frames; this function only advances the pure queue state.
 */
export function complete(q: QueueState, jobId: string): { q: QueueState; next: string | null } {
  if (q.running !== jobId) return { q, next: null }; // stale/unknown completion — no-op
  const [next, ...rest] = q.waiting;
  return { q: { running: next ?? null, waiting: rest }, next: next ?? null };
}

/**
 * Stage-4 fix round (BLOCKER 1) — like `complete`, but never resurrects a popped entry
 * the caller says is no longer valid to dispatch (`isValid` returns false — e.g. it was
 * cancelled via `job --cancel`, or already failed while still queued when its pinned
 * plugin disconnected). The bug this closes: `job --cancel` marking a record `cancelled`
 * does not by itself remove it from `waiting` (or a caller might forget to, on some other
 * path) — when the job ahead of it finishes, plain `complete` would pop and RESURRECT it
 * (`markRunning` + dispatch a job the caller was told would never run). Skipping treats
 * the stale pop as an immediate finish of ITS OWN and keeps draining, so the first
 * genuinely `queued` entry (or none) is what the caller actually dispatches. Pure —
 * `isValid` is injected so this stays a function of its own inputs, no JobTable reference.
 */
export function completeSkippingStale(
  q: QueueState,
  finishedJobId: string,
  isValid: (jobId: string) => boolean,
): { q: QueueState; next: string | null } {
  let current = q;
  let poppedFrom = finishedJobId;
  for (;;) {
    const { q: nextQ, next } = complete(current, poppedFrom);
    current = nextQ;
    if (next === null || isValid(next)) return { q: current, next };
    poppedFrom = next; // stale — treat as already finished, keep draining
  }
}

/**
 * Cancel-queued (`job <id> --cancel`): removes `jobId` from the WAITING list only. A no-op
 * if `jobId` is not there — including when it is the currently RUNNING job (a running job
 * cannot be cancelled; that refusal is enforced by `JobTable.cancelQueued`, and this
 * function must never advance the queue on its behalf, or a "refused" cancel would
 * silently start the next job anyway).
 */
export function remove(q: QueueState, jobId: string): QueueState {
  if (!q.waiting.includes(jobId)) return q;
  return { running: q.running, waiting: q.waiting.filter((id) => id !== jobId) };
}

/** 1-based position of `jobId` in the waiting list, or `undefined` if it is running or
 *  not present — the value `JobInfo.queuePosition` carries on `JOB_STATE`. */
export function queuePosition(q: QueueState, jobId: string): number | undefined {
  const idx = q.waiting.indexOf(jobId);
  return idx === -1 ? undefined : idx + 1;
}
