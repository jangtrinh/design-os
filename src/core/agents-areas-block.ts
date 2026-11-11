/**
 * The generated ontology-areas block of a project agent: one line per area (its key, its node count and the exact
 * `ui ontology query` command for it), fenced by markers. It is the one deliberate exception to "agent identity is read
 * at runtime, never baked": it sits between markers, `ui agents init` regenerates it, and `ui agents check` re-renders
 * it from the ontology file and compares (the method `principles.json` uses). Text outside the markers is never touched
 * by a block replacement. The block is never empty and never absent: with no ontology it says so and names the build.
 */
import type { Runtime } from "./init-stub.js";
import { listAreas } from "./ontology/query-areas.js";
import type { AreaRow } from "./ontology/query-areas.js";
import { shellQuote } from "./ontology/query-text.js";

export const BLOCK_START = "<!-- design-os:ontology-areas:start -->";
export const BLOCK_END = "<!-- design-os:ontology-areas:end -->";
const BLOCK_RE = /<!-- design-os:ontology-areas:start -->[\s\S]*?<!-- design-os:ontology-areas:end -->\n?/g;

/** What the ontology file says about areas: read from the file on disk only, never from the sources. */
export type OntologyView = { state: "areas"; areas: AreaRow[] } | { state: "missing" } | { state: "unreadable" };

export function ontologyView(fileText: string | null): OntologyView {
  if (fileText === null) return { state: "missing" };
  try {
    const doc = JSON.parse(fileText) as { nodes?: unknown };
    return Array.isArray(doc.nodes) ? { state: "areas", areas: listAreas({ nodes: doc.nodes as { area?: unknown }[] } as Parameters<typeof listAreas>[0]) } : { state: "unreadable" };
  } catch { return { state: "unreadable" }; }
}

/** How an agent asks the owner an open ruling question, per runtime. */
const ASKING: Record<Runtime, string> = {
  claude: "To ask the owner an open ruling question, use AskUserQuestion with the options that `ui onboard questions --format claude` prints.",
  codex: "To ask the owner an open ruling question, print the numbered questions that `ui onboard questions` prints and wait for the answer.",
  antigravity: "To ask the owner an open ruling question, print the numbered questions that `ui onboard questions` prints and wait for the answer.",
};

export function renderAreasBlock(view: OntologyView, runtime: Runtime): string {
  const body = view.state === "areas"
    ? view.areas.length === 0
      ? ["The ontology holds no area yet (no component, token or ruling carries one): query it without --area, for example `ui ontology query \"<your task>\"`."]
      : ["Ontology areas of this project. Before design work, find what it knows with the command of the area the task belongs to:",
        ...view.areas.map((a) => `- ${a.key} (${a.nodes} node${a.nodes === 1 ? "" : "s"}): \`ui ontology query "<your task>" --area ${shellQuote(a.key)}\``)]
    : [view.state === "missing"
      ? "This project has no ontology yet (design/knowledge/ontology.json is missing): run `ui ontology build`, then `ui agents init --force` lists its areas here."
      : "The ontology file cannot be read (design/knowledge/ontology.json): run `ui ontology build`, then `ui agents init --force` lists its areas here."];
  return `${[BLOCK_START, ...body, ASKING[runtime], BLOCK_END].join("\n")}\n`;
}

/** Every block in a text, markers included. */
export const blocksIn = (text: string): string[] => text.match(BLOCK_RE) ?? [];
/** The text with every block removed: what is outside the markers. */
export const stripBlocks = (text: string): string => text.replace(BLOCK_RE, "");
