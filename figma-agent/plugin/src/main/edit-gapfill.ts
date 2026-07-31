// Reconnect gap-fill (wave 4.4 phase 02 §2) — covers the window the live event stream
// cannot see: the plugin was CLOSED. Page switches need no gap-fill — `documentchange` is
// document-wide once `loadAllPagesAsync` has run (spec's own verdict), so only the
// plugin-closed window is a real gap.
//
// A compact snapshot — existence/name/position ONLY (property-level diffing for the
// offline window is a stated non-goal) — is persisted in `figma.root`'s sharedPluginData,
// CHUNKED AND PER PAGE, for two measured reasons: (1) Figma caps one sharedPluginData
// entry at 100kB (`@figma/plugin-typings`) — 4,000 six-field records is far past that; (2)
// `documentchange` is document-wide, but a snapshot of only `figma.currentPage` would
// leave every OTHER page invisible while the plugin is closed — the exact gap this closes.
//
// Split cleanly into a PURE core (`diffSnapshots`/`splitSnapshotChunks` — no figma access,
// fully unit-tested in tests/edit-gapfill.test.ts) and the figma-dependent read/write/diff
// halves, which inherit main.ts's own untestability (cannot be imported outside a live
// plugin sandbox) — verified instead by the real-canvas run budgeted in phase 02's
// validation section.
import type { EditInput, EditOp } from '../../../shared/edit-feed';

export interface NodeSnapshot {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  parent: string | null;
}

const SNAPSHOT_NS = 'ease_design';
const SNAPSHOT_MANIFEST_KEY = 'figma-edit-snapshot-v1';
const chunkKey = (pageId: string, i: number): string => `figma-edit-snap-${pageId}-${i}`;

/** Comfortably under Figma's real 100kB per-entry cap (mirrors correction-edge-store.ts's
 *  own CHUNK_BYTE_BUDGET headroom). */
export const SNAPSHOT_CHUNK_BYTES = 64_000;
/** The repo's existing scan budget — a page over this reports `truncated: true` rather
 *  than silently under-reporting (risk register: deleted nodes past the cap are
 *  unknowable, and saying so is the honest answer). */
export const SNAPSHOT_NODE_CAP_PER_PAGE = 4_000;

interface PageManifestEntry {
  pageId: string;
  /** Stage-4 fix round (M4) — the last-known page NAME, so a page that vanished entirely
   *  (deleted while the plugin was closed) can still be named in its own deletion notice;
   *  a bare page id is not something a human/agent can act on. */
  pageName: string;
  chunks: number;
  truncated: boolean;
}
interface SnapshotManifest { v: 1; pages: PageManifestEntry[] }

// ── Pure core (unit-tested directly, no figma access) ───────────────────────────────

/** Rounds to 0.5px — a sub-pixel re-layout must not churn the snapshot or spuriously
 *  report a "moved" node between two sessions. */
export function normalizeSnapshotCoord(n: number): number {
  return Math.round(n * 2) / 2;
}

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Splits one page's records into JSON-array chunks within `SNAPSHOT_CHUNK_BYTES`,
 *  strictly on RECORD boundaries (never mid-JSON) — mirrors correction-edge-store.ts's
 *  `splitIntoChunks`. A single oversized record still lands whole, in its own chunk,
 *  never silently dropped or truncated here (the `SNAPSHOT_NODE_CAP_PER_PAGE` count cap
 *  is the honest truncation signal; this is pure byte-packing). */
export function splitSnapshotChunks(records: readonly NodeSnapshot[]): string[] {
  const chunks: string[] = [];
  let current: NodeSnapshot[] = [];
  let currentBytes = 2; // "[]"
  for (const rec of records) {
    const recBytes = utf8ByteLength(JSON.stringify(rec));
    const commaBeforeAdd = current.length > 0 ? 1 : 0;
    if (current.length > 0 && currentBytes + commaBeforeAdd + recBytes > SNAPSHOT_CHUNK_BYTES) {
      chunks.push(JSON.stringify(current));
      current = [];
      currentBytes = 2;
    }
    currentBytes += (current.length > 0 ? 1 : 0) + recBytes;
    current.push(rec);
  }
  if (current.length > 0) chunks.push(JSON.stringify(current));
  return chunks;
}

