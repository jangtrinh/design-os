// Panel IA v2 needs a node's NAME to render an activity sentence like
// `Created frame "Hero card"` — three executors previously returned an id only.
// This locks the additive `name` field each now carries, so the feed can quote it.
import { describe, it, expect } from 'vitest';
import { installMockFigma, makeMockComponent, setMockComponents } from './helpers/mock-figma.ts';
import { opCreateFrame, opCreateInstance, opSetText } from '../plugin/src/main/executor-ops.ts';

describe('executor-ops — additive `name` on the reply (backlog: activity sentences)', () => {
  it('opCreateFrame reply carries the frame\'s own name', async () => {
    installMockFigma();
    const result = await opCreateFrame({ name: 'Hero card' });
    expect(result.name).toBe('Hero card');
    expect(result.id).toBeTruthy();
  });

  it('opCreateInstance reply carries the instance\'s own name', async () => {
    const figma = installMockFigma();
    const main = makeMockComponent('Button', 'KEY-BUTTON');
    setMockComponents([main]);
    const result = await opCreateInstance({ component: 'KEY-BUTTON' }) as { id: string; name: string };
    expect(result.name).toBe('Button');
    expect(result.id).toBeTruthy();
    void figma;
  });

  it('opSetText reply carries the text node\'s own name', async () => {
    const figma = installMockFigma();
    const node = figma.createText();
    node.name = 'Title';
    node.characters = ''; // the mock leaves this undefined on a fresh node; opSetText reads .length
    // getSceneNode resolves via figma.getNodeByIdAsync, which only answers for ids the mock
    // knows about (components + instance-owned nodes) — setMockComponents is also just the
    // id→node registry `getNodeByIdAsync` reads, so it doubles as "make this id resolvable"
    // for a plain node too.
    setMockComponents([node]);
    const result = await opSetText({ nodeId: node.id, characters: 'Hello' });
    expect(result.name).toBe('Title');
    expect(result.id).toBe(node.id);
  });
});
