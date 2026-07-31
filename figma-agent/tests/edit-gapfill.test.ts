// Reconnect gap-fill (wave 4.4 phase 02 §2) — the PURE core: snapshot chunking, coordinate
// normalization, and the diff. No figma access — the read/write/boot-diff halves in
// edit-gapfill.ts cannot be unit-tested outside a live plugin sandbox (same limitation as
// main.ts itself), verified instead by the phase's budgeted real-canvas run.
import { describe, it, expect } from 'vitest';
import {
  SNAPSHOT_CHUNK_BYTES, deletedPageIds, diffSnapshots, gapfillEditsForPage, mergeUpdatedRecords,
  normalizeSnapshotCoord, pageWasTruncated, resolvePageWrite, splitSnapshotChunks,
  type NodeSnapshot,
} from '../plugin/src/main/edit-gapfill.ts';

function node(over: Partial<NodeSnapshot> = {}): NodeSnapshot {
  return { id: 'n1', name: 'Hero', type: 'FRAME', x: 0, y: 0, parent: null, ...over };
}

describe('normalizeSnapshotCoord — rounds to 0.5px', () => {
  it('rounds to the nearest half-pixel', () => {
    expect(normalizeSnapshotCoord(1.24)).toBe(1);
    expect(normalizeSnapshotCoord(1.26)).toBe(1.5);
    expect(normalizeSnapshotCoord(1.76)).toBe(2);
  });

  it('a sub-pixel jitter within the same half-pixel bucket produces the SAME value', () => {
    expect(normalizeSnapshotCoord(10.01)).toBe(normalizeSnapshotCoord(10.02));
  });
});

describe('splitSnapshotChunks — packs records within the byte budget, never mid-record', () => {
  it('a small set fits in one chunk', () => {
    const chunks = splitSnapshotChunks([node({ id: 'a' }), node({ id: 'b' })]);
    expect(chunks).toHaveLength(1);
    expect(JSON.parse(chunks[0]!)).toHaveLength(2);
  });

  it('an empty set produces zero chunks', () => {
    expect(splitSnapshotChunks([])).toEqual([]);
  });

  it('splits across multiple chunks once the byte budget is exceeded', () => {
    // A big name pushes each record's own JSON size up so a handful together exceed the
    // (real) 64_000-byte budget without needing thousands of records in the test.
    const bigName = 'x'.repeat(SNAPSHOT_CHUNK_BYTES / 3);
    const records = Array.from({ length: 5 }, (_, i) => node({ id: `n${i}`, name: bigName }));
    const chunks = splitSnapshotChunks(records);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk parses independently as valid JSON (never split mid-record).
    const total = chunks.flatMap((c) => JSON.parse(c) as NodeSnapshot[]);
    expect(total).toHaveLength(5);
  });

  it('a single record larger than the whole budget still lands whole, in its own chunk', () => {
    const hugeName = 'x'.repeat(SNAPSHOT_CHUNK_BYTES * 2);
    const chunks = splitSnapshotChunks([node({ name: hugeName })]);
    expect(chunks).toHaveLength(1);
    expect(JSON.parse(chunks[0]!)).toHaveLength(1);
  });
});

