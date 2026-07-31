// Owner-edit change feed (wave 4.4, phase 01) — shared by plugin (capture) and cli/broker
// (append). Pure: no fs, no figma API, no network. Deliberately its OWN contract and its
// OWN version constant, separate from shared/figma-changes.ts's ChangeFrame/
// CHANGE_LOG_SCHEMA_VERSION — that feed stays component-only and is what
// src/core/figma-reconcile.ts's kernel reconcile parses; pouring the wider capture this
// feed carries into that file would either break reconcile or silently pollute the
// registry (spec's corollary). The two feeds never share a file, a schema version, or a
// validator.
//
// Data flow: plugin's widened `onDocumentChange` (main.ts) resolves every changed node
// (not just components), classifies who made it (edit-actor.ts), coalesces to one
// EditInput per node per batch, posts EDIT_FEED over the wire; the broker stamps each
// EditInput into an EditFrame and appends it to design/changes/<slug>.jsonl.

/** Bump when EditFrame's shape changes. Independent of CHANGE_LOG_SCHEMA_VERSION. */
export const EDIT_FEED_SCHEMA_VERSION = 1;

/** Node-level operation (mirrors figma-changes.ts's ChangeOp shape, kept separate on purpose). */
export type EditOp = 'created' | 'updated' | 'deleted';

/** Who made the edit. `ambiguous` is a REFUSAL to guess, not a fallback. */
export type EditActor = 'owner' | 'agent' | 'ambiguous';

/** How the frame was observed. */
export type EditSource = 'live' | 'gapfill';

/** Where a change came from (Figma `DocumentChange.origin`). */
export type EditOrigin = 'LOCAL' | 'REMOTE';

/**
 * One node's coalesced edit, as the plugin posts it (EDIT_FEED.data.edits[]). `nodeName`/
 * `parentName` are null when unknowable — a DELETE gives Figma a `RemovedNode` that
 * carries only id + type, so the plugin's identity cache (main.ts) is the only source for
 * the name/parent of a just-deleted node, and it degrades to null honestly when the
 * session never observed that node.
 */
export interface EditInput {
  op: EditOp;
  nodeId: string;
  nodeName: string | null;
  nodeType: string;
  parentName: string | null;
  changedProps: string[];
  origin: EditOrigin;
  page: string;
  actor: EditActor;
}

/** One line of the per-file edit feed. Append-only, versioned. */
export interface EditFrame {
  v: number;                 // EDIT_FEED_SCHEMA_VERSION
  ts: number;                // epoch ms, stamped by the broker at append
  actor: EditActor;
  source: EditSource;
  op: EditOp;
  nodeId: string;
  nodeName: string | null;   // null on a delete (RemovedNode carries only id + type)
  nodeType: string;
  parentName: string | null; // the enclosing frame/section — "where" the owner was working
  changedProps: string[];
  origin: EditOrigin;
  page: string;
  fileKey: string | null;
  /**
   * Phase 02 fix — mirrors `figma-changes.ts`'s `ChangeFrame.fileName` (added there in
   * registry-integrity phase 03 §1, for the same reason): a Figma-Free file's `fileKey`
   * is `null`, so `--file <name>` matching (phase 02 §1) needs the human name ON THE
   * FRAME, not just baked into the feed's own on-disk slug. Optional/additive — an older
   * frame on disk without it still parses; `EDIT_FEED_SCHEMA_VERSION` stays 1.
   */
  fileName?: string;
}

/**
 * Per-batch metadata. `page` is deliberately NOT here — it is per frame (a document-wide
 * batch can span pages, since `documentchange` is document-wide via `loadAllPagesAsync`),
 * while the file identity and how the batch was observed really are constant for it.
 */
export interface EditBatchMeta {
  fileKey: string | null;
  fileName: string;
  source: EditSource;
}

const VALID_OPS: ReadonlySet<string> = new Set(['created', 'updated', 'deleted']);
const VALID_ACTORS: ReadonlySet<string> = new Set(['owner', 'agent', 'ambiguous']);

/**
 * Structural guard for untrusted wire input — a bad entry is skipped, never fatal
 * (mirrors change-log.ts's `isValidChange` in spirit, but stricter: this feed's `actor`
 * field is the one thing it exists to get right, so EVERY field — including each element
 * of `changedProps` — is checked, not just the couple that make `buildEditFrame` not
 * throw. `buildEditFrame` still coerces defensively too, but a caller should never rely
 * on that path being reached for a value this function already rejected.)
 */
