/**
 * `classification-conflicts` (FR-010): a name or section heuristic contradicts a sensed fact, so the heuristic is not
 * applied until the owner chooses between the two candidate classes. The screen heuristics (a digit-led name, a frame
 * 1,024 px wide or wider) are contradicted by two facts: the node sits on a page the owner kept as a library page, or
 * other components or frames are built from it. Independent of the library-pages question: the second fact needs no
 * ruling, so the cluster also fires when that question was never asked.
 */
import { classifyHeuristic } from "../figma-ds-heuristics.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";

export interface ConflictNode {
  id: string;
  name: string;
  /** The page id and name from the scan, when it carries them. */
  pageId?: string;
  pageName?: string;
  width?: number;
  /** Other components or frames contain instances of this node. */
  instantiated: boolean;
}

export interface ConflictInput {
  nodes: ConflictNode[];
  /** Page ids the owner kept as library pages; absent when that question was not ruled. */
  libraryPages?: string[];
}

const SCREEN_HEURISTICS = new Set(["digit-name", "width-1024"]);

/** The nodes whose screen heuristic a sensed fact contradicts, with the fact. */
export function classificationConflicts(input: ConflictInput): { id: string; name: string; heuristic: string; fact: "library-page" | "instantiated" }[] {
  const library = new Set(input.libraryPages ?? []);
  const out: ReturnType<typeof classificationConflicts> = [];
  for (const n of input.nodes) {
    const h = classifyHeuristic({ name: n.name, ...(n.width === undefined ? {} : { width: n.width }), ...(n.pageName === undefined ? {} : { section: n.pageName }) });
    if (h.heuristic === undefined || !SCREEN_HEURISTICS.has(h.heuristic)) continue;
    if (n.pageId !== undefined && library.has(n.pageId)) out.push({ id: n.id, name: n.name, heuristic: h.heuristic, fact: "library-page" });
    else if (n.instantiated) out.push({ id: n.id, name: n.name, heuristic: h.heuristic, fact: "instantiated" });
  }
  return out;
}

function detect(raw: unknown): KindDetection | null {
  const input = raw as ConflictInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.nodes)) return null;
  const found = classificationConflicts(input);
  const by = new Map(found.map((f) => [f.id, f]));
  const pageOf = new Map(input.nodes.filter((n) => n.pageName !== undefined).map((n) => [n.id, n.pageName as string]));
  return {
    kind: "classification-conflicts",
    members: found.map((f) => f.id),
    domain: found.map((f) => f.id),
    ask(members) {
      const rows = members.map((m) => by.get(m)).filter((f): f is NonNullable<typeof f> => f !== undefined);
      const onLibrary = rows.filter((f) => f.fact === "library-page").length;
      const shown = rows.slice(0, 3).map((f) => f.name).join(", ");
      const facts = [onLibrary > 0 ? `${onLibrary} sit on a page you kept as a library page` : "", rows.length - onLibrary > 0 ? `${rows.length - onLibrary} are used to build other components or frames` : ""].filter((s) => s !== "").join("; ");
      return {
        question: `${members.length} node(s) look like full screens by name or width (${shown}${members.length > 3 ? ", …" : ""}), but ${facts}. Are they components or screens? They are neither written nor dropped until you answer.`,
        options: [
          { id: "as-component", label: "Treat them as components", consequence: `${members.length} node(s) go on to the registry checks` },
          { id: "as-screen", label: "Treat them as screens", consequence: `${members.length} node(s) listed as screens, not in the registry` },
          { id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${members.length} node(s); you choose per node` },
        ],
        labels: Object.fromEntries(rows.map((f) => [f.id, `${f.name}${pageOf.has(f.id) ? ` on ${pageOf.get(f.id)}` : ""}`])),
      };
    },
  };
}

export const classificationConflictsEmitter: KindEmitter = { kind: "classification-conflicts", detect };
