/** Filesystem boundary: append-only ledger, disposable graph/counter, optional user profile. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync, rmSync, openSync, readSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseLedger, serializeEvent, validateEvent, nextEventId, MemoryEventError } from "./memory-events.js";
import { compileLessons } from "./memory-lessons.js";
import { preflightLesson } from "./memory-lesson-evidence.js";
import type { MemoryEvent } from "./memory-events.js";
import { compileGraph } from "./memory-graph.js";
import { MemoryAppendCommittedError } from "./memory-error.js";
import { validGraphCache } from "./memory-graph-cache.js";
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
/** Disposable count cache; append allocation always uses the locked ledger. */
const LEDGER_COUNTER_FILENAME = "memory.events.count.json";
interface LedgerCounter {
  count: number;
  bytes: number;
}
function ledgerCounterPath(paths: MemoryPaths): string {
  return join(paths.dir, LEDGER_COUNTER_FILENAME);
}
/** Missing/malformed metadata and old {count}-only counters force one verified recount. */
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
/** O(1) with verified byte size; absent or stale metadata triggers one recount. */
export function ledgerLineCount(paths: MemoryPaths): number {
  if (!existsSync(paths.ledger)) return 0;
  const liveBytes = statSync(paths.ledger).size;
  // es-debt: same-size external edits are invisible to the counter; hash it if external writers become supported.
  const cached = readLedgerCounter(paths);
  if (cached !== undefined && cached.bytes === liveBytes) return cached.count;
  const count = readFileSync(paths.ledger, "utf8").split("\n").filter((l) => l.trim().length > 0).length;
  writeLedgerCounter(paths, { count, bytes: liveBytes });
  return count;
}
/** Read one final byte only; ordinary gate outcomes never replay the whole ledger. */
function ledgerNeedsNewline(paths: MemoryPaths): string {
  if (!existsSync(paths.ledger)) return "";
  const size = statSync(paths.ledger).size;
  if (size === 0) return "";
  const fd = openSync(paths.ledger, "r");
  try {
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] === 10 ? "" : "\n";
  } finally { closeSync(fd); }
}
/** Contention alone retries briefly; an abandoned or active lock is never broken. */
function acquireAppendLock(lock: string): void {
  let deadline: number | undefined;
  let waitWord: Int32Array | undefined;
  for (;;) {
    try { mkdirSync(lock); return; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      deadline ??= performance.now() + 100;
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        throw new MemoryEventError("MEMORY_LOCKED", `memory append lock is held at '${lock}' after bounded retry; retry after its writer releases it`);
      }
      waitWord ??= new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(waitWord, 0, 0, Math.min(1, remaining));
    }
  }
}
/** Called only while owning the shared append lock. */
function appendWhileLocked(paths: MemoryPaths, event: MemoryEvent): MemoryEvent {
  const lesson = event.type === "lesson_proposed" || event.type === "lesson_reviewed";
  const raw = lesson && existsSync(paths.ledger) ? readFileSync(paths.ledger, "utf8") : "";
  const prior = lesson ? parseLedger(raw) : [];
  const priorCount = lesson ? prior.length : ledgerLineCount(paths);
  const assigned = { ...event, id: nextEventId(priorCount) };
  validateEvent(assigned.type, assigned.data, assigned.refs);
  if (lesson) {
    const lessons = compileLessons([...prior, assigned]);
    preflightLesson(paths.projectDir, assigned, lessons, prior);
  }
  appendFileSync(paths.ledger, ledgerNeedsNewline(paths) + serializeEvent(assigned) + "\n", "utf8");
  // The append is committed. A disposable counter failure must not invite a retry.
  try { writeLedgerCounter(paths, { count: priorCount + 1, bytes: statSync(paths.ledger).size }); } catch { /* recovered on next count */ }
  return assigned;
}
/** Serialize validation, ID allocation and append for every writer. Never break locks. */
export function appendEvent(paths: MemoryPaths, event: MemoryEvent): MemoryEvent {
  mkdirSync(paths.dir, { recursive: true });
  const lock = join(paths.dir, "memory.events.lock");
  acquireAppendLock(lock);
  let assigned: MemoryEvent;
  try { assigned = appendWhileLocked(paths, event); }
  catch (error) {
    try { rmSync(lock, { recursive: true }); } catch { /* preserve the precommit error */ }
    throw error;
  }
  try { rmSync(lock, { recursive: true }); }
  catch (error) {
    throw new MemoryAppendCommittedError(assigned.id,
      `event '${assigned.id}' committed; lock cleanup failed at '${lock}': ${error instanceof Error ? error.message : String(error)}. Do not repeat record; inspect the held lock before recovery.`);
  }
  return assigned;
}
export function readEvents(paths: MemoryPaths): MemoryEvent[] {
  if (!existsSync(paths.ledger)) return [];
  return parseLedger(readFileSync(paths.ledger, "utf8"));
}
// ─── Graph (compiled view, lazy) ─────────────────────────────────────────────────
function ledgerSource(paths: MemoryPaths): Buffer {
  return existsSync(paths.ledger) ? readFileSync(paths.ledger) : Buffer.alloc(0);
}
function sourceHash(raw: Buffer): string {
  return "sha256:" + createHash("sha256").update(raw).digest("hex");
}
function projectGraph(paths: MemoryPaths, raw: Buffer, nowIso: string): MemoryGraph {
  const graph = compileGraph(parseLedger(raw.toString("utf8")), nowIso);
  graph.sourceHash = sourceHash(raw);
  mkdirSync(paths.dir, { recursive: true });
  writeFileSync(paths.graph, JSON.stringify(graph, null, 2) + "\n", "utf8");
  return graph;
}
/** Explicit compile always refreshes decay; bytes and hash come from the same read. */
export function compileAndWrite(paths: MemoryPaths, nowIso: string): MemoryGraph {
  return projectGraph(paths, ledgerSource(paths), nowIso);
}
function cachedGraph(paths: MemoryPaths, raw: Buffer): MemoryGraph | null {
  if (!existsSync(paths.graph)) return null;
  try {
    const graph: unknown = JSON.parse(readFileSync(paths.graph, "utf8"));
    return validGraphCache(graph) && graph.sourceHash === sourceHash(raw) ? graph : null;
  } catch { return null; }
}
/** Read-only cache probe for status: schema and raw-byte hash, no clock or writes. */
export function graphCacheFresh(paths: MemoryPaths): boolean {
  if (!existsSync(paths.ledger)) return false;
  return cachedGraph(paths, ledgerSource(paths)) !== null;
}
/** Cache validity binds raw ledger bytes, never mtime. Optional explicit --now refresh. */
export function loadGraph(paths: MemoryPaths, nowIso: string, refreshClock = false): MemoryGraph {
  const raw = ledgerSource(paths);
  if (!existsSync(paths.ledger)) return compileGraph([], nowIso);
  const graph = refreshClock ? null : cachedGraph(paths, raw);
  return graph ?? projectGraph(paths, raw, nowIso);
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
