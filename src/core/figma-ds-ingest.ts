/**
 * Figma design-system ingest — the pure orchestrator (zero-network, zero-LLM).
 *
 * Validates a parsed ds.json (the `figma-agent scan-design-system` output) and transforms it into the portable
 * ease-design stores: a DTCG token tree, a component registry, and a DESIGN.md knowledge doc. It asks instead of
 * dropping or guessing: `planIngest` returns every question the scan raises, and the stores only once the owner's
 * rulings answer all of them. The command wrapper (src/commands/ingest-figma-ds.ts) owns all filesystem I/O, the block
 * contract and memory seeding; this module is a deterministic value → value transform.
 */
import { buildDesignDoc } from "./figma-ds-designdoc.js";
import type { DesignExclusions } from "./figma-ds-designdoc.js";
import { componentStage } from "./figma-ds-ingest-components.js";
import type { BindingReport, ComponentFinal } from "./figma-ds-ingest-components.js";
import { rulingView } from "./figma-ds-ingest-rulings.js";
import { tokenStage } from "./figma-ds-ingest-tokens.js";
import { buildLedger } from "./figma-ds-ledger.js";
import type { Ledger } from "./figma-ds-ledger.js";
import type { IconSummary } from "./figma-ds-registry.js";
import type { DsFile } from "./figma-ds-scan-read.js";
import { SKIP_REASONS } from "./figma-ds-tokens.js";
import type { DtcgTree } from "./figma-ds-tokens.js";
import type { Registry } from "./registry-store.js";
import type { KindDetection } from "./owner-rulings/kind-emitter.js";
import type { Ruling } from "./owner-rulings/ruling-store.js";
import { HEURISTICS } from "./figma-ds-heuristics.js";

export { DsIngestError, parseDsFile } from "./figma-ds-scan-read.js";
export type { DsFile } from "./figma-ds-scan-read.js";

export interface IngestResult {
  tree: DtcgTree;
  registry: Registry;
  designMd: string;
  /** `components` counts REAL DS components only; icons/screens are the classified noise. */
  counts: { tokens: number; components: number; styles: number; icons: number; screens: number };
  stats: { primitives: number; semantics: number; skippedTokens: number };
  componentNames: string[];
  /** Bulk icon summary (not one row per icon). */
  icons: IconSummary;
  /** Screen-frame names — full designs, not DS components. */
  screens: string[];
  ledger: Ledger;
  /** Everything that was left out, named: the collections and pages, with their counts. */
  excluded: DesignExclusions;
  pageSignal: DsFile["pageSignal"];
  bindings: BindingReport;
  frames: ComponentFinal["frames"];
}

export interface IngestPlan {
  /** Every question the scan raises now, whether or not a ruling already answers it. */
  detections: KindDetection[];
  /** Null while any question is open. */
  result: IngestResult | null;
  ledger: Ledger;
}

/** Plan an ingest against the owner's rulings. Deterministic. */
export function planIngest(ds: DsFile, name: string, source: string, rulings: readonly Ruling[] = []): IngestPlan {
  const view = rulingView(rulings);
  const t = tokenStage(ds.tokens, view);
  const c = componentStage(ds, view, t.built, t.kept);
  const detections = [...t.detections, ...c.detections];
  const zero = Object.fromEntries(HEURISTICS.map((h) => [h, 0])) as Ledger["classifiedByHeuristic"];
  const base = { variables: ds.tokens.length, components: ds.components.length };
  if (t.built === null || c.final === null) {
    return { detections, result: null, ledger: buildLedger({ ...base, writtenTokens: 0, writtenComponents: 0, excluded: {}, pending: base.variables + base.components, classifiedByHeuristic: zero }) };
  }
  const built = t.built;
  const f = c.final;
  const registry = f.classified.registry;
  const excluded = {
    "collection-not-selected": built.excluded.collections.reduce((n, x) => n + x.count, 0),
    "path-collision": built.excluded.collisionLosers.length,
    ...Object.fromEntries(SKIP_REASONS.map((r) => [r, built.excluded.skipped[r].length])),
    "page-not-selected": f.excludedPages.reduce((n, x) => n + x.count, 0),
    "archived-excluded": f.archivedExcluded.length,
    "duplicate-excluded": f.duplicateExcluded.length,
    "classified-icon": f.classified.icons.count,
    "classified-screen": f.classified.screens.length,
  };
  const ledger = buildLedger({
    ...base, writtenTokens: built.primitives + built.semantics, writtenComponents: registry.components.length,
    excluded, pending: 0, classifiedByHeuristic: f.classified.classifiedByHeuristic,
  });
  const counts = { tokens: ds.tokens.length, components: registry.components.length, styles: ds.styles.length, icons: f.classified.icons.count, screens: f.classified.screens.length };
  // Every item the owner ruled out, with its id and name: the envelope lists them all, the text surfaces cap the names.
  const variableName = new Map(ds.tokens.map((v) => [v.id, v.name]));
  const named = (ids: readonly string[]): { id: string; name: string }[] => ids.map((id) => ({ id, name: variableName.get(id) ?? id }));
  const items: NonNullable<DesignExclusions["items"]> = {
    "path-collision": named(built.excluded.collisionLosers),
    ...Object.fromEntries(SKIP_REASONS.map((r) => [r, named(built.excluded.skipped[r])])),
    "archived-excluded": f.archivedExcluded,
    "duplicate-excluded": f.duplicateExcluded,
  };
  for (const key of Object.keys(items) as (keyof typeof items)[]) if ((items[key]?.length ?? 0) === 0) delete items[key];
  const exclusions: DesignExclusions = { collections: built.excluded.collections, pages: f.excludedPages, items };
  const designMd = buildDesignDoc({
    name, source, tree: built.tree, registry, styles: ds.styles, counts, icons: f.classified.icons, screens: f.classified.screens,
    ledger, exclusions, frames: f.frames, bindings: f.bindings,
  });
  return {
    detections,
    ledger,
    result: {
      tree: built.tree, registry, designMd, counts,
      stats: { primitives: built.primitives, semantics: built.semantics, skippedTokens: built.skipped },
      componentNames: registry.components.map((x) => x.name),
      icons: f.classified.icons, screens: f.classified.screens, ledger, excluded: exclusions,
      pageSignal: ds.pageSignal, bindings: f.bindings, frames: f.frames,
    },
  };
}

/** Transform a validated ds.json into the portable stores, or throw when a question is still open. */
export function ingestDesignSystem(ds: DsFile, name: string, source: string, rulings: readonly Ruling[] = []): IngestResult {
  const plan = planIngest(ds, name, source, rulings);
  if (plan.result === null) throw new Error(`the scan raises ${plan.detections.filter((d) => d.members.length > 0).length} question(s) that need an owner ruling: use planIngest and ask them`);
  return plan.result;
}
