/**
 * Figma live-sync reconcile core (spec 004 P2, Tier 3 — deterministic, pure).
 *
 * Reads a slice of the append-only change-log (`design/figma.changes.jsonl`, whose
 * ON-DISK contract is figma-agent/shared/figma-changes.ts → `ChangeFrame`) and
 * computes a PREVIEW-DELTA against the current component-registry — WITHOUT writing
 * anything (P2 is dry-run only; apply lands in P4).
 *
 * Pure: no fs, no network, no LLM. The command layer (src/commands/figma.ts) owns all
 * IO and passes raw strings + a loaded registry view in. The JSONL is a SERIALIZATION
 * boundary across a separate bundle — figma-agent is its own package, outside this
 * tsconfig — so this module re-declares the frame shape and parses defensively rather
 * than importing the plugin's TS types: the log itself is the contract, not the type.
 *
 * The coalesce here mirrors figma-changes.ts `coalesceChanges` (same op-precedence,
 * prop-union) but operates on stamped ChangeFrames CROSS-BATCH and keeps the stamp
 * fields reconcile needs (scopeHint, latest ts/page) — the plugin coalesces one batch
 * of pre-stamp ComponentChanges, so the shapes genuinely differ.
 */

/** Component-level op, coalesced (mirrors figma-changes.ts ChangeOp). */
export type ChangeOp = "created" | "updated" | "deleted";
/** Scope hint derived from origin — NON-authoritative (reconcile decides). */
export type ScopeHint = "local" | "global";
/** Figma DocumentChange.origin. */
export type ChangeOrigin = "LOCAL" | "REMOTE";

/** Must equal figma-changes.ts CHANGE_LOG_SCHEMA_VERSION — reconcile refuses a mismatch. */
export const EXPECTED_CHANGE_LOG_VERSION = 1;

/** One line of `figma.changes.jsonl` — the on-disk contract reconcile parses. */
export interface ChangeFrame {
  v: number;
  ts: number;
  op: ChangeOp;
  nodeId: string;
  nodeName: string | null;
  nodeType: string;
  changedProps: string[];
  origin: ChangeOrigin;
  scopeHint: ScopeHint;
  page: string;
  fileKey: string | null;
  /**
   * Registry-integrity phase 03 (5.2), additive — `CHANGE_LOG_SCHEMA_VERSION` stays 1
   * (`validateFrame` ignores unknown/absent keys, so an older log line reads fine).
   * `figma.root.name` at capture — the identity chain's SECOND rung: a Figma-Free file's
   * `fileKey` is null, so without this every such file slugs to 'unknown' and keeps
   * coalescing together.
   */
  fileName?: string;
}

/** A component's cross-batch coalesced state (highest-ranked op, unioned props). */
export interface CoalescedComponent {
  nodeId: string;
  nodeName: string | null;
  nodeType: string;
  op: ChangeOp;
  changedProps: string[];
  scopeHint: ScopeHint;
  page: string;
  latestTs: number;
  /**
   * Registry-integrity phase 02 (5.3, additive): index of the FIRST frame (ABSOLUTE —
   * into the whole parsed log, never relative to a resumed slice) that produced this
   * target. The cursor may not advance past this index until the target is fully
   * processed (captured/failed/pending are all "not done").
   */
  firstFrameIndex: number;
  /** Index of the LAST frame (also absolute) that produced this target. */
  lastFrameIndex: number;
  /**
   * Registry-integrity phase 03 (5.2, additive): the file this target's frames came
   * from. `null` = a pre-partitioning log line (migration) with no `fileKey` recorded.
   */
  fileKey: string | null;
  /** Stable slug for the identity chain AND for paths: `fileKey`, else slugged
   *  `fileName`, else 'unknown' — the SAME chain the edit feed / project binding use. */
  fileSlug: string;
}

/** Minimal registry projection reconcile needs (built by the command from the registry). */
export interface RegistryView {
  name: string;
  scope?: ScopeHint;
  deprecated?: boolean;
}

/** Shared preview-delta entry fields. */
export interface DeltaEntry {
  name: string; // component-name key = the verbatim Figma node name (untrusted data)
  nodeId: string;
  nodeType: string;
  scope: ScopeHint; // resolved scope for this preview
  scopeHint: ScopeHint; // the raw hint from the log
  scopeFromHint: boolean; // true = scope taken from the hint; false = kept the registry's scope
  page: string;
}

