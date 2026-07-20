import { describe, expect, it } from 'vitest';
import {
  buildCorrectionEvent,
  mergeCorrectionStores,
  retainCorrectionEvents,
} from '../shared/supervised-memory';

const event = (eventId: string, timestamp: string, unresolved = false) => buildCorrectionEvent({
  eventId,
  fileKey: 'file-1',
  nodeId: '1:2',
  source: 'designer',
  kind: 'designer-correction',
  timestamp,
  unresolved,
  traits: { spacing: { from: 8, to: 12 } },
});

describe('supervised correction memory', () => {
  it('merges unique events deterministically', () => {
    const a = event('a', '2026-07-01T00:00:00.000Z');
    const b = event('b', '2026-07-02T00:00:00.000Z');
    expect(mergeCorrectionStores([b], [a]).active.map((item) => item.eventId)).toEqual(['a', 'b']);
  });

  it('quarantines same-id different-content and keeps project active', () => {
    const project = event('a', '2026-07-01T00:00:00.000Z');
    const edge = buildCorrectionEvent({ ...project, timestamp: '2026-07-03T00:00:00.000Z' });
    const result = mergeCorrectionStores([project], [edge]);
    expect(result.quarantined).toHaveLength(1);
    expect(result.active[0]?.timestamp).toBe(project.timestamp);
  });

  it('applies explicit tombstones', () => {
    const original = event('a', '2026-07-01T00:00:00.000Z');
    const tombstone = buildCorrectionEvent({
      eventId: 'delete-a',
      fileKey: 'file-1',
      nodeId: '1:2',
      source: 'system',
      kind: 'tombstone',
      timestamp: '2026-07-02T00:00:00.000Z',
      causalParent: 'a',
      traits: {},
    });
    const result = mergeCorrectionStores([original, tombstone], []);
    expect(result.active).toEqual([]);
    expect(result.tombstonedIds).toEqual(['a']);
  });

  it('retains unresolved events beyond age and count limits', () => {
    const oldUnresolved = event('protected', '2020-01-01T00:00:00.000Z', true);
    const recent = [
      event('a', '2026-07-18T00:00:00.000Z'),
      event('b', '2026-07-19T00:00:00.000Z'),
    ];
    expect(retainCorrectionEvents([oldUnresolved, ...recent], new Date('2026-07-20T00:00:00.000Z'), 2)
      .map((item) => item.eventId)).toEqual(['protected', 'b']);
  });
});
