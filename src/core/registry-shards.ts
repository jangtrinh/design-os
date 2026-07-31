/**
 * Registry-integrity phase 04 (5.4), §4 — sharded per-component records + a compact
 * index, backing `component-registry.json` as a DERIVED artifact. Adopted decision:
 * sharded records, not SQLite (determinism, reviewability, the repo's zero-dep posture —
 * see the phase report for the full recommendation table). Record identity stays
 * name-keyed, unchanged — composite `(fileSlug, name)` identity remains a SEPARATE
 * decision for the owner to take explicitly, never smuggled in under a perf phase.
 *
 * Layout:
 *   design/registry/index.json          — {v, components:[{name,category,scope,deprecated,shard,hash}]}
 *   design/registry/shards/<slug>.json  — one full ComponentRecord per file
 *   design/component-registry.json      — STILL WRITTEN (registry-store.ts's saveRegistry),
 *                                          regenerated from these shards — the 49-consumer
 *                                          contract file, unchanged shape.
 *
 * `loadRegistry` (registry-store.ts) keeps reading ONLY the contract file — zero consumer
 * impact, the whole point of shipping this as its own sub-phase. `saveRegistry` writes
 * shards here (content-guarded: a shard whose bytes are unchanged is never rewritten, so
 * "one changed record → exactly one shard touched" holds without needing a caller-
 * supplied touched set — that finer-grained wiring, avoiding even the per-save diff cost,
 * is §5's job) + the index, THEN still emits the whole contract file exactly as before.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalHash, canonicalStringify } from "./ds-manifest.js";
import { toSafeFilename } from "./html-export.js";
import type { ComponentRecord, ComponentScope, Registry } from "./registry-store.js";

export const REGISTRY_SHARD_INDEX_VERSION = "0.1.0";
const REGISTRY_DIRNAME = "registry";
const SHARD_DIRNAME = "shards";
const INDEX_FILENAME = "index.json";

export interface ShardIndexEntry {
  name: string;
  category: string;
  scope: ComponentScope;
  deprecated?: boolean;
  /** Relative to `design/registry/` — e.g. `"shards/button-primary.json"`. */
  shard: string;
  /** `canonicalHash` of the shard's `ComponentRecord` — a quick integrity/change check
   *  without reading every shard file. */
  hash: string;
}

export interface ShardIndex {
  v: string;
  components: ShardIndexEntry[];
}

/** `<name-slug>.json` — reuses the SAME kebab-slug convention `figmaNodeRelPath` already
 *  uses for Figma sidecars, so a component's shard and its sidecar slug identically. */
function nameSlug(name: string): string {
  return toSafeFilename(name);
}

export function registryDir(designDir: string): string {
  return join(designDir, REGISTRY_DIRNAME);
}
export function shardIndexPath(designDir: string): string {
  return join(registryDir(designDir), INDEX_FILENAME);
}
/** Relative to `design/registry/` (the value stored in the index — portable if the
 *  project moves). */
export function shardRelPath(name: string): string {
  return `${SHARD_DIRNAME}/${nameSlug(name)}.json`;
}
export function shardPath(designDir: string, name: string): string {
  return join(registryDir(designDir), shardRelPath(name));
}

/** Write one component's shard file — content-guarded (byte-identical content is never
 *  rewritten), the SAME convention `figma-node-reader.ts`'s `writeFigmaNode` already uses
 *  for sidecars. Returns whether the write actually happened, plus the record's hash
 *  (computed either way — cheap, and the index needs it regardless). */
function writeShard(designDir: string, record: ComponentRecord): { written: boolean; hash: string } {
  const path = shardPath(designDir, record.name);
  const content = canonicalStringify(record);
  const hash = canonicalHash(record);
  let existing: string | undefined;
  try {
    existing = readFileSync(path, "utf8");
  } catch {
    existing = undefined;
  }
  if (existing === content) return { written: false, hash };
  mkdirSync(join(registryDir(designDir), SHARD_DIRNAME), { recursive: true });
  writeFileSync(path, content, "utf8");
  return { written: true, hash };
}

