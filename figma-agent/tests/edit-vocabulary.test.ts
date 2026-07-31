// shared/edit-vocabulary.ts — scene-edit verbs, distinct from activity-sentence.ts's
// command vocabulary. One case per verb, the null-name honesty degrade, and the
// parentName-present/absent branch.
import { describe, it, expect } from 'vitest';
import { editSentence, sceneEditVerb, type SceneEditSentenceInput } from '../shared/edit-vocabulary.ts';

const base = (over: Partial<SceneEditSentenceInput> = {}): SceneEditSentenceInput => ({
  op: 'updated',
  nodeName: 'Hero card',
  nodeType: 'FRAME',
  parentName: null,
  changedProps: [],
  ...over,
});

describe('sceneEditVerb', () => {
  it('created → created, deleted → deleted, regardless of changedProps', () => {
    expect(sceneEditVerb('created', [])).toBe('created');
    expect(sceneEditVerb('deleted', ['fills'])).toBe('deleted');
  });

  it('updated with `name` in changedProps → renamed, even alongside other props', () => {
    expect(sceneEditVerb('updated', ['name'])).toBe('renamed');
    expect(sceneEditVerb('updated', ['fills', 'name', 'x'])).toBe('renamed');
  });

  it('updated with a position/layout prop (no name) → moved', () => {
    expect(sceneEditVerb('updated', ['x'])).toBe('moved');
    expect(sceneEditVerb('updated', ['relativeTransform'])).toBe('moved');
    expect(sceneEditVerb('updated', ['constraints'])).toBe('moved');
  });

  it('updated with neither name nor position → restyled (the residual bucket)', () => {
    expect(sceneEditVerb('updated', ['fills'])).toBe('restyled');
    expect(sceneEditVerb('updated', ['characters'])).toBe('restyled');
  });

  it('updated with an empty changedProps still resolves honestly (restyled), never throws', () => {
    expect(sceneEditVerb('updated', [])).toBe('restyled');
  });

  it('rename wins over move when both name and a position prop are present', () => {
    expect(sceneEditVerb('updated', ['x', 'name'])).toBe('renamed');
  });
});

describe('editSentence', () => {
  it('matches the spec A1 example verbatim: a delete with a known name + parent', () => {
    expect(editSentence({
      op: 'deleted', nodeName: 'Subtitle', nodeType: 'TEXT', parentName: 'Roles / Detail', changedProps: [],
    })).toBe('Deleted text "Subtitle" in "Roles / Detail"');
  });

  it('created, no parent', () => {
    expect(editSentence(base({ op: 'created', nodeName: 'Hero card', nodeType: 'FRAME', parentName: null })))
      .toBe('Created frame "Hero card"');
  });

  it('restyled, no parent', () => {
    expect(editSentence(base({ op: 'updated', nodeName: 'Button', nodeType: 'INSTANCE', changedProps: ['fills'] })))
      .toBe('Restyled instance "Button"');
  });

  it('moved, with a parent', () => {
    expect(editSentence(base({
      op: 'updated', nodeName: 'CTA', nodeType: 'FRAME', changedProps: ['x', 'y'], parentName: 'Screen 1',
    }))).toBe('Moved frame "CTA" in "Screen 1"');
  });

  it('renamed', () => {
    expect(editSentence(base({ op: 'updated', nodeName: 'New Name', nodeType: 'FRAME', changedProps: ['name'] })))
      .toBe('Renamed frame "New Name"');
  });

  it('degrades honestly to the raw type when nodeName is null — never invents one', () => {
    expect(editSentence({ op: 'deleted', nodeName: null, nodeType: 'TEXT', parentName: null, changedProps: [] }))
      .toBe('Deleted a TEXT node');
  });

  it('degrades honestly when nodeName is an empty string too', () => {
    expect(editSentence(base({ nodeName: '', nodeType: 'FRAME' }))).toBe('Restyled a FRAME node');
  });

  it('an empty parentName is treated as absent (no "in ..." clause)', () => {
    expect(editSentence(base({ parentName: '' }))).toBe('Restyled frame "Hero card"');
  });

  it('humanizes a multi-word type: COMPONENT_SET → "component set"', () => {
    expect(editSentence(base({ nodeType: 'COMPONENT_SET', changedProps: ['name'], op: 'updated' })))
      .toBe('Renamed component set "Hero card"');
  });
});
