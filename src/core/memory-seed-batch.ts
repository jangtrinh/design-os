/** Filesystem boundary for seeding: committed events survive later batch failures. */
import { MemoryAppendCommittedError, MemoryEventError } from "./memory-error.js";
import type { MemoryEvent } from "./memory-events.js";
import { appendEvent, compileAndWrite } from "./memory-store.js";
import type { MemoryPaths } from "./memory-store.js";

export function seedMemoryBatch(
  paths: MemoryPaths,
  expectedCount: number,
  nowIso: string,
  write: (append: (event: MemoryEvent) => MemoryEvent) => void,
): void {
  const ids: string[] = [];
  try {
    write((event) => {
      const assigned = appendEvent(paths, event);
      ids.push(assigned.id);
      return assigned;
    });
    compileAndWrite(paths, nowIso);
  } catch (error) {
    if (error instanceof MemoryAppendCommittedError) ids.push(...error.ids);
    const lastId = ids.at(-1);
    if (lastId === undefined) throw error;
    const cause = error instanceof MemoryEventError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error);
    const message = `${ids.length}/${expectedCount} memory seed events committed (IDs: ${ids.join(", ")}); ${cause}. ` +
      `Do not repeat --seed-memory; inspect ledger '${paths.ledger}' and rebuild the projection with ui memory compile` +
      (ids.length < expectedCount ? "; append only reviewed missing events." : ".");
    throw new MemoryAppendCommittedError(lastId, message, ids, expectedCount);
  }
}
