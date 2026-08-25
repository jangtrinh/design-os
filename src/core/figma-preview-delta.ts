/** Compute a deterministic component-registry preview from coalesced Figma changes. */
import type {
  CoalescedComponent,
  DeltaEntry,
  PreviewDelta,
  RegistryView,
  ScopeHint,
  UnresolvedEntry,
  UpdatedEntry,
} from "./figma-reconcile-types.js";

/** Only structurally certain mappings belong here; visual properties require re-ingest. */
const FIGMA_PROP_TO_FIELD: Record<string, string> = {
  name: "name",
  componentPropertyDefinitions: "variants",
  variantProperties: "variants",
};

function resolveScope(
  hint: ScopeHint,
  prior: RegistryView | undefined,
): { scope: ScopeHint; scopeFromHint: boolean } {
  if (prior === undefined) return { scope: hint, scopeFromHint: true };
  const existing = prior.scope ?? "local";
  if (hint === "global" && existing !== "global") {
    return { scope: "global", scopeFromHint: true };
  }
  return { scope: existing, scopeFromHint: false };
}

/**
 * Bucket created and updated changes by registry presence; deletions become deprecations.
 * Cross-file name collisions remain unresolved until a file-scoped apply chooses one.
 */
export function computePreviewDelta(
  components: readonly CoalescedComponent[],
  existing: ReadonlyMap<string, RegistryView>,
): PreviewDelta {
  const added: DeltaEntry[] = [];
  const updated: UpdatedEntry[] = [];
  const deprecated: DeltaEntry[] = [];
  const unresolved: UnresolvedEntry[] = [];

  const targetsByName = new Map<string, CoalescedComponent[]>();
  for (const component of components) {
    if (component.nodeName === null || component.nodeName.length === 0) continue;
    const targets = targetsByName.get(component.nodeName);
    if (targets !== undefined) targets.push(component);
    else targetsByName.set(component.nodeName, [component]);
  }

  const colliding = new Set<CoalescedComponent>();
  for (const targets of targetsByName.values()) {
    if (new Set(targets.map((component) => component.fileSlug)).size > 1) {
      for (const component of targets) colliding.add(component);
    }
  }

  for (const component of components) {
    const name = component.nodeName;
    if (name === null || name.length === 0) {
      unresolved.push({
        nodeId: component.nodeId,
        op: component.op,
        reason: "no resolvable component name (DELETE lost identity)",
      });
      continue;
    }
    if (colliding.has(component)) {
      unresolved.push({
        nodeId: component.nodeId,
        op: component.op,
        reason: `name collision: '${name}' resolves to more than one target in this batch (likely two different files sharing a name) — apply with --file-slug to resolve one at a time`,
      });
      continue;
    }

    const prior = existing.get(name);
    const { scope, scopeFromHint } = resolveScope(component.scopeHint, prior);
    const base: DeltaEntry = {
      name,
      nodeId: component.nodeId,
      nodeType: component.nodeType,
      scope,
      scopeHint: component.scopeHint,
      scopeFromHint,
      page: component.page,
    };
    if (component.op === "deleted") {
      deprecated.push(base);
      continue;
    }
    if (prior === undefined) {
      added.push(base);
      continue;
    }

    const changedProps = component.changedProps.map((prop) => ({
      figmaProp: prop,
      field: FIGMA_PROP_TO_FIELD[prop] ?? null,
    }));
    const fields = [...new Set(
      changedProps.map((item) => item.field).filter((field): field is string => field !== null),
    )].sort();
    updated.push({ ...base, changedProps, fields });
  }

  const byName = (a: DeltaEntry, b: DeltaEntry): number =>
    a.name.localeCompare(b.name) || compare(a.nodeId, b.nodeId);
  added.sort(byName);
  updated.sort(byName);
  deprecated.sort(byName);
  unresolved.sort((a, b) => compare(a.nodeId, b.nodeId));
  return { added, updated, deprecated, unresolved };
}

/** Count resolved scopes across every applied bucket. */
export function scopeSummary(delta: PreviewDelta): { local: number; global: number } {
  let local = 0;
  let global = 0;
  for (const entry of [...delta.added, ...delta.updated, ...delta.deprecated]) {
    if (entry.scope === "global") global++;
    else local++;
  }
  return { local, global };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
