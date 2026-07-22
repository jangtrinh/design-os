// Opus review Finding 1 — a bounded `inspect --depth` must bound the two ASYNC
// pre-passes too, not just the output tree. Otherwise the walker still round-trips
// getMainComponentAsync / getVariableByIdAsync for every descendant it will prune,
// so the overflow the depth bound exists to prevent is only half-prevented. These
// tests prove a descendant past the budget is neither visited nor resolved, while
// the unbounded default (scan-node / mirror-verify) still reaches it.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import {
  installMockFigma,
  setMockLocalVariables,
  makeMockKeyedLocalVariable,
  FakeNode,
  type FakeVariable,
} from './helpers/mock-figma.ts';

beforeAll(() => { installMockFigma(); });

const { readMainComponentMap, readKeyedVariableMap } = await import('../plugin/src/main/scan-node.ts');

type HasMain = { getMainComponentAsync: () => Promise<unknown> };
type VarsApi = { getVariableByIdAsync: (id: string) => Promise<unknown> };
const figmaVars = (): VarsApi =>
  (globalThis as unknown as { figma: { variables: VarsApi } }).figma.variables;

function frame(name: string, children: FakeNode[] = []): FakeNode {
  const n = new FakeNode('FRAME');
  n.name = name;
  for (const c of children) n.appendChild(c);
  return n;
}
function instance(name: string): FakeNode {
  const n = new FakeNode('INSTANCE');
  n.name = name;
  n.mainComponent = { id: `MAIN_${name}`, key: `k_${name}`, name: `Main_${name}` };
  return n;
}

describe('readMainComponentMap — depth bounds the main-component pre-pass', () => {
  it('depth 1 resolves a direct-child instance but NOT a grandchild instance', async () => {
    const directInst = instance('direct');
    const deepInst = instance('deep');
    const root = frame('root', [directInst, frame('mid', [deepInst])]);
    const deepSpy = vi.spyOn(deepInst as unknown as HasMain, 'getMainComponentAsync');

    const map = await readMainComponentMap(root as unknown as SceneNode, 1);

    expect(map.has(directInst.id)).toBe(true); // within budget → resolved
    expect(map.has(deepInst.id)).toBe(false);  // past budget → absent
    expect(deepSpy).not.toHaveBeenCalled();     // and never round-tripped
  });

  it('unbounded (undefined) resolves the grandchild instance', async () => {
    const deepInst = instance('deepU');
    const root = frame('rootU', [frame('midU', [deepInst])]);
    const deepSpy = vi.spyOn(deepInst as unknown as HasMain, 'getMainComponentAsync');

    const map = await readMainComponentMap(root as unknown as SceneNode);

    expect(map.has(deepInst.id)).toBe(true);
    expect(deepSpy).toHaveBeenCalledTimes(1);
  });

  it('depth 2 reaches the grandchild instance', async () => {
    const deepInst = instance('deep2');
    const root = frame('root2', [frame('mid2', [deepInst])]);
    const map = await readMainComponentMap(root as unknown as SceneNode, 2);
    expect(map.has(deepInst.id)).toBe(true);
  });
});

describe('readKeyedVariableMap — depth bounds the keyed-variable pre-pass', () => {
  let shallowVar: FakeVariable;
  let deepVar: FakeVariable;

  beforeEach(() => {
    shallowVar = makeMockKeyedLocalVariable('shallow', 'key-shallow');
    deepVar = makeMockKeyedLocalVariable('deep', 'key-deep');
    setMockLocalVariables([shallowVar, deepVar]);
  });

  function boundFrame(name: string, varId: string, children: FakeNode[] = []): FakeNode {
    const n = frame(name, children);
    n.boundVariables = { cornerRadius: { type: 'VARIABLE_ALIAS', id: varId } };
    return n;
  }

  it('depth 1 collects a direct-child binding but NOT a grandchild binding', async () => {
    const shallow = boundFrame('shallowNode', shallowVar.id);
    const deep = boundFrame('deepNode', deepVar.id);
    const root = frame('root', [shallow, frame('mid', [deep])]);
    const spy = vi.spyOn(figmaVars(), 'getVariableByIdAsync');

    const map = await readKeyedVariableMap(root as unknown as SceneNode, 1);

    expect(map.has(shallowVar.id)).toBe(true);
    expect(map.has(deepVar.id)).toBe(false);
    expect(spy).toHaveBeenCalledWith(shallowVar.id);
    expect(spy).not.toHaveBeenCalledWith(deepVar.id); // no round-trip for the pruned node
    spy.mockRestore();
  });

  it('unbounded (undefined) collects the grandchild binding', async () => {
    const deep = boundFrame('deepNodeU', deepVar.id);
    const root = frame('rootU', [frame('midU', [deep])]);
    const map = await readKeyedVariableMap(root as unknown as SceneNode);
    expect(map.has(deepVar.id)).toBe(true);
  });
});