const MOVE_EPSILON = 0.5;

export interface RecordPair { prev: NodeSnapshot; next: NodeSnapshot }

/** Diff two snapshots of the SAME page: id present→absent = deleted, absent→present =
 *  created, same id different `name` = renamed, same id different `x`|`y` (> 0.5px) =
 *  moved. A node that changed BOTH appears in `renamed` AND `moved` — each is its own
 *  real, independent fact; neither list drops it for the other (the caller, which knows
 *  the wire format, is what merges them into one `updated` EditInput — see
 *  `runGapfillDiff`). Pure — no figma access, fully unit-tested. */
export interface GapfillDiff {
  created: NodeSnapshot[];
  deleted: NodeSnapshot[];
  renamed: RecordPair[];
  moved: RecordPair[];
}

export function diffSnapshots(prev: readonly NodeSnapshot[], next: readonly NodeSnapshot[]): GapfillDiff {
  const prevById = new Map(prev.map((n) => [n.id, n]));
  const nextIds = new Set(next.map((n) => n.id));
  const created: NodeSnapshot[] = [];
  const deleted: NodeSnapshot[] = [];
  const renamed: RecordPair[] = [];
  const moved: RecordPair[] = [];

  for (const n of next) {
    const p = prevById.get(n.id);
    if (!p) { created.push(n); continue; }
    if (p.name !== n.name) renamed.push({ prev: p, next: n });
    if (Math.abs(p.x - n.x) > MOVE_EPSILON || Math.abs(p.y - n.y) > MOVE_EPSILON) moved.push({ prev: p, next: n });
  }
  for (const p of prev) {
    if (!nextIds.has(p.id)) deleted.push(p);
  }
  return { created, deleted, renamed, moved };
}

/** Merges `renamed`+`moved` pairs for the SAME node into one `updated` EditInput with the
 *  union of changedProps — the wire format's own "one frame per node per batch" contract
 *  (mirrors `coalesceEdits`), so a node that changed both is reported ONCE, not twice.
 *  Pure — the seam `runGapfillDiff` (figma-dependent) delegates to. */
export function mergeUpdatedRecords(renamed: readonly RecordPair[], moved: readonly RecordPair[]): Array<{ rec: NodeSnapshot; changedProps: string[] }> {
  const byId = new Map<string, { rec: NodeSnapshot; props: Set<string> }>();
  for (const { next } of renamed) {
    const entry = byId.get(next.id) ?? { rec: next, props: new Set<string>() };
    entry.props.add('name');
    byId.set(next.id, entry);
  }
  for (const { next } of moved) {
    const entry = byId.get(next.id) ?? { rec: next, props: new Set<string>() };
    entry.props.add('x');
    entry.props.add('y');
    byId.set(next.id, entry);
  }
  return [...byId.values()].map(({ rec, props }) => ({ rec, changedProps: [...props].sort() }));
}

/** Stage-4 fix round (M4) — which page ids the PREVIOUS manifest knew about that no
 *  longer appear among the currently-loaded pages at all (the whole page was deleted
 *  while the plugin was closed). Pure — figma-dependent callers pass in plain ids. */
export function deletedPageIds(prevPageIds: readonly string[], currentPageIds: ReadonlySet<string>): string[] {
  return prevPageIds.filter((id) => !currentPageIds.has(id));
}

/** Stage-4 fix round (M5) — either side of a page's own snapshot being truncated makes
 *  created/deleted facts unreliable (a node pushed past the cap by unrelated tree growth
 *  reads as a false deletion; one that only now fits reads as a false creation). Pure. */
