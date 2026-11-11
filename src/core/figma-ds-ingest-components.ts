/**
 * The component side of the ingest, in the order the questions depend on each other: which pages hold the design
 * system (and which pages' frames are existing screens), then nodes a heuristic and a sensed fact disagree on, then
 * archive-marked nodes, then duplicate names. A question is raised only once the one before it is ruled (a question
 * the page answer can dissolve is not asked before it); the registry is classified once all of them are.
 */
import type { DsFile, DsFrame, ScanComponent } from "./figma-ds-scan-read.js";
import { classifyRegistry, effectiveClass, storedName } from "./figma-ds-registry.js";
import type { ClassifiedRegistry } from "./figma-ds-registry.js";
import { bindingLinks } from "./figma-ds-ingest-bindings.js";
import type { BindingReport } from "./figma-ds-ingest-bindings.js";
import { resolveDuplicates } from "./figma-ds-ingest-duplicates.js";
import type { NamedItem } from "./figma-ds-ingest-duplicates.js";
import { withOutcome } from "./figma-ds-ingest-rulings.js";
import type { RulingView } from "./figma-ds-ingest-rulings.js";
import type { TokenBuildResult } from "./figma-ds-tokens.js";
import type { KindDetection } from "./owner-rulings/kind-emitter.js";
import { archivedMarkedNodesEmitter } from "./owner-rulings/kind-archived-marked-nodes.js";
import { classificationConflictsEmitter } from "./owner-rulings/kind-classification-conflicts.js";
import { duplicateComponentNamesEmitter } from "./owner-rulings/kind-duplicate-component-names.js";
import { figmaLibraryPagesEmitter } from "./owner-rulings/kind-figma-library-pages.js";
import { screenPagesEmitter } from "./owner-rulings/kind-screen-pages.js";

export type { BindingReport } from "./figma-ds-ingest-bindings.js";

/** The library-pages member for nodes that sit on no page in a scan that has pages. */
export const NO_PAGE = "~no-page";
export const NO_PAGE_LABEL = "Nodes without a page";

export interface ComponentFinal {
  classified: ClassifiedRegistry;
  excludedPages: { name: string; count: number }[];
  archivedExcluded: NamedItem[];
  duplicateExcluded: NamedItem[];
  /** Frames per page and whether the owner kept it; null when the scan carries no frames. */
  frames: { pages: { id: string; name: string; frames: number; instanceBuilt: number; kept: boolean }[] } | null;
  bindings: BindingReport;
}

export interface ComponentStage { detections: KindDetection[]; final: ComponentFinal | null }

const pageTable = <T extends { pageId?: string; pageName?: string }>(items: readonly T[], keyOf: (i: T) => string | undefined, nameOf: (key: string, i: T) => string): Map<string, { id: string; name: string; items: T[] }> => {
  const out = new Map<string, { id: string; name: string; items: T[] }>();
  for (const i of items) {
    const key = keyOf(i);
    if (key !== undefined) (out.get(key) ?? out.set(key, { id: key, name: nameOf(key, i), items: [] }).get(key)!).items.push(i);
  }
  return out;
}

