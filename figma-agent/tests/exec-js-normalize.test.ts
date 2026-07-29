// Phase 02 — locks the 2.5 regression (trailing `;` silently discarding an IIFE's value)
// and the `resultWarning`/`summarize` classification that makes a script's result never
// silently pass as a real `null`. No `figma` global needed at import time — the module
// under test stays free of top-level figma access so a plain import works.
import { describe, it, expect } from 'vitest';
import {
  compile, expressionCandidates, resultWarning, summarize,
} from '../plugin/src/main/executor-exec-js.ts';

describe('expressionCandidates / compile — mode selection', () => {
  it('an IIFE with a trailing `;` still compiles as an expression (the 2.5 regression, locked)', async () => {
    const { fn, mode } = compile('(async () => { return 1 })();');
    expect(mode).toBe('expression');
    await expect(fn(consoleStub(), undefined as never)).resolves.toBe(1);
  });

  it.each([
    '(async () => 1)(); // done',
    '(async () => 1)();  /* done */',
    '(async () => 1)() ;;',
  ])('harder trailing spellings still compile as expression: %s', async (source) => {
    const { mode } = compile(source);
    expect(mode).toBe('expression');
  });

  it('a top-level `const` forces statement form, result undefined', async () => {
    const { fn, mode } = compile('const a = 1; a + 1');
    expect(mode).toBe('statement');
    await expect(fn(consoleStub(), undefined as never)).resolves.toBeUndefined();
  });

  it('a bad strip only fails to parse — a string literal ending in `//` keeps its value', async () => {
    const { fn, mode } = compile('"https://x//"');
    expect(mode).toBe('expression');
    await expect(fn(consoleStub(), undefined as never)).resolves.toBe('https://x//');
  });

  it('Codex round 1 finding 1: an IIFE whose string body ends in `//` before a trailing `;` must not be comment-mangled', async () => {
    const { fn, mode } = compile('(async () => "https://x//")();');
    expect(mode).toBe('expression');
    await expect(fn(consoleStub(), undefined as never)).resolves.toBe('https://x//');
  });

  it('Codex round 1 finding 1: a genuine trailing `// comment` on its own line still normalizes (multiline)', async () => {
    const { fn, mode } = compile('(async () => "https://x//")();\n// trailing comment');
    expect(mode).toBe('expression');
    await expect(fn(consoleStub(), undefined as never)).resolves.toBe('https://x//');
  });

  it('figma property access compiles as expression with no figma global at compile time', () => {
    const { mode } = compile('figma.currentPage.name');
    expect(mode).toBe('expression');
  });
});

describe('resultWarning', () => {
  it('undefined warns, phrased per mode', () => {
    expect(resultWarning(undefined, 'statement')).toMatch(/no explicit return/);
    expect(resultWarning(undefined, 'expression')).toMatch(/undefined/);
  });

  it('null / empty array / empty object warn', () => {
    expect(resultWarning(null, 'expression')).toMatch(/null/);
    expect(resultWarning([], 'expression')).toMatch(/empty array/);
    expect(resultWarning({}, 'expression')).toMatch(/empty object/);
  });

  it('0 / false / empty string / a non-empty object do not warn', () => {
    expect(resultWarning(0, 'expression')).toBeUndefined();
    expect(resultWarning(false, 'expression')).toBeUndefined();
    expect(resultWarning('', 'expression')).toBeUndefined();
    expect(resultWarning({ a: 1 }, 'expression')).toBeUndefined();
  });
});

describe('summarize', () => {
  it('collapses a node-ish value to {id,name,type}', () => {
    const nodeish = { id: '1:2', name: 'Frame', type: 'FRAME', remove: () => {}, extra: 'dropped' };
    expect(summarize(nodeish)).toEqual({ id: '1:2', name: 'Frame', type: 'FRAME' });
  });

  it('maps an array of node-ish values', () => {
    const nodeish = { id: '1:2', name: 'Frame', type: 'FRAME', remove: () => {} };
    expect(summarize([nodeish, 42])).toEqual([{ id: '1:2', name: 'Frame', type: 'FRAME' }, 42]);
  });
});

function consoleStub() {
  return { log: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}
