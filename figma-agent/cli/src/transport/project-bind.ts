// Registry-integrity phase 01 (5.1) — file↔project binding. Durable project state (the
// registry, its sidecars, cursor, manifest) currently derives from the broker's OWN spawn
// cwd (figma-sync-config.ts's `projectDir()`), never from which project the edit actually
// came from. This module is the fix's pure core: it never guesses a project for an unknown
// file — the caller (figma-sync-apply.ts §3) must refuse instead.
//
// Persistence has two stores, each with one job (see phase-01-project-binding.md §2):
//   - `<projectDir>/design/figma-bind.json` — the DURABLE TRUTH. Reviewable in git, moves
//     with the repo, survives everything.
//   - `/tmp/figma-agent-binds.json` (bindCacheFile) — the broker's RESTART-SURVIVAL CACHE:
//     just enough (a list of project dirs) to know where to re-scan for markers at startup.
//     Without it the broker has no directory to look in after a restart, so an explicit
//     bind would silently stop working until the next CLI request re-teaches it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeSlug } from './edit-feed-log.ts';

export type BindSource = 'bind' | 'request';

/** One resolved binding: which project a file identity currently maps to, and why. */
export interface Binding {
  projectDir: string;
  source: BindSource;
  at: number;
}

/**
 * fileKey when present, else slugged fileName, else 'unknown' — the SAME chain the edit
 * feed already uses (edit-feed-log.ts's `editFeedPath`), reused via `safeSlug` so the two
 * file-partitioning schemes can never silently drift apart.
 */
export function fileIdentity(fileKey: string | null | undefined, fileName: string | null | undefined): string {
  if (typeof fileKey === 'string' && fileKey.trim() !== '') return fileKey;
  return safeSlug(fileName ?? '');
}

/** A binding is only usable if its target still exists and still looks like a project —
 *  a moved/deleted project must refuse, never silently fall through to somewhere else. */
export function isUsable(b: Binding): boolean {
  return existsSync(join(b.projectDir, 'design'));
}

/**
 * Precedence, in order, with NO fourth branch:
 *   1. explicit `bind`  (source: 'bind')
 *   2. last CLI request that targeted this file identity (source: 'request')
 *   3. null → the caller REFUSES; it never guesses, never falls back to cwd.
 * A binding whose target has stopped looking like a project is treated as absent (not a
 * fallback to some other entry — the spec's risk row: a moved project must refuse loudly).
 */
export function resolveProjectDir(id: string, index: ReadonlyMap<string, Binding>): string | null {
  const b = index.get(id);
  if (!b || !isUsable(b)) return null;
  return b.projectDir;
}

/**
 * Insert/update a binding in the broker's live index, respecting precedence: an explicit
 * `bind` always wins and may replace a prior binding of either source; a `request` binding
 * is recorded only when no `bind` binding already owns this identity — a request must never
 * downgrade an explicit bind (the whole point of the precedence rule).
 */
export function recordBinding(index: Map<string, Binding>, id: string, candidate: Binding): void {
  const existing = index.get(id);
  if (candidate.source === 'bind' || !existing || existing.source !== 'bind') {
    index.set(id, candidate);
  }
}

/**
 * True when a fileKey alias needs (re)writing to match `target` — false ONLY when this
 * EXACT promotion (same projectDir, `source: 'bind'`) already happened, so a repeat
 * `FILE_INFO` for an already-promoted file is a cheap no-op.
 *
 * Fix round (finding 4, part 1 — alias asymmetry): the bug this replaces treated ANY
 * existing entry as "already handled", so a weaker `source: 'request'` alias (left over
 * from an earlier unbound interaction with the same file) permanently blocked the
 * explicit bind from ever promoting its fileKey. "Explicit > implicit, always" means the
 * only thing allowed to block a promotion is an IDENTICAL prior promotion, never a weaker
 * or differently-targeted one.
 */
export function needsAliasPromotion(current: Binding | undefined, target: Binding): boolean {
  return !(current?.source === 'bind' && current.projectDir === target.projectDir);
}

/**
 * Remove every alias key belonging to one binding — never just the single key a caller
 * happened to address it by (fix round, finding 4, part 2 — "unbind removes EVERY alias
 * pointing at that binding, walk by binding identity, not by the one key the caller
 * passed"). `keys` is the identity's own {fileNameSlug, fileKey?} pair, gathered by the
 * caller (bind.ts reads the marker entry BEFORE rewriting it, since the fileKey is not
 * otherwise recoverable once the marker has been rewritten).
 */
export function removeBinding(index: Map<string, Binding>, keys: readonly string[]): void {
  for (const key of keys) index.delete(key);
}

// ── Durable truth: `<projectDir>/design/figma-bind.json` ────────────────────────────
export const BIND_MARKER_FILENAME = 'figma-bind.json';

