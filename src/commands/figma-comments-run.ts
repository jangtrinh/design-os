/**
 * `ui figma comments` — IO runner for comment triage.
 *
 * Reads payloads captured OUTSIDE the kernel (templates/workflows/figma-comments.md
 * owns the REST calls and the token), folds them into threads, resolves what each pin
 * points at, and emits a digest. Read-only: it never writes, never calls the network,
 * never calls a model (Art. I).
 */
import { readFileSync } from "node:fs";

import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson, ok } from "../core/output.js";
import { foldComments, CommentPayloadError } from "../core/figma-comment-thread.js";
import type { CommentThread } from "../core/figma-comment-thread.js";
import {
  activitySince,
  BadSinceError,
  parseSince,
  resolvedRootIds,
  summariseDelta,
} from "../core/figma-comment-delta.js";
import type { ThreadActivity } from "../core/figma-comment-delta.js";
import {
  buildNodeIndex,
  buildPageIndex,
  collectDescendantIds,
  resolveAnchor,
} from "../core/figma-comment-anchor.js";
import type { FigmaNode, ResolvedAnchor } from "../core/figma-comment-anchor.js";

const CMD = "figma";

interface TriagedThread {
  thread: CommentThread;
  anchor: ResolvedAnchor;
  /** Present only in --since mode. */
  activity?: ThreadActivity;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Decisions are written by the host model; the kernel only reads them to skip settled work. */
function readDecisions(path: string | undefined): Set<string> {
  if (!path) return new Set();
  try {
    const raw = readJson(path) as Record<string, unknown> | null;
    return raw && typeof raw === "object" ? new Set(Object.keys(raw)) : new Set();
  } catch {
    return new Set(); // an absent ledger simply means nothing has been decided yet
  }
}

/** Group key: the frame id, never the frame NAME — names repeat across pages. */
function groupKey(anchor: ResolvedAnchor): string {
  return anchor.frameId ?? "￿unanchored";
}

function groupLabel(anchor: ResolvedAnchor): string {
  if (anchor.confidence === "unanchored") return "Unanchored (pinned to bare canvas)";
  const frame = anchor.frameName ?? anchor.frameId ?? "unknown frame";
  const label = anchor.pageName ? `${anchor.pageName} / ${frame}` : frame;
  return anchor.confidence === "orphaned" ? `${label} — deleted since the comment` : label;
}

/** Real files nest deep — a VSF-PCP section measured a median chain of 8 and a max of 11. */
const MAX_CHAIN_SEGMENTS = 3;

/**
 * Outermost → innermost, e.g. "OrderSummary › PriceRow". Two trims, both measured against
 * a real file rather than guessed:
 *  - the frame's own name is dropped when it already heads the group;
 *  - only the innermost few segments are shown, because the outer ones are shell/template
 *    scaffolding ("Content › Body › Page content / …") repeated on every single line.
 * The full chain always survives in the JSON envelope — this trims the human view only.
 */
function chainLabel(anchor: ResolvedAnchor): string {
  const chain =
    anchor.chain.length > 1 && anchor.chain[0] === anchor.frameName ? anchor.chain.slice(1) : anchor.chain;
  if (chain.length <= MAX_CHAIN_SEGMENTS) return chain.join(" › ");
  return `… › ${chain.slice(-MAX_CHAIN_SEGMENTS).join(" › ")}`;
}

/** Explicit plural form — English -y nouns ("reply" → "replies") defeat a naive +"s". */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function renderText(items: TriagedThread[], stats: Record<string, number>): string {
  const lines: string[] = [];
  // Anything that did not become a shown thread is named here. A count the reader cannot
  // reconcile is how a triage tool quietly loses someone's feedback.
  const extras: string[] = [];
  if (stats["newThreads"]) extras.push(`${stats["newThreads"]} new`);
  if (stats["repliedThreads"]) extras.push(`${stats["repliedThreads"]} replied`);
  if (stats["newlyResolved"]) extras.push(`${stats["newlyResolved"]} newly resolved`);
  if (stats["repliedWhileResolved"]) {
    extras.push(`${stats["repliedWhileResolved"]} replied-while-resolved`);
  }
  if (stats["outsideScope"]) extras.push(`${stats["outsideScope"]} outside scope`);
  if (stats["decidedHidden"]) extras.push(`${stats["decidedHidden"]} already decided`);
  if (stats["orphanReplies"]) extras.push(`${stats["orphanReplies"]} orphan replies`);
  if (stats["unreadable"]) extras.push(`${stats["unreadable"]} unreadable`);
  lines.push(
    `${stats["pulled"]} pulled · ${stats["resolvedHidden"]} resolved hidden · ` +
      `${plural(stats["repliesFolded"] ?? 0, "reply", "replies")} folded · ${stats["shown"]} shown` +
      (extras.length > 0 ? ` · ${extras.join(" · ")}` : ""),
  );
  lines.push("");

  const groups = new Map<string, TriagedThread[]>();
  for (const item of items) {
    const key = groupKey(item.anchor);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  for (const [, bucket] of groups) {
    const first = bucket[0];
    if (!first) continue;
    lines.push(`${groupLabel(first.anchor)}  (${bucket.length})`);
    for (const { thread, anchor, activity } of bucket) {
      const num = thread.orderId ? `#${thread.orderId}` : thread.id;
      const chain = chainLabel(anchor);
      const where = chain ? `  ${chain} [${anchor.confidence}]` : `  [${anchor.confidence}]`;
      const marks: string[] = [];
      if (activity?.isNew) marks.push("NEW");
      if (activity?.newReplies) marks.push(`+${activity.newReplies} reply`);
      if (activity?.newlyResolved) marks.push("RESOLVED");
      const mark = marks.length > 0 ? `  [${marks.join(" · ")}]` : "";
      lines.push(`  ${num} ${thread.author} · ${thread.createdAt.slice(0, 10)}${where}${mark}`);
      lines.push(`      ${thread.message}`);
      for (const reply of thread.replies) {
        lines.push(`      ↳ ${reply.author}: ${reply.message}`);
      }
      lines.push("");
    }
  }

  if (items.length === 0) lines.push("No open comments to triage.");
  return `${lines.join("\n").trimEnd()}\n`;
}

export function runComments(parsed: ParsedArgs): CommandResult {
  const useJson = parsed.json;
  const source = parsed.positionals[0];
  if (!source) {
    const msg = "ui figma comments requires a <comments.json> path. Run 'ui figma --help'.";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
  }

  let payload: unknown;
  try {
    payload = readJson(source);
  } catch (error) {
    const msg = `cannot read comments payload '${source}': ${(error as Error).message}`;
    return useJson ? errJson(CMD, "READ_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  const nodesFlag = parsed.flags["nodes"];
  const treeFlag = parsed.flags["file-tree"];
  const decisionsFlag = parsed.flags["decisions"];

  let nodeIndex = new Map<string, FigmaNode>();
  let pageIndex = new Map<string, string>();
  try {
    if (typeof nodesFlag === "string") nodeIndex = buildNodeIndex(readJson(nodesFlag));
    if (typeof treeFlag === "string") pageIndex = buildPageIndex(readJson(treeFlag));
  } catch (error) {
    const msg = `cannot read a supporting payload: ${(error as Error).message}`;
    return useJson ? errJson(CMD, "READ_ERROR", msg) : errText(`ui: ${msg}\n`);
  }

  const sinceFlag = parsed.flags["since"];
  let since: string | undefined;
  try {
    if (typeof sinceFlag === "string") since = parseSince(sinceFlag);
  } catch (error) {
    if (error instanceof BadSinceError) {
      return useJson ? errJson(CMD, "BAD_ARG", error.message) : errText(`ui: ${error.message}\n`);
    }
    throw error;
  }

  let folded;
  try {
    // --since implies include-resolved: a reply inside a resolved thread is precisely the
    // case this mode exists to surface, and the default view drops it.
    folded = foldComments(payload, since !== undefined || parsed.flags["include-resolved"] === true);
  } catch (error) {
    if (error instanceof CommentPayloadError) {
      const msg = error.message;
      return useJson ? errJson(CMD, "BAD_COMMENTS_PAYLOAD", msg) : errText(`ui: ${msg}\n`);
    }
    throw error;
  }

  const decided = readDecisions(typeof decisionsFlag === "string" ? decisionsFlag : undefined);
  const onlyPending = parsed.flags["pending"] === true;

  const all: TriagedThread[] = folded.threads.map((thread) => ({
    thread,
    anchor: resolveAnchor(thread.anchor, nodeIndex, pageIndex),
  }));

  // --under scopes triage to one section/page. Refuse rather than silently show the whole
  // file when the subtree is absent: "0 comments in your section" and "I could not see
  // your section" look identical to the reader, and only one of them is true.
  const underFlag = parsed.flags["under"];
  let scoped = all;
  let outsideScope = 0;
  if (typeof underFlag === "string") {
    const subtree = collectDescendantIds(underFlag, nodeIndex);
    if (subtree.size === 0) {
      const msg =
        `--under '${underFlag}' is not in the --nodes payload, so scope cannot be applied. ` +
        `Capture it with GET /v1/files/<key>/nodes?ids=${underFlag} and pass that as --nodes.`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    scoped = all.filter((i) => i.anchor.frameId !== null && subtree.has(i.anchor.frameId));
    outsideScope = all.length - scoped.length;
  }

  let delta = scoped;
  let deltaStats: Record<string, number> = {};
  if (since !== undefined) {
    const activity = activitySince(payload, since);
    const resolvedIds = resolvedRootIds(payload);
    delta = scoped
      .filter((i) => activity.has(i.thread.id))
      .map((i) => ({ ...i, activity: activity.get(i.thread.id) }));
    const d = summariseDelta(activity, delta.map((i) => i.thread), resolvedIds);
    deltaStats = {
      newThreads: d.newThreads,
      repliedThreads: d.repliedThreads,
      newlyResolved: d.newlyResolved,
      repliedWhileResolved: d.repliedWhileResolved,
    };
  }

  const items = onlyPending ? delta.filter((i) => !decided.has(i.thread.id)) : delta;

  const stats: Record<string, number> = {
    ...folded.stats,
    ...deltaStats,
    shown: items.length,
    outsideScope,
    decidedHidden: onlyPending ? delta.length - items.length : 0,
  };

  if (useJson) {
    return okJson(CMD, {
      stats,
      threads: items.map(({ thread, anchor, activity }) => ({
        id: thread.id,
        orderId: thread.orderId,
        author: thread.author,
        createdAt: thread.createdAt,
        message: thread.message,
        replies: thread.replies,
        anchor,
        ...(activity ? { activity } : {}),
      })),
    });
  }
  return ok(renderText(items, stats));
}
