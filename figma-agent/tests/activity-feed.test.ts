// The panel activity feed's pure record plumbing — start/land a row, keyed by request
// id, never by position. IA v2 moved the row's rendered TEXT (label/meta → one sentence)
// to activity-sentence.ts (see activity-sentence.test.ts); this file only tests the
// plumbing that survives the cut: the record shape, formatting helpers, and the
// start/land/push lifecycle.
import { describe, it, expect } from 'vitest';
import {
  formatClock, formatTimestamp, formatDuration, timeAgo,
  toActivityRecord, toActivityResult, pushActivity, resolveActivity, diffRowKeys,
  type ActivityRecord,
} from '../plugin/src/ui/activity-feed.ts';

const rec = (over: Partial<ActivityRecord> = {}): ActivityRecord => ({
  id: 'c_1', tool: 'EXEC_JS', pending: true, ok: true, ms: 0, at: 1_000, ...over,
});

describe('formatClock / formatTimestamp / formatDuration / timeAgo', () => {
  it('formatClock is a zero-padded local HH:MM:SS', () => {
    const at = new Date(2026, 6, 16, 9, 5, 3).getTime();
    expect(formatClock(at)).toBe('09:05:03');
  });
  it('formatClock refuses to invent a time from a broken stamp', () => {
    expect(formatClock(Number.NaN)).toBe('--:--:--');
  });
  it('formatTimestamp is the absolute date+time the compact age cannot say', () => {
    expect(formatTimestamp(new Date(2026, 6, 16, 14, 32, 7).getTime())).toBe('2026-07-16 14:32:07');
  });
  it('formatTimestamp refuses to invent a stamp from a broken one', () => {
    expect(formatTimestamp(Number.NaN)).toBe('—');
  });
  it('formatDuration is ms under a second, then 1-decimal seconds, then m+s', () => {
    expect(formatDuration(12)).toBe('12ms');
    expect(formatDuration(1_250)).toBe('1.3s');
    expect(formatDuration(-1)).toBe('—');
  });
  it('formatDuration breaks to minutes past 60s — "124.0s" is a number, not a duration', () => {
    expect(formatDuration(60_000)).toBe('1m 0s');
    expect(formatDuration(124_000)).toBe('2m 4s');
    expect(formatDuration(59_900)).toBe('59.9s'); // still under the minute
  });
  it('timeAgo is relative to now and COMPACT — the column already means "ago"', () => {
    const now = 1_000_000;
    expect(timeAgo(now, now)).toBe('now');
    expect(timeAgo(now, now - 5_000)).toBe('5s');
    expect(timeAgo(now, now - 180_000)).toBe('3m');
    expect(timeAgo(now, now - 7_200_000)).toBe('2h');
  });
  it('timeAgo never spends width on the word "ago" — it is the first thing truncation eats', () => {
    expect(timeAgo(1_000_000, 940_000)).not.toContain('ago');
  });
});

describe('toActivityRecord — defensive coercion of the start-event detail', () => {
  it('opens a PENDING row carrying the id + label', () => {
    expect(toActivityRecord({ phase: 'start', id: 'c_7', tool: 'EXEC_JS', label: 'Scan · 1:23', at: 500 }))
      .toEqual({ id: 'c_7', tool: 'EXEC_JS', label: 'Scan · 1:23', pending: true, ok: true, ms: 0, at: 500 });
  });
  it('rejects a missing/blank tool', () => {
    expect(toActivityRecord({ ok: true })).toBeNull();
    expect(toActivityRecord({ tool: '' })).toBeNull();
    expect(toActivityRecord(null)).toBeNull();
    expect(toActivityRecord('nope')).toBeNull();
  });
  it('BACKWARD-COMPAT: a detail with no label still opens a row (the sentence module falls back to the tool)', () => {
    const r = toActivityRecord({ id: 'c_1', tool: 'STATUS', at: 500 });
    expect(r?.label).toBeUndefined();
    expect(r?.tool).toBe('STATUS');
  });
  it('synthesises an id and defaults `at` rather than dropping the row', () => {
    const r = toActivityRecord({ tool: 'X' });
    expect(r?.id).not.toBe('');
    expect(typeof r?.at).toBe('number');
  });
});

describe('toActivityResult — coercion of the done-event detail', () => {
  it('accepts a well-formed patch', () => {
    expect(toActivityResult({ phase: 'done', id: 'c_2', ok: true, ms: 40, result: '→ 3 nodes' }))
      .toEqual({ id: 'c_2', ok: true, ms: 40, result: '→ 3 nodes' });
  });
  it('rejects a patch with no id — it could not be landed on any row', () => {
    expect(toActivityResult({ ok: true, ms: 5 })).toBeNull();
    expect(toActivityResult({ id: '', ok: true })).toBeNull();
    expect(toActivityResult(null)).toBeNull();
  });
  it('coerces a bad ms and treats a non-true ok as failure', () => {
    expect(toActivityResult({ id: 'c_3', ms: -3 })).toEqual({ id: 'c_3', ok: false, ms: 0 });
  });
  it('carries the wire error code and a reply-provided node name, when present', () => {
    expect(toActivityResult({ id: 'c_4', ok: false, ms: 8, result: 'x', code: 'E_EVAL' }))
      .toEqual({ id: 'c_4', ok: false, ms: 8, result: 'x', code: 'E_EVAL' });
    expect(toActivityResult({ id: 'c_5', ok: true, ms: 8, nodeName: 'Hero card' }))
      .toEqual({ id: 'c_5', ok: true, ms: 8, nodeName: 'Hero card' });
  });
});