/** Delete a shard file that no longer has a matching record — a no-op when absent,
 *  matching the other content-guarded writers' "only touch what actually needs to
 *  change" discipline. */
function removeShard(designDir: string, name: string): void {
  const path = shardPath(designDir, name);
  if (existsSync(path)) rmSync(path, { force: true });
}

/**
 * Write every component in `reg` to its own shard (content-guarded) plus a fresh index,
 * deleting any shard whose record no longer exists in `reg` (compared against the PRIOR
 * index, never a directory listing — a directory listing would also see files an
 * operator added for unrelated reasons, not this module's business). Returns the count
 * of shards ACTUALLY written, for the same "record only real writes" discipline the rest
 * of this wave already follows (`writeFigmaNode`'s `written` flag, `sidecarsWritten`, …).
 *
 * Registry-integrity phase 04 (5.4), §5 — `touched`, when given (the apply layer's own
 * `Set<name>` of what it actually added/updated/deprecated this run), skips even
 * DIFFING every other component's shard: an untouched component's PRIOR index entry is
 * reused verbatim (its shard is guaranteed byte-identical, since nothing about it
 * changed), so the whole call becomes O(touched) instead of O(N) content-guard checks.
 * Omitted (every other caller — `ui registry register`, `ds init`, …) processes every
 * component, exactly as §4 shipped it — zero behaviour change for them.
 */
