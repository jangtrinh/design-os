/**
 * Shared types for Figma comment triage (folding, anchoring, and the command surface).
 *
 * Split out per Art. IX so neither core module carries the type surface plus its logic;
 * follows the `designmd-audit-types.ts` precedent. Every shape here mirrors the Figma
 * OpenAPI spec (figma/rest-api-spec, openapi.yaml L6835+) — notably that `message` is a
 * plain required string and `client_meta` is a required oneOf over four variants.
 */

/** A comment pin anchored to a frame — client_meta was FrameOffset/FrameOffsetRegion. */
export interface FrameAnchor {
  kind: "frame";
  /** The FRAME the pin hangs on. Never the element — Figma does not tell us that. */
  nodeId: string;
  /** Offset from the frame's top-left corner, in frame-local coordinates. */
  offset: { x: number; y: number };
  region?: { width: number; height: number };
}

/** A pin dropped on bare canvas — client_meta was Vector/Region, carrying no node_id. */
export interface CanvasAnchor {
  kind: "canvas";
  point: { x: number; y: number };
  region?: { width: number; height: number };
}

export type CommentAnchor = FrameAnchor | CanvasAnchor;

export interface ThreadReply {
  id: string;
  author: string;
  createdAt: string;
  message: string;
}

export interface CommentThread {
  id: string;
  /** Figma's own displayed number, when it set one. */
  orderId: string | null;
  author: string;
  createdAt: string;
  /** Verbatim. The comment is evidence; any title derived from it is interpretation. */
  message: string;
  replies: ThreadReply[];
  anchor: CommentAnchor;
}

export interface FoldStats {
  pulled: number;
  resolvedHidden: number;
  repliesFolded: number;
  orphanReplies: number;
  /**
   * Roots whose client_meta could not be read. The schema marks it required, so this
   * should stay 0 — which is exactly why it must be visible if it ever isn't.
   */
  unreadable: number;
  shown: number;
}

export interface FoldResult {
  threads: CommentThread[];
  /**
   * Every count sums back to `pulled` — a silent drop is a bug, not a tidy output:
   * `shown + resolvedHidden + repliesFolded + orphanReplies + unreadable === pulled`.
   */
  stats: FoldStats;
}

/** A node as it arrives in a captured `/nodes` or `?depth=2` payload. */
export interface FigmaNode {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  visible?: unknown;
  /**
   * TEXT nodes only: the rendered string. Inside a component instance this is the
   * OVERRIDE, while `name` keeps the component's default text — so the two routinely
   * disagree and only this one matches what a human sees on the canvas.
   */
  characters?: unknown;
  /** INSTANCE nodes only: the master this instance was made from. */
  componentId?: unknown;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  children?: FigmaNode[];
}

/** How much the anchor resolution actually knows. It must never claim more than this. */
export type AnchorConfidence =
  | "element" // the pin landed on a node a human would recognise by name
  | "region" // it landed only on structural containers; the chain is the answer
  | "frame" // we have the frame but no usable subtree
  | "orphaned" // the frame the comment names no longer exists in the file
  | "unanchored"; // the pin was dropped on bare canvas, never attached to a frame

export interface ResolvedAnchor {
  frameId: string | null;
  frameName: string | null;
  pageName: string | null;
  /** Outermost → innermost, junk filtered. e.g. ["Checkout","OrderSummary","PriceRow"]. */
  chain: string[];
  /** The innermost trustworthy name, or null when nothing survived the filter. */
  element: string | null;
  confidence: AnchorConfidence;
  /** Frame-local pin position — multiply by the PNG scale to place a marker. */
  pin: { x: number; y: number } | null;
  /**
   * The pin sits inside a component INSTANCE, so the real fix may belong in the master and
   * would propagate to every other consumer. Measured: the three shared-component tasks in
   * the pilot run cost 7, 11 and 11 attempts against a baseline of 2 — the largest single
   * cost in the run, and nothing in the task spec warned about it.
   */
  sharedInstance: boolean;
  /**
   * The master's id, when the pin landed on an instance. The master itself usually lives
   * OUTSIDE the fetched subtree (masters sit on a library page), which is exactly why the
   * consumer COUNT is not derivable here and only the boolean is reported.
   */
  componentId: string | null;
}
