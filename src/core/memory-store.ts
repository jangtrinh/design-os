/**
 * Design-memory filesystem layer — keeps the pure model (events/graph/profile)
 * fs-free. Owns path resolution, the append-only ledger write, lazy graph
 * recompile (rebuild when the ledger is newer than the compiled graph), and the
 * user-scope registry + taste profile under `~/.ease-design/`
 * (override with `EASE_DESIGN_HOME`; tests MUST set it — plan invariant #5).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import { parseLedger, serializeEvent } from "./memory-events.js";
import type { MemoryEvent } from "./memory-events.js";
import { compileGraph } from "./memory-graph.js";
import type { MemoryGraph } from "./memory-graph.js";
import type { ProjectEntry, TasteProfile } from "./memory-profile.js";

// ─── Path resolution ────────────────────────────────────────────────────────────

export interface MemoryPaths {
  projectDir: string; // the project root (holds design/)
  dir: string;        // <projectDir>/design
  ledger: string;     // design/memory.events.jsonl
  graph: string;      // design/memory.graph.json
}

/** Resolve project memory paths from an optional --dir (else cwd). */
export function memoryPaths(dirFlag: string | undefined): MemoryPaths {
  const projectDir = dirFlag !== undefined ? resolve(dirFlag) : process.cwd();
  const dir = join(projectDir, "design");
  return { projectDir, dir, ledger: join(dir, "memory.events.jsonl"), graph: join(dir, "memory.graph.json") };
}

/** User-scope home for the registry + profile. */
export function easeHome(): string {
  const env = process.env["EASE_DESIGN_HOME"];
  return env !== undefined && env.length > 0 ? resolve(env) : join(homedir(), ".ease-design");
}

export function registryPath(): string {
  return join(easeHome(), "projects.json");
}
export function profilePath(): string {
  return join(easeHome(), "taste.profile.json");
}

// ─── Ledger ─────────────────────────────────────────────────────────────────────

/**
 * Registry-integrity phase 04 (5.4), §5 — `ledgerLineCount` used to re-read the WHOLE
 * ledger on every call (O(E) per event, O(E²) cumulative over a project's lifetime, just
 * to pick the next id). A small counter file persisted BESIDE the ledger makes it O(1):
 * `appendEvent` increments it after every write; `ledgerLineCount` trusts it when present
 * and self-heals with exactly ONE real count (the same O(E) scan as before, but only ever
 * once) when it is absent — a fresh project, or a pre-phase-04 one that has never
 * appended since this landed. No new concurrency guarantee is introduced or assumed
 * beyond what the ledger itself already had (single-writer CLI invocations; the
 * Concurrency & Jobs wave, a separate track, owns any real locking).
 *
 * Stage-4 MAJOR8 — the plan required this counter be VERIFIED on open, not trusted
 * blindly forever: anything that touches the ledger OUTSIDE `appendEvent` (a hand-edit, a
 * restore from backup, a corrupted write, or a future writer that forgets to bump the
 * counter) would otherwise silently diverge from reality — permanently, since nothing
 * ever re-checked it — and a wrong next-id from `ledgerLineCount` risks a colliding or
 * gapped event id. The counter now also persists the ledger's own byte size at the
 * instant it was last verified (`bytes`); every read compares that against the ledger's
 * CURRENT size (`statSync`, O(1) — no full read) and only trusts the cached count when
 * they still agree, re-scanning (and re-persisting both) the moment they do not.
 *
 * Known, accepted gap (deliberate, not fixed here): a byte-size match is not a content
 * hash — an out-of-band edit that happens to leave the file the SAME total size (e.g. one
 * line shortened by exactly as many bytes as another grew) would go undetected. Hashing
 * the whole ledger on every read would defeat the O(1) goal this fix exists for; a
 * same-size silent corruption is judged rare enough that the O(1)-size check is the right
 * trade-off, not a full-content verification.
 */
const LEDGER_COUNTER_FILENAME = "memory.events.count.json";

interface LedgerCounter {
  count: number;
  bytes: number;
}

function ledgerCounterPath(paths: MemoryPaths): string {
  return join(paths.dir, LEDGER_COUNTER_FILENAME);
}

/** The persisted counter, or undefined when absent/malformed (never trusted blindly —
 *  same "reject, never clamp" doctrine as every other small state file in this wave). A
 *  pre-MAJOR8 counter file (`{count}` alone, no `bytes`) reads as undefined too — it
 *  cannot be verified, so it is treated exactly like "no counter yet" (one self-healing
 *  rescan, same as always), never trusted on faith. */