export function pageWasTruncated(prevTruncated: boolean | undefined, nextTruncated: boolean): boolean {
  return prevTruncated === true || nextTruncated;
}

function toGapfillEdit(op: EditOp, rec: NodeSnapshot, page: string, changedProps: string[] = []): EditInput {
  return {
    op, nodeId: rec.id, nodeName: rec.name, nodeType: rec.type,
    // Gap-fill is existence/name/position only (spec non-goal: no property-level diff for
    // the offline window) — the snapshot itself never tracked a parent NAME (only a
    // parent id, for a future use), so this is null rather than invented.
    parentName: null,
    page, changedProps, origin: 'LOCAL',
    // The agent cannot have acted while its bridge was down — every gap-fill frame is
    // unambiguously the owner's (spec §2).
    actor: 'owner',
  };
}

/** Builds the EDIT_FEED-ready edits for one page's diff, applying `mergeUpdatedRecords`'s
 *  one-frame-per-node contract. Pure. */
export function gapfillEditsForPage(diff: GapfillDiff, pageName: string): EditInput[] {
  const edits: EditInput[] = [];
  for (const rec of diff.created) edits.push(toGapfillEdit('created', rec, pageName));
  for (const rec of diff.deleted) edits.push(toGapfillEdit('deleted', rec, pageName));
  for (const { rec, changedProps } of mergeUpdatedRecords(diff.renamed, diff.moved)) {
    edits.push(toGapfillEdit('updated', rec, pageName, changedProps));
  }
  return edits;
}

// ── Figma-dependent halves (untestable outside a live sandbox, same as main.ts) ────────

interface PageSnapshotResult { records: NodeSnapshot[]; truncated: boolean }

/** Walks one page's tree (existence/name/position only), capped at
 *  `SNAPSHOT_NODE_CAP_PER_PAGE` — a page over the cap sets `truncated: true` rather than
 *  silently under-reporting. */
function snapshotPage(page: PageNode): PageSnapshotResult {
  const all = page.findAll(() => true);
  const truncated = all.length > SNAPSHOT_NODE_CAP_PER_PAGE;
  const records: NodeSnapshot[] = [];
  for (const node of all) {
    if (records.length >= SNAPSHOT_NODE_CAP_PER_PAGE) break;
    const hasXY = 'x' in node && 'y' in node;
    records.push({
      id: node.id,
      name: node.name,
      type: node.type,
      x: hasXY ? normalizeSnapshotCoord((node as { x: number }).x) : 0,
      y: hasXY ? normalizeSnapshotCoord((node as { y: number }).y) : 0,
      parent: node.parent ? node.parent.id : null,
    });
  }
  return { records, truncated };
}

function readManifest(): SnapshotManifest | null {
  const raw = figma.root.getSharedPluginData(SNAPSHOT_NS, SNAPSHOT_MANIFEST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SnapshotManifest;
    return parsed?.v === 1 && Array.isArray(parsed.pages) ? parsed : null;
  } catch {
    return null; // a corrupt manifest degrades to "no previous snapshot", never a crash
  }
}

function readPageChunks(entry: PageManifestEntry): NodeSnapshot[] {
  const records: NodeSnapshot[] = [];
  for (let i = 0; i < entry.chunks; i++) {
    const raw = figma.root.getSharedPluginData(SNAPSHOT_NS, chunkKey(entry.pageId, i));
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) records.push(...(parsed as NodeSnapshot[]));
    } catch { /* a corrupt chunk degrades to fewer records for this page, never a crash */ }
  }
  return records;
}

export interface PageWriteResult {
  entry: PageManifestEntry;
  /** `null` = this page's own snapshot attempt failed — write NOTHING for it (its
   *  existing chunks on disk stay exactly as they were) rather than mixing a fresh
   *  manifest entry with stale/partial chunk data. */
  chunksToWrite: string[] | null;
}