export function isValidEditInput(v: unknown): v is EditInput {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  if (typeof r.op !== 'string' || !VALID_OPS.has(r.op)) return false;
  if (typeof r.nodeId !== 'string' || r.nodeId.length === 0) return false;
  if (typeof r.actor !== 'string' || !VALID_ACTORS.has(r.actor)) return false;
  if (r.nodeName !== null && typeof r.nodeName !== 'string') return false;
  if (typeof r.nodeType !== 'string') return false;
  if (r.parentName !== null && typeof r.parentName !== 'string') return false;
  if (!Array.isArray(r.changedProps) || !r.changedProps.every((p) => typeof p === 'string')) return false;
  if (r.origin !== 'LOCAL' && r.origin !== 'REMOTE') return false;
  if (typeof r.page !== 'string') return false;
  return true;
}

/**
 * Stamp one EditInput into a fully-formed EditFrame (pure). Coerces absent/loose fields
 * to safe defaults so a frame crossing the wire always lands on disk well-formed
 * (nodeName/parentName → null, changedProps → [], origin → LOCAL).
 */
export function buildEditFrame(e: EditInput, meta: EditBatchMeta, ts: number): EditFrame {
  const origin: EditOrigin = e.origin === 'REMOTE' ? 'REMOTE' : 'LOCAL';
  return {
    v: EDIT_FEED_SCHEMA_VERSION,
    ts,
    actor: e.actor,
    source: meta.source,
    op: e.op,
    nodeId: e.nodeId,
    nodeName: e.nodeName ?? null,
    nodeType: e.nodeType ?? '',
    parentName: e.parentName ?? null,
    changedProps: Array.isArray(e.changedProps) ? e.changedProps : [],
    origin,
    page: e.page ?? '',
    fileKey: meta.fileKey ?? null,
    ...(typeof meta.fileName === 'string' && meta.fileName.length > 0 && { fileName: meta.fileName }),
  };
}

const VALID_SOURCES: ReadonlySet<string> = new Set(['live', 'gapfill']);

/**
 * Stage-4 fix round (M1) — the READER's own shape guard: `readEditFeed` (changes.ts)
 * only caught a JSON.parse failure, so a JSON-VALID but semantically-wrong line (a
 * missing field, a garbage `actor`) still landed in `frames` and crashed downstream
 * (`countByActor`'s `counts[f.actor]++`, `editSentence`'s field reads). Reuses
 * `isValidEditInput` for the fields EditFrame shares with EditInput, then checks the
 * frame-only fields (`v`, `ts`, `source`, `fileKey`, optional `fileName`). A bad line is
 * skipped and counted (the reader's own `warnings`) — never fatal, never silently
 * admitted either.
 */
export function isValidEditFrame(v: unknown): v is EditFrame {
  if (!isValidEditInput(v)) return false;
  const r = v as unknown as Record<string, unknown>;
  if (typeof r.v !== 'number') return false;
  if (typeof r.ts !== 'number' || !Number.isFinite(r.ts)) return false;
  if (typeof r.source !== 'string' || !VALID_SOURCES.has(r.source)) return false;
  if (r.fileKey !== null && typeof r.fileKey !== 'string') return false;
  if (r.fileName !== undefined && typeof r.fileName !== 'string') return false;
  return true;
}

/**
 * Coalesce raw per-node edits to ONE EditInput per nodeId per batch. Deterministic:
 * output sorted by nodeId; changedProps unioned + sorted; the LAST `op` seen wins (per
 * the phase's own contract — not a ranked precedence like figma-changes.ts's
 * `coalesceChanges`: a create→update batch settles as `updated`, a delete→create batch
 * settles as `created`, because that IS the node's actual end state after the batch, and
 * inventing a "deletion always wins" rule would misreport a node that was deleted then
 * immediately recreated as still gone); origin is REMOTE if any contributing edit is
 * remote; nodeName/parentName is the first non-null seen; actor is the LAST seen (the
 * most recent classification for that node in the batch is the truest one). Pure —
 * unit-testable, idempotent on already-coalesced input.
 */
export function coalesceEdits(raw: readonly EditInput[]): EditInput[] {
  const byId = new Map<string, EditInput>();
  const propSets = new Map<string, Set<string>>();
  for (const e of raw) {
    const props = propSets.get(e.nodeId) ?? new Set<string>();
    for (const p of e.changedProps) props.add(p);
    propSets.set(e.nodeId, props);

    const prev = byId.get(e.nodeId);
    if (!prev) {
      byId.set(e.nodeId, { ...e, changedProps: [] });
      continue;
    }
    prev.op = e.op; // last op in the batch wins — the node's actual end state
    if (prev.nodeName === null && e.nodeName !== null) prev.nodeName = e.nodeName;
    if (prev.parentName === null && e.parentName !== null) prev.parentName = e.parentName;
    if (!prev.nodeType && e.nodeType) prev.nodeType = e.nodeType;
    if (e.origin === 'REMOTE') prev.origin = 'REMOTE';
    prev.actor = e.actor; // last classification in the batch wins
  }
  const out: EditInput[] = [];
  for (const [id, e] of byId) {
    e.changedProps = [...(propSets.get(id) ?? new Set())].sort();
    out.push(e);
  }
  out.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
  return out;
}
