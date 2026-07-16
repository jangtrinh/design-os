// Figma live-sync change contract (spec 004 P1) — shared by plugin (capture) and
// cli/broker (append). Pure: no fs, no figma API, no network. Both bundles import
// this relatively; esbuild inlines it per bundle (same pattern as protocol.ts).
//
// Data flow: plugin `documentchange` handler resolves each raw change to its
// enclosing component and coalesces to one ComponentChange per component (Tier 1),
// posts DOC_CHANGE over the wire; the broker stamps each ComponentChange into a
// ChangeFrame and appends it to `design/figma.changes.jsonl` (Tier 2). Reconcile
// (P2/P4) walks that log — so ChangeFrame is the ON-DISK CONTRACT those phases read.

/** Bump when ChangeFrame's shape changes; reconcile refuses a mismatched `v`. */
export const CHANGE_LOG_SCHEMA_VERSION = 1;

/** Component-level operation, coalesced from Figma's finer DocumentChange types. */
export type ChangeOp = 'created' | 'updated' | 'deleted';

/** Where a change came from (Figma `DocumentChange.origin`). */
export type ChangeOrigin = 'LOCAL' | 'REMOTE';

/** Best-effort scope hint derived from origin — NON-authoritative (reconcile decides). */
export type ScopeHint = 'local' | 'global';

/**
 * One component's coalesced change, as the plugin posts it (DOC_CHANGE.data.changes[]).
 * `nodeName` is null when unknowable — a DELETE gives Figma a `RemovedNode` that
 * carries only id + type (no name).
 */
export interface ComponentChange {
  op: ChangeOp;
  nodeId: string;
  nodeName: string | null;
  nodeType: string; // COMPONENT | COMPONENT_SET (or the raw type on an unresolved delete)
  changedProps: string[]; // property names for `updated`; empty for created/deleted
  origin: ChangeOrigin;
}

/**
 * One line of `design/figma.changes.jsonl`. The broker stamps `v`/`ts`/`scopeHint`
 * plus the per-batch `page`/`fileKey` onto each ComponentChange. THIS is the shape
 * reconcile (P2/P4) parses — treat as an append-only, versioned contract.
 */
export interface ChangeFrame {
  v: number; // CHANGE_LOG_SCHEMA_VERSION
  ts: number; // epoch ms, stamped at append
  op: ChangeOp;
  nodeId: string;
  nodeName: string | null;
  nodeType: string;
  changedProps: string[];
  origin: ChangeOrigin;
  scopeHint: ScopeHint; // origin === 'REMOTE' → 'global', else 'local' (a hint, not a decision)
  page: string; // figma.currentPage.name at capture
  fileKey: string | null; // figma.fileKey (undefined on some free-tier contexts → null)
}

/** Per-batch metadata (same for every change in one documentchange event). */
export interface ChangeBatchMeta {
  page: string;
  fileKey: string | null;
}

/**
 * Map a Figma `DocumentChange.type` to a component-level op. Returns null for the
 * STYLE_* variants — P1 captures component nodes only (styles/tokens are out of scope).
 */
export function mapChangeType(type: string): ChangeOp | null {
  switch (type) {
    case 'CREATE': return 'created';
    case 'DELETE': return 'deleted';
    case 'PROPERTY_CHANGE': return 'updated';
    default: return null; // STYLE_CREATE / STYLE_DELETE / STYLE_PROPERTY_CHANGE — ignored in P1
  }
}

/** REMOTE-origin changes come from another user / a published library → global hint. */
export function deriveScopeHint(origin: ChangeOrigin): ScopeHint {
  return origin === 'REMOTE' ? 'global' : 'local';
}

// Op precedence when several raw changes hit the same component in one batch:
// a deletion supersedes everything; a creation supersedes a mere update.
const OP_RANK: Record<ChangeOp, number> = { deleted: 3, created: 2, updated: 1 };

/**
 * Coalesce raw per-node component changes to ONE ComponentChange per component id.
 * Deterministic: output sorted by nodeId; changedProps unioned + sorted; the
 * highest-ranked op wins; origin is REMOTE if any contributing change is remote;
 * nodeName is the first non-null seen. Pure — no figma calls, so unit-testable.
 * Idempotent on already-coalesced input (ids are unique → each maps to itself).
 */
export function coalesceChanges(raw: ComponentChange[]): ComponentChange[] {
  const byId = new Map<string, ComponentChange>();
  const propSets = new Map<string, Set<string>>();
  for (const c of raw) {
    const props = propSets.get(c.nodeId) ?? new Set<string>();
    for (const p of c.changedProps) props.add(p);
    propSets.set(c.nodeId, props);

    const prev = byId.get(c.nodeId);
    if (!prev) {
      byId.set(c.nodeId, { ...c, changedProps: [] });
      continue;
    }
    prev.op = OP_RANK[c.op] > OP_RANK[prev.op] ? c.op : prev.op;
    if (prev.nodeName === null && c.nodeName !== null) prev.nodeName = c.nodeName;
    if (!prev.nodeType && c.nodeType) prev.nodeType = c.nodeType;
    if (c.origin === 'REMOTE') prev.origin = 'REMOTE';
  }
  const out: ComponentChange[] = [];
  for (const [id, c] of byId) {
    c.changedProps = [...(propSets.get(id) ?? new Set())].sort();
    out.push(c);
  }
  out.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
  return out;
}

/**
 * Stamp one ComponentChange into a fully-formed ChangeFrame (pure). Coerces
 * absent/loose fields to safe defaults so a frame crossing the wire always lands
 * on disk well-formed (nodeName→null, changedProps→[], origin→LOCAL).
 */
export function buildChangeFrame(change: ComponentChange, meta: ChangeBatchMeta, ts: number): ChangeFrame {
  const origin: ChangeOrigin = change.origin === 'REMOTE' ? 'REMOTE' : 'LOCAL';
  return {
    v: CHANGE_LOG_SCHEMA_VERSION,
    ts,
    op: change.op,
    nodeId: change.nodeId,
    nodeName: change.nodeName ?? null,
    nodeType: change.nodeType ?? '',
    changedProps: Array.isArray(change.changedProps) ? change.changedProps : [],
    origin,
    scopeHint: deriveScopeHint(origin),
    page: meta.page,
    fileKey: meta.fileKey ?? null,
  };
}
