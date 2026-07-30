/**
 * Registry-integrity phase 04 (5.4), §2 — `rotateIfNeeded` (byte-based retention for the
 * three append-only feeds) is the heaviest-tested part of this phase: a rotated file
 * resets both byte AND line numbering to 0 for the fresh live file, so getting the
 * marker wrong is the one way this phase could destroy (or strand) real history.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// Stage-4 MAJOR3 — `vi.spyOn(nodeFsNamespace, ...)` cannot redefine a live ESM named
// export ("Module namespace is not configurable in ESM"), so the ordering tests below
// mock the WHOLE module instead: `renameSync`/`writeFileSync` become `vi.fn()`s that
// still delegate to the real implementation (`importOriginal`), so every OTHER test in
// this file keeps its real, unmodified filesystem behavior — only the two ordering tests
// below install a temporary custom implementation, always restored afterward.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync), writeFileSync: vi.fn(actual.writeFileSync) };
});
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_ROTATE_POLICY, readRotateMarker, rotateIfNeeded, type RotatePolicy } from '../cli/src/transport/log-rotate.ts';

const renameMock = vi.mocked(renameSync);
const writeMock = vi.mocked(writeFileSync);

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fa-log-rotate-'));
  path = join(dir, 'figma.changes.jsonl');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  renameMock.mockClear();
  writeMock.mockClear();
});

function writeLines(n: number, lineBytes = 50): void {
  const line = 'x'.repeat(Math.max(0, lineBytes - 1)); // -1 for the trailing \n
  writeFileSync(path, `${line}\n`.repeat(n), 'utf8');
}

describe('rotateIfNeeded — the boundary', () => {
  it('does nothing when the file is absent', () => {
    expect(rotateIfNeeded(path)).toEqual({ rotated: false });
    expect(existsSync(path)).toBe(false);
  });

  it('does nothing when the file is under maxBytes', () => {
    writeLines(3, 20);
    const before = readFileSync(path, 'utf8');
    expect(rotateIfNeeded(path, { maxBytes: 1_000_000, keep: 3 })).toEqual({ rotated: false });
    expect(readFileSync(path, 'utf8')).toBe(before);
    expect(existsSync(`${path}.1`)).toBe(false);
  });

  it('rotates exactly at/over the size threshold: p → p.1, live file reset to empty', () => {
    writeLines(10, 100); // 1000 bytes
    const before = readFileSync(path, 'utf8');
    const policy: RotatePolicy = { maxBytes: 999, keep: 3 };
    expect(rotateIfNeeded(path, policy)).toEqual({ rotated: true });
    expect(readFileSync(path, 'utf8')).toBe(''); // fresh, empty live file
    expect(readFileSync(`${path}.1`, 'utf8')).toBe(before); // full pre-rotation content preserved
  });

  it('writes the marker BEFORE the live file is reset, with the correct pre-rotation counts', () => {
    writeLines(10, 100);
    rotateIfNeeded(path, { maxBytes: 999, keep: 3 });
    const marker = readRotateMarker(path);
    expect(marker).toMatchObject({ atLine: 10, atByte: 1000 });
    expect(typeof marker?.ts).toBe('number');
  });

  // Stage-4 MAJOR3 — the doc comment above `rotateIfNeeded` and this suite's own PRIOR
  // test name both claimed "marker BEFORE reset", but the code wrote it AFTER
  // `renameSync` + the truncating `writeFileSync`: a crash between those two calls left
  // the live file already rotated away with NO marker, so the reader could never tell a
  // real rotation from ordinary staleness/corruption. The prior test was a phantom — it
  // only asserted the marker's final CONTENTS, never the ORDER the writes actually
  // happened in. This spies on the real fs calls (still delegating to the real
  // implementation) to observe the actual call order, the only way to catch an ordering
  // bug a content-only assertion cannot see.
  it('actually calls writeFileSync(marker) BEFORE renameSync(live→.1) — ordering, not just final contents', () => {
    writeLines(10, 100);
    rotateIfNeeded(path, { maxBytes: 999, keep: 3 });

    const markerCallIdx = writeMock.mock.calls.findIndex((args) => String(args[0]).endsWith('.rotated.json'));
    const renameCallIdx = renameMock.mock.calls.findIndex((args) => args[0] === path && args[1] === `${path}.1`);
    expect(markerCallIdx).toBeGreaterThanOrEqual(0);
    expect(renameCallIdx).toBeGreaterThanOrEqual(0);
    // `invocationCallOrder` is a single counter shared across every mock in the test run,
    // so it is directly comparable between these two DIFFERENT mocked functions.
    const markerOrder = writeMock.mock.invocationCallOrder[markerCallIdx]!;
    const renameOrder = renameMock.mock.invocationCallOrder[renameCallIdx]!;
    expect(markerOrder).toBeLessThan(renameOrder);
  });

  it('a crash right at the rename still leaves the marker on disk (the crash-safety the ordering exists for)', () => {
    writeLines(10, 100);
    renameMock.mockImplementationOnce(() => {
      throw new Error('simulated crash right after the marker write');
    });
    expect(() => rotateIfNeeded(path, { maxBytes: 999, keep: 3 })).toThrow(/simulated crash/);
    // Even though the function threw before the live file was ever renamed away, the
    // marker recording the pre-rotation counts already exists — the reader can still
    // recognize "this file's numbering is stale" on the NEXT attempt, rather than
    // silently trusting a byte hint from before an interrupted rotation.
    const marker = readRotateMarker(path);
    expect(marker).toMatchObject({ atLine: 10, atByte: 1000 });
    // The live file itself was NEVER renamed away (the simulated crash happened first) —
    // still present with its original content, proving this really tests the ordering,
    // not some already-completed rotation.
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8').length).toBe(1000);
  });

  // Stage-4 MINOR18 — a SECOND rotation before the first marker is ever consumed must
  // fold the prior marker's atLine into the new one, not silently overwrite it with just
  // this generation's own (much smaller) count — otherwise `rotated_away_lines` would
  // understate the true gap by however many lines the FIRST rotation itself represented.
  it('a repeated rotation (marker never consumed in between) folds the PRIOR atLine into the new marker, never overwrites it', () => {
    const policy: RotatePolicy = { maxBytes: 999, keep: 3 };
    writeLines(10, 100); // first generation: 10 lines
    rotateIfNeeded(path, policy);
    expect(readRotateMarker(path)).toMatchObject({ atLine: 10 });

    writeLines(7, 150); // second generation (on the fresh live file): 7 MORE lines, over the threshold again
    rotateIfNeeded(path, policy);
    // Folded: 10 (never consumed) + 7 (this generation) = 17, NOT just 7.
    expect(readRotateMarker(path)).toMatchObject({ atLine: 17 });
  });

  it('keeps at most `keep` archived generations, oldest deleted first', () => {
    const policy: RotatePolicy = { maxBytes: 999, keep: 2 };
    writeLines(10, 100);
    rotateIfNeeded(path, policy); // → p.1 (gen A)
    writeLines(10, 100);
    rotateIfNeeded(path, policy); // → p.1 (gen B), old p.1 (gen A) → p.2
    writeLines(10, 100);
    rotateIfNeeded(path, policy); // → p.1 (gen C), p.1(B)→p.2, old p.2 (gen A) deleted
    expect(existsSync(`${path}.1`)).toBe(true);
    expect(existsSync(`${path}.2`)).toBe(true);
    expect(existsSync(`${path}.3`)).toBe(false); // never more than `keep`
  });

  it('archived generations are byte-identical to what was actually rotated out, in the right order', () => {
    const policy: RotatePolicy = { maxBytes: 40, keep: 2 };
    writeFileSync(path, 'AAAA\n'.repeat(10), 'utf8'); // 50 bytes → rotates
    rotateIfNeeded(path, policy);
    const genA = readFileSync(`${path}.1`, 'utf8');
    expect(genA).toBe('AAAA\n'.repeat(10));

    writeFileSync(path, 'BBBB\n'.repeat(10), 'utf8');
    rotateIfNeeded(path, policy);
    expect(readFileSync(`${path}.1`, 'utf8')).toBe('BBBB\n'.repeat(10)); // newest
    expect(readFileSync(`${path}.2`, 'utf8')).toBe(genA); // shifted down, unchanged
  });

  it('the default policy is 8 MiB / keep 3', () => {
    expect(DEFAULT_ROTATE_POLICY).toEqual({ maxBytes: 8 * 1024 * 1024, keep: 3 });
  });

  it('retention is byte-based, not time-based — an old-but-small file never rotates', () => {
    writeLines(2, 10);
    // Backdate the file's mtime far into the past — retention must not care.
    const old = new Date('2020-01-01T00:00:00Z');
    utimesSync(path, old, old);
    expect(rotateIfNeeded(path, { maxBytes: 1_000_000, keep: 3 })).toEqual({ rotated: false });
  });
});

describe('readRotateMarker — degrades safely, never crashes the append path', () => {
  it('returns undefined when no marker exists', () => {
    expect(readRotateMarker(path)).toBeUndefined();
  });

  it('returns undefined for a malformed marker file (never throws)', () => {
    writeFileSync(`${path}.rotated.json`, '{not valid json', 'utf8');
    expect(readRotateMarker(path)).toBeUndefined();
  });

  it('returns undefined for a marker missing a required field', () => {
    writeFileSync(`${path}.rotated.json`, JSON.stringify({ atLine: 5 }), 'utf8');
    expect(readRotateMarker(path)).toBeUndefined();
  });

  it('returns undefined for a marker with an out-of-range field (negative/non-integer)', () => {
    writeFileSync(`${path}.rotated.json`, JSON.stringify({ atLine: -1, atByte: 0, ts: 1 }), 'utf8');
    expect(readRotateMarker(path)).toBeUndefined();
    writeFileSync(`${path}.rotated.json`, JSON.stringify({ atLine: 1.5, atByte: 0, ts: 1 }), 'utf8');
    expect(readRotateMarker(path)).toBeUndefined();
  });

  it('round-trips a well-formed marker exactly', () => {
    writeLines(7, 30);
    rotateIfNeeded(path, { maxBytes: 100, keep: 3 });
    const marker = readRotateMarker(path);
    expect(marker).toMatchObject({ atLine: 7 });
  });
});

describe('rotateIfNeeded — repeated small appends eventually rotate exactly once per threshold crossing', () => {
  it('a file hovering right at the boundary rotates only when it actually crosses it', () => {
    const policy: RotatePolicy = { maxBytes: 100, keep: 3 };
    writeLines(1, 50); // 50 bytes — under
    expect(rotateIfNeeded(path, policy).rotated).toBe(false);
    writeFileSync(path, readFileSync(path, 'utf8') + 'y'.repeat(49) + '\n'); // now ~100 bytes — at/over
    expect(rotateIfNeeded(path, policy).rotated).toBe(true);
    expect(statSync(path).size).toBe(0);
  });
});
