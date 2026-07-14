// Raw-facts contract for the AUDIT_DS command — the ONE shape the plugin emits and
// the CLI detect core consumes. Lives in shared/ because both bundles import it
// (plugin: executor-audit.ts; CLI: audit-ds-detect.ts) and neither may reach into
// the other's tree. The plugin gathers these facts WITHOUT judgment; every flag,
// cluster and summary is computed later in the pure CLI detector.
//
// v2 (schema 2): masters carry width/height + nested comparable `units[]` (structure /
// texts / paints / per-variant usageCount). The judgment layer segments masters into
// ds / icon / screen and compares units structurally — none of that lives here.

/** The facts-shape version. The CLI refuses to detect on any other value (E_PLUGIN_STALE):
 *  a stale plugin sandbox (old build still resident) would otherwise emit v1 shapes silently. */
export const AUDIT_FACTS_SCHEMA = 2;

/** Raw structural material for ONE comparable unit (a set's variant child, or a standalone
 *  COMPONENT itself). Gathered node-by-node; the CLI hashes/compares these — never the plugin. */
export interface AuditUnitFact {
  id: string;
  /** variant child: "Tone=ok, Pct=50"; standalone: the node's own name. */
  name: string;
  /** Subtree entries `${depth}:${type}:${name}:${w}x${h}`. The ROOT entry carries NO name
   *  (`0:COMPONENT::16x16`) so duplicate detection is name-independent at the root. */
  structure: string[];
  /** characters of every TEXT node, traversal order. */
  texts: string[];
  /** Paint fingerprints, traversal order: `f:#rrggbb[@0.50]` | `f:var:<variableId>` |
   *  `f:GRADIENT_LINEAR` (non-solid: type only); `s:` prefix for strokes. */
  paints: string[];
  /** getInstancesAsync().length — doc-wide incl. nested. null = call failed/unavailable OR
   *  standalone (the census covers standalone usage, so getInstancesAsync is never called there). */
  usageCount: number | null;
}

/** One inventoried COMPONENT or COMPONENT_SET — plain data, no verdicts. */
export interface AuditComponentFact {
  id: string;
  key: string | null;
  name: string;
  type: 'COMPONENT' | 'COMPONENT_SET';
  /** SET: number of variant children; a lone COMPONENT: 0. */
  variantCount: number;
  /** SET: the VARIANT axes from componentPropertyDefinitions (axisName → options). */
  variantAxes: Record<string, string[]>;
  pageName: string;
  /** Name of the nearest ancestor SECTION, or null when outside every section. */
  section: string | null;
  /** getSharedPluginData('idp','status') === 'deprecated'. */
  deprecatedData: boolean;
  /** Math.round of the node's rendered size — feeds ds/icon/screen classification (0 on read failure). */
  width: number;
  height: number;
  /** SOLID paints on the representative + its direct children NOT bound to a color variable. */
  unboundFills: number;
  unboundStrokes: number;
  /** SET: one unit per variant child (usage via getInstancesAsync).
   *  Standalone COMPONENT: exactly ONE unit (itself), usageCount null (census covers it). */
  units: AuditUnitFact[];
}

/** Instance-usage tally, resolved to the SET (or lone component) id. */
export interface AuditUsageFacts {
  /** set-id (or component-id when not in a set) → instance count across all pages. */
  byMainId: Record<string, number>;
  /** set-id → the names of the pages that hold at least one instance. */
  pagesById: Record<string, string[]>;
  /** Instances whose representative failed to resolve to a main (prototype's 'ERR'). */
  unresolved: number;
}

/** The whole raw scan — one JSON object the plugin returns for AUDIT_DS. */
export interface AuditDsFacts {
  /** AUDIT_FACTS_SCHEMA at capture time — the CLI's staleness gate keys off this. */
  schema: number;
  /** `skippedPages`: pages whose setCurrentPageAsync failed (hydration error) — traversal
   *  skipped them, so usage counts are a LOWER BOUND whenever this is non-empty. */
  file: { fileName: string; pages: { id: string; name: string }[]; skippedPages: string[] };
  components: AuditComponentFact[];
  usage: AuditUsageFacts;
  /** masters = all inventoried masters; standalone = masters − sets; variants = Σ variantCount. */
  counts: { masters: number; sets: number; standalone: number; variants: number; instancesTallied: number };
}
