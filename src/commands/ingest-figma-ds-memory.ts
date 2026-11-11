/** Seeds the project memory from an ingest (`--seed-memory`): the I/O half of the command that is not the transform. */
import { buildEvent, validateEvent } from "../core/memory-events.js";
import type { EventType } from "../core/memory-events.js";
import { memoryPaths } from "../core/memory-store.js";
import { seedMemoryBatch } from "../core/memory-seed-batch.js";

/**
 * Seed the project memory with the DS provenance + one event per REAL component.
 * Icons and screens are aggregated into a single event each — never one-per-icon —
 * so onboarding a 1,600-node icon library does not bloat the ledger.
 */
export function seedMemory(
  outDir: string,
  source: string,
  componentNames: string[],
  iconCount: number,
  screenCount: number,
  nowIso: string,
): void {
  const paths = memoryPaths(outDir);
  const events: Array<{ type: EventType; data: Record<string, unknown> }> = [
    { type: "harvested", data: { source, what: `${componentNames.length} components ingested from a Figma design system` } },
    ...componentNames.map((name) => ({ type: "component_registered" as EventType, data: { name } })),
  ];
  if (iconCount > 0) {
    events.push({ type: "harvested", data: { source, what: `${iconCount} icons (icon-set)` } });
  }
  if (screenCount > 0) {
    events.push({ type: "harvested", data: { source, what: `${screenCount} screens (not DS components)` } });
  }
  seedMemoryBatch(paths, events.length, nowIso, (append) => {
    for (const e of events) {
      validateEvent(e.type, e.data, undefined);
      append(buildEvent({ id: "", t: nowIso, type: e.type, data: e.data, actor: "ingest-figma-ds", medium: "figma" }));
    }
  });
}
