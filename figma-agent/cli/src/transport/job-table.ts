// Concurrency & jobs (backlog 1.1+2.6+4.3) — the job table.
//
// `handleClose`'s CLI branch deletes that client's `pending` entry the moment the CLI
// hangs up, so when the plugin's reply finally arrives, `routeFromPlugin` finds no
// client and returns silently — the work completed, and its result went nowhere. That
// is exactly what makes today's CLI timeout dangerous: the agent cannot tell "still
// running" from "finished, result lost", so it re-dispatches and double-applies
// (backlog 2.6). This table is the thing that outlives the CLI socket and catches that
// reply instead.
//
// Pure — no socket I/O here, so the TTL/cap/queue rules are unit-tested without one.
// The daemon (broker-daemon.ts) owns the single instance and is the only caller that
// ever touches a real WebSocket.
import type WebSocket from 'ws';
import type { JobInfo } from '../../../shared/protocol.ts';

export const JOB_TTL_MS = 10 * 60_000;               // finished results stay retrievable this long — BEST EFFORT
export const JOB_FINISHED_CAP = 200;                 // hard cap on FINISHED records; live jobs are NEVER capped
export const JOB_FRAME_BYTES_CAP = 8 * 1024 * 1024;  // held request+reply frames, across the whole table
export const JOB_TOMBSTONE_CAP = 500;                // jobIds only, so `expired` stays distinguishable from `unknown`

const FINISHED_STATES = new Set<JobInfo['state']>(['done', 'failed', 'cancelled']);

/** Whether a job state is one of the three TERMINAL outcomes — the shared predicate every
 *  late-reply / poll-shape check in this module and broker-daemon.ts uses, so the tri-state
 *  comparison is written once, not re-derived at each call site. */
export function isFinishedState(state: JobInfo['state']): boolean {
  return FINISHED_STATES.has(state);
}

export interface JobRecord extends JobInfo {
  /** The join to `pending` / `dispatchedTo` — the SAME id `routeFromPlugin` routes replies by. */
  requestId: string;
  /**
   * The request frame(s), verbatim and in order — a QUEUED job must be re-sendable at
   * dequeue without re-resolving anything. One entry for a normal request; N for a
   * chunked one (see `admitChunk` in broker-daemon.ts).
   */
  requestFrames: string[];
  /** The CLI that asked. `null` once that client has gone — the job still runs; that is the point. */
  from: WebSocket | null;
  /**
   * The plugin instance this job is PINNED to, by instanceId — never re-resolved at
   * dequeue, or a queued mutation could land in whichever file became most-recent while
   * it waited.
   */
  targetInstanceId: string;
  /** Reply frame(s), verbatim and in order (a chunked reply arrives as many). */
  replyFrames: string[];
  readOnly: boolean;
  /**
   * Set when the byte-budget eviction had to drop this (finished) record's held frames
   * to stay under `JOB_FRAME_BYTES_CAP` — the metadata survives, a poll can still say
   * *why* the result is gone rather than returning nothing.
   */
  resultDropped?: boolean;
  /** Set by `job <id> --force-release` (phase 02) — an audited override, never automatic. */
  forceReleased?: boolean;
  /** Internal only (never serialized onto the wire — see `toJobInfo`): when this record
   *  was created, the basis `queuedMs` is measured from. */
  createdAt: number;
  /**
   * Closing round (R1+R2 unified, reviewer Q1) — a reply that arrives AFTER this record
   * is already terminal (a watchdog timeout report, a force-release, or a genuine prior
   * finish) is DISCARDED entirely, never stored: force-release's own contract already
   * says "discarded" verbatim, so keeping the payload (even just for debugging) both
   * contradicts that and reopens an unbounded-growth class this whole phase bounded
   * everywhere else. Only a bounded count survives, surfaced in the poll reply when > 0
   * so the caller at least knows a late frame showed up and was thrown away.
   */
  lateReplyCount?: number;
}

/** Project a `JobRecord` down to the wire-safe `JobInfo` shape — `from`/`requestFrames`/
 *  `replyFrames`/`targetInstanceId`/`createdAt` never leave the broker (the first carries
 *  a live `WebSocket`, which JSON.stringify cannot serialize meaningfully anyway). */
export function toJobInfo(rec: JobRecord): JobInfo {
  const info: JobInfo = { jobId: rec.jobId, state: rec.state, cmd: rec.cmd, fileSlug: rec.fileSlug };
  if (rec.activity !== undefined) info.activity = rec.activity;
  if (rec.queuePosition !== undefined) info.queuePosition = rec.queuePosition;
  if (rec.queuedMs !== undefined) info.queuedMs = rec.queuedMs;
  if (rec.startedAt !== undefined) info.startedAt = rec.startedAt;
  if (rec.finishedAt !== undefined) info.finishedAt = rec.finishedAt;
  return info;
}

function byteLength(frames: readonly string[]): number {
  let total = 0;
  for (const f of frames) total += Buffer.byteLength(f, 'utf8');
  return total;
}

