/**
 * The component side of the ingest, in the order the questions depend on each other: which pages hold the design
 * system (and which pages' frames are existing screens), then nodes a heuristic and a sensed fact disagree on, then
 * archive-marked nodes, then duplicate names. A question is raised only once the one before it is ruled; the
 * registry is classified once all of them are.
 */
import type { DsFile, DsFrame, ScanComponent } from "./figma-ds-scan-read.js";
import { classifyRegistry, effectiveClass, storedName } from "./figma-ds-registry.js";
import type { ClassifiedRegistry } from "./figma-ds-registry.js";
import { withOutcome } from "./figma-ds-ingest-rulings.js";
import type { RulingView } from "./figma-ds-ingest-rulings.js";
import type { TokenBuildResult } from "./figma-ds-tokens.js";
import type { KindDetection } from "./owner-rulings/kind-emitter.js";
import { archivedMarkedNodesEmitter } from "./owner-rulings/kind-archived-marked-nodes.js";
import { classificationConflictsEmitter } from "./owner-rulings/kind-classification-conflicts.js";
import { duplicateComponentNamesEmitter, surplusNodes } from "./owner-rulings/kind-duplicate-component-names.js";
import { figmaLibraryPagesEmitter } from "./owner-rulings/kind-figma-library-pages.js";
import { screenPagesEmitter } from "./owner-rulings/kind-screen-pages.js";

const TOKEN_PATH = /^[a-z][a-z0-9.-]*$/;

export interface BindingReport {
  /** Components whose scan entry carries `boundVariables`; the rest are `not-sensed`, never "none". */
  sensed: number;
  notSensed: number;
  linked: number;
  excluded: { collections: { name: string; count: number }[]; notWritten: number; outsideScan: number; unsafePath: number };
}

export interface ComponentFinal {
  classified: ClassifiedRegistry;
  excludedPages: { name: string; count: number }[];
  archivedExcluded: number;
  duplicateExcluded: number;
  /** Frames per page and whether the owner kept it; null when the scan carries no frames. */
  frames: { pages: { id: string; name: string; frames: number; instanceBuilt: number; kept: boolean }[] } | null;
  bindings: BindingReport;
}

export interface ComponentStage { detections: KindDetection[]; final: ComponentFinal | null }

const pageTable = <T extends { pageId?: string; pageName?: string }>(items: readonly T[]): Map<string, { id: string; name: string; items: T[] }> => {
  const out = new Map<string, { id: string; name: string; items: T[] }>();
  for (const i of items) if (i.pageId !== undefined) (out.get(i.pageId) ?? out.set(i.pageId, { id: i.pageId, name: i.pageName ?? i.pageId, items: [] }).get(i.pageId)!).items.push(i);
  return out;
}

/** Links each node to the tokens written for the variables bound inside it, and counts what could not be linked. */
function bindingLinks(nodes: ScanComponent[], ds: DsFile, tokens: TokenBuildResult, kept: ReadonlySet<string>): { links: Map<string, string[]>; report: BindingReport } {
  const links = new Map<string, string[]>();
  const report: BindingReport = { sensed: 0, notSensed: 0, linked: 0, excluded: { collections: [], notWritten: 0, outsideScan: 0, unsafePath: 0 } };
  const collectionOf = new Map(ds.tokens.map((v) => [v.id, v.collection ?? ""]));
  const perCollection = new Map<string, number>();
  const sensing = ds.sensing?.status !== "skipped";
  for (const n of nodes) {
    if (!sensing || n.boundVariables === undefined) { report.notSensed++; continue; }
    report.sensed++;
    const paths = new Set<string>();
    for (const id of n.boundVariables) {
      const written = tokens.pathById.get(id);
      const collection = collectionOf.get(id);
      if (written !== undefined) { if (TOKEN_PATH.test(written)) { paths.add(written); report.linked++; } else report.excluded.unsafePath++; }
      else if (collection === undefined) report.excluded.outsideScan++;
      else if (!kept.has(collection)) perCollection.set(collection, (perCollection.get(collection) ?? 0) + 1);
      else report.excluded.notWritten++;
    }
    links.set(n.id, [...paths].sort());
  }
  report.excluded.collections = [...perCollection].map(([name, count]) => ({ name, count }));
  return { links, report };
}

