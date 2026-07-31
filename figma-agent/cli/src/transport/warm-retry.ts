// Warm-retry (F3): the FIRST plugin command against a big/cold Figma file often
// exceeds its timeout — the plugin main thread is JIT-cold, fonts aren't loaded,
// and a whole design-system serialization is slow the first time. The identical
// second attempt almost always lands because the plugin is now warm. So a
// long-running command retries ONCE on a cold E_TIMEOUT (opt-in per command),
// instead of surfacing a spurious failure the user must re-issue by hand.
import { CliError } from './protocol-helpers.ts';

/**
 * True when a failed attempt should be retried once because it timed out cold.
 *
 * Concurrency & jobs (backlog 1.1+2.6+4.3) — "the CLI never re-dispatches" was FALSE in
 * this tree until this guard existed: `runWithWarmRetry` retried the first E_TIMEOUT
 * automatically, and with the broker now confirming a timed-out request became a real
 * job (survives, retrievable via `figma-agent job <id>`), an unconditional retry would
 * fire a SECOND request while the first job is still alive — a double-dispatch, exactly
 * what backlog 2.6 exists to kill. So a timeout carrying a `jobId` is never retried here;
 * the caller polls instead. A timeout with no `jobId` (an older broker that never sent
 * JOB_STATE) keeps today's warm-retry behaviour unchanged.
 */
export function shouldWarmRetry(err: unknown, attempt: number): boolean {
  if (attempt !== 1) return false; // one warm retry only — never loop
  const code = (err as { code?: string } | null)?.code;
  if (code !== 'E_TIMEOUT') return false;
  if (err instanceof CliError && err.jobId !== undefined) return false;
  return true;
}

export interface WarmRetryOpts {
  /** Called once before the warm retry fires (e.g. to log/annotate). */
  onRetry?: (err: CliError) => void;
}

/**
 * Run `fn` (attempt 1); if it times out cold, run it once more (attempt 2).
 * `fn` receives the 1-based attempt number so callers may widen the per-attempt
 * timeout on the warm pass if they choose. Any non-timeout error, or a second
 * timeout, propagates unchanged.
 */
export async function runWithWarmRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: WarmRetryOpts = {},
): Promise<T> {
  try {
    return await fn(1);
  } catch (err) {
    if (!shouldWarmRetry(err, 1)) throw err;
    opts.onRetry?.(err as CliError);
    return fn(2);
  }
}
