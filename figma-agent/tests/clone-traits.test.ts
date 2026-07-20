import { beforeEach, describe, expect, it, vi } from 'vitest';
import { opCloneTraits } from '../plugin/src/main/executor-clone-traits';

const source = {
  id: '1:1',
  type: 'FRAME',
  layoutMode: 'VERTICAL',
  itemSpacing: 16,
  paddingTop: 24,
  fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
};
const target = {
  id: '1:2',
  type: 'FRAME',
  layoutMode: 'NONE',
  itemSpacing: 0,
  paddingTop: 0,
  fills: [],
};

describe('clone traits executor', () => {
  beforeEach(() => {
    Object.assign(target, { layoutMode: 'NONE', itemSpacing: 0, paddingTop: 0, fills: [] });
    vi.stubGlobal('figma', {
      mixed: Symbol('mixed'),
      getNodeByIdAsync: async (id: string) => id === source.id ? source : id === target.id ? target : null,
    });
  });

  it('copies only requested trait groups', async () => {
    const result = await opCloneTraits({
      sourceId: source.id,
      targetId: target.id,
      traits: 'layout,spacing',
    });
    expect(result.traits).toEqual(['layout', 'spacing']);
    expect(target.layoutMode).toBe('VERTICAL');
    expect(target.itemSpacing).toBe(16);
    expect(target.paddingTop).toBe(24);
    expect(target.fills).toEqual([]);
  });

  it('refuses text traits on non-text nodes', async () => {
    await expect(opCloneTraits({
      sourceId: source.id,
      targetId: target.id,
      traits: 'text',
    })).rejects.toThrow('text trait requires TEXT source and target');
  });
});
