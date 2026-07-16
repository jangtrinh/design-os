// The outcome half of the activity feed: what the plugin can HONESTLY say it just
// did. The count is derived from the reply the relay already holds — never guessed
// from the command name — so a script that scanned nothing may not claim a node
// count, and an import that emitted warnings may not hide them.
import { describe, it, expect } from 'vitest';
import {
  countSpecNodes, summarizeResult, summarizeError,
} from '../plugin/src/ui/activity-summary.ts';

describe('countSpecNodes — the count is derived from the reply, never guessed', () => {
  it('counts the root alone', () => {
    expect(countSpecNodes({ type: 'FRAME', name: 'a' })).toBe(1);
  });
  it('counts the whole tree, root included', () => {
    const spec = {
      type: 'FRAME', name: 'root',
      children: [
        { type: 'TEXT', name: 'a' },
        { type: 'FRAME', name: 'b', children: [{ type: 'TEXT', name: 'c' }, { type: 'TEXT', name: 'd' }] },
      ],
    };
    expect(countSpecNodes(spec)).toBe(5);
  });
  it('is 0 for anything that is not a node spec', () => {
    expect(countSpecNodes(null)).toBe(0);
    expect(countSpecNodes({ removed: true })).toBe(0);
    expect(countSpecNodes('FRAME')).toBe(0);
  });
});

describe('summarizeResult — what the plugin can honestly say it did', () => {
  it('IMPORT_PAYLOAD reports the name it built', () => {
    expect(summarizeResult('IMPORT_PAYLOAD', { id: '1:2', name: 'Hero card', warnings: [] }))
      .toBe('→ Hero card');
  });
  it('IMPORT_PAYLOAD surfaces warnings rather than burying them', () => {
    expect(summarizeResult('IMPORT_PAYLOAD', { name: 'Hero', warnings: ['a', 'b'] }))
      .toBe('→ Hero, 2 warnings');
    expect(summarizeResult('IMPORT_PAYLOAD', { name: 'Hero', warnings: ['a'] }))
      .toBe('→ Hero, 1 warning');
  });
  it('HTML_TO_FIGMA reads the same shape (the relay converts it to IMPORT_PAYLOAD)', () => {
    expect(summarizeResult('HTML_TO_FIGMA', { name: 'Landing', warnings: [] })).toBe('→ Landing');
  });
  it('EXEC_JS unwraps the {result, console, ms} envelope before counting', () => {
    const spec = { type: 'FRAME', name: 'root', children: [{ type: 'TEXT', name: 'a' }] };
    expect(summarizeResult('EXEC_JS', { result: spec, console: [], ms: 12 })).toBe('→ 2 nodes');
  });
  it('EXEC_JS counts a bare spec too (no envelope)', () => {
    expect(summarizeResult('EXEC_JS', { type: 'FRAME', name: 'solo' })).toBe('→ 1 node');
  });
  it('EXEC_JS says NOTHING for a script that returned no spec — no fabricated count', () => {
    // mirror-verify's remove-scratch returns {removed:true}; an ad-hoc script returns
    // anything at all. Neither scanned a node, so neither may claim a node count.
    expect(summarizeResult('EXEC_JS', { result: { removed: true }, ms: 3 })).toBeNull();
    expect(summarizeResult('EXEC_JS', null)).toBeNull();
    expect(summarizeResult('EXEC_JS', { result: 42, ms: 1 })).toBeNull();
  });
  it('is null for a command with nothing countable to report', () => {
    expect(summarizeResult('STATUS', { ok: true })).toBeNull();
  });
});

describe('summarizeError', () => {
  it('marks the failure with the plugin error message', () => {
    expect(summarizeError({ code: 'E_PLUGIN_ERROR', message: 'node not found: 1:23' }))
      .toBe('✗ node not found: 1:23');
  });
  it('flattens a multi-line message onto the single row it has', () => {
    expect(summarizeError({ message: 'line one\n  line two' })).toBe('✗ line one line two');
  });
  it('truncates a runaway message rather than blowing up the row', () => {
    const out = summarizeError({ message: 'x'.repeat(500) });
    expect(out.length).toBeLessThanOrEqual(122);
    expect(out.endsWith('…')).toBe(true);
  });
  it('still says something when the error carries no message', () => {
    expect(summarizeError({})).toBe('✗ failed');
    expect(summarizeError('boom')).toBe('✗ boom');
  });
});
