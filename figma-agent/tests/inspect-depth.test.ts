// Batch A — bounded rich inspection (`inspect --depth`).
// The walker's depth arm is proven at the source (nodeToSpec) so a live plugin is
// not needed; the CLI seam (inspectTarget) is proven to thread + validate the bound.
import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectTarget, resolveInspectDepth, DEFAULT_INSPECT_DEPTH } from '../cli/src/commands/inspect';
import { nodeToSpec } from '../plugin/src/main/scan-node';

// A minimal fake SceneNode tree the sync walker can read (no Figma runtime).
function fakeNode(name: string, children: unknown[] = []): unknown {
  return {
    type: 'FRAME',
    name,
    width: 100,
    height: 100,
    children,
    // getters the walker probes must not throw:
    fills: [],
    strokes: [],
  };
}

describe('nodeToSpec — depth bound + truncation marker', () => {
  const tree = fakeNode('root', [
    fakeNode('child-a', [fakeNode('grandchild')]),
    fakeNode('child-b'),
  ]);

  it('depth 0 → root only, no children, childrenTruncated marks the cut', () => {
    const spec = nodeToSpec(tree as never, undefined, undefined, undefined, 0);
    expect(spec.children).toBeUndefined();
    expect(spec.childrenTruncated).toBe(true);
  });

  it('depth 1 → root + direct children; grandchildren cut and marked', () => {
    const spec = nodeToSpec(tree as never, undefined, undefined, undefined, 1) as {
      children: { name: string; children?: unknown; childrenTruncated?: boolean }[];
    };
    expect(spec.children).toHaveLength(2);
    const childA = spec.children[0];
    expect(childA.name).toBe('child-a');
    expect(childA.children).toBeUndefined(); // grandchild pruned
    expect(childA.childrenTruncated).toBe(true);
    // child-b is a genuine leaf → no marker
    expect(spec.children[1].childrenTruncated).toBeUndefined();
  });

  it('undefined depth → complete walk (scan-node / mirror-verify behaviour)', () => {
    const spec = nodeToSpec(tree as never, undefined, undefined, undefined, undefined) as {
      children: { children?: { name: string }[]; childrenTruncated?: boolean }[];
    };
    expect(spec.children[0].children?.[0]?.name).toBe('grandchild');
    expect(spec.children[0].childrenTruncated).toBeUndefined();
  });
});

describe('resolveInspectDepth — validation', () => {
  it('defaults to 1 when absent', () => {
    expect(resolveInspectDepth(undefined)).toBe(DEFAULT_INSPECT_DEPTH);
    expect(DEFAULT_INSPECT_DEPTH).toBe(1);
  });

  it('accepts non-negative integers', () => {
    expect(resolveInspectDepth(0)).toBe(0);
    expect(resolveInspectDepth(3)).toBe(3);
  });

  it.each([-1, 1.5, Number.NaN, Infinity])('rejects invalid depth %s with E_INVALID_ARGS', (bad) => {
    expect(() => resolveInspectDepth(bad)).toThrowError(/E_INVALID_ARGS|non-negative integer/);
  });
});

describe('inspectTarget — depth threading + fail-closed on invalid depth', () => {
  it('threads the resolved depth into scanNodeSpec and echoes it', async () => {
    const out = join(tmpdir(), `inspect-depth-${Date.now()}.png`);
    const runner = vi.fn(async (cmd: string, params: unknown) => {
      if (cmd === 'EXEC_JS') {
        // The injected code must carry the depth literal as the 5th nodeToSpec arg.
        expect(String((params as { code: string }).code)).toContain('nodeToSpec(node, tokenNames, mainComps, keyedVars, 2)');
        return { result: { type: 'FRAME', name: 'Card' }, console: [], ms: 1 };
      }
      if (cmd === 'EXPORT_PNG') return { base64: Buffer.from('png').toString('base64'), w: 10, h: 20 };
      throw new Error(`unexpected ${cmd}`);
    });
    const result = await inspectTarget({ explicit: '1:2', out, depth: 2 }, runner as never) as { depth: number };
    expect(result.depth).toBe(2);
  });

  it('defaults the injected depth to 1 when no --depth is given', async () => {
    const out = join(tmpdir(), `inspect-default-${Date.now()}.png`);
    const runner = vi.fn(async (cmd: string, params: unknown) => {
      if (cmd === 'EXEC_JS') {
        expect(String((params as { code: string }).code)).toContain('keyedVars, 1)');
        return { result: { type: 'FRAME', name: 'Card' }, console: [], ms: 1 };
      }
      if (cmd === 'EXPORT_PNG') return { base64: Buffer.from('png').toString('base64'), w: 10, h: 20 };
      throw new Error(`unexpected ${cmd}`);
    });
    const result = await inspectTarget({ explicit: '1:2', out }, runner as never) as { depth: number };
    expect(result.depth).toBe(1);
  });

  it('rejects invalid depth BEFORE any plugin call', async () => {
    const runner = vi.fn(async () => ({}));
    await expect(inspectTarget({ explicit: '1:2', depth: -1 }, runner as never)).rejects.toThrow(/E_INVALID_ARGS|non-negative/);
    expect(runner).not.toHaveBeenCalled();
  });
});
