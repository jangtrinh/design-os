// Concurrency & jobs (backlog 1.1+2.6+4.3), stage-4 fold — the pendingChunks abandoned-
// entry bound. A CLI that dies mid-chunk-send (before `last` arrives) must not leak its
// buffered frames forever; `abandonedChunkIds` is the pure decision the SAME park-sweeper
// interval acts on (no new timer).
import { describe, expect, it } from 'vitest';
import {
  abandonedChunkIds, deleteConnectionChunk, getConnectionChunks, sweepAbandonedChunks, type ChunkBuffers,
} from '../cli/src/transport/protocol-helpers.ts';

describe('abandonedChunkIds', () => {
  it('an abandoned mid-send entry (no frame in over the bound) is reported', () => {
    const pendingChunks = new Map([['req-1', { lastFrameAt: 1_000 }]]);
    expect(abandonedChunkIds(pendingChunks, /* now */ 1_600, /* boundMs */ 500)).toEqual(['req-1']);
  });

  it('an in-progress send (a frame arrived within the bound) is NOT swept', () => {
    const pendingChunks = new Map([['req-1', { lastFrameAt: 1_400 }]]);
    expect(abandonedChunkIds(pendingChunks, /* now */ 1_600, /* boundMs */ 500)).toEqual([]);
  });

  it('exactly at the bound is not yet abandoned — only strictly OVER it is', () => {
    const pendingChunks = new Map([['req-1', { lastFrameAt: 1_000 }]]);
    expect(abandonedChunkIds(pendingChunks, /* now */ 1_500, /* boundMs */ 500)).toEqual([]);
  });

  it('multiple entries: only the abandoned ones are reported, in iteration order', () => {
    const pendingChunks = new Map([
      ['old', { lastFrameAt: 0 }],
      ['fresh', { lastFrameAt: 1_500 }],
      ['also-old', { lastFrameAt: 100 }],
    ]);
    expect(abandonedChunkIds(pendingChunks, 2_000, 500)).toEqual(['old', 'also-old']);
  });

  it('an empty map reports nothing', () => {
    expect(abandonedChunkIds(new Map(), 1_000, 500)).toEqual([]);
  });
});

// Stage-4 fix round (minor 6) — chunk buffering keyed per CONNECTION, not by the
// process-unique request id alone (two simultaneous CLI processes could mint the SAME
// request id). `Conn` here is just a plain string standing in for a WebSocket reference.
describe('getConnectionChunks / deleteConnectionChunk — per-connection scoping', () => {
  it('two DIFFERENT connections buffering under the SAME request id never merge', () => {
    const buffers: ChunkBuffers<string> = new Map();
    const connA = 'connection-A';
    const connB = 'connection-B';
    const bufA = getConnectionChunks(buffers, connA);
    bufA.set('c_1_1000', { frames: ['{"seq":0, "from":"A"}'], lastFrameAt: 1 });
    const bufB = getConnectionChunks(buffers, connB);
    bufB.set('c_1_1000', { frames: ['{"seq":0, "from":"B"}'], lastFrameAt: 1 }); // COLLIDING id

    // Each connection's own buffer is untouched by the other's — proving the fix: a flat
    // Map<string, ...> keyed by id alone would have let B's `set` overwrite A's entry.
    expect(getConnectionChunks(buffers, connA).get('c_1_1000')?.frames).toEqual(['{"seq":0, "from":"A"}']);
    expect(getConnectionChunks(buffers, connB).get('c_1_1000')?.frames).toEqual(['{"seq":0, "from":"B"}']);
  });

  it('get-or-create returns the SAME inner map on repeated calls for one connection', () => {
    const buffers: ChunkBuffers<string> = new Map();
    const first = getConnectionChunks(buffers, 'conn-1');
    first.set('id', { frames: ['x'], lastFrameAt: 1 });
    const second = getConnectionChunks(buffers, 'conn-1');
    expect(second.get('id')?.frames).toEqual(['x']);
  });

  it('deleteConnectionChunk removes just that id, keeping the rest of the connection\'s buffer', () => {
    const buffers: ChunkBuffers<string> = new Map();
    const buf = getConnectionChunks(buffers, 'conn-1');
    buf.set('id-1', { frames: ['a'], lastFrameAt: 1 });
    buf.set('id-2', { frames: ['b'], lastFrameAt: 1 });
    deleteConnectionChunk(buffers, 'conn-1', 'id-1');
    const remaining = getConnectionChunks(buffers, 'conn-1');
    expect(remaining.has('id-1')).toBe(false);
    expect(remaining.has('id-2')).toBe(true);
  });

  it('deleteConnectionChunk prunes the OUTER entry once a connection has nothing buffered left', () => {
    const buffers: ChunkBuffers<string> = new Map();
    getConnectionChunks(buffers, 'conn-1').set('id-1', { frames: ['a'], lastFrameAt: 1 });
    deleteConnectionChunk(buffers, 'conn-1', 'id-1');
    expect(buffers.has('conn-1')).toBe(false); // never leaves an empty inner Map behind
  });

  it('deleting from a connection that was never buffered is a no-op', () => {
    const buffers: ChunkBuffers<string> = new Map();
    expect(() => deleteConnectionChunk(buffers, 'never-seen', 'id')).not.toThrow();
  });
});

describe('sweepAbandonedChunks — per-connection sweep', () => {
  it('sweeps an abandoned entry from ONE connection without touching another\'s still-fresh buffer', () => {
    const buffers: ChunkBuffers<string> = new Map();
    getConnectionChunks(buffers, 'conn-A').set('id-old', { frames: ['a'], lastFrameAt: 0 });
    getConnectionChunks(buffers, 'conn-B').set('id-fresh', { frames: ['b'], lastFrameAt: 900 });
    sweepAbandonedChunks(buffers, 1_000, 500);
    expect(buffers.has('conn-A')).toBe(false); // abandoned entry swept, connection pruned
    expect(getConnectionChunks(buffers, 'conn-B').has('id-fresh')).toBe(true); // untouched
  });

  it('a connection with a mix of stale and fresh entries keeps only the fresh one', () => {
    const buffers: ChunkBuffers<string> = new Map();
    const buf = getConnectionChunks(buffers, 'conn-A');
    buf.set('id-old', { frames: ['a'], lastFrameAt: 0 });
    buf.set('id-fresh', { frames: ['b'], lastFrameAt: 900 });
    sweepAbandonedChunks(buffers, 1_000, 500);
    const survivor = getConnectionChunks(buffers, 'conn-A');
    expect(survivor.has('id-old')).toBe(false);
    expect(survivor.has('id-fresh')).toBe(true);
  });
});
