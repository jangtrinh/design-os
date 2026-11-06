/**
 * `ui gate` baseline — accepted, known findings that should not fail the gate,
 * so the gate can go red on NEW debt in a project that already carries some.
 *
 * A fingerprint is (family, checkId, nodeRef, message), never the line number:
 * lines shift on every unrelated edit, and a baseline keyed on them would
 * resurface the whole backlog the moment anything above it moved. A message that
 * carries a count ("12 distinct font sizes") is part of the fingerprint on
 * purpose — when the count grows, the finding is new debt and fails again.
 *
 * Entries are a multiset: two identical findings need two baseline entries, so a
 * third copy of an accepted problem still fails.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { FloorFindingBase } from "./finding-schema.js";

export const BASELINE_KIND = "ui-gate-baseline";
export const BASELINE_VERSION = 1;

export interface GateBaselineFile {
  kind: typeof BASELINE_KIND;
  version: typeof BASELINE_VERSION;
  /** The gated file when the baseline was written (informational). */
  file?: string;
  entries: Array<{ fingerprint: string; count: number }>;
}

export class GateBaselineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateBaselineError";
  }
}

/** The line-independent identity of a finding. */
export function fingerprintOf(family: string, f: FloorFindingBase): string {
  const message = f.message.replace(/\bline \d+\b/g, "line ?");
  return [family, f.checkId, f.nodeRef ?? "", message].join(" | ");
}

/** Read a baseline file → fingerprint counts. Throws GateBaselineError on a bad file. */
export function readBaseline(path: string): Map<string, number> {
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new GateBaselineError(`cannot read baseline '${path}': ${e instanceof Error ? e.message : String(e)}`);
  }
  const d = doc as Partial<GateBaselineFile>;
  if (d === null || typeof d !== "object" || d.kind !== BASELINE_KIND || d.version !== BASELINE_VERSION || !Array.isArray(d.entries)) {
    throw new GateBaselineError(`'${path}' is not a ui gate baseline (expected kind "${BASELINE_KIND}", version ${BASELINE_VERSION}) — write one with --write-baseline`);
  }
  const out = new Map<string, number>();
  for (const e of d.entries) {
    if (typeof e?.fingerprint !== "string" || typeof e.count !== "number" || e.count < 1) {
      throw new GateBaselineError(`'${path}' has a malformed entry — each needs a string fingerprint and a count >= 1`);
    }
    out.set(e.fingerprint, (out.get(e.fingerprint) ?? 0) + e.count);
  }
  return out;
}

/** Serialise the given fingerprints as a baseline file (sorted, so it diffs cleanly). */
export function writeBaseline(path: string, fingerprints: readonly string[], file?: string): number {
  const counts = new Map<string, number>();
  for (const fp of fingerprints) counts.set(fp, (counts.get(fp) ?? 0) + 1);
  const entries = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([fingerprint, count]) => ({ fingerprint, count }));
  const doc: GateBaselineFile = { kind: BASELINE_KIND, version: BASELINE_VERSION, ...(file !== undefined && { file }), entries };
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n", "utf8");
  return fingerprints.length;
}

/** A consumable view of a baseline: each `take` uses up one accepted copy. */
export function baselineMatcher(counts: Map<string, number>): (fingerprint: string) => boolean {
  const left = new Map(counts);
  return (fp) => {
    const n = left.get(fp) ?? 0;
    if (n <= 0) return false;
    left.set(fp, n - 1);
    return true;
  };
}
