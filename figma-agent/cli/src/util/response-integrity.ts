// Response-integrity gate — the fail-closed check between "the command produced a
// value" and "that value leaves the process as a complete JSON object".
//
// The invariant (spec: figma-agent-response-integrity): a zero exit code proves the
// process ran, NOT that stdout carried a whole payload. A large object written just
// before `process.exit` can be truncated mid-flush; a consumer then parses a partial
// object and narrates it as success. So every stdout emission is serialized ONCE and
// the EXACT bytes are re-parsed here before they are written — invalid → E_RESPONSE_
// INTEGRITY and a non-zero exit, never a silent partial.
//
// Size is telemetry only: `byteLength` is measured and returned, but a large VALID
// payload is always accepted. The gate rejects on parse-validity, never on size.
import { CliError } from '../transport/protocol-helpers.ts';

export interface IntegrityResult {
  /** The exact serialized bytes to write — re-parsed here, so provably valid JSON. */
  json: string;
  /** utf8 byte length of `json`, for telemetry. Never a rejection input. */
  byteLength: number;
}

/**
 * Parse-validate an already-serialized JSON string and return its utf8 byte length.
 * Fails closed with E_RESPONSE_INTEGRITY on any parse error (truncated, corrupt, or
 * non-JSON text such as a warning line that slipped in front of the object).
 */
export function assertParseable(json: string): number {
  try {
    JSON.parse(json);
  } catch (err) {
    throw new CliError('E_RESPONSE_INTEGRITY', `response is not valid JSON: ${(err as Error).message}`);
  }
  return Buffer.byteLength(json, 'utf8');
}

/**
 * Serialize a value to pretty JSON, then re-parse the exact bytes to prove they form
 * a complete JSON document before anything is written. Returns the bytes + their size.
 *
 * `JSON.stringify` returns `undefined` for a value that has no JSON representation
 * (a bare `undefined`, a function); that is not a writable object, so it fails the
 * gate rather than emitting the literal string "undefined".
 */
export function serializeChecked(value: unknown, indent = 2): IntegrityResult {
  const json = JSON.stringify(value, null, indent);
  if (typeof json !== 'string') {
    throw new CliError('E_RESPONSE_INTEGRITY', `value has no JSON representation (${typeof value})`);
  }
  return { json, byteLength: assertParseable(json) };
}