function readLedgerCounter(paths: MemoryPaths): LedgerCounter | undefined {
  const p = ledgerCounterPath(paths);
  if (!existsSync(p)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as { count?: unknown; bytes?: unknown };
    return typeof parsed?.count === "number" && Number.isInteger(parsed.count) && parsed.count >= 0
      && typeof parsed?.bytes === "number" && Number.isInteger(parsed.bytes) && parsed.bytes >= 0
      ? { count: parsed.count, bytes: parsed.bytes }
      : undefined;
  } catch {
    return undefined;
  }
}

function writeLedgerCounter(paths: MemoryPaths, counter: LedgerCounter): void {
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(ledgerCounterPath(paths), JSON.stringify(counter) + "\n", "utf8");
}

/** Count non-blank ledger lines (→ next event id). 0 when the ledger is absent. O(1) once
 *  a counter exists AND its recorded byte size still matches the live ledger (one cheap
 *  `statSync`, not a full read); a missing/malformed counter, or one whose `bytes` no
 *  longer matches the ledger's current size, triggers exactly one real scan, which then
 *  persists a fresh `{count, bytes}` pair so every subsequent call is O(1) again. */
export function ledgerLineCount(paths: MemoryPaths): number {
  if (!existsSync(paths.ledger)) return 0;
  const liveBytes = statSync(paths.ledger).size;
  const cached = readLedgerCounter(paths);
  if (cached !== undefined && cached.bytes === liveBytes) return cached.count;
  const count = readFileSync(paths.ledger, "utf8").split("\n").filter((l) => l.trim().length > 0).length;
  writeLedgerCounter(paths, { count, bytes: liveBytes });
  return count;
}

/** Append one serialised event line, creating design/ if needed, and advance the
 *  persisted counter by exactly one (self-healing via `ledgerLineCount` when it does not
 *  exist yet, or is stale — see MAJOR8 above). */
export function appendEvent(paths: MemoryPaths, event: MemoryEvent): void {
  const priorCount = ledgerLineCount(paths);
  mkdirSync(paths.dir, { recursive: true });
  appendFileSync(paths.ledger, serializeEvent(event) + "\n", "utf8");
  writeLedgerCounter(paths, { count: priorCount + 1, bytes: statSync(paths.ledger).size });
}

export function readEvents(paths: MemoryPaths): MemoryEvent[] {
  if (!existsSync(paths.ledger)) return [];
  return parseLedger(readFileSync(paths.ledger, "utf8"));
}

// ─── Graph (compiled view, lazy) ─────────────────────────────────────────────────

/** Force a recompile from the ledger and write the graph. */
export function compileAndWrite(paths: MemoryPaths, nowIso: string): MemoryGraph {
  const graph = compileGraph(readEvents(paths), nowIso);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.graph, JSON.stringify(graph, null, 2) + "\n", "utf8");
  return graph;
}

/**
 * Return the compiled graph, recompiling when the graph is missing or the ledger
 * has been appended to since the graph was written (mtime comparison).
 */
export function loadGraph(paths: MemoryPaths, nowIso: string): MemoryGraph {
  if (!existsSync(paths.ledger)) return compileGraph([], nowIso);
  const graphFresh =
    existsSync(paths.graph) && statSync(paths.graph).mtimeMs >= statSync(paths.ledger).mtimeMs;
  if (graphFresh) {
    try {
      return JSON.parse(readFileSync(paths.graph, "utf8")) as MemoryGraph;
    } catch {
      /* fall through to recompile on a corrupt graph */
    }
  }
  return compileAndWrite(paths, nowIso);
}

// ─── User-scope registry ─────────────────────────────────────────────────────────

export function loadRegistry(): ProjectEntry[] {
  const p = registryPath();
  if (!existsSync(p)) return [];
  try {
    const arr = JSON.parse(readFileSync(p, "utf8")) as unknown;
    return Array.isArray(arr) ? (arr as ProjectEntry[]) : [];
  } catch {
    return [];
  }
}

/** Upsert this project into the registry (name = dir basename), sorted by path. */
export function upsertRegistry(projectDir: string, lastEventAt: string): void {
  const entries = loadRegistry().filter((e) => e.path !== projectDir);
  entries.push({ name: basename(projectDir), path: projectDir, lastEventAt });
  entries.sort((a, b) => a.path.localeCompare(b.path));
  mkdirSync(easeHome(), { recursive: true });
  writeFileSync(registryPath(), JSON.stringify(entries, null, 2) + "\n", "utf8");
}

// ─── Taste profile ───────────────────────────────────────────────────────────────

export function loadProfile(): TasteProfile | null {
  const p = profilePath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as TasteProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: TasteProfile): void {
  mkdirSync(easeHome(), { recursive: true });
  writeFileSync(profilePath(), JSON.stringify(profile, null, 2) + "\n", "utf8");
}