describe('diffSnapshots — existence/name/position, one fact category at a time', () => {
  it('id present in next, absent in prev → created', () => {
    const diff = diffSnapshots([], [node({ id: 'a' })]);
    expect(diff.created.map((n) => n.id)).toEqual(['a']);
    expect(diff.deleted).toEqual([]);
    expect(diff.renamed).toEqual([]);
    expect(diff.moved).toEqual([]);
  });

  it('id present in prev, absent in next → deleted', () => {
    const diff = diffSnapshots([node({ id: 'a' })], []);
    expect(diff.deleted.map((n) => n.id)).toEqual(['a']);
    expect(diff.created).toEqual([]);
  });

  it('same id, different name → renamed', () => {
    const diff = diffSnapshots([node({ id: 'a', name: 'Old' })], [node({ id: 'a', name: 'New' })]);
    expect(diff.renamed).toHaveLength(1);
    expect(diff.renamed[0]!.prev.name).toBe('Old');
    expect(diff.renamed[0]!.next.name).toBe('New');
    expect(diff.moved).toEqual([]);
  });

  it('same id, x or y moved beyond 0.5px → moved', () => {
    const diff = diffSnapshots([node({ id: 'a', x: 0, y: 0 })], [node({ id: 'a', x: 10, y: 0 })]);
    expect(diff.moved).toHaveLength(1);
    expect(diff.renamed).toEqual([]);
  });

  it('a move of EXACTLY 0.5px is NOT reported (only strictly over the epsilon is)', () => {
    const diff = diffSnapshots([node({ id: 'a', x: 0 })], [node({ id: 'a', x: 0.5 })]);
    expect(diff.moved).toEqual([]);
  });

  it('a node that changed BOTH name and position is reported in BOTH lists — neither drops it for the other', () => {
    const diff = diffSnapshots(
      [node({ id: 'a', name: 'Old', x: 0, y: 0 })],
      [node({ id: 'a', name: 'New', x: 100, y: 100 })],
    );
    expect(diff.renamed.map((p) => p.next.id)).toEqual(['a']);
    expect(diff.moved.map((p) => p.next.id)).toEqual(['a']);
  });

  it('an unchanged node produces no facts at all', () => {
    const diff = diffSnapshots([node({ id: 'a' })], [node({ id: 'a' })]);
    expect(diff).toEqual({ created: [], deleted: [], renamed: [], moved: [] });
  });

  it('a delete→create of the SAME id (recreated) reads as both deleted and created, honestly — no attempt to infer "same node"', () => {
    const diff = diffSnapshots([node({ id: 'a', name: 'Old' })], [node({ id: 'a', name: 'Old' })]);
    // Same id, same name/position — unchanged, not a special "recreated" case; diffSnapshots
    // only sees the two full snapshots, not the intermediate deletion.
    expect(diff).toEqual({ created: [], deleted: [], renamed: [], moved: [] });
  });
});

describe('mergeUpdatedRecords — one `updated` entry per node, union of changedProps (the wire contract)', () => {
  it('a rename alone → changedProps ["name"]', () => {
    const merged = mergeUpdatedRecords([{ prev: node({ name: 'Old' }), next: node({ name: 'New' }) }], []);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.changedProps).toEqual(['name']);
  });

  it('a move alone → changedProps ["x","y"]', () => {
    const merged = mergeUpdatedRecords([], [{ prev: node({ x: 0 }), next: node({ x: 10 }) }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.changedProps).toEqual(['x', 'y']);
  });

  it('a node in BOTH renamed and moved merges into ONE entry with the union', () => {
    const renamedPair = { prev: node({ id: 'a', name: 'Old' }), next: node({ id: 'a', name: 'New', x: 10 }) };
    const movedPair = { prev: node({ id: 'a', x: 0 }), next: node({ id: 'a', name: 'New', x: 10 }) };
    const merged = mergeUpdatedRecords([renamedPair], [movedPair]);
    expect(merged).toHaveLength(1); // ONE entry, not two
    expect(merged[0]!.changedProps).toEqual(['name', 'x', 'y']);
  });

  it('two different nodes stay as two separate entries', () => {
    const merged = mergeUpdatedRecords(
      [{ prev: node({ id: 'a', name: 'Old' }), next: node({ id: 'a', name: 'New' }) }],
      [{ prev: node({ id: 'b', x: 0 }), next: node({ id: 'b', x: 10 }) }],
    );
    expect(merged.map((m) => m.rec.id).sort()).toEqual(['a', 'b']);
  });
});

describe('gapfillEditsForPage — EditInput shape: source-neutral here, actor stamped owner by the caller', () => {
  it('a created node emits op created, empty changedProps', () => {
    const edits = gapfillEditsForPage({ created: [node({ id: 'a' })], deleted: [], renamed: [], moved: [] }, 'Page 1');
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ op: 'created', nodeId: 'a', page: 'Page 1', actor: 'owner', changedProps: [] });
  });

  it('a deleted node emits op deleted', () => {
    const edits = gapfillEditsForPage({ created: [], deleted: [node({ id: 'a' })], renamed: [], moved: [] }, 'Page 1');
    expect(edits[0]).toMatchObject({ op: 'deleted', nodeId: 'a' });
  });

  it('renamed+moved for the same node produce exactly ONE updated edit', () => {
    const pair = { prev: node({ id: 'a', name: 'Old', x: 0 }), next: node({ id: 'a', name: 'New', x: 10 }) };
    const edits = gapfillEditsForPage({ created: [], deleted: [], renamed: [pair], moved: [pair] }, 'Page 1');
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ op: 'updated', changedProps: ['name', 'x', 'y'] });
  });

  it('parentName is always null — gap-fill never invents a parent it did not track', () => {
    const edits = gapfillEditsForPage({ created: [node()], deleted: [], renamed: [], moved: [] }, 'Page 1');
    expect(edits[0]!.parentName).toBeNull();
  });

  it('an empty diff produces no edits', () => {
    expect(gapfillEditsForPage({ created: [], deleted: [], renamed: [], moved: [] }, 'Page 1')).toEqual([]);
  });
});