/**
 * Stage-4 fix round (N1) — the per-page write DECISION, injectable so it is testable
 * without a live figma sandbox: `snapshot` is the figma-dependent page walk (real caller:
 * `snapshotPage`), free to throw — e.g. `PageNode.findAll` on a page that isn't loaded
 * under `dynamic-page` (a real risk now that the close hook can fire mid-teardown). On
 * success: fresh chunks + a fresh manifest entry. On failure: the PREVIOUS entry carries
 * forward VERBATIM (never a partial/mixed write for that one page — the old chunks under
 * its keys are simply left untouched); `null` when there was no previous entry either (a
 * brand-new page whose very first snapshot attempt failed — nothing yet to preserve, and
 * nothing to write). One page's failure never touches any OTHER page's fresh write, and
 * never aborts the whole function the way a single wrapping try/catch used to.
 */
export function resolvePageWrite(
  page: { id: string; name: string },
  prevEntry: PageManifestEntry | undefined,
  snapshot: () => PageSnapshotResult,
): PageWriteResult | null {
  try {
    const { records, truncated } = snapshot();
    const chunks = splitSnapshotChunks(records);
    return { entry: { pageId: page.id, pageName: page.name, chunks: chunks.length, truncated }, chunksToWrite: chunks };
  } catch {
    return prevEntry ? { entry: prevEntry, chunksToWrite: null } : null;
  }
}

/** Writes the snapshot for every loaded page — called on a debounce after each idle
 *  window and on plugin close (main.ts wiring, both best-effort). Clears any now-stale
 *  chunk keys past the new count, so a page that shrank never leaves orphaned chunks a
 *  future read would wrongly append.
 *
 *  Stage-4 fix round (M4) — ALSO clears chunk keys for a page that existed in the
 *  PREVIOUS manifest but is no longer loaded at all (the whole page was deleted while the
 *  plugin was closed) — otherwise those chunks leak in `figma.root`'s sharedPluginData
 *  forever, since nothing else ever visits a page id that no longer exists.
 *
 *  Stage-4 fix round (N1) — per-page atomicity via `resolvePageWrite`: one page's own
 *  snapshot/write failure can never corrupt or discard any OTHER page's fresh data, and
 *  never silently mixes stale chunks under a manifest entry that claims a different count.
 *
 *  Best-effort throughout: a write failure degrades to "no gap-fill this session", never
 *  a crash (risk register). */
export function writeSnapshot(pages: readonly PageNode[]): void {
  const prevManifest = readManifest();
  const manifest: SnapshotManifest = { v: 1, pages: [] };
  const currentPageIds = new Set(pages.map((p) => p.id));

  for (const page of pages) {
    const prevEntry = prevManifest?.pages.find((p) => p.pageId === page.id);
    const result = resolvePageWrite(page, prevEntry, () => snapshotPage(page));
    if (!result) continue; // brand-new page, first attempt failed — nothing to carry, nothing to write
    if (result.chunksToWrite === null) {
      manifest.pages.push(result.entry); // carrying the previous entry forward verbatim
      continue;
    }
    try {
      const prevChunkCount = prevEntry?.chunks ?? 0;
      for (let i = 0; i < result.chunksToWrite.length; i++) {
        figma.root.setSharedPluginData(SNAPSHOT_NS, chunkKey(page.id, i), result.chunksToWrite[i]!);
      }
      for (let i = result.chunksToWrite.length; i < prevChunkCount; i++) figma.root.setSharedPluginData(SNAPSHOT_NS, chunkKey(page.id, i), '');
      manifest.pages.push(result.entry);
    } catch {
      // The WRITE itself failed (not the snapshot walk) — same reasoning: never claim
      // fresh chunks landed when they didn't; carry the previous entry forward instead.
      if (prevEntry) manifest.pages.push(prevEntry);
    }
  }

  if (prevManifest) {
    for (const prevEntry of prevManifest.pages) {
      if (currentPageIds.has(prevEntry.pageId)) continue;
      try {
        for (let i = 0; i < prevEntry.chunks; i++) figma.root.setSharedPluginData(SNAPSHOT_NS, chunkKey(prevEntry.pageId, i), '');
      } catch {
        // Best-effort clear — a failure here just leaves those stale chunks for next time.
      }
    }
  }

  try {
    figma.root.setSharedPluginData(SNAPSHOT_NS, SNAPSHOT_MANIFEST_KEY, JSON.stringify(manifest));
  } catch {
    // Manifest write itself failed — best-effort, degrades to "no gap-fill next session".
  }
}

