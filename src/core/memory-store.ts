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

/** Count non-blank ledger lines (→ next event id). 0 when the ledger is absent. */
export function ledgerLineCount(paths: MemoryPaths): number {
  if (!existsSync(paths.ledger)) return 0;
  return readFileSync(paths.ledger, "utf8").split("\n").filter((l) => l.trim().length > 0).length;
}

/** Append one serialised event line, creating design/ if needed. */
export function appendEvent(paths: MemoryPaths, event: MemoryEvent): void {
  mkdirSync(paths.dir, { recursive: true });
  appendFileSync(paths.ledger, serializeEvent(event) + "\n", "utf8");
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