export function componentStage(ds: DsFile, view: RulingView, tokens: TokenBuildResult | null, kept: ReadonlySet<string>): ComponentStage {
  const detections: KindDetection[] = [];
  const pushed = (d: KindDetection | null): KindDetection | null => { if (d !== null) detections.push(d); return d; };

  // Which pages' frames are existing screens.
  const framePages = pageTable<DsFrame>(ds.frames ?? [], (f) => f.pageId, (_, f) => f.pageName);
  const screenDet = pushed(ds.frames === undefined ? null : screenPagesEmitter.detect({
    pages: [...framePages.values()].map((p) => ({ id: p.id, name: p.name, frames: p.items.length, instanceBuilt: p.items.filter((f) => f.instances.length > 0).length })),
  }));

  // Which pages hold the design system. In a scan that has pages, the nodes with none are one more member.
  const hasPages = ds.pageSignal === "present";
  const keyOf = (c: ScanComponent): string | undefined => c.pageId ?? (hasPages ? NO_PAGE : undefined);
  const pages = pageTable(ds.components, keyOf, (key, c) => (key === NO_PAGE ? NO_PAGE_LABEL : c.pageName ?? key));
  const libDet = pages.size > 1 ? pushed(figmaLibraryPagesEmitter.detect({ pages: [...pages.values()].map((p) => ({ id: p.id, name: p.name, nodes: p.items.length })) })) : null;
  const libRuled = libDet === null || view.ruled(libDet);
  // A question the page answer can dissolve waits for it: nothing below is raised while the pages are unruled.
  if (!libRuled) return { detections, final: null };
  const selected = libDet !== null ? new Set([...pages.keys()].filter((id) => view.outcome("figma-library-pages", id) !== "drop")) : undefined;
  const nodes = ds.components.filter((c) => selected === undefined || selected.has(keyOf(c) ?? ""));

  // A heuristic against a sensed fact. The instance fact needs no ruling, so a single-page scan raises this at once.
  const used = new Set([...ds.components, ...(ds.frames ?? [])].flatMap((x) => (x.instances ?? []).map((i) => i.component)));
  const conflict = pushed(classificationConflictsEmitter.detect({
    nodes: nodes.map((n) => ({ id: n.id, name: n.name, ...(n.pageId === undefined ? {} : { pageId: n.pageId, pageName: n.pageName }), ...(n.width === undefined ? {} : { width: n.width }), instantiated: used.has(n.id) })),
    ...(selected !== undefined && libDet !== null ? { libraryPages: [...selected] } : {}),
  }));
  if (conflict !== null && !view.ruled(conflict)) return { detections, final: null };

  const ids = nodes.map((n) => n.id);
  const classOpts = { asComponent: withOutcome(view, "classification-conflicts", ids, "as-component"), asScreen: withOutcome(view, "classification-conflicts", ids, "as-screen") };
  const real = nodes.filter((n) => effectiveClass(n, classOpts).kind === "component");

  const marked = pushed(archivedMarkedNodesEmitter.detect({ nodes: real.map((n) => ({ id: n.id, name: n.name, ...(n.pageName === undefined ? {} : { page: n.pageName }) })) }));
  if (marked !== null && !view.ruled(marked)) return { detections, final: null };
  const realIds = real.map((n) => n.id);
  const archivedOut = withOutcome(view, "archived-marked-nodes", realIds, "exclude-archived");
  const deprecated = withOutcome(view, "archived-marked-nodes", realIds, "keep-archived");
  const left = real.filter((n) => !archivedOut.has(n.id));
  const named = left.map((n) => ({ id: n.id, name: storedName(n, deprecated.has(n.id)), ...(n.pageName === undefined ? {} : { page: n.pageName }), ...(n.pageId === undefined ? {} : { pageId: n.pageId }) }));
  const dup = pushed(duplicateComponentNamesEmitter.detect({ nodes: named }));
  if (dup !== null && !view.ruled(dup)) return { detections, final: null };
  const { excluded: dupOut, renames } = resolveDuplicates(named, (member) => view.outcome("duplicate-component-names", member));

  if (tokens === null || (screenDet !== null && !view.ruled(screenDet))) return { detections, final: null };

  const remaining = nodes.filter((n) => !archivedOut.has(n.id) && !dupOut.some((d) => d.id === n.id));
  const { links, report } = bindingLinks(remaining.filter((n) => effectiveClass(n, classOpts).kind === "component"), ds, tokens, kept);
  const classified = classifyRegistry(remaining, { ...classOpts, deprecatedIds: deprecated, renames, tokensUsed: links });
  if (classified.duplicates.length > 0) throw new Error(`the ingest reached the registry with a repeated name: ${classified.duplicates[0]?.name ?? ""}`);
  const excludedPages = [...pages.values()].filter((p) => selected !== undefined && !selected.has(p.id)).map((p) => ({ name: p.name, count: p.items.length }));
  const frames = ds.frames === undefined ? null : { pages: [...framePages.values()].map((p) => ({
    id: p.id, name: p.name, frames: p.items.length, instanceBuilt: p.items.filter((f) => f.instances.length > 0).length,
    kept: screenDet === null || view.outcome("screen-pages", p.id) !== "drop",
  })) };
  const archivedItems = real.filter((n) => archivedOut.has(n.id)).map((n) => ({ id: n.id, name: n.name }));
  return { detections, final: { classified, excludedPages, archivedExcluded: archivedItems, duplicateExcluded: dupOut, frames, bindings: report } };
}
