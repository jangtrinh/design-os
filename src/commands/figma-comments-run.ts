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
import { classifyVerdict, summariseVerdicts } from "../core/figma-comment-verdict.js";
import type { ThreadVerdict } from "../core/figma-comment-verdict.js";
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
  /** Present only with --authored-by, and only on threads we posted. */
  verdict?: ThreadVerdict | null;
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

function renderText(
  items: TriagedThread[],
  stats: Record<string, number>,
  masterUses: Map<string, number>,
): string {
  const lines: string[] = [];
  // Anything that did not become a shown thread is named here. A count the reader cannot
  // reconcile is how a triage tool quietly loses someone's feedback.
  const extras: string[] = [];
  if (stats["reversed"]) extras.push(`${stats["reversed"]} REVERSED`);
  if (stats["conditional"]) extras.push(`${stats["conditional"]} conditional`);
  if (stats["silent"]) extras.push(`${stats["silent"]} silent (not accepted)`);
  if (stats["accepted"]) extras.push(`${stats["accepted"]} accepted`);
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
    for (const { thread, anchor, activity, verdict } of bucket) {
      const num = thread.orderId ? `#${thread.orderId}` : thread.id;
      const chain = chainLabel(anchor);
      const where = chain ? `  ${chain} [${anchor.confidence}]` : `  [${anchor.confidence}]`;
      const marks: string[] = [];
      if (activity?.isNew) marks.push("NEW");
      if (activity?.newReplies) marks.push(`+${activity.newReplies} reply`);
      if (activity?.newlyResolved) marks.push("RESOLVED");
      if (verdict) marks.push(verdict.verdict.toUpperCase());
      // Warn only when this master is hit more than once in the batch — see masterUses above.
      const uses = anchor.componentId ? (masterUses.get(anchor.componentId) ?? 0) : 0;
      if (uses > 1) marks.push(`shared×${uses}`);
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

  const DELIVERY_TARGETS = ["figma-canvas", "code", "both"] as const;
  const target = parsed.flags["delivery-target"];
  if (typeof target !== "string" || !DELIVERY_TARGETS.includes(target as (typeof DELIVERY_TARGETS)[number])) {
    // Required, not defaulted: the most expensive error in the pilot run was a batch that
    // named the wrong artifact and passed every gate defined for the wrong one.
    const msg =
      "ui figma comments requires --delivery-target <figma-canvas|code|both>. " +
      "It decides what 'done' means and which gate proves it; a batch without one is not actionable.";
    return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
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

  const authoredBy = typeof parsed.flags["authored-by"] === "string" ? parsed.flags["authored-by"] : "";
  const explicitResolved = parsed.flags["include-resolved"] === true;

  let folded;
  try {
    // --since and --authored-by both imply include-resolved, for the same reason: the
    // threads they exist to read are the ones that get resolved fastest. A verdict lives on
    // a thread WE posted, and the owner resolves those as soon as he has replied — so
    // filtering by resolve here silently drops every verdict, which is the exact blind spot
    // this feature was built to close, one layer up.
    folded = foldComments(payload, since !== undefined || explicitResolved || authoredBy !== "");
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

  let withVerdicts = delta;
  let verdictStats: Record<string, number> = {};
  if (authoredBy !== "") {
    withVerdicts = delta.map((i) => ({ ...i, verdict: classifyVerdict(i.thread, authoredBy) }));
    const s = summariseVerdicts(withVerdicts.map((i) => i.verdict ?? null));
    verdictStats = {
      accepted: s.accepted,
      conditional: s.conditional,
      reversed: s.reversed,
      silent: s.silent,
      awaitingVerdict: s.awaitingVerdict,
    };
  }

  // Resolve-filtering is re-applied ONLY to threads that are not ours: the reviewer's own
  // satisfied requests stay hidden, our own stay visible so their verdict can be read.
  let visible = withVerdicts;
  if (authoredBy !== "" && since === undefined && !explicitResolved) {
    const resolved = resolvedRootIds(payload);
    visible = withVerdicts.filter((i) => !resolved.has(i.thread.id) || i.thread.author === authoredBy);
  }

  const items = onlyPending ? visible.filter((i) => !decided.has(i.thread.id)) : visible;

  // Blast-radius estimator, measured rather than assumed. The raw `sharedInstance` boolean
  // fired on 84% of anchors on a real file — in a fully componentised design almost every pin
  // is inside SOME instance, so the bare fact carries no signal. How often the SAME master
  // appears across this batch does: 19 masters covered 52 pins, and one master accounted for
  // 24 of them. A master hit once is probably local; a master hit repeatedly is shared, and
  // that is the one worth stopping for.
  const masterUses = new Map<string, number>();
  for (const i of items) {
    const id = i.anchor.componentId;
    if (id) masterUses.set(id, (masterUses.get(id) ?? 0) + 1);
  }
  const hotMasters = [...masterUses.values()].filter((n) => n > 1).length;

  const stats: Record<string, number> = {
    ...folded.stats,
    ...deltaStats,
    ...verdictStats,
    hotMasters,
    shown: items.length,
    outsideScope,
    decidedHidden: onlyPending ? visible.length - items.length : 0,
  };

  if (useJson) {
    return okJson(CMD, {
      deliveryTarget: target,
      stats,
      threads: items.map(({ thread, anchor, activity, verdict }) => ({
        id: thread.id,
        orderId: thread.orderId,
        author: thread.author,
        createdAt: thread.createdAt,
        message: thread.message,
        replies: thread.replies,
        anchor,
        ...(activity ? { activity } : {}),
        ...(verdict ? { verdict } : {}),
      })),
    });
  }
  return ok(renderText(items, stats, masterUses));
}
