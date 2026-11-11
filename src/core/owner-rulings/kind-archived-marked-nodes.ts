/**
 * `archived-marked-nodes` (FR-009): kept nodes whose name carries an archive marker (a leading cross mark, or a
 * bracketed ARCHIVED / DEPRECATED token, any case). The only name signal added by this spec, and it only asks.
 */
import { hasArchiveMarker } from "../figma-ds-heuristics.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";

export interface ArchivedMarkedInput {
  nodes: { id: string; name: string; page?: string }[];
}

function detect(raw: unknown): KindDetection | null {
  const input = raw as ArchivedMarkedInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.nodes)) return null;
  const marked = input.nodes.filter((n) => hasArchiveMarker(n.name));
  return {
    kind: "archived-marked-nodes",
    members: marked.map((n) => n.id),
    domain: marked.map((n) => n.id),
    ask(members) {
      const names = new Map(marked.map((n) => [n.id, n.name]));
      const shown = members.slice(0, 3).map((m) => names.get(m) ?? m).join(", ");
      return {
        question: `${members.length} kept node(s) carry an archive marker in their name (${shown}${members.length > 3 ? ", …" : ""}). Are they part of the design system?`,
        options: [
          { id: "exclude-archived", label: "Exclude them", consequence: `${members.length} node(s) left out of the registry, counted and named` },
          { id: "keep-archived", label: "Keep them as deprecated components", consequence: `${members.length} record(s) written with the marker removed from the name and the record marked deprecated` },
          { id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${members.length} node(s); you choose per node` },
        ],
        labels: Object.fromEntries(members.map((m) => { const n = marked.find((x) => x.id === m); return [m, `${names.get(m) ?? m}${n?.page === undefined ? "" : ` on ${n.page}`}`]; })),
      };
    },
  };
}

export const archivedMarkedNodesEmitter: KindEmitter = { kind: "archived-marked-nodes", detect };
