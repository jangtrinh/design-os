/**
 * High-performance line-index lookup utility.
 *
 * Replaces O(N) per-finding `source.slice(0, idx).split("\n").length` with a single
 * O(N) pre-indexed newline scan and O(log L) binary search per lookup (where N is
 * the string length in UTF-16 code units, and L is the number of lines).
 *
 * Semantics are 100% equivalent to the native slice-and-split oracle,
 * including negative offsets, floats, NaN, out-of-bounds, and CRLF / Unicode.
 */

export interface LineIndex {
  readonly length: number;
  readonly lineCount: number;
  lineOf(idx: number): number;
}

/**
 * Normalizes an offset index identically to `String.prototype.slice(0, idx).length`.
 * Handles negative offsets (counted from string end), NaN, floats (truncated),
 * non-finite values, and bounds clamping.
 */
export function normalizeEnd(idx: number, len: number): number {
  if (Number.isNaN(idx)) return 0;
  const n = Math.trunc(idx) || 0;
  if (!Number.isFinite(n)) return n > 0 ? len : 0;
  if (n < 0) {
    const clamped = len + n;
    return clamped < 0 ? 0 : clamped;
  }
  return n > len ? len : n;
}

/**
 * Construct a LineIndex for a given source string.
 * Scans the source string in O(N) time to record newline positions,
 * enabling subsequent O(log L) line lookups via binary search.
 */
export function createLineIndex(source: string): LineIndex {
  const newlines: number[] = [];
  let pos = source.indexOf("\n");
  while (pos !== -1) {
    newlines.push(pos);
    pos = source.indexOf("\n", pos + 1);
  }

  const len = source.length;
  const newlineCount = newlines.length;
  const lineCount = newlineCount + 1;
  const firstNewline = newlineCount > 0 ? (newlines[0] as number) : -1;
  const lastNewline = newlineCount > 0 ? (newlines[newlineCount - 1] as number) : -1;

  return {
    length: len,
    lineCount,
    lineOf(idx: number): number {
      const end = normalizeEnd(idx, len);
      if (end <= 0 || newlineCount === 0 || end <= firstNewline) {
        return 1;
      }
      if (end > lastNewline) {
        return lineCount;
      }

      let lo = 0;
      let hi = newlineCount;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if ((newlines[mid] as number) < end) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      return lo + 1;
    },
  };
}

// ─── Bounded last-source cache ───────────────────────────────────────────────
// Capacity 2 accommodates alternating raw vs stripped/masked sources.
// Bounded to avoid growing with many documents. Large documents (> 256 KB) are
// scheduled for cleanup on microtask tick so memory is never retained indefinitely.

const MAX_CACHE_ENTRIES = 2;
const MAX_RETAIN_SIZE = 256 * 1024; // 256 KB

interface CacheEntry {
  source: string;
  index: LineIndex;
}

const cache: CacheEntry[] = [];
let clearScheduled = false;

function scheduleCleanupIfNeeded(): void {
  if (clearScheduled) return;
  const hasLargeEntry = cache.some((entry) => entry.source.length > MAX_RETAIN_SIZE);
  if (!hasLargeEntry) return;

  clearScheduled = true;
  queueMicrotask(() => {
    cache.length = 0;
    clearScheduled = false;
  });
}

/** Clear module-global line-index cache (useful for testing and deterministic resets). */
export function clearLineIndexCache(): void {
  cache.length = 0;
  clearScheduled = false;
}

/**
 * Return 1-based line number for a match at UTF-16 code-unit offset `idx`.
 * Identical semantics to `html.slice(0, idx).split("\n").length`.
 *
 * Uses a bounded last-source cache so repeated lookups against the same source
 * during a linting pass avoid re-indexing.
 */
export function lineOf(source: string, idx: number): number {
  for (let i = 0; i < cache.length; i++) {
    const entry = cache[i] as CacheEntry;
    if (entry.source === source) {
      if (i > 0) {
        cache.splice(i, 1);
        cache.unshift(entry);
      }
      return entry.index.lineOf(idx);
    }
  }

  const index = createLineIndex(source);
  if (cache.length >= MAX_CACHE_ENTRIES) {
    cache.pop();
  }
  cache.unshift({ source, index });
  scheduleCleanupIfNeeded();
  return index.lineOf(idx);
}
