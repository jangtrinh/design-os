/**
 * Delta mode — what moved since a cutoff.
 *
 * The central case is drawn from a real miss on the VSF-PCP file: the owner replied with
 * live instructions ("có manual adjust cần scan và document lại") on threads he then
 * resolved himself. Resolution-as-filter destroyed those, so a resolved thread with a fresh
 * reply MUST survive this mode. Every other assertion here is scaffolding around that one.
 */
import { describe, expect, it } from "vitest";

import {
  activitySince,
  BadSinceError,
  parseSince,
  resolvedRootIds,
  summariseDelta,
} from "../src/core/figma-comment-delta.js";
import { foldComments } from "../src/core/figma-comment-thread.js";

const CUT = "2026-08-15T09:00:00Z";

const PAYLOAD = {
  comments: [
    // untouched since the cutoff — must not appear
    { id: "r-old", parent_id: "", order_id: "1", message: "old ask", created_at: "2026-08-14T08:00:00Z",
      resolved_at: null, user: { handle: "Hải" }, client_meta: { node_id: "1:1", node_offset: { x: 1, y: 1 } } },
    // THE case: resolved thread, reply arrives afterwards
    { id: "r-resolved", parent_id: "", order_id: "2", message: "design:os · AM-12 delivered",
      created_at: "2026-08-15T03:00:00Z", resolved_at: "2026-08-15T03:50:00Z", user: { handle: "Giang" },
      client_meta: { node_id: "1:1", node_offset: { x: 2, y: 2 } } },
    { id: "r-resolved-reply", parent_id: "r-resolved", message: "Done. Có manual adjust cần scan lại.",
      created_at: "2026-08-15T09:30:00Z", resolved_at: null, user: { handle: "Giang" },
      client_meta: { node_id: "1:1", node_offset: { x: 2, y: 2 } } },
    // brand new root
    { id: "r-new", parent_id: "", order_id: "3", message: "Thêm giúp quản lý domain",
      created_at: "2026-08-15T10:00:00Z", resolved_at: null, user: { handle: "Hải" },
      client_meta: { node_id: "1:1", node_offset: { x: 3, y: 3 } } },
    // pre-existing thread resolved after the cutoff = acceptance
    { id: "r-accepted", parent_id: "", order_id: "4", message: "fix the padding",
      created_at: "2026-08-14T09:00:00Z", resolved_at: "2026-08-15T10:30:00Z", user: { handle: "Hải" },
      client_meta: { node_id: "1:1", node_offset: { x: 4, y: 4 } } },
  ],
};

const activity = activitySince(PAYLOAD, CUT);

describe("parseSince", () => {
  it("accepts an ISO instant", () => {
    expect(parseSince("2026-08-15T09:00:00Z")).toBe("2026-08-15T09:00:00.000Z");
  });

  it("refuses garbage rather than silently treating it as epoch 0", () => {
    // The quiet failure this guards: an unparsed cutoff reports the whole file as "new".
    expect(() => parseSince("yesterday")).toThrow(BadSinceError);
  });
});

describe("activitySince", () => {
  it("keeps a RESOLVED thread that gained a reply after the cutoff", () => {
    const a = activity.get("r-resolved");
    expect(a).toBeDefined();
    expect(a?.newReplies).toBe(1);
  });

  it("reports a brand-new thread", () => {
    expect(activity.get("r-new")?.isNew).toBe(true);
  });

  it("reports a thread resolved after the cutoff", () => {
    const a = activity.get("r-accepted");
    expect(a?.newlyResolved).toBe(true);
    expect(a?.isNew).toBe(false); // created long before
  });

  it("omits threads that did not move", () => {
    expect(activity.has("r-old")).toBe(false);
  });

  it("tracks the most recent activity for ordering", () => {
    expect(activity.get("r-resolved")?.lastActivityAt).toBe("2026-08-15T09:30:00Z");
  });

  it("treats a reply as news regardless of the thread's resolve state", () => {
    // Same payload, cutoff before the resolve: the reply still counts.
    const early = activitySince(PAYLOAD, "2026-08-15T00:00:00Z");
    expect(early.get("r-resolved")?.newReplies).toBe(1);
  });
});

describe("summariseDelta", () => {
  it("counts replied-while-resolved separately — the number the old design reported as zero", () => {
    const { threads } = foldComments(PAYLOAD, true);
    const stats = summariseDelta(activity, threads, resolvedRootIds(PAYLOAD));
    expect(stats.newThreads).toBe(1);
    expect(stats.repliedThreads).toBe(1);
    expect(stats.newlyResolved).toBe(1);
    expect(stats.repliedWhileResolved).toBe(1);
  });
});

describe("resolvedRootIds", () => {
  it("collects resolved roots only, never replies", () => {
    const ids = resolvedRootIds(PAYLOAD);
    expect(ids.has("r-resolved")).toBe(true);
    expect(ids.has("r-accepted")).toBe(true);
    expect(ids.has("r-old")).toBe(false);
    expect(ids.has("r-resolved-reply")).toBe(false);
  });
});
