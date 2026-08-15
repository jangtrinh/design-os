/**
 * Figma comment triage — the pure core (folding + anchor resolution).
 *
 * Fixtures are shaped to the Figma OpenAPI spec, and nodes.json is built to PROVOKE the
 * junk-leaf failure rather than dodge it: a naive deepest-containing-node walk resolves
 * comment c-anchored-1 to "Rectangle 47". These tests pin the behaviour that refuses to
 * say that.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { foldComments, CommentPayloadError } from "../src/core/figma-comment-thread.js";
import type { FrameAnchor } from "../src/core/figma-comment-thread.js";
import {
  buildNodeIndex,
  buildPageIndex,
  collectDescendantIds,
  resolveAnchor,
} from "../src/core/figma-comment-anchor.js";

const FIXTURES = resolve(__dirname, "fixtures/figma-comments");
const load = (name: string): unknown => JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));

const comments = load("comments.json");
const nodes = load("nodes.json");
const fileTree = load("file-tree.json");

const nodeIndex = buildNodeIndex(nodes);
const pageIndex = buildPageIndex(fileTree);

function threadById(id: string) {
  const found = foldComments(comments).threads.find((t) => t.id === id);
  if (!found) throw new Error(`fixture thread ${id} missing`);
  return found;
}

function anchorOf(id: string) {
  return resolveAnchor(threadById(id).anchor, nodeIndex, pageIndex);
}

describe("foldComments", () => {
  it("folds replies into roots and never lists a reply as its own item", () => {
    const { threads } = foldComments(comments);
    expect(threads.map((t) => t.id)).not.toContain("c-anchored-1-reply");
    expect(threadById("c-anchored-1").replies.map((r) => r.id)).toEqual(["c-anchored-1-reply"]);
  });

  it("hides a resolved thread and reports counts that sum back to what was pulled", () => {
    const { threads, stats } = foldComments(comments);
    expect(threads.map((t) => t.id)).not.toContain("c-resolved");
    expect(stats.pulled).toBe(9);
    expect(stats.resolvedHidden).toBe(1);
    expect(stats.repliesFolded).toBe(1);
    expect(stats.orphanReplies).toBe(0);
    expect(stats.unreadable).toBe(0);
    expect(stats.shown).toBe(7);
    // The whole point of the stats block: nothing vanishes silently.
    expect(
      stats.shown + stats.resolvedHidden + stats.repliesFolded + stats.orphanReplies + stats.unreadable,
    ).toBe(stats.pulled);
  });

  it("counts a root it cannot anchor instead of dropping it in silence", () => {
    const { threads, stats } = foldComments({
      comments: [
        { id: "good", parent_id: "", message: "fine", order_id: "1", user: { handle: "Dana" }, created_at: "2026-08-14T09:00:00Z", client_meta: { x: 1, y: 2 } },
        { id: "bad", parent_id: "", message: "broken anchor", order_id: "2", user: { handle: "Dana" }, created_at: "2026-08-14T09:00:00Z", client_meta: {} },
      ],
    });
    expect(threads).toHaveLength(1);
    expect(stats.unreadable).toBe(1);
    expect(stats.shown + stats.unreadable).toBe(stats.pulled);
  });

  it("counts an id-less root too — it cannot be addressed, but it is not lost", () => {
    const { threads, stats } = foldComments({
      comments: [
        { id: "", parent_id: "", message: "no id", user: { handle: "Dana" }, created_at: "2026-08-14T09:00:00Z", client_meta: { x: 1, y: 2 } },
        { id: "good", parent_id: "", message: "fine", user: { handle: "Dana" }, created_at: "2026-08-14T09:00:00Z", client_meta: { x: 3, y: 4 } },
      ],
    });
    expect(threads).toHaveLength(1);
    expect(stats.unreadable).toBe(1);
    expect(stats.shown + stats.unreadable).toBe(stats.pulled);
  });

  it("keeps the message verbatim — the comment is evidence, not a summary", () => {
    expect(threadById("c-anchored-2").message).toBe(
      "Can the CTA say <b>Pay now</b> instead? & make it primary.",
    );
  });

  it("can include resolved threads on request", () => {
    const { threads } = foldComments(comments, true);
    expect(threads.map((t) => t.id)).toContain("c-resolved");
  });

  it("is deterministic — same input, same order", () => {
    const a = foldComments(comments).threads.map((t) => t.id);
    const b = foldComments(comments).threads.map((t) => t.id);
    expect(a).toEqual(b);
    expect(a[0]).toBe("c-anchored-1"); // order_id 1 sorts first
  });

  it("rejects a payload that is not a comments response", () => {
    expect(() => foldComments({ nope: true })).toThrow(CommentPayloadError);
  });
});

describe("anchor classification", () => {
  it("reads a frame anchor as a FRAME id, never as an element", () => {
    const anchor = threadById("c-anchored-1").anchor as FrameAnchor;
    expect(anchor.kind).toBe("frame");
    expect(anchor.nodeId).toBe("10:2");
    expect(anchor.offset).toEqual({ x: 220, y: 640 });
  });

  it("classifies a bare-canvas pin as unanchored instead of inventing a frame", () => {
    expect(anchorOf("c-unanchored-vector").confidence).toBe("unanchored");
    expect(anchorOf("c-unanchored-region").confidence).toBe("unanchored");
  });

  it("marks a comment on a deleted frame as orphaned rather than throwing", () => {
    const resolved = anchorOf("c-orphaned");
    expect(resolved.confidence).toBe("orphaned");
    expect(resolved.frameId).toBe("77:99");
  });

  it("carries region dimensions through on a frame-anchored region comment", () => {
    const anchor = threadById("c-region-on-frame").anchor as FrameAnchor;
    expect(anchor.region).toEqual({ width: 300, height: 60 });
  });
});

describe("hit-test", () => {
  it("refuses to name a junk leaf, and returns the ancestor chain instead", () => {
    const resolved = anchorOf("c-anchored-1");
    // The literal deepest containing node here is "Rectangle 47" — a full-bleed background.
    expect(resolved.chain).not.toContain("Rectangle 47");
    expect(resolved.element).not.toBe("Rectangle 47");
    expect(resolved.chain).toEqual(["Checkout", "OrderSummary", "PriceRow"]);
    // Honest label: we filtered the actual hit, so we do not claim element precision.
    expect(resolved.confidence).toBe("region");
  });

  it("claims element precision when the pin lands on a real named node", () => {
    const resolved = anchorOf("c-anchored-2");
    expect(resolved.chain).toEqual(["Checkout", "PayButton", "Label"]);
    expect(resolved.element).toBe("Label");
    expect(resolved.confidence).toBe("element");
  });

  it("converts frame-local offset to canvas coordinates (the silent-wrong-answer trap)", () => {
    // Frame 10:2 sits at canvas (1000,500); the pin is at frame-local (220,640).
    // Without the conversion the point would be (220,640) — outside the frame entirely,
    // yielding an empty chain. A non-empty chain proves the conversion happened.
    expect(anchorOf("c-anchored-1").chain.length).toBeGreaterThan(1);
  });

  it("keeps the frame-local pin for placing a marker on a rendered PNG", () => {
    expect(anchorOf("c-anchored-1").pin).toEqual({ x: 220, y: 640 });
  });

  it("skips invisible nodes when descending", () => {
    // 10:9 "Vector" is visible:false and contains no meaningful name anyway.
    expect(anchorOf("c-anchored-1").chain).not.toContain("Vector");
  });
});

describe("subtree indexing and scoping", () => {
  it("indexes NESTED nodes, not just the requested roots", () => {
    // The real failure this guards: fetch one section, and every comment inside it anchors
    // to a nested frame. Root-only indexing reports all of them "orphaned" — wrong, not an error.
    expect(nodeIndex.has("10:4")).toBe(true); // OrderSummary, nested two levels down
    expect(nodeIndex.has("10:11")).toBe(true); // Label, nested three levels down
  });

  it("resolves a comment anchored to a nested frame instead of calling it orphaned", () => {
    const resolved = resolveAnchor(
      { kind: "frame", nodeId: "10:4", offset: { x: 20, y: 130 } },
      nodeIndex,
      pageIndex,
    );
    expect(resolved.confidence).not.toBe("orphaned");
    expect(resolved.frameName).toBe("OrderSummary");
  });

  it("collects a subtree's ids for --under scoping", () => {
    const ids = collectDescendantIds("10:2", nodeIndex);
    expect(ids.has("10:2")).toBe(true);
    expect(ids.has("10:5")).toBe(true); // PriceRow, deep inside
    expect(ids.has("90:2")).toBe(false); // the other page's frame
  });

  it("returns an empty set for an unknown root so callers can refuse rather than show everything", () => {
    expect(collectDescendantIds("99:99", nodeIndex).size).toBe(0);
  });
});

describe("TEXT nodes report what is on screen", () => {
  // Measured on a real file (VSF-PCP): inside an instance, a TEXT node's `name` keeps the
  // COMPONENT'S DEFAULT text while `characters` holds the override actually rendered.
  const frame = {
    id: "f:1",
    name: "Card",
    type: "FRAME",
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
    children: [
      {
        id: "t:1",
        name: "No transformation plan — the system is maintained as is.",
        type: "TEXT",
        characters: "Target date 20/12/2026 · Expanding the partner API catalog",
        absoluteBoundingBox: { x: 10, y: 10, width: 80, height: 20 },
        children: [],
      },
    ],
  };
  const index = buildNodeIndex({ nodes: { "f:1": { document: frame } } });

  it("prefers the rendered override over the component's stale default name", () => {
    const r = resolveAnchor({ kind: "frame", nodeId: "f:1", offset: { x: 20, y: 15 } }, index, new Map());
    expect(r.element).toContain("Target date 20/12/2026");
    expect(r.element).not.toContain("No transformation plan");
  });

  it("truncates a long text label instead of pasting a paragraph into the chain", () => {
    const r = resolveAnchor({ kind: "frame", nodeId: "f:1", offset: { x: 20, y: 15 } }, index, new Map());
    expect(r.element!.length).toBeLessThanOrEqual(40);
    expect(r.element!.endsWith("…")).toBe(true);
  });
});

describe("page disambiguation", () => {
  it("distinguishes two frames that share a name on different pages", () => {
    const live = anchorOf("c-anchored-1");
    const archived = anchorOf("c-same-name-other-page");
    expect(live.frameName).toBe("Checkout");
    expect(archived.frameName).toBe("Checkout");
    expect(live.pageName).toBe("Product");
    expect(archived.pageName).toBe("Archive");
    expect(live.frameId).not.toBe(archived.frameId);
  });

  it("degrades to frame-only when no node payload was captured", () => {
    const resolved = resolveAnchor(threadById("c-anchored-1").anchor, new Map(), new Map());
    expect(resolved.confidence).toBe("frame");
    expect(resolved.frameId).toBe("10:2");
  });
});