export interface BindMarkerEntry {
  fileKey: string | null;
  fileNameSlug: string;
  boundAt: number;
  /** Set when bound while the named file was NOT connected — no fileKey known yet;
   *  filled in on the first FILE_INFO that matches (see cli/src/commands/bind.ts). */
  pendingKey?: true;
}

export interface BindMarkerFile {
  v: 1;
  bindings: BindMarkerEntry[];
}

export function bindMarkerPath(projectDir: string): string {
  return join(projectDir, 'design', BIND_MARKER_FILENAME);
}

/** Read a project's own binding marker. Malformed/absent → null — never throws, so a
 *  broken marker can't crash the broker; the caller treats it as "nothing recorded here". */
export function readBindMarker(projectDir: string): BindMarkerFile | null {
  const path = bindMarkerPath(projectDir);
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as BindMarkerFile).bindings)) {
      return parsed as BindMarkerFile;
    }
    return null;
  } catch {
    return null;
  }
}

/** Write the durable marker, creating `<projectDir>/design/` if needed. */
export function writeBindMarker(projectDir: string, marker: BindMarkerFile): void {
  mkdirSync(join(projectDir, 'design'), { recursive: true });
  writeFileSync(bindMarkerPath(projectDir), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
}

// ── Restart-survival cache: `/tmp/figma-agent-binds.json` ───────────────────────────
export interface BindCache {
  v: 1;
  projectDirs: string[];
}

/** Overridable for tests (mirrors FIGMA_AGENT_CHANGES_DIR's precedent); defaults beside
 *  the broker advertisement (BROKER_FILE). */
export function bindCacheFile(): string {
  return process.env['FIGMA_AGENT_BINDS_FILE'] || '/tmp/figma-agent-binds.json';
}

export function readBindCache(): BindCache {
  const path = bindCacheFile();
  if (!existsSync(path)) return { v: 1, projectDirs: [] };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const dirs = parsed && typeof parsed === 'object' ? (parsed as BindCache).projectDirs : undefined;
    if (Array.isArray(dirs)) return { v: 1, projectDirs: dirs.filter((d): d is string => typeof d === 'string') };
    return { v: 1, projectDirs: [] };
  } catch {
    return { v: 1, projectDirs: [] }; // a corrupt cache never crashes the broker — start empty
  }
}

/** Best-effort write: a failed cache write only costs a slower re-learn after the next
 *  broker restart, never a broken bind (the durable marker is unaffected). */
export function writeBindCache(projectDirs: readonly string[]): void {
  try {
    writeFileSync(bindCacheFile(), JSON.stringify({ v: 1, projectDirs: [...new Set(projectDirs)] }), 'utf8');
  } catch { /* best-effort */ }
}

/**
 * Startup reconstruction ONLY: two projects can each claim a binding for the same file
 * identity (most likely a stale duplicate — the file was re-bound elsewhere and the old
 * project's marker was never cleaned up). The NEWEST by `boundAt` must win, regardless of
 * which order the /tmp cache happens to list project dirs in (registry-integrity fix
 * round, finding 5 — cache order is an implementation detail of a Set, never a ranking).
 * `recordBinding`'s source-precedence rule doesn't apply here: every candidate in this
 * loop is `source: 'bind'`, so its "an explicit bind always wins" clause would let
 * iteration order silently decide instead.
 */
function recordNewestBind(index: Map<string, Binding>, id: string, candidate: Binding): void {
  const existing = index.get(id);
  if (!existing || candidate.at >= existing.at) index.set(id, candidate);
}

/**
 * Rebuild the in-memory index at daemon startup: read the cache's project dirs, drop any
 * that no longer look like a project (never trusted once stale), and load each survivor's
 * own marker into the index — a marker entry on disk IS an explicit bind by construction,
 * so it is recorded with `source: 'bind'`, newest-`boundAt`-wins on a collision. Returns
 * the rebuilt index plus the still-usable dirs, so the daemon can rewrite a pruned cache
 * (dropping dead entries).
 */
export function loadBindIndex(): { index: Map<string, Binding>; usableDirs: string[] } {
  const cache = readBindCache();
  const index = new Map<string, Binding>();
  const usableDirs: string[] = [];
  for (const projectDir of cache.projectDirs) {
    if (!existsSync(join(projectDir, 'design'))) continue; // stale — dropped, never trusted
    usableDirs.push(projectDir);
    const marker = readBindMarker(projectDir);
    if (!marker) continue;
    for (const entry of marker.bindings) {
      const candidate: Binding = { projectDir, source: 'bind', at: entry.boundAt };
      if (entry.fileKey) recordNewestBind(index, entry.fileKey, candidate);
      if (entry.fileNameSlug) recordNewestBind(index, entry.fileNameSlug, candidate);
    }
  }
  return { index, usableDirs };
}