export function componentStage(ds: DsFile, view: RulingView, tokens: TokenBuildResult | null, kept: ReadonlySet<string>): ComponentStage {
  const detections: KindDetection[] = [];
  const pushed = (d: KindDetection | null): KindDetection | null => { if (d !== null) detections.push(d); return d; };

  // Which pages' frames are existing screens.
  const framePages = pageTable<DsFrame & { pageId: string }>(ds.frames ?? []);
  const screenDet = pushed(ds.frames === undefined ? null : screenPagesEmitter.detect({
    pages: [...framePages.values()].map((p) => ({ id: p.id, name: p.name, frames: p.items.length, instanceBuilt: p.items.filter((f) => f.instances.length > 0).length })),
  }));

  // Which pages hold the design system.
  const pages = pageTable(ds.components);
  const libDet = pages.size > 1 ? pushed(figmaLibraryPagesEmitter.detect({ pages: [...pages.values()].map((p) => ({ id: p.id, name: p.name, nodes: p.items.length })) })) : null;
  const libRuled = libDet === null || view.ruled(libDet);
  const selected = libDet !== null && libRuled ? new Set([...pages.keys()].filter((id) => view.outcome("figma-library-pages", id) !== "drop")) : undefined;
  const onSelected = (c: ScanComponent): boolean => c.pageId === undefined || selected === undefined || selected.has(c.pageId);
  const nodes = ds.components.filter(onSelected);

  // A heuristic against a sensed fact. The instance fact needs no ruling, so this is raised whether or not pages were asked.
  const used = new Set([...ds.components, ...(ds.frames ?? [])].flatMap((x) => (x.instances ?? []).map((i) => i.component)));
  const conflict = pushed(classificationConflictsEmitter.detect({
    nodes: nodes.map((n) => ({ id: n.id, name: n.name, ...(n.pageId === undefined ? {} : { pageId: n.pageId, pageName: n.pageName }), ...(n.width === undefined ? {} : { width: n.width }), instantiated: used.has(n.id) })),
    ...(selected !== undefined && libDet !== null ? { libraryPages: [...selected] } : {}),
  }));
  const conflictRuled = conflict === null || view.ruled(conflict);
  if (!libRuled || !conflictRuled) return { detections, final: null };

  const ids = nodes.map((n) => n.id);
  const classOpts = { asComponent: withOutcome(view, "classification-conflicts", ids, "as-component"), asScreen: withOutcome(view, "classification-conflicts", ids, "as-screen") };
  const real = nodes.filter((n) => effectiveClass(n, classOpts).kind === "component");

  const marked = pushed(archivedMarkedNodesEmitter.detect({ nodes: real.map((n) => ({ id: n.id, name: n.name })) }));
  if (marked !== null && !view.ruled(marked)) return { detections, final: null };
  const realIds = real.map((n) => n.id);
  const archivedOut = withOutcome(view, "archived-marked-nodes", realIds, "exclude-archived");
  const deprecated = withOutcome(view, "archived-marked-nodes", realIds, "keep-archived");
  const left = real.filter((n) => !archivedOut.has(n.id));
  const named = left.map((n) => ({ id: n.id, name: storedName(n, deprecated.has(n.id)), ...(n.pageName === undefined ? {} : { page: n.pageName }) }));
  const dup = pushed(duplicateComponentNamesEmitter.detect({ nodes: named }));
  if (dup !== null && !view.ruled(dup)) return { detections, final: null };
  const surplus = surplusNodes(named);
  const dupOut = withOutcome(view, "duplicate-component-names", surplus.map((n) => n.id), "exclude-surplus");
  const taken = new Set(named.filter((n) => !dupOut.has(n.id) && !surplus.includes(n)).map((n) => n.name));
  const renames = new Map<string, string>();
  for (const n of surplus.filter((s) => !dupOut.has(s.id))) {
    const base = `${n.name} · ${n.page ?? "unpaged"}`;
    let candidate = base;
    for (let k = 2; taken.has(candidate); k++) candidate = `${base} (${k})`;
    taken.add(candidate);
    renames.set(n.id, candidate);
  }

  if (tokens === null || (screenDet !== null && !view.ruled(screenDet))) return { detections, final: null };

  const remaining = nodes.filter((n) => !archivedOut.has(n.id) && !dupOut.has(n.id));
  const { links, report } = bindingLinks(remaining.filter((n) => effectiveClass(n, classOpts).kind === "component"), ds, tokens, kept);
  const classified = classifyRegistry(remaining, { ...classOpts, deprecatedIds: deprecated, renames, tokensUsed: links });
  if (classified.duplicates.length > 0) throw new Error(`the ingest reached the registry with a repeated name: ${classified.duplicates[0]?.name ?? ""}`);
  const excludedPages = [...pages.values()].filter((p) => selected !== undefined && !selected.has(p.id)).map((p) => ({ name: p.name, count: p.items.length }));
  const frames = ds.frames === undefined ? null : { pages: [...framePages.values()].map((p) => ({
    id: p.id, name: p.name, frames: p.items.length, instanceBuilt: p.items.filter((f) => f.instances.length > 0).length,
    kept: screenDet === null || view.outcome("screen-pages", p.id) !== "drop",
  })) };
  return { detections, final: { classified, excludedPages, archivedExcluded: archivedOut.size, duplicateExcluded: dupOut.size, frames, bindings: report } };
}