export interface CreateJobInput {
  requestId: string;
  cmd: string;
  activity?: string;
  fileSlug: string;
  readOnly: boolean;
  requestFrames: string[];
  from: WebSocket | null;
  targetInstanceId: string;
}

export class JobTable {
  private readonly jobs = new Map<string, JobRecord>();
  /** FIFO of finished jobIds, oldest first — the cap/TTL eviction order. */
  private readonly finishedOrder: string[] = [];
  /** Bounded ring of evicted jobIds, so `byId` can answer `'expired'` instead of
   *  collapsing into the honestly-different `'unknown'`. */
  private readonly tombstones: string[] = [];
  private readonly tombstoneSet = new Set<string>();
  private counter = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly mintId?: () => string,
  ) {}

  private mint(): string {
    if (this.mintId) return this.mintId();
    // Request ids are per-process (`c_<counter>_<ts>`) and CAN collide across processes —
    // a job id is polled LATER, by a possibly DIFFERENT process, so it must be
    // broker-unique, not merely process-unique.
    return `j_${++this.counter}_${this.now()}`;
  }

  create(input: CreateJobInput): JobRecord {
    const rec: JobRecord = {
      jobId: this.mint(),
      state: 'queued',
      cmd: input.cmd,
      fileSlug: input.fileSlug,
      requestId: input.requestId,
      requestFrames: input.requestFrames,
      from: input.from,
      targetInstanceId: input.targetInstanceId,
      replyFrames: [],
      readOnly: input.readOnly,
      createdAt: this.now(),
    };
    if (input.activity !== undefined) rec.activity = input.activity;
    this.jobs.set(rec.jobId, rec);
    return rec;
  }

  /** Stamps `queuedMs` from `createdAt` — the evidence for the subtree-lock upgrade
   *  trigger (locked decision 6: revisit only when this measures > 5 min/day for real). */
  markRunning(jobId: string): void {
    const rec = this.jobs.get(jobId);
    if (!rec) return;
    rec.state = 'running';
    rec.startedAt = this.now();
    rec.queuedMs = rec.startedAt - rec.createdAt;
    delete rec.queuePosition;
  }

  /**
   * Store the verbatim reply and finish the job — called even when no CLI is listening.
   *
   * Stage-4 fix round (MAJOR 4), closing round (R1+R2 unified) — a TERMINAL record
   * (already done/failed/cancelled) ignores this call entirely for its own
   * state/replyFrames: without the guard, a late reply arriving after the watchdog
   * already reported a timeout (or after a force-release) would flip the record back to
   * "done", pollute `replyFrames` with a SECOND answer contradicting the first
   * (`[timeoutErr, realReply]` → the poll's own chunk reassembly then throws
   * E_CHUNK_LOST on what looks like a corrupt multi-frame reply), and double-push
   * `finishedOrder` (skewing the finished-cap's eviction order). This is defense-in-depth
   * alongside `routeFromPlugin`'s OWN terminal check (broker-daemon.ts) — that check
   * stops the raw chunk from ever reaching `replyFrames` in the first place (the actual
   * pollution site); this guard catches every OTHER direct `finish()` caller. Only a
   * bounded count survives the late call — never the payload.
   */
  finish(jobId: string, ok: boolean, rawReply: string[]): void {
    const rec = this.jobs.get(jobId);
    if (!rec) return;
    if (FINISHED_STATES.has(rec.state)) {
      rec.lateReplyCount = (rec.lateReplyCount ?? 0) + 1;
      return;
    }
    rec.state = ok ? 'done' : 'failed';
    rec.finishedAt = this.now();
    rec.replyFrames = rawReply;
    this.finishedOrder.push(jobId);
    this.enforceFinishedCap();
    this.enforceByteBudget();
  }

  /** Refuses a RUNNING job — the sandbox cannot interrupt a live `eval`. */
  cancelQueued(jobId: string): { ok: boolean; reason?: string } {
    const rec = this.jobs.get(jobId);
    if (!rec) return { ok: false, reason: 'no such job' };
    if (rec.state === 'running') {
      return { ok: false, reason: 'the plugin sandbox cannot interrupt a running script — only a QUEUED job can be cancelled' };
    }
    if (rec.state !== 'queued') return { ok: false, reason: `job is already ${rec.state}` };
    rec.state = 'cancelled';
    rec.finishedAt = this.now();
    rec.queuedMs = rec.finishedAt - rec.createdAt;
    delete rec.queuePosition;
    this.finishedOrder.push(jobId);
    this.enforceFinishedCap();
    return { ok: true };
  }

  /** Three answers, not two: `'expired'` (aged out / capped) is a different fact from
   *  `'unknown'` (never existed, or the tombstone ring itself overflowed). */
  byId(jobId: string): JobRecord | 'unknown' | 'expired' {
    const rec = this.jobs.get(jobId);
    if (rec) return rec;
    if (this.tombstoneSet.has(jobId)) return 'expired';
    return 'unknown';
  }

  byRequestId(requestId: string): JobRecord | undefined {
    for (const rec of this.jobs.values()) if (rec.requestId === requestId) return rec;
    return undefined;
  }

  /**
   * Per-file view for `status` (backlog 4.3): the running job (if any) + how many are
   * queued behind it. `runningJobId` is the caller's OWN per-file `QueueState.running`
   * pointer — the AUTHORITATIVE occupancy signal, deliberately NOT re-derived by scanning
   * this table for `state === 'running'`: a watchdog-timed-out job is marked `failed` for
   * reporting (phase 01) while its file's mutation slot STAYS BLOCKED on purpose, so a
   * state-scan would wrongly report the file as idle the moment the watchdog fires. Passing
   * the queue's own pointer keeps this correct regardless of the record's own `state`.
   * `queueDepth` still comes from this table's own QUEUED count for the file, which is
   * always in lock-step with the queue's own `waiting.length` by construction (every
   * `enqueue` pairs with a `create`, every dequeue with a `markRunning`/`finish`).
   * Wire-safe (`toJobInfo`) — `running` must never carry the record's own `from`
   * WebSocket onto a JSON envelope.
   */
  summaryFor(fileSlug: string, runningJobId: string | null): { running: JobInfo | null; queueDepth: number } {
    const runningRec = runningJobId !== null ? this.jobs.get(runningJobId) : undefined;
    let queueDepth = 0;
    for (const rec of this.jobs.values()) {
      if (rec.fileSlug === fileSlug && rec.state === 'queued') queueDepth++;
    }
    return { running: runningRec ? toJobInfo(runningRec) : null, queueDepth };
  }

  /** Every currently RUNNING job, across all files — the watchdog's own sweep target
   *  (broker-daemon.ts checks each one's age against EXEC_JS_MAX_TIMEOUT_MS + margin). */
  runningJobs(): JobRecord[] {
    return [...this.jobs.values()].filter((r) => r.state === 'running');
  }

  /** `figma-agent job --list [--file <name>]` (phase 02 §2) — the bounded table,
   *  newest first (by `createdAt`), optionally filtered to one file's own jobs. Wire-safe
   *  (`toJobInfo`), never the raw `JobRecord` (which carries a live socket + held frames). */
  list(fileSlug?: string): JobInfo[] {
    const all = [...this.jobs.values()]
      .filter((r) => fileSlug === undefined || r.fileSlug === fileSlug)
      .sort((a, b) => b.createdAt - a.createdAt);
    return all.map(toJobInfo);
  }

  private evict(jobId: string): void {
    this.jobs.delete(jobId);
    this.tombstones.push(jobId);
    this.tombstoneSet.add(jobId);
    if (this.tombstones.length > JOB_TOMBSTONE_CAP) {
      const dropped = this.tombstones.shift();
      if (dropped !== undefined) this.tombstoneSet.delete(dropped);
    }
  }

  /** JOB_FINISHED_CAP is the HARD limit: past it, the oldest FINISHED record is dropped
   *  even if it is still inside its TTL. Live (queued/running) jobs are never touched —
   *  they are bounded naturally by the queue and the number of connected files. */
  private enforceFinishedCap(): void {
    while (this.finishedOrder.length > JOB_FINISHED_CAP) {
      const oldest = this.finishedOrder.shift();
      if (oldest !== undefined && this.jobs.has(oldest)) this.evict(oldest);
    }
  }

  /**
   * An entry count cannot bound memory when one entry may hold a multi-megabyte
   * chunked payload. Over budget → drop the OLDEST finished records' held frames first
   * (keeping their metadata, marking `resultDropped: true` so a poll says *why* rather
   * than returning nothing) — never a live job's frames, and never evict the record
   * itself just for this (that is the FINISHED_CAP's job, not the byte budget's).
   */
  private enforceByteBudget(): void {
    let total = 0;
    for (const rec of this.jobs.values()) total += byteLength(rec.requestFrames) + byteLength(rec.replyFrames);
    if (total <= JOB_FRAME_BYTES_CAP) return;
    for (const jobId of this.finishedOrder) {
      if (total <= JOB_FRAME_BYTES_CAP) break;
      const rec = this.jobs.get(jobId);
      if (!rec || rec.resultDropped === true) continue;
      total -= byteLength(rec.requestFrames) + byteLength(rec.replyFrames);
      rec.requestFrames = [];
      rec.replyFrames = [];
      rec.resultDropped = true;
    }
    // Still over budget after shedding every finished record's frames → live jobs alone
    // exceed it. Accepted, not fixed here: live jobs are never evicted or trimmed.
  }

  /** TTL + cap eviction. Returns the number of jobs evicted this sweep. */
  sweep(): number {
    const cutoff = this.now() - JOB_TTL_MS;
    let evicted = 0;
    const survivors: string[] = [];
    for (const jobId of this.finishedOrder) {
      const rec = this.jobs.get(jobId);
      if (!rec) continue; // already evicted by the cap
      if ((rec.finishedAt ?? 0) <= cutoff) {
        this.evict(jobId);
        evicted++;
      } else {
        survivors.push(jobId);
      }
    }
    this.finishedOrder.length = 0;
    this.finishedOrder.push(...survivors);
    return evicted;
  }
}
