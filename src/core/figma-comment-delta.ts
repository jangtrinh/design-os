/**
 * What changed in a Figma comment payload since a given moment (spec: figma comment triage).
 *
 * Pure transform over two things already on disk: the payload and a timestamp (Art. I).
 *
 * This exists because the first version of the triage treated comments as a dataset to
 * export once. They are not — they are a channel that keeps talking. Measured on a real
 * file: after one delivery round the reviewer had resolved 19 threads, answered a question
 * that had blocked a deferred task, and posted a new request, while the owner had left
 * instructions as replies on threads he then resolved himself.
 *
 * That last case is why resolution cannot be the filter here. `resolved_at` means two
 * different things depending on who set it — "my request is satisfied" from a reviewer,
 * "I have read this" from someone answering in their own thread. A reply inside a resolved
 * thread is still a live instruction, and the default triage view drops it.
 */

import type { CommentThread } from "./figma-comment-types.js";

export interface ThreadActivity {
  /** The root comment appeared after the cutoff. */
  isNew: boolean;
  /** Replies posted after the cutoff — feedback, whatever the thread's resolve state. */
  newReplies: number;
  /** The thread was resolved after the cutoff. Acceptance, when a reviewer did it. */
  newlyResolved: boolean;
  /** Most recent activity of any kind, for ordering. */
  lastActivityAt: string;
}

export interface DeltaStats {
  newThreads: number;
  repliedThreads: number;
  newlyResolved: number;
  /** Threads carrying replies the default (resolve-filtered) view would have hidden. */
  repliedWhileResolved: number;
}

export class BadSinceError extends Error {
  readonly code = "BAD_ARG";
}

interface RawComment {
  id?: unknown;
  parent_id?: unknown;
  created_at?: unknown;
  resolved_at?: unknown;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Parse the cutoff. Accepts any ISO 8601 instant; rejects anything else loudly rather than
 * silently treating it as epoch 0, which would report the entire file as "new".
 */
export function parseSince(raw: string): string {
  const t = Date.parse(raw);
  if (Number.isNaN(t)) {
    throw new BadSinceError(
      `--since '${raw}' is not an ISO 8601 timestamp (expected e.g. 2026-08-15T08:00:00Z)`,
    );
  }
  return new Date(t).toISOString();
}

/** Later-than comparison on ISO instants, tolerant of differing offsets and precision. */
function after(when: string, cutoff: string): boolean {
  if (!when) return false;
  const a = Date.parse(when);
  const b = Date.parse(cutoff);
  return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
}

function maxIso(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

/**
 * Classify every root thread by what happened to it after `sinceIso`.
 *
 * Returns only threads with activity — a thread that did not move is absent from the map,
 * so a caller can filter on membership without a second pass.
 */
export function activitySince(payload: unknown, sinceIso: string): Map<string, ThreadActivity> {
  const list = (payload as { comments?: unknown } | null)?.comments;
  const raws: RawComment[] = Array.isArray(list) ? (list as RawComment[]) : [];

  const activity = new Map<string, ThreadActivity>();
  const ensure = (id: string): ThreadActivity => {
    let a = activity.get(id);
    if (!a) {
      a = { isNew: false, newReplies: 0, newlyResolved: false, lastActivityAt: "" };
      activity.set(id, a);
    }
    return a;
  };

  for (const raw of raws) {
    const id = str(raw.id);
    const parent = str(raw.parent_id);
    const created = str(raw.created_at);
    const resolved = str(raw.resolved_at);

    if (!parent) {
      if (!id) continue;
      if (after(created, sinceIso)) {
        const a = ensure(id);
        a.isNew = true;
        a.lastActivityAt = maxIso(a.lastActivityAt, created);
      }
      if (after(resolved, sinceIso)) {
        const a = ensure(id);
        a.newlyResolved = true;
        a.lastActivityAt = maxIso(a.lastActivityAt, resolved);
      }
      continue;
    }

    // A reply. Its own resolve state is irrelevant — the ROOT owns resolution, and we
    // deliberately do not consult it: a reply after the cutoff is news either way.
    if (after(created, sinceIso)) {
      const a = ensure(parent);
      a.newReplies += 1;
      a.lastActivityAt = maxIso(a.lastActivityAt, created);
    }
  }

  return activity;
}

/**
 * Summarise a delta, counting separately the case the old design could not see: a thread
 * that is resolved yet carries replies newer than the cutoff.
 */
export function summariseDelta(
  activity: Map<string, ThreadActivity>,
  threads: readonly CommentThread[],
  resolvedIds: ReadonlySet<string>,
): DeltaStats {
  let newThreads = 0;
  let repliedThreads = 0;
  let newlyResolved = 0;
  let repliedWhileResolved = 0;

  for (const thread of threads) {
    const a = activity.get(thread.id);
    if (!a) continue;
    if (a.isNew) newThreads += 1;
    if (a.newlyResolved) newlyResolved += 1;
    if (a.newReplies > 0) {
      repliedThreads += 1;
      if (resolvedIds.has(thread.id)) repliedWhileResolved += 1;
    }
  }
  return { newThreads, repliedThreads, newlyResolved, repliedWhileResolved };
}

/** Ids of roots that are resolved, for the "replied while resolved" distinction. */
export function resolvedRootIds(payload: unknown): Set<string> {
  const list = (payload as { comments?: unknown } | null)?.comments;
  const raws: RawComment[] = Array.isArray(list) ? (list as RawComment[]) : [];
  const ids = new Set<string>();
  for (const raw of raws) {
    if (!str(raw.parent_id) && str(raw.resolved_at)) {
      const id = str(raw.id);
      if (id) ids.add(id);
    }
  }
  return ids;
}
