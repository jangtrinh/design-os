/**
 * Which screens-meta entry is which screen node. An entry ties to a node only when its `figmaId` equals the id of a
 * frame that is a screen node (exact, `screen:<figmaId>` of the Figma door); nothing is matched by name or position.
 */
import { nodeId } from "./node-ids.js";
import type { OntNode } from "./ontology-types.js";
import type { MetaEntry, MetaFact } from "./source-screens-meta.js";

export interface MetaTies {
  /** Entry id -> the screen node it is. */
  tied: Map<string, string>;
  untied: MetaEntry[];
}

export function tieEntries(meta: MetaFact, nodes: readonly OntNode[]): MetaTies {
  const frames = new Set(nodes.filter((n) => n.kind === "screen" && n["door"] === "figma").map((n) => n.id));
  const tied = new Map<string, string>();
  const untied: MetaEntry[] = [];
  for (const e of meta.entries) {
    const id = e.figmaId === undefined ? undefined : nodeId("screen", e.figmaId);
    if (id !== undefined && frames.has(id)) tied.set(e.id, id); else untied.push(e);
  }
  return { tied, untied };
}