/** An `updated` entry additionally reports which Figma props changed + mapped fields. */
export interface UpdatedEntry extends DeltaEntry {
  changedProps: { figmaProp: string; field: string | null }[]; // field=null → no registry field maps
  fields: string[]; // distinct mapped registry fields (subset of the record shape)
}

/** A change we cannot key to a component name (e.g. a DELETE that lost its identity). */
export interface UnresolvedEntry {
  nodeId: string;
  op: ChangeOp;
  reason: string;
}

export interface PreviewDelta {
  added: DeltaEntry[];
  updated: UpdatedEntry[];
  deprecated: DeltaEntry[];
  unresolved: UnresolvedEntry[];
}

/** Typed error for all reconcile failures (parallels RegistryError). */
export class ReconcileError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ReconcileError";
    this.code = code;
  }
}

// ─── Change-log parse ─────────────────────────────────────────────────────────

/**
 * Parse the WHOLE change-log into validated frames. Any malformed line (bad JSON,
 * missing field, wrong `v`) throws BAD_CHANGE_LOG — an append-only ledger the broker
 * owns should never be corrupt, so a single bad line fails the reconcile loudly
 * rather than silently skipping audit history. Blank lines are ignored.
 */
export function parseChangeLog(raw: string): ChangeFrame[] {
  const frames: ChangeFrame[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim().length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ReconcileError("BAD_CHANGE_LOG", `change-log line ${i + 1} is not valid JSON`);
    }
    frames.push(validateFrame(parsed, i + 1));
  }
  return frames;
}

function validateFrame(v: unknown, line: number): ChangeFrame {
  const bad = (m: string): never => {
    throw new ReconcileError("BAD_CHANGE_LOG", `change-log line ${line}: ${m}`);
  };
  if (v === null || typeof v !== "object" || Array.isArray(v)) return bad("frame must be an object");
  const f = v as Record<string, unknown>;
  if (f["v"] !== EXPECTED_CHANGE_LOG_VERSION) {
    return bad(`unsupported schema version ${String(f["v"])} (expected ${EXPECTED_CHANGE_LOG_VERSION})`);
  }
  if (typeof f["ts"] !== "number") return bad("ts must be a number");
  if (f["op"] !== "created" && f["op"] !== "updated" && f["op"] !== "deleted") {
    return bad(`invalid op '${String(f["op"])}'`);
  }
  if (typeof f["nodeId"] !== "string" || f["nodeId"].length === 0) return bad("nodeId must be a non-empty string");
  if (f["nodeName"] !== null && typeof f["nodeName"] !== "string") return bad("nodeName must be a string or null");
  if (typeof f["nodeType"] !== "string") return bad("nodeType must be a string");
  if (!Array.isArray(f["changedProps"]) || f["changedProps"].some((p) => typeof p !== "string")) {
    return bad("changedProps must be an array of strings");
  }
  if (f["origin"] !== "LOCAL" && f["origin"] !== "REMOTE") return bad(`invalid origin '${String(f["origin"])}'`);
  if (f["scopeHint"] !== "local" && f["scopeHint"] !== "global") return bad(`invalid scopeHint '${String(f["scopeHint"])}'`);
  if (typeof f["page"] !== "string") return bad("page must be a string");
  if (f["fileKey"] !== null && typeof f["fileKey"] !== "string") return bad("fileKey must be a string or null");
  // Optional (phase 03, additive): reject only a WRONG type, never merely absent — an
  // older log line before this field existed must keep parsing.
  if (f["fileName"] !== undefined && typeof f["fileName"] !== "string") {
    return bad("fileName must be a string when present");
  }
  return {
    v: EXPECTED_CHANGE_LOG_VERSION,
    ts: f["ts"],
    op: f["op"],
    nodeId: f["nodeId"],
    nodeName: f["nodeName"] as string | null,
    nodeType: f["nodeType"],
    changedProps: f["changedProps"] as string[],
    origin: f["origin"],
    scopeHint: f["scopeHint"],
    page: f["page"],
    fileKey: f["fileKey"] as string | null,
    ...(typeof f["fileName"] === "string" && { fileName: f["fileName"] }),
  };
}

// ─── Coalesce ─────────────────────────────────────────────────────────────────

// Op precedence: a deletion supersedes everything; a creation supersedes an update.
const OP_RANK: Record<ChangeOp, number> = { deleted: 3, created: 2, updated: 1 };

