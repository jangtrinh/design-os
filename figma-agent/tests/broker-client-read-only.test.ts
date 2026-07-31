// Concurrency & jobs stage-4 fix round (minor 8, ruling Q4) — `--read-only` is a PARTIAL
// hardening: refuse the assertion outright when the outgoing command mutates BY NAME
// (asserting read-only on SET_TEXT/CREATE_FRAME/etc. is always a lie), but EXEC_JS keeps
// the trusted assertion (that IS the flag's designed use — a read-only script body the
// broker cannot inspect). Already-read-only commands make the flag a harmless no-op.
import { describe, expect, it } from 'vitest';
import { refusesReadOnlyAssertion } from '../cli/src/transport/broker-client.ts';
import { MUTATING_COMMANDS } from '../shared/mutating-commands.ts';

describe('refusesReadOnlyAssertion', () => {
  it('refuses a mutating-by-name command (SET_TEXT) asserting --read-only', () => {
    expect(refusesReadOnlyAssertion('SET_TEXT', true)).toBe(true);
  });

  it('refuses every MUTATING_COMMANDS entry except EXEC_JS when readOnly is true', () => {
    for (const cmd of MUTATING_COMMANDS) {
      const expected = cmd !== 'EXEC_JS';
      expect(refusesReadOnlyAssertion(cmd, true)).toBe(expected);
    }
  });

  it('EXEC_JS keeps the trusted assertion — never refused, that IS the flag\'s designed use', () => {
    expect(refusesReadOnlyAssertion('EXEC_JS', true)).toBe(false);
  });

  it('an already-read-only command (STATUS) makes the flag a harmless no-op', () => {
    expect(refusesReadOnlyAssertion('STATUS', true)).toBe(false);
  });

  it('readOnly=false never refuses anything, regardless of command', () => {
    expect(refusesReadOnlyAssertion('SET_TEXT', false)).toBe(false);
    expect(refusesReadOnlyAssertion('EXEC_JS', false)).toBe(false);
  });
});
