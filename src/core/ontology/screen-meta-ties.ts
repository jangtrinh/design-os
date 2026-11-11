/**
 * Which screens-meta entry is which screen node. An entry ties to a node only when its `figmaId` equals the id of a
 * frame that is a screen node (exact, `screen:<figmaId>` of the Figma door); nothing is matched by name or position.
 * A figmaId that more than one entry claims ties none of them: the screen gets no metadata and no parent from any.
 */
import { nodeId } from "./node-ids.js";
import type { OntNode } from "./ontology-types.js";
import type { MetaEntry, MetaFact } from "./source-screens-meta.js";

export interface MetaTies {
  /** Entry id -> the screen node it is. */
  tied: Map<string, string>;
  untied: MetaEntry[];
  /** figmaId -> how many entries claim it, for the ids more than one entry claims: those tie none of their entries. */
  claimed: Map<string, number>;
}

export function tieEntries(meta: MetaFact, nodes: readonly OntNode[]): MetaTies {
  const frames = new Set(nodes.filter((n) => n.kind === "screen" && n["door"] === "figma").map((n) => n.id));
  const tied = new Map<string, string>();
  const untied: MetaEntry[] = [];
  const claims = new Map<string, number>();
  for (const e of meta.entries) if (e.figmaId !== undefined) claims.set(e.figmaId, (claims.get(e.figmaId) ?? 0) + 1);
  const claimed = new Map([...claims].filter(([, n]) => n > 1));
  for (const e of meta.entries) {
    const id = e.figmaId === undefined ? undefined : nodeId("screen", e.figmaId);
    if (id !== undefined && frames.has(id) && !claimed.has(e.figmaId as string)) tied.set(e.id, id); else untied.push(e);
  }
  return { tied, untied, claimed };
}
