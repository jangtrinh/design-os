// Pure view-model for the panel's ACTIVITY FEED — no DOM, no WebSocket, no Figma
// API. Split out of panel-model.ts (which owns the connection chrome) when the feed
// grew a per-operation vocabulary of its own; panel-ui.ts is the DOM glue and
// ui-relay.ts feeds it. IA v2: each row renders ONE English sentence via
// ./activity-sentence.ts (which consumes this module's record shape, unchanged) —
// the row-level `activityLabel`/`activityMeta` split moved there. Every branch
// still here is unit-tested in figma-agent/tests/activity-feed.test.ts.

/** One row of the feed: a request from the moment it starts until its reply lands. */
export interface ActivityRecord {
  /** Wire request id — the join between the start event and its result. */
  id: string;
  /** Wire command name (EXEC_JS, IMPORT_PAYLOAD…) — the sentence's fallback stem. */
  tool: string;
  /** The CLI's intent label ("Scan · 1:23"); absent ⇒ fall back to a humanized `tool`. */
  label?: string;
  /** Result summary once done ("→ 42 nodes", "node not found"); absent while pending. */
  result?: string;
  /** True until the reply lands — the row renders as in-flight. */
  pending: boolean;
  ok: boolean;
  /** Round-trip duration in ms (0 while pending). */
  ms: number;
  /** Epoch ms the request started — the row renders a clock time from it. */
  at: number;
  /** Wire ErrorCode, present only on a failed reply — never shown raw, only mapped to a reason. */
  errorCode?: string;
  /** The reply's own `name`, when it carried one (CREATE_FRAME/CREATE_INSTANCE/SET_TEXT/
   *  IMPORT_PAYLOAD/a scan) — lets the sentence say `Created frame "Hero card"` instead of
   *  fabricating an object no reply ever named. */
  nodeName?: string;
  /**
   * A pre-composed FULL sentence, used VERBATIM by the renderer instead of running
   * `activitySentence()`'s tool/count/name machinery. For callers that already hold the
   * complete human sentence in hand (a sync result's kernel summary; a job's own state) —
   * forcing either of those through the generic count-regex mapper is exactly the bug
   * this field exists to stop (the sync row used to collapse to the bare word "Synced").
   * Absent for every ordinary wire-command row, which is untouched by this field.
   */
  sentence?: string;
}