describe('pushActivity — newest-first, capped at 50', () => {
  const at = (n: number): ActivityRecord => rec({ id: `c_${n}`, tool: `T${n}`, at: n });
  it('prepends newest', () => {
    const buf = pushActivity(pushActivity([], at(1)), at(2));
    expect(buf.map((r) => r.tool)).toEqual(['T2', 'T1']);
  });
  it('never exceeds the cap and drops the oldest', () => {
    let buf: ActivityRecord[] = [];
    for (let i = 0; i < 60; i++) buf = pushActivity(buf, at(i));
    expect(buf).toHaveLength(50);
    expect(buf[0].tool).toBe('T59'); // newest kept
    expect(buf.at(-1)?.tool).toBe('T10'); // oldest 10 dropped
  });
});

describe('resolveActivity — a reply lands on ITS OWN row, by id', () => {
  it('closes the pending row and attaches the outcome', () => {
    const buf = pushActivity([], rec({ id: 'c_1', label: 'Scan · 1:23' }));
    const [row] = resolveActivity(buf, { id: 'c_1', ok: true, ms: 42, result: '→ 3 nodes' });
    expect(row).toMatchObject({ pending: false, ok: true, ms: 42, result: '→ 3 nodes', label: 'Scan · 1:23' });
  });
  it('matches by id, NOT by position — two commands can be in flight at once', () => {
    // The panel is shared by every CLI caller, so the newest row is not necessarily
    // the row a reply belongs to. Landing on position would credit the wrong request.
    let buf = pushActivity([], rec({ id: 'first', tool: 'A', at: 1 }));
    buf = pushActivity(buf, rec({ id: 'second', tool: 'B', at: 2 })); // newest, still running
    const out = resolveActivity(buf, { id: 'first', ok: true, ms: 10, result: '→ done' });
    expect(out.find((r) => r.id === 'first')).toMatchObject({ pending: false, result: '→ done' });
    expect(out.find((r) => r.id === 'second')).toMatchObject({ pending: true });
  });
  it('drops a reply whose row is gone (evicted by the cap) rather than rewriting another', () => {
    const buf = pushActivity([], rec({ id: 'alive' }));
    expect(resolveActivity(buf, { id: 'evicted', ok: false, ms: 1 })).toEqual(buf);
  });
  it('marks a failure without pretending it succeeded', () => {
    const buf = pushActivity([], rec({ id: 'c_1' }));
    const [row] = resolveActivity(buf, { id: 'c_1', ok: false, ms: 8, result: 'node not found' });
    expect(row).toMatchObject({ pending: false, ok: false, result: 'node not found' });
  });
  it('attaches the error code and node name onto the record when the patch carries them', () => {
    const buf = pushActivity([], rec({ id: 'c_1' }));
    const [row] = resolveActivity(buf, { id: 'c_1', ok: false, ms: 8, code: 'E_WRONG_FILE' });
    expect(row.errorCode).toBe('E_WRONG_FILE');
    const buf2 = pushActivity([], rec({ id: 'c_2' }));
    const [row2] = resolveActivity(buf2, { id: 'c_2', ok: true, ms: 8, nodeName: 'Hero card' });
    expect(row2.nodeName).toBe('Hero card');
  });

  // Owner addendum (task #145) — the pre-composed `sentence` a sync result / job status
  // carries lands verbatim onto the row; an ordinary wire-command row (no `sentence` in
  // the patch) is completely unaffected.
  it('lands a pre-composed `sentence` onto the row when the patch carries one', () => {
    const buf = pushActivity([], rec({ id: 'c_1', tool: 'RECONCILE' }));
    const [row] = resolveActivity(buf, { id: 'c_1', ok: true, ms: 8, sentence: 'Synced VSF - PCP — 3 added' });
    expect(row.sentence).toBe('Synced VSF - PCP — 3 added');
  });

  it('a patch with no `sentence` leaves an existing row without one (ordinary rows untouched)', () => {
    const buf = pushActivity([], rec({ id: 'c_1', tool: 'EXEC_JS' }));
    const [row] = resolveActivity(buf, { id: 'c_1', ok: true, ms: 8, result: '→ 3 nodes' });
    expect(row.sentence).toBeUndefined();
  });
});

describe('diffRowKeys — which rows are genuinely new since the last render (backlog 4.7)', () => {
  it('every key is new on the very first render (empty prev)', () => {
    expect(diffRowKeys([], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('no keys are new when the render is identical to the last one', () => {
    expect(diffRowKeys(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('only the keys absent from prev are reported, order preserved from next', () => {
    expect(diffRowKeys(['a'], ['b', 'a', 'c'])).toEqual(['b', 'c']);
  });

  it('a key that DISAPPEARS (evicted by the cap) is simply absent from the result, not an error', () => {
    expect(diffRowKeys(['a', 'b', 'c'], ['b'])).toEqual([]);
  });

  it('a pending row that later resolves keeps the SAME id, so it is never "new" twice', () => {
    // Simulates: render 1 shows the row pending (new); render 2 shows the same id
    // resolved to done — same key, so it must NOT be reported as new again (this is
    // what stops the flash on error resolution, not just the 1s heartbeat tick).
    const render1Keys = diffRowKeys([], ['req-1']);
    expect(render1Keys).toEqual(['req-1']);
    const render2Keys = diffRowKeys(['req-1'], ['req-1']);
    expect(render2Keys).toEqual([]);
  });

  it('an empty next list yields no new keys, regardless of prev', () => {
    expect(diffRowKeys(['a', 'b'], [])).toEqual([]);
  });

  it('is pure — does not mutate either input array', () => {
    const prev = ['a'];
    const next = ['a', 'b'];
    diffRowKeys(prev, next);
    expect(prev).toEqual(['a']);
    expect(next).toEqual(['a', 'b']);
  });
});
