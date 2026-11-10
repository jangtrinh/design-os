/**
 * `duplicate-component-names` (FR-010): two kept nodes share a name after marker stripping. The registry never
 * holds a name twice, so the owner decides. The first node of a name in the scan keeps it; the members of the
 * question are the repeated nodes after it, so a per-member answer is meaningful: exclude that node, or keep it under
 * a distinct name (`<name> · <page>`, with an ordinal when the same page repeats the name).
 */
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";

export interface DuplicateNamesInput {
  /** Kept nodes in scan order; `name` is the stored name (markers already stripped). */
  nodes: { id: string; name: string; page?: string }[];
}

/** The repeated nodes: every node after the first of its name. */
export function surplusNodes(nodes: DuplicateNamesInput["nodes"]): DuplicateNamesInput["nodes"] {
  const seen = new Set<string>();
  const out: DuplicateNamesInput["nodes"] = [];
  for (const n of nodes) {
    if (seen.has(n.name)) out.push(n);
    else seen.add(n.name);
  }
  return out;
}

function detect(raw: unknown): KindDetection | null {
  const input = raw as DuplicateNamesInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.nodes)) return null;
  const surplus = surplusNodes(input.nodes);
  return {
    kind: "duplicate-component-names",
    members: surplus.map((n) => n.id),
    domain: surplus.map((n) => n.id),
    ask(members) {
      const asked = new Set(members);
      const names = [...new Set(surplus.filter((n) => asked.has(n.id)).map((n) => n.name))];
      const shown = names.slice(0, 3).join(", ");
      return {
        question: `${names.length} name(s) occur more than once after marker stripping (${shown}${names.length > 3 ? ", …" : ""}); the first node of each keeps the name. What happens to the ${members.length} repeated node(s)?`,
        options: [
          { id: "exclude-surplus", label: "Exclude the repeated nodes", consequence: `${members.length} node(s) left out of the registry, counted and named` },
          { id: "keep-renamed", label: "Keep them under a distinct name", consequence: `${members.length} record(s) written as "<name> · <page>" (with an ordinal when the page repeats the name)` },
          { id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${members.length} node(s); you choose per node` },
        ],
      };
    },
  };
}

export const duplicateComponentNamesEmitter: KindEmitter = { kind: "duplicate-component-names", detect };