/** Wall-clock stamp for a row: "14:32:07" (local time, zero-padded). Kept for the status snapshot. */
export function formatClock(at: number): string {
  if (!Number.isFinite(at)) return '--:--:--';
  const d = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Absolute stamp for a row's `title`: "2026-07-16 14:32:07" (local). The compact age
 *  ("2m") is unreadable to a screen reader — "1m" gets announced as "1 meter" — and
 *  answers "how long ago", never "when". This is the hover/AT answer to "when". */
export function formatTimestamp(at: number): string {
  if (!Number.isFinite(at)) return '—';
  const d = new Date(at);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${formatClock(at)}`;
}

/** A completed request's duration: "12ms" under a second, "1.2s" under a minute, else "2m 4s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/**
 * Relative age for the activity log, COMPACT: "now", "5s", "3m", "2h" — no "ago".
 * The column already means "ago", so the word is 4 characters of pure repetition on
 * the row whose whole problem is width; it is the last thing on the meta line, so it
 * is also the first thing truncation eats. The absolute time survives in the `title`
 * (formatTimestamp) for anyone who needs to actually read it.
 */
export function timeAgo(nowMs: number, atMs: number): string {
  const s = Math.floor((nowMs - atMs) / 1000);
  if (s < 1) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

/**
 * Coerce a raw `figma-agent:activity` start-event detail (typed `unknown`) into a
 * pending record, or null if the shape is wrong. Defensive: the event crosses an
 * untyped DOM boundary.
 */
export function toActivityRecord(detail: unknown): ActivityRecord | null {
  if (detail === null || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  if (typeof d.tool !== 'string' || d.tool === '') return null;
  const at = typeof d.at === 'number' && Number.isFinite(d.at) ? d.at : Date.now();
  const rec: ActivityRecord = {
    id: typeof d.id === 'string' && d.id !== '' ? d.id : `${d.tool}:${at}`,
    tool: d.tool,
    pending: true,
    ok: true,
    ms: 0,
    at,
  };
  if (typeof d.label === 'string' && d.label.trim() !== '') rec.label = d.label.trim();
  return rec;
}

/** A landed reply, as carried by the `figma-agent:activity` done-event. */
export interface ActivityResult {
  id: string;
  ok: boolean;
  ms: number;
  result?: string;
  /** Wire ErrorCode, present only on a failure — ui-relay.ts's emitActivity adds it. */
  code?: string;
  /** The reply's own `name`, when it carried one — ui-relay.ts's emitActivity extracts it. */
  nodeName?: string;
  /** Pre-composed full sentence to land on the row verbatim — see `ActivityRecord.sentence`. */
  sentence?: string;
}

/** Coerce a done-event detail into a result patch, or null if the shape is wrong. */
export function toActivityResult(detail: unknown): ActivityResult | null {
  if (detail === null || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  if (typeof d.id !== 'string' || d.id === '') return null;
  const patch: ActivityResult = {
    id: d.id,
    ok: d.ok === true,
    ms: typeof d.ms === 'number' && Number.isFinite(d.ms) && d.ms >= 0 ? d.ms : 0,
  };
  if (typeof d.result === 'string' && d.result !== '') patch.result = d.result;
  if (typeof d.code === 'string' && d.code !== '') patch.code = d.code;
  if (typeof d.nodeName === 'string' && d.nodeName !== '') patch.nodeName = d.nodeName;
  return patch;
}

/** Newest-first ring buffer capped at `max` (keep 50, the feed shows 20). Returns a NEW array. */
export function pushActivity(
  buf: readonly ActivityRecord[],
  rec: ActivityRecord,
  max = 50,
): ActivityRecord[] {
  return [rec, ...buf].slice(0, Math.max(0, max));
}

/**
 * Land a reply onto its own start-row, matched by request id — NOT by position.
 * Two commands can be in flight at once (the panel is shared by every CLI caller),
 * so "newest row" is not "the row this reply belongs to". An id with no row left in
 * the buffer (evicted by the cap) is dropped: a stale reply must never rewrite an
 * unrelated row.
 */
export function resolveActivity(
  buf: readonly ActivityRecord[],
  patch: ActivityResult,
): ActivityRecord[] {
  return buf.map((rec) => {
    if (rec.id !== patch.id) return rec;
    const next: ActivityRecord = { ...rec, pending: false, ok: patch.ok, ms: patch.ms };
    if (patch.result !== undefined) next.result = patch.result;
    if (patch.code !== undefined) next.errorCode = patch.code;
    if (patch.nodeName !== undefined) next.nodeName = patch.nodeName;
    if (patch.sentence !== undefined) next.sentence = patch.sentence;
    return next;
  });
}

/**
 * Which of `nextIds` were NOT present in `prevIds` — the rows genuinely NEW since the
 * last render (backlog 4.7). `renderActivity` (panel-ui.ts) used to rebuild every row's
 * DOM node from scratch on every render — including the 1s heartbeat tick that only
 * refreshes relative ages — so `.activity-row`'s CSS entrance animation replayed on
 * every tick for every row, worst when a failing command kept re-rendering the same
 * handful of rows. Row identity is the request/activity id, matched by position order
 * (both arrays are newest-first, mirroring the buffer) — the DOM diff only needs to know
 * "was this id visible last time", not track full row content. Pure, order-preserving.
 */
export function diffRowKeys(prevIds: readonly string[], nextIds: readonly string[]): string[] {
  const prevSet = new Set(prevIds);
  return nextIds.filter((id) => !prevSet.has(id));
}