export function writeShards(
  designDir: string, reg: Registry, touched?: ReadonlySet<string>,
): { shardsWritten: number; orphanShards: string[] } {
  const dir = registryDir(designDir);
  mkdirSync(dir, { recursive: true });

  const priorIndex = readShardIndex(designDir);
  const priorByName = new Map((priorIndex?.components ?? []).map((e) => [e.name, e] as const));
  const nextNames = new Set(reg.components.map((c) => c.name));
  // Stage-4 MAJOR9 — no trustworthy prior index (absent OR just-rejected-as-corrupt): the
  // normal removal loop below cannot run safely (it has nothing reliable to diff
  // against), so any shard file left behind by a component no longer in `reg` becomes an
  // orphan. Detected via a directory listing (see `detectOrphanShards`'s own doc for why
  // that is confined to exactly this recovery path) and REPORTED, never auto-deleted.
  const orphanShards = priorIndex === undefined ? detectOrphanShards(designDir, reg) : [];
  if (priorIndex !== undefined) {
    for (const entry of priorIndex.components) {
      if (!nextNames.has(entry.name)) removeShard(designDir, entry.name);
    }
  }

  let shardsWritten = 0;
  const entries: ShardIndexEntry[] = [];
  for (const record of reg.components) {
    const mustProcess = touched === undefined || touched.has(record.name);
    if (!mustProcess) {
      const prior = priorByName.get(record.name);
      // A prior entry exists → this component is untouched AND already indexed; reuse it
      // verbatim (no hash recompute, no shard read/write). No prior entry (the index
      // never covered this component yet, e.g. it predates sharding) → fall through and
      // process it once to backfill, even though `touched` did not name it.
      if (prior !== undefined) {
        entries.push(prior);
        continue;
      }
    }
    const { written, hash } = writeShard(designDir, record);
    if (written) shardsWritten += 1;
    entries.push({
      name: record.name,
      category: record.category,
      scope: record.scope ?? "local",
      ...(record.deprecated !== undefined && { deprecated: record.deprecated }),
      shard: shardRelPath(record.name),
      hash,
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const index: ShardIndex = { v: REGISTRY_SHARD_INDEX_VERSION, components: entries };
  writeFileSync(shardIndexPath(designDir), canonicalStringify(index), "utf8");
  return { shardsWritten, orphanShards };
}

const VALID_SCOPES = new Set<ComponentScope>(["local", "global"]);

/** Structural validation of ONE index entry — every field `writeShards`/`registryFromShards`
 *  actually dereferences must be present and correctly typed. Stage-4 MAJOR9 — this used
 *  to be entirely UNCHECKED: a malformed entry (e.g. a missing/non-string `name`) would
 *  reach `writeShards`'s removal loop (`shardPath(designDir, entry.name)` → `toSafeFilename`
 *  called on `undefined`) and THROW, wrapped by `saveRegistry` into a `WRITE_ERROR` that
 *  then blocks EVERY future registry write forever — the corrupt index.json never gets
 *  cleaned up, since nothing ever gets far enough to rewrite it. */
function isValidShardIndexEntry(v: unknown): v is ShardIndexEntry {
  if (v === null || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e["name"] === "string" && e["name"].length > 0 &&
    typeof e["category"] === "string" &&
    typeof e["scope"] === "string" && VALID_SCOPES.has(e["scope"] as ComponentScope) &&
    (e["deprecated"] === undefined || e["deprecated"] === true) &&
    typeof e["shard"] === "string" && e["shard"].length > 0 &&
    typeof e["hash"] === "string" && e["hash"].length > 0
  );
}

/**
 * Read the index, or undefined when absent (a project that predates sharding, or whose
 * registry has never been saved through `saveRegistry` since this landed) OR corrupt.
 *
 * Stage-4 MAJOR9 — every entry is validated (not just the top-level `{v, components}`
 * shape); ONE malformed entry invalidates the WHOLE index, treated exactly like "absent"
 * (never a partial filter that silently drops just the bad entry — the index's usefulness
 * depends on it being a complete, trustworthy account of every component's shard, and a
 * partially-trusted index is how the old crash happened). `writeShards`'s caller then
 * falls back to a full reprocess of every component (recomputing hashes and rewriting
 * shards as needed) — costlier this one run, never a wedge.
 */
export function readShardIndex(designDir: string): ShardIndex | undefined {
  const path = shardIndexPath(designDir);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ShardIndex>;
    if (
      typeof parsed.v === "string" && Array.isArray(parsed.components) &&
      parsed.components.every(isValidShardIndexEntry)
    ) {
      return { v: parsed.v, components: parsed.components };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Stage-4 MAJOR9 — when the index was corrupt (treated as absent), the removal loop that
 *  normally deletes a shard whose record disappeared never ran (there is no trustworthy
 *  prior index to diff against), so shard files for components no longer in `reg` can be
 *  left behind as ORPHANS. Never auto-deleted here (guessing wrong would destroy a real
 *  shard) — a directory listing (the ONE case this module's normal path deliberately
 *  avoids, per its own header comment, precisely because it can see unrelated files) is
 *  the only way to detect them without a trustworthy index, so it is used ONLY in this
 *  recovery path and only to REPORT, never to remove. */
function detectOrphanShards(designDir: string, reg: Registry): string[] {
  const shardsDir = join(registryDir(designDir), SHARD_DIRNAME);
  if (!existsSync(shardsDir)) return [];
  const expected = new Set(reg.components.map((c) => `${nameSlug(c.name)}.json`));
  let files: string[];
  try {
    files = readdirSync(shardsDir);
  } catch {
    return []; // never let orphan detection itself fail the save
  }
  return files.filter((f) => f.endsWith(".json") && !expected.has(f)).map((f) => `${SHARD_DIRNAME}/${f}`).sort();
}

/** Read ONE component record directly from its shard — for a caller that needs a single
 *  record without loading the whole registry (e.g. a future per-target lookup in the
 *  apply layer, §5). Returns undefined when no shard exists for `name`. */
export function readShard(designDir: string, name: string): ComponentRecord | undefined {
  const path = shardPath(designDir, name);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ComponentRecord;
  } catch {
    return undefined;
  }
}

/** Rebuild a `Registry` purely from shards + index — proves shards+index alone are
 *  sufficient to reconstruct exactly what `saveRegistry` would have written directly
 *  (the golden round-trip test's mechanism). A shard the index references but that is
 *  missing/corrupt on disk is skipped (never fabricated) — same "never invent content"
 *  discipline as the rest of this wave. */
export function registryFromShards(designDir: string, version: string): Registry {
  const index = readShardIndex(designDir);
  if (index === undefined) return { version, components: [] };
  const components: ComponentRecord[] = [];
  for (const entry of index.components) {
    const record = readShard(designDir, entry.name);
    if (record !== undefined) components.push(record);
  }
  return { version, components };
}
