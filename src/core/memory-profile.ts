/**
 * Cross-project designer taste profile — the user-scope consolidation.
 *
 * `consolidate()` rebuilds the `computed` section every run from the ledgers of
 * registered projects that still exist on disk (optionally filtered to one
 * `actor`), reusing `compileGraph` per project and keeping only signals that
 * recur across **≥2 projects** (a one-project quirk is not taste). `insights`
 * are preserved across rebuilds, deduped by exact text. Lives in
 * `~/.ease-design/` — NEVER inside a project repo (plan invariant #5).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseLedger } from "./memory-events.js";
import type { MemoryEvent } from "./memory-events.js";
import { compileGraph } from "./memory-graph.js";

export interface ProjectEntry { name: string; path: string; lastEventAt?: string }

export interface FamilyPref { pickWeight: number; projects: number }
export interface RecurringVibe { word: string; weight: number; projects: number }
export interface Avoid { axis: string; failWeight: number; projects: number }
export interface ProfileInsight { text: string; refs: { project: string; events: string[] }[]; addedAt: string }

export interface TasteProfile {
  v: 1;
  consolidatedAt: string;
  actor: string | null;
  projects: number;
  computed: {
    personaFamilies: Record<string, FamilyPref>;
    recurringVibes: RecurringVibe[];
    avoids: Avoid[];
  };
  insights: ProfileInsight[];
}

function r4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

/** Read + parse one project's ledger, filtered to `actor` when given. Returns [] if absent. */
function projectEvents(projectPath: string, actor: string | undefined): MemoryEvent[] {
  const ledger = join(projectPath, "design", "memory.events.jsonl");
  if (!existsSync(ledger)) return [];
  const events = parseLedger(readFileSync(ledger, "utf8"));
  return actor === undefined ? events : events.filter((e) => e.actor === actor);
}

/**
 * Rebuild the taste profile.
 *
 * @param registry  Registered projects (only those whose path exists are read).
 * @param nowIso    Consolidation clock (decay reference; from --now or system clock).
 * @param actor     Restrict to one actor's events, or undefined for all.
 * @param familyOf  Persona-slug → family resolver (identity when a slug is unknown).
 * @param insights  Pre-assembled insights (prior + any newly added); deduped by text here.
 */
export function consolidate(input: {
  registry: readonly ProjectEntry[];
  nowIso: string;
  actor?: string;
  familyOf?: (slug: string) => string;
  insights?: readonly ProfileInsight[];
}): TasteProfile {
  const familyOf = input.familyOf ?? ((s: string) => s);

  // signal → { weight, projects: Set<projectName> } accumulators
  const families = new Map<string, { weight: number; projects: Set<string> }>();
  const vibes = new Map<string, { word: string; weight: number; projects: Set<string> }>();
  const axes = new Map<string, { failWeight: number; projects: Set<string> }>();

  let projectsSeen = 0;
  for (const entry of input.registry) {
    if (!existsSync(entry.path)) continue; // registered but moved/deleted → skip
    const events = projectEvents(entry.path, input.actor);
    if (events.length === 0) continue;
    projectsSeen += 1;
    const g = compileGraph(events, input.nowIso);

    for (const [slug, p] of Object.entries(g.personas)) {
      if (p.pickWeight <= 0) continue;
      const fam = familyOf(slug);
      const acc = families.get(fam) ?? { weight: 0, projects: new Set<string>() };
      acc.weight += p.pickWeight;
      acc.projects.add(entry.name);
      families.set(fam, acc);
    }
    for (const v of g.vibes) {
      const acc = vibes.get(v.word) ?? { word: v.word, weight: 0, projects: new Set<string>() };
      acc.weight += v.weight;
      acc.projects.add(entry.name);
      vibes.set(v.word, acc);
    }
    for (const [axis, a] of Object.entries(g.axes)) {
      if (a.failWeight <= 0) continue;
      const acc = axes.get(axis) ?? { failWeight: 0, projects: new Set<string>() };
      acc.failWeight += a.failWeight;
      acc.projects.add(entry.name);
      axes.set(axis, acc);
    }
  }

  // Keep only ≥2-project signals; emit deterministically (maps key-sorted, arrays by weight).
  const personaFamilies: Record<string, FamilyPref> = {};
  for (const fam of [...families.keys()].sort()) {
    const acc = families.get(fam)!;
    if (acc.projects.size >= 2) personaFamilies[fam] = { pickWeight: r4(acc.weight), projects: acc.projects.size };
  }
  const recurringVibes: RecurringVibe[] = [...vibes.values()]
    .filter((v) => v.projects.size >= 2)
    .map((v) => ({ word: v.word, weight: r4(v.weight), projects: v.projects.size }))
    .sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word));
  const avoids: Avoid[] = [...axes.entries()]
    .filter(([, a]) => a.projects.size >= 2)
    .map(([axis, a]) => ({ axis, failWeight: r4(a.failWeight), projects: a.projects.size }))
    .sort((a, b) => b.failWeight - a.failWeight || a.axis.localeCompare(b.axis));

  // Preserve insights across rebuilds, first-seen-wins dedupe by exact text.
  const seen = new Set<string>();
  const insights: ProfileInsight[] = [];
  for (const ins of input.insights ?? []) {
    if (seen.has(ins.text)) continue;
    seen.add(ins.text);
    insights.push(ins);
  }

  return {
    v: 1,
    consolidatedAt: input.nowIso,
    actor: input.actor ?? null,
    projects: projectsSeen,
    computed: { personaFamilies, recurringVibes, avoids },
    insights,
  };
}
