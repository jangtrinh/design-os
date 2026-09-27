/**
 * ksync drift — compare each pin with the frame snapshot the host captured.
 * Pure: the clock is a parameter. A verdict of CLEAN is only ever returned when every
 * pin was actually checked against a fresh ingest — an old or empty ingest is red.
 */
import type { KsyncPin } from "./ksync-pins.js";
import type { Ingest } from "./ksync-ingest.js";

export type PinState = "OK" | "DRIFT" | "MISSING" | "UNCHECKABLE";
export type Verdict = "CLEAN" | "DRIFT" | "STALE-INGEST" | "EMPTY";

export interface PinResult {
  route: string;
  node: string;
  state: PinState;
  reason: string;
}

export interface DriftReport {
  verdict: Verdict;
  ingestAgeDays: number | null;
  maxAgeDays: number;
  counts: Record<PinState, number>;
  results: PinResult[];
}

const DAY_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

export function classifyPin(pin: KsyncPin, ingest: Ingest): { state: PinState; reason: string } {
  if (ingest.fileKey !== null && ingest.fileKey !== pin.file) return { state: "MISSING", reason: `pinned to file ${pin.file}, ingest is of file ${ingest.fileKey}` };
  const frame = ingest.frames.get(pin.node);
  if (frame === undefined) return { state: "MISSING", reason: "frame is not in the ingest (deleted, moved out of scope, or never captured)" };
  // A hash is content; a timestamp is only a clue that something was touched. When both sides hold a hash, the hash decides.
  if (pin.specHash !== undefined && frame.specHash !== null) {
    return pin.specHash === frame.specHash
      ? { state: "OK", reason: "spec hash unchanged" }
      : { state: "DRIFT", reason: "spec hash differs from the pinned hash" };
  }
  if (frame.lastModifiedMs !== null) {
    const pinnedMs = Date.parse(pin.pinnedAt);
    return frame.lastModifiedMs > pinnedMs
      ? { state: "DRIFT", reason: `frame modified ${iso(frame.lastModifiedMs)}, after the pin at ${pin.pinnedAt}` }
      : { state: "OK", reason: "frame not modified since the pin" };
  }
  return { state: "UNCHECKABLE", reason: "no hash pair and no lastModified — the ingest cannot say whether this frame changed" };
}

export function computeDrift(pins: readonly KsyncPin[], ingest: Ingest, opts: { nowMs: number; maxAgeDays: number }): DriftReport {
  const results = pins.map((p): PinResult => ({ route: p.route, node: p.node, ...classifyPin(p, ingest) }));
  const counts: Record<PinState, number> = { OK: 0, DRIFT: 0, MISSING: 0, UNCHECKABLE: 0 };
  for (const r of results) counts[r.state]++;
  const ageDays = ingest.ingestedAtMs === null ? null : (opts.nowMs - ingest.ingestedAtMs) / DAY_MS;
  const stale = ageDays === null || ageDays > opts.maxAgeDays;
  const verdict: Verdict = stale ? "STALE-INGEST" : pins.length === 0 ? "EMPTY" : counts.OK === pins.length ? "CLEAN" : "DRIFT";
  return { verdict, ingestAgeDays: ageDays === null ? null : Math.round(ageDays * 100) / 100, maxAgeDays: opts.maxAgeDays, counts, results };
}
