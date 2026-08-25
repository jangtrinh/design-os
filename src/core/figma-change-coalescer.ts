/** Cross-batch coalescing for validated Figma change frames. */
import type {
  ChangeFrame,
  ChangeOp,
  CoalescedComponent,
} from "./figma-reconcile-types.js";

const OP_RANK: Record<ChangeOp, number> = { deleted: 3, created: 2, updated: 1 };

/**
 * Mirror of figma-agent file identity normalization. The packages cannot share runtime
 * code, so parity fixtures in both repositories enforce this serialization contract.
 */
function safeSlug(raw: string): string {
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "unknown";
}

/** Resolve the stable file identity used by logs, bindings, and registry partitions. */
export function fileSlugOf(fileKey: string | null, fileName: string | undefined): string {
  if (typeof fileKey === "string" && fileKey.trim() !== "") return fileKey;
  return safeSlug(fileName ?? "");
}

/**
 * Reduce frames to one deterministic state per file and node pair. baseIndex is the
 * absolute index of frames[0], so resumed slices retain whole-log cursor positions.
 */
export function coalesceFrames(
  frames: readonly ChangeFrame[],
  baseIndex = 0,
): CoalescedComponent[] {
  const byKey = new Map<string, CoalescedComponent>();
  const propSets = new Map<string, Set<string>>();
  const indexed = frames.map((frame, index) => ({
    frame,
    index: baseIndex + index,
    slug: fileSlugOf(frame.fileKey, frame.fileName),
  }));
  const ordered = indexed.sort((a, b) => a.frame.ts - b.frame.ts || compare(a.frame.nodeId, b.frame.nodeId));

  for (const { frame, index, slug } of ordered) {
    const key = `${slug} ${frame.nodeId}`;
    const props = propSets.get(key) ?? new Set<string>();
    for (const prop of frame.changedProps) props.add(prop);
    propSets.set(key, props);

    const previous = byKey.get(key);
    if (previous === undefined) {
      byKey.set(key, {
        nodeId: frame.nodeId,
        nodeName: frame.nodeName,
        nodeType: frame.nodeType,
        op: frame.op,
        changedProps: [],
        scopeHint: frame.scopeHint,
        page: frame.page,
        latestTs: frame.ts,
        firstFrameIndex: index,
        lastFrameIndex: index,
        fileKey: frame.fileKey,
        fileSlug: slug,
      });
      continue;
    }

    if (OP_RANK[frame.op] > OP_RANK[previous.op]) previous.op = frame.op;
    if (frame.nodeName !== null) previous.nodeName = frame.nodeName;
    if (frame.nodeType.length > 0) previous.nodeType = frame.nodeType;
    if (frame.scopeHint === "global") previous.scopeHint = "global";
    if (frame.ts >= previous.latestTs) {
      previous.latestTs = frame.ts;
      previous.page = frame.page;
    }
    if (index < previous.firstFrameIndex) previous.firstFrameIndex = index;
    if (index > previous.lastFrameIndex) previous.lastFrameIndex = index;
  }

  const output: CoalescedComponent[] = [];
  for (const [key, component] of byKey) {
    component.changedProps = [...(propSets.get(key) ?? new Set<string>())].sort();
    output.push(component);
  }
  output.sort((a, b) => compare(a.nodeId, b.nodeId) || compare(a.fileSlug, b.fileSlug));
  return output;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
