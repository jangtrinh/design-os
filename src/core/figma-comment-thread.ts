/**
 * Fold a raw Figma comments payload into threads (spec: figma comment triage).
 *
 * Pure transform, zero network, zero model calls (Art. I). The payload is captured
 * OUTSIDE the kernel by the host model — `GET /v1/files/:key/comments` persisted to
 * `output/<slug>-figma/raw/`, exactly as templates/workflows/figma.md already
 * mandates for node trees and screenshots.
 *
 * Shapes follow the Figma OpenAPI spec verbatim (figma/rest-api-spec, openapi.yaml
 * L6835+): `message` is a required STRING, `client_meta` is required and is a oneOf
 * over Vector | FrameOffset | Region | FrameOffsetRegion.
 */

import type {
  CommentAnchor,
  CommentThread,
  FoldResult,
} from "./figma-comment-types.js";

export type {
  CanvasAnchor,
  CommentAnchor,
  CommentThread,
  FoldResult,
  FoldStats,
  FrameAnchor,
  ThreadReply,
} from "./figma-comment-types.js";

export class CommentPayloadError extends Error {
  readonly code = "BAD_COMMENTS_PAYLOAD";
}

interface RawUser {
  handle?: unknown;
}

interface RawComment {
  id?: unknown;
  parent_id?: unknown;
  user?: RawUser;
  created_at?: unknown;
  resolved_at?: unknown;
  order_id?: unknown;
  message?: unknown;
  client_meta?: Record<string, unknown> | null;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Read client_meta's oneOf. A frame anchor is distinguished by `node_id`; everything
 * else is a bare canvas point. Region dimensions ride along on both variants.
 */
function readAnchor(meta: Record<string, unknown> | null | undefined): CommentAnchor | null {
  if (!meta || typeof meta !== "object") return null;

  const width = num(meta["region_width"]);
  const height = num(meta["region_height"]);
  const region = width !== null && height !== null ? { width, height } : undefined;

  const nodeId = meta["node_id"];
  if (typeof nodeId === "string" && nodeId.length > 0) {
    const rawOffset = meta["node_offset"] as Record<string, unknown> | undefined;
    const x = num(rawOffset?.["x"]);
    const y = num(rawOffset?.["y"]);
    if (x === null || y === null) return null;
    return region
      ? { kind: "frame", nodeId, offset: { x, y }, region }
      : { kind: "frame", nodeId, offset: { x, y } };
  }

  const x = num(meta["x"]);
  const y = num(meta["y"]);
  if (x === null || y === null) return null;
  return region ? { kind: "canvas", point: { x, y }, region } : { kind: "canvas", point: { x, y } };
}

/** A reply carries a non-empty parent_id. Figma sends "" (not null) for roots. */
function parentOf(raw: RawComment): string {
  return str(raw.parent_id);
}

/**
 * Fold a raw payload into threads.
 *
 * Rules, each earning its place:
 *  - Resolution is judged at the THREAD level: resolving a thread in Figma resolves the
 *    conversation, so a stray unresolved reply must not resurrect it.
 *  - Replies never surface as their own item; they fold into the root, ordered by time.
 *  - A reply whose root is absent (root resolved-and-filtered, or paged out) is counted
 *    as an orphan rather than silently vanishing or being promoted to a fake root.
 */
export function foldComments(payload: unknown, includeResolved = false): FoldResult {
  const root = payload as { comments?: unknown } | null;
  const list = root?.comments;
  if (!Array.isArray(list)) {
    throw new CommentPayloadError("payload has no 'comments' array — expected the body of GET /v1/files/:key/comments");
  }

  const raws = list as RawComment[];
  const byId = new Map<string, RawComment>();
  for (const raw of raws) {
    const id = str(raw.id);
    if (id) byId.set(id, raw);
  }

  // A thread is resolved when its ROOT is resolved.
  const resolvedRoots = new Set<string>();
  for (const raw of raws) {
    const id = str(raw.id);
    if (id && !parentOf(raw) && str(raw.resolved_at)) resolvedRoots.add(id);
  }

  const threads = new Map<string, CommentThread>();
  let repliesFolded = 0;
  let orphanReplies = 0;
  let unreadable = 0;

  for (const raw of raws) {
    if (parentOf(raw)) continue; // replies are folded in the second pass
    const id = str(raw.id);
    if (!id) {
      unreadable += 1; // an id-less root cannot be addressed, decided, or deduped — but it is never dropped in silence
      continue;
    }
    if (!includeResolved && resolvedRoots.has(id)) continue;
    const anchor = readAnchor(raw.client_meta);
    if (!anchor) {
      unreadable += 1; // never drop in silence — the count is the whole contract
      continue;
    }
    threads.set(id, {
      id,
      orderId: typeof raw.order_id === "string" ? raw.order_id : null,
      author: str(raw.user?.handle, "unknown"),
      createdAt: str(raw.created_at),
      message: str(raw.message),
      replies: [],
      anchor,
    });
  }

  for (const raw of raws) {
    const parent = parentOf(raw);
    if (!parent) continue;
    const thread = threads.get(parent);
    if (!thread) {
      // Root exists but was filtered as resolved → folded away with its thread, not orphaned.
      if (byId.has(parent) || resolvedRoots.has(parent)) continue;
      orphanReplies += 1;
      continue;
    }
    thread.replies.push({
      id: str(raw.id),
      author: str(raw.user?.handle, "unknown"),
      createdAt: str(raw.created_at),
      message: str(raw.message),
    });
    repliesFolded += 1;
  }

  const ordered = [...threads.values()].sort(compareThreads);
  for (const thread of ordered) {
    thread.replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  return {
    threads: ordered,
    stats: {
      pulled: raws.length,
      resolvedHidden: includeResolved ? 0 : countResolvedMessages(raws, resolvedRoots),
      repliesFolded,
      orphanReplies,
      unreadable,
      shown: ordered.length,
    },
  };
}

/** Deterministic order: Figma's own numbering when present, then id. Same input, same bytes. */
function compareThreads(a: CommentThread, b: CommentThread): number {
  const an = a.orderId === null ? Number.NaN : Number(a.orderId);
  const bn = b.orderId === null ? Number.NaN : Number(b.orderId);
  const aHas = Number.isFinite(an);
  const bHas = Number.isFinite(bn);
  if (aHas && bHas && an !== bn) return an - bn;
  if (aHas !== bHas) return aHas ? -1 : 1;
  return a.id.localeCompare(b.id);
}

/** Every message belonging to a resolved thread — root plus its replies. */
function countResolvedMessages(raws: RawComment[], resolvedRoots: Set<string>): number {
  let count = 0;
  for (const raw of raws) {
    const id = str(raw.id);
    const parent = parentOf(raw);
    if (parent ? resolvedRoots.has(parent) : resolvedRoots.has(id)) count += 1;
  }
  return count;
}
