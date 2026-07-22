// Single-JSON stdout contract: every command prints exactly one JSON object and
// exits 0 (result) or 1 ({error:{code,message}}). The bytes are validated by the
// response-integrity gate BEFORE writing, and the process exits only AFTER stdout
// has flushed — a large payload can no longer be truncated by an eager exit.
import { CliError } from '../transport/protocol-helpers.ts';
import { serializeChecked } from './response-integrity.ts';

/**
 * Write text to stdout and exit with `code` only once the bytes have flushed.
 *
 * `process.exit` does NOT wait for stdout to drain; on a pipe with a large payload it
 * drops the unflushed tail while still exiting 0 — the exact truncation this gate
 * exists to prevent. The write callback fires after the chunk is handed to the OS, so
 * exiting from it guarantees the reader sees the whole object. `exitCode` is set up
 * front so that even if the callback never runs, a natural drain still exits correctly.
 */
function writeAndExit(text: string, code: number): never {
  process.exitCode = code;
  process.stdout.write(text, () => process.exit(code));
  // Unreachable in practice — the callback exits — but satisfies the `never` return.
  return undefined as never;
}

/** Validate the serialized bytes, then print the single JSON object and exit 0. */
export function printJson(value: unknown): never {
  const { json } = serializeChecked(value);
  return writeAndExit(`${json}\n`, 0);
}

/** Print {error:{code,message}} and exit 1. Unknown errors map to E_INTERNAL. */
export function printErrorJson(err: unknown): never {
  const error =
    err instanceof CliError
      ? { code: err.code, message: err.message }
      : { code: 'E_INTERNAL', message: err instanceof Error ? err.message : String(err) };
  // Symmetry with printJson: validate the serialized bytes before writing. Indent 0
  // keeps the historic compact single-line error shape. The error reporter must NEVER
  // throw — a bad serialization falls back to a minimal hand-built envelope rather than
  // crashing while reporting a crash.
  let text: string;
  try {
    text = serializeChecked({ error }, 0).json;
  } catch {
    text = '{"error":{"code":"E_INTERNAL","message":"error serialization failed"}}';
  }
  return writeAndExit(`${text}\n`, 1);
}