/**
 * Lowercase, alnum + dash only, no leading/trailing dash — MIRRORS figma-agent's
 * `file-identity.ts` `safeSlug` (the ONE canonical helper `edit-feed-log.ts` and
 * `project-bind.ts` both import there). Duplicated, not imported: figma-agent is a
 * separate package/bundle outside this tsconfig, the same reason `ChangeFrame` itself is
 * re-declared here rather than imported (the log/wire IS the contract, not the type).
 *
 * A comment cannot catch drift between two copies in two packages — a test that runs on
 * every change can: the parity fixture list in this file's own test
 * (`tests/cmd-figma-reconcile.test.ts`) is duplicated verbatim in
 * `figma-agent/tests/project-bind.test.ts` (each names the other as its twin), asserting
 * this function and figma-agent's `fileIdentity` agree on every fixture. That test IS the
 * enforcement; review round finding 1 found the two HAD already drifted once
 * (`edit-feed-log.ts`'s old `editFeedPath` slugged the fileKey too) with only a prose
 * claim standing guard.
 */
function safeSlug(raw: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.length > 0 ? s : "unknown";
}

/**
 * fileKey when present (verbatim, never slugged), else slugged fileName, else 'unknown'
 * (registry-integrity phase 03, §1) — the SAME chain figma-agent's `fileIdentity` (raw
 * fileKey wins; uniqueness over cosmetic lowercasing) resolves to, enforced by the parity
 * test named on `safeSlug` above, not by this comment. Exported for the command layer
 * (figma-reconcile-run.ts §2), which needs it to count/report frames filtered as foreign.
 */
export function fileSlugOf(fileKey: string | null, fileName: string | undefined): string {
  if (typeof fileKey === "string" && fileKey.trim() !== "") return fileKey;
  return safeSlug(fileName ?? "");
}

/**
 * Coalesce every frame in the slice to ONE state per (file, node id) pair (cross-batch).
 * Deterministic: frames are processed oldest→newest so "last non-null name / latest
 * page" is stable; the highest-ranked op wins; changedProps are unioned + sorted; any
 * REMOTE-derived `global` hint promotes the coalesced hint. Output sorted by nodeId.
 *
 * Registry-integrity phase 03 (5.2): the map key is `` `${fileSlug} ${nodeId}` ``, not
 * bare `nodeId` — node ids are only unique WITHIN a file, so the same id from two
 * different files must never merge into one target (the silent cross-file merge bug).
 *
 * `baseIndex` (registry-integrity phase 02, additive) is the ABSOLUTE log index of
 * `frames[0]` — the caller passes `cursorFrom` when `frames` is a resumed slice
 * (`frames.slice(cursorFrom)`), so `firstFrameIndex`/`lastFrameIndex` always index the
 * WHOLE log, never the slice. Zipped BEFORE the `ts` sort below (which reorders), so a
 * frame's absolute position survives regardless of where it lands in `ts` order.
 */
export function coalesceFrames(frames: readonly ChangeFrame[], baseIndex = 0): CoalescedComponent[] {
  const byKey = new Map<string, CoalescedComponent>();
  const propSets = new Map<string, Set<string>>();
  const indexed = frames.map((fr, i) => ({ fr, idx: baseIndex + i, slug: fileSlugOf(fr.fileKey, fr.fileName) }));
  const ordered = indexed.sort((a, b) => a.fr.ts - b.fr.ts || cmp(a.fr.nodeId, b.fr.nodeId));
  for (const { fr, idx, slug } of ordered) {
    const key = `${slug} ${fr.nodeId}`;
    const props = propSets.get(key) ?? new Set<string>();
    for (const p of fr.changedProps) props.add(p);
    propSets.set(key, props);

    const prev = byKey.get(key);
    if (prev === undefined) {
      byKey.set(key, {
        nodeId: fr.nodeId,
        nodeName: fr.nodeName,
        nodeType: fr.nodeType,
        op: fr.op,
        changedProps: [],
        scopeHint: fr.scopeHint,
        page: fr.page,
        latestTs: fr.ts,
        firstFrameIndex: idx,
        lastFrameIndex: idx,
        fileKey: fr.fileKey,
        fileSlug: slug,
      });
      continue;
    }
    if (OP_RANK[fr.op] > OP_RANK[prev.op]) prev.op = fr.op;
    if (fr.nodeName !== null) prev.nodeName = fr.nodeName; // last non-null wins (ts order)
    if (fr.nodeType.length > 0) prev.nodeType = fr.nodeType;
    if (fr.scopeHint === "global") prev.scopeHint = "global";
    if (fr.ts >= prev.latestTs) {
      prev.latestTs = fr.ts;
      prev.page = fr.page;
    }
    // Independent of ts order (the interleaved case: A's frames at log lines 0 and 9,
    // B's at 3-4 — the `ts` sort can place them in any relative order).
    if (idx < prev.firstFrameIndex) prev.firstFrameIndex = idx;
    if (idx > prev.lastFrameIndex) prev.lastFrameIndex = idx;
  }
  const out: CoalescedComponent[] = [];
  for (const [key, c] of byKey) {
    c.changedProps = [...(propSets.get(key) ?? new Set<string>())].sort();
    out.push(c);
  }
  // Deterministic even across files: nodeId first (unchanged single-file ordering), then
  // fileSlug breaks a tie when the SAME id appears in two files.
  out.sort((a, b) => cmp(a.nodeId, b.nodeId) || cmp(a.fileSlug, b.fileSlug));
  return out;
}