describe('deletedPageIds — a page in the PREVIOUS manifest missing from the CURRENT set entirely (M4)', () => {
  it('finds a page id present in prev but absent from current', () => {
    expect(deletedPageIds(['p1', 'p2'], new Set(['p1']))).toEqual(['p2']);
  });

  it('every prev page still present → nothing deleted', () => {
    expect(deletedPageIds(['p1', 'p2'], new Set(['p1', 'p2']))).toEqual([]);
  });

  it('no previous pages at all → nothing to report', () => {
    expect(deletedPageIds([], new Set(['p1']))).toEqual([]);
  });

  it('every prev page gone → all reported', () => {
    expect(deletedPageIds(['p1', 'p2'], new Set())).toEqual(['p1', 'p2']);
  });
});

describe('pageWasTruncated — either side truncated makes created/deleted unreliable (M5)', () => {
  it('neither side truncated → false', () => {
    expect(pageWasTruncated(false, false)).toBe(false);
  });

  it('previous side truncated alone → true', () => {
    expect(pageWasTruncated(true, false)).toBe(true);
  });

  it('current side truncated alone → true', () => {
    expect(pageWasTruncated(false, true)).toBe(true);
  });

  it('both sides truncated → true', () => {
    expect(pageWasTruncated(true, true)).toBe(true);
  });

  it('a page with no previous manifest entry at all (prevTruncated undefined) is judged by the current side alone', () => {
    expect(pageWasTruncated(undefined, false)).toBe(false);
    expect(pageWasTruncated(undefined, true)).toBe(true);
  });
});

describe('resolvePageWrite — per-page atomicity: one page\'s failure never corrupts or drops another\'s data (N1)', () => {
  const page = { id: 'page-1', name: 'Screens' };
  const prevEntry = { pageId: 'page-1', pageName: 'Screens', chunks: 2, truncated: false };

  it('a successful snapshot produces a fresh entry + the chunks to write', () => {
    const result = resolvePageWrite(page, prevEntry, () => ({ records: [node()], truncated: false }));
    expect(result).not.toBeNull();
    expect(result!.entry).toEqual({ pageId: 'page-1', pageName: 'Screens', chunks: 1, truncated: false });
    expect(result!.chunksToWrite).toEqual([JSON.stringify([node()])]);
  });

  // The core N1 case: a page's own snapshot walk throws (e.g. `findAll` on an unloaded
  // page stub) — the PREVIOUS entry carries forward VERBATIM, and chunksToWrite is null
  // (write NOTHING for this page — its existing chunks on disk stay exactly as they were).
  it('a throwing snapshot carries the PREVIOUS entry forward verbatim, writes nothing', () => {
    const result = resolvePageWrite(page, prevEntry, () => { throw new Error('findAll failed'); });
    expect(result).toEqual({ entry: prevEntry, chunksToWrite: null });
  });

  it('a throwing snapshot with NO previous entry (brand-new page, first attempt failed) returns null — nothing to carry, nothing to write', () => {
    const result = resolvePageWrite(page, undefined, () => { throw new Error('findAll failed'); });
    expect(result).toBeNull();
  });

  it('the previous entry is never mutated by a later successful write for a DIFFERENT page', () => {
    const otherPage = { id: 'page-2', name: 'Other' };
    const otherPrev = { pageId: 'page-2', pageName: 'Other', chunks: 5, truncated: true };
    resolvePageWrite(page, prevEntry, () => { throw new Error('boom'); });
    const otherResult = resolvePageWrite(otherPage, otherPrev, () => ({ records: [], truncated: false }));
    expect(otherResult!.entry).toEqual({ pageId: 'page-2', pageName: 'Other', chunks: 0, truncated: false });
    expect(prevEntry).toEqual({ pageId: 'page-1', pageName: 'Screens', chunks: 2, truncated: false }); // untouched
  });
});
