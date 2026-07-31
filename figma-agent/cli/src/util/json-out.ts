// Single-JSON stdout contract: every command prints exactly one JSON object
// and exits 0 (result) or 1 ({error:{code,message}}).
import { CliError } from '../transport/protocol-helpers.ts';
import { getLastFileContext } from '../transport/broker-client.ts';
import type { FileContext } from '../../../shared/protocol.ts';

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Attach the answering file to a plain-object result. Two cases must NOT be silently mangled:
 * a non-object result (EXEC_JS can return a string/array) has nowhere to put the key, and a result
 * that already owns `fileContext` belongs to the command, not to transport metadata. Both fall back
 * to stderr, so stdout keeps its exactly-one-JSON-object contract and the proof is still visible.
 */
export function withFileContext(result: unknown): unknown {
  const ctx = getLastFileContext();
  if (!ctx) return result;
  const plain = result !== null && typeof result === 'object' && !Array.isArray(result);
  if (!plain || 'fileContext' in (result as Record<string, unknown>)) {
    process.stderr.write(`fileContext: ${JSON.stringify(ctx)}\n`);
    return result;
  }
  return { ...(result as Record<string, unknown>), fileContext: ctx };
}

/** Print {error:{code,message}} and exit 1. Unknown errors map to E_INTERNAL.
 * `rolledBack` is included only when set — an absent field keeps today's output
 * byte-identical for every error that never carried it. `fileContext` is optional and
 * additive the same way. */
export function printErrorJson(err: unknown, fileContext?: FileContext): never {
  const error =
    err instanceof CliError
      ? {
          code: err.code, message: err.message,
          ...(err.rolledBack ? { rolledBack: true } : {}),
          // Concurrency & jobs (backlog 1.1+2.6+4.3) — machine-readable jobId on an
          // E_TIMEOUT that confirmed a real job exists, so a caller (or a script driving
          // this CLI) can poll `figma-agent job <id>` without re-parsing the message.
          ...(err.jobId !== undefined ? { jobId: err.jobId } : {}),
        }
      : { code: 'E_INTERNAL', message: err instanceof Error ? err.message : String(err) };
  const payload = fileContext ? { error, fileContext } : { error };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(1);
}
