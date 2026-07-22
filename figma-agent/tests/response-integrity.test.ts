// Batch B — the fail-closed response-integrity gate.
// Valid → accepted (any size); invalid/truncated/warning-prefixed → E_RESPONSE_INTEGRITY.
import { describe, expect, it } from 'vitest';
import { assertParseable, serializeChecked } from '../cli/src/util/response-integrity';
import { CliError } from '../cli/src/transport/protocol-helpers';

describe('assertParseable', () => {
  it('accepts valid JSON and returns its utf8 byte length', () => {
    const json = JSON.stringify({ ok: true, name: 'héllo' });
    expect(assertParseable(json)).toBe(Buffer.byteLength(json, 'utf8'));
  });

  it('rejects truncated JSON with E_RESPONSE_INTEGRITY', () => {
    const truncated = JSON.stringify({ a: 1, b: [1, 2, 3] }).slice(0, 12);
    expect(() => assertParseable(truncated)).toThrowError(CliError);
    try {
      assertParseable(truncated);
    } catch (err) {
      expect((err as CliError).code).toBe('E_RESPONSE_INTEGRITY');
    }
  });

  it('rejects a warning line prefixed in front of the JSON (fails closed, not sliced)', () => {
    const withWarning = `WARN: plugin slow\n${JSON.stringify({ ok: true })}`;
    expect(() => assertParseable(withWarning)).toThrowError(/E_RESPONSE_INTEGRITY|not valid JSON/);
  });
});

describe('serializeChecked', () => {
  it('round-trips a valid value into bytes + size', () => {
    const { json, byteLength } = serializeChecked({ hello: 'world' });
    expect(JSON.parse(json)).toEqual({ hello: 'world' });
    expect(byteLength).toBe(Buffer.byteLength(json, 'utf8'));
  });

  it('accepts a large valid payload — size is telemetry, never a rejection input', () => {
    const big = { rows: Array.from({ length: 50_000 }, (_, i) => ({ i, label: `row-${i}` })) };
    const { json, byteLength } = serializeChecked(big);
    expect(byteLength).toBeGreaterThan(1_000_000); // > 1 MB, still accepted
    expect(JSON.parse(json).rows).toHaveLength(50_000);
  });

  it('fails closed on a value with no JSON representation', () => {
    expect(() => serializeChecked(undefined)).toThrowError(/E_RESPONSE_INTEGRITY|no JSON representation/);
  });
});