// ─── Preview delta ────────────────────────────────────────────────────────────

/**
 * Map a Figma changed-property name to a ComponentRecord field where the mapping is
 * STRUCTURALLY CERTAIN. Visual props (fills, cornerRadius, characters, …) have no
 * discrete registry field — the registry stores tokens + markup, not visual values —
 * so they resolve to `null` ("changed", re-ingest at apply). Deliberately tiny.
 */
const FIGMA_PROP_TO_FIELD: Record<string, string> = {
  name: "name",
  componentPropertyDefinitions: "variants",
  variantProperties: "variants",
};

/**
 * Resolve the scope for a component in the preview. New component → take the hint
 * verbatim. Existing component → a `global` hint (REMOTE origin = published/library
 * evidence) PROMOTES local→global; a `local` hint never demotes a known-global;
 * otherwise the registry's own scope is kept. The hint is never authoritative on its
 * own — that is the whole reason `scopeFromHint` is surfaced in the output.
 */
function resolveScope(hint: ScopeHint, prior: RegistryView | undefined): { scope: ScopeHint; scopeFromHint: boolean } {
  if (prior === undefined) return { scope: hint, scopeFromHint: true };
  const existing = prior.scope ?? "local";
  if (hint === "global" && existing !== "global") return { scope: "global", scopeFromHint: true };
  return { scope: existing, scopeFromHint: false };
}

/**
 * Compute the preview-delta: created/updated by registry presence, deleted → deprecate.
 * A `created` op whose name already exists folds into `updated` (a replace); an
 * `updated` op whose name is unknown folds into `added` (a discovery). A change with no
 * resolvable name (a DELETE that lost identity) goes to `unresolved`. Pure + sorted.
 */
export function computePreviewDelta(
  components: readonly CoalescedComponent[],
  existing: ReadonlyMap<string, RegistryView>,
): PreviewDelta {
  const added: DeltaEntry[] = [];
  const updated: UpdatedEntry[] = [];
  const deprecated: DeltaEntry[] = [];
  const unresolved: UnresolvedEntry[] = [];

  for (const c of components) {
    const name = c.nodeName;
    if (name === null || name.length === 0) {
      unresolved.push({ nodeId: c.nodeId, op: c.op, reason: "no resolvable component name (DELETE lost identity)" });
      continue;
    }
    const prior = existing.get(name);
    const { scope, scopeFromHint } = resolveScope(c.scopeHint, prior);
    const base: DeltaEntry = {
      name,
      nodeId: c.nodeId,
      nodeType: c.nodeType,
      scope,
      scopeHint: c.scopeHint,
      scopeFromHint,
      page: c.page,
    };
    if (c.op === "deleted") {
      deprecated.push(base);
      continue;
    }
    if (prior === undefined) {
      added.push(base);
      continue;
    }
    const changedProps = c.changedProps.map((p) => ({ figmaProp: p, field: FIGMA_PROP_TO_FIELD[p] ?? null }));
    const fields = [...new Set(changedProps.map((x) => x.field).filter((x): x is string => x !== null))].sort();
    updated.push({ ...base, changedProps, fields });
  }

  const byName = (a: DeltaEntry, b: DeltaEntry): number => a.name.localeCompare(b.name) || cmp(a.nodeId, b.nodeId);
  added.sort(byName);
  updated.sort(byName);
  deprecated.sort(byName);
  unresolved.sort((a, b) => cmp(a.nodeId, b.nodeId));
  return { added, updated, deprecated, unresolved };
}

/** Count the resolved scopes across every applied entry (added + updated + deprecated). */
export function scopeSummary(delta: PreviewDelta): { local: number; global: number } {
  let local = 0;
  let global = 0;
  for (const e of [...delta.added, ...delta.updated, ...delta.deprecated]) {
    if (e.scope === "global") global++;
    else local++;
  }
  return { local, global };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