/**
 * Runs ONCE at boot (main.ts wiring, after `loadAllPagesAsync`): diffs the PREVIOUS
 * session's snapshot against the CURRENT scene, across every loaded page, and returns the
 * gap-fill edits ready to post as one EDIT_FEED batch (`source: 'gapfill'`, stamped by the
 * caller). Budget: one diff per reconnect (brief #4) — this must be called exactly once
 * at boot, never on an interval. Returns `[]` on a first-ever run (nothing to diff against
 * yet) — also writes a FRESH snapshot immediately after, so the window between "diffed"
 * and "next observation" never grows stale.
 *
 * Stage-4 fix round:
 *   M4 — a page that existed in the PREVIOUS session but is no longer loaded AT ALL (the
 *   whole page was deleted while the plugin was closed) never appears in `pages`, so it
 *   would otherwise never be diffed. ONE honest notice frame here (never N synthetic
 *   per-node deletions — we only know the page is gone, not whether each node was
 *   individually deleted or the whole page vanished); the stale chunk keys themselves are
 *   cleared by `writeSnapshot` below.
 *   M5 — when EITHER side of a page's own snapshot was truncated, created/deleted facts
 *   are UNRELIABLE (a node pushed past the cap by unrelated tree growth reads as a false
 *   deletion; a node that was always there but only now fits reads as a false creation).
 *   Honest under-reporting beats a wrong fact: suppress the WHOLE diff for that page and
 *   emit only the truncation notice.
 */
export function runGapfillDiff(pages: readonly PageNode[]): EditInput[] {
  const prev = readManifest();
  if (!prev) {
    writeSnapshot(pages); // first-ever run — nothing to diff, but start the baseline now
    return [];
  }
  const edits: EditInput[] = [];
  const currentPageIds = new Set(pages.map((p) => p.id));

  for (const deletedId of deletedPageIds(prev.pages.map((p) => p.pageId), currentPageIds)) {
    const prevEntry = prev.pages.find((p) => p.pageId === deletedId)!;
    const nodeCount = readPageChunks(prevEntry).length;
    edits.push(toGapfillEdit(
      'deleted',
      { id: `page-deleted:${prevEntry.pageId}`, name: `${prevEntry.pageName} (${nodeCount} node(s))`, type: 'PAGE', x: 0, y: 0, parent: null },
      prevEntry.pageName,
      ['page-deleted'],
    ));
  }

  for (const page of pages) {
    const prevEntry = prev.pages.find((p) => p.pageId === page.id);
    const prevRecords = prevEntry ? readPageChunks(prevEntry) : [];
    const { records: nextRecords, truncated: nextTruncated } = snapshotPage(page);
    if (pageWasTruncated(prevEntry?.truncated, nextTruncated)) {
      edits.push(toGapfillEdit('updated', { id: `truncated:${page.id}`, name: page.name, type: 'PAGE', x: 0, y: 0, parent: null }, page.name, ['truncated']));
      continue; // never a created/deleted/renamed/moved fact for this page this round
    }
    const diff = diffSnapshots(prevRecords, nextRecords);
    edits.push(...gapfillEditsForPage(diff, page.name));
  }
  writeSnapshot(pages); // the diff window now starts at THIS observation, not session start
  return edits;
}
