// The mirror's LINTER (Art II): a deep, path-reporting comparison of two
// FigmaExportNode specs. `mirror-verify` asks "did scan → rebuild → scan land on
// the same spec?" — a boolean answer is useless when it says NO, so this reports
// exactly WHICH field lost the round-trip, as a JSON path (e.g.
// `children[0].fills[0].color.a`).
//
// Deliberately schema-agnostic: it walks the JSON, not the FigmaExportNode type.
// A field added to the walker is compared the day it appears, with no edit here.
//
// Conventions, all of them load-bearing for a HONEST verdict:
//  - Numbers compare with an epsilon (FLOAT_EPSILON) — the build path round-trips
//    colours through paint.opacity ↔ color.a and radii through float fields, so a
//    strict === would report noise as loss. Same tolerance the fixed-point test
//    asserts with toBeCloseTo(_, 5).
//  - `undefined` === absent. The walker `delete`s empty fields, so `{}` and
//    `{fills: undefined}` are the same spec.
//  - Object keys are visited SORTED, so the diff list is deterministic (the same
//    two specs always produce byte-identical output — Art VI).
//  - An array is compared POSITIONALLY unless it is provably a SET serialised in
//    sorted order, in which case its members are paired by NAME (spec-005 P16 — see
//    structural-diff-keyed for the shape rules and the proof that this cannot change
//    the verdict, only the report). Without it one missing member of `innerOverrides`
//    shifted the whole tail and turned 5 real diffs into 43.
//  - The literal of a value BOUND to the same variable on both sides is not compared:
//    it is that binding's projection into the scan's current variable mode, not data
//    (spec-005 P17 — see structural-diff-bound-projection). Every skipped literal that
//    actually differed is reported in `normalized`, so this never buys silence.

import {
  innerOverrideKeys, stringSetMembers, unionKeys,
} from './structural-diff-keyed.ts';
import { boundProjectedPaths } from './structural-diff-bound-projection.ts';

/** One field that did not survive the round-trip. */
export interface StructuralDiffEntry {
  /** JSON path from the spec root, e.g. `children[0].fills[0].color.a`. */
  path: string;
  left: unknown;
  right: unknown;
}

export interface StructuralDiffResult {
  equal: boolean;
  diffs: StructuralDiffEntry[];
  /**
   * Literals that were NOT compared because they are a shared binding's mode
   * projection (P17) AND that do differ between the two scans — one line per path, so
   * a reader can see exactly what `equal: true` looked past and why.
   */
  normalized: string[];
}

/** The walk's accumulators — one per structuralDiff call, never shared. */
interface Ctx {
  diffs: StructuralDiffEntry[];
  notes: string[];
  /** Absolute path → the binding that makes the literal there a projection. */
  projected: Map<string, string>;
}

/** Float tolerance — matches the fixed-point test's `toBeCloseTo(x, 5)`. */
export const FLOAT_EPSILON = 1e-5;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `path` + a key, honouring the root case (no leading dot). */
function joinPath(path: string, key: string): string {
  return path ? `${path}.${key}` : key;
}

function numbersEqual(a: number, b: number): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return Math.abs(a - b) <= FLOAT_EPSILON;
}

/**
 * Pair two arrays by NAME when both are provably sets in sorted order; returns false
 * (comparison untouched) otherwise, so the caller falls through to positional.
 *
 * No `length` entry is emitted here on purpose: a member that is missing is already
 * reported AT ITS OWN KEY, which says strictly more than a count does. The two
 * together would be the cascade this rule exists to remove, just shorter.
 */
function walkAsSet(a: unknown[], b: unknown[], path: string, ctx: Ctx): boolean {
  const keysA = innerOverrideKeys(a);
  const keysB = innerOverrideKeys(b);
  if (keysA && keysB) {
    const byKey = (arr: unknown[], keys: string[]) =>
      new Map(keys.map((k, i) => [k, arr[i]]));
    const ma = byKey(a, keysA);
    const mb = byKey(b, keysB);
    for (const key of unionKeys(keysA, keysB)) {
      walk(ma.get(key), mb.get(key), `${path}[childKey=${key}]`, ctx);
    }
    return true;
  }

  const setA = stringSetMembers(a);
  const setB = stringSetMembers(b);
  if (setA && setB) {
    const inA = new Set(setA);
    const inB = new Set(setB);
    for (const member of unionKeys(setA, setB)) {
      // Membership is the only thing a string set can differ in — the member IS its
      // own value, so a present/absent pair is the whole story.
      if (inA.has(member) !== inB.has(member)) {
        ctx.diffs.push({
          path: `${path}[${member}]`,
          left: inA.has(member) ? member : undefined,
          right: inB.has(member) ? member : undefined,
        });
      }
    }
    return true;
  }
  return false;
}

/**
 * Report a projection that was skipped — but ONLY when the two literals really do
 * differ, so the `normalized` list stays a record of what was forgiven rather than an
 * inventory of every bound field on the node. The re-walk runs with an empty context:
 * it asks the plain question "are these two literals equal?", and its findings are
 * thrown away either way.
 */
function noteProjection(a: unknown, b: unknown, path: string, binding: string, ctx: Ctx): void {
  const probe: Ctx = { diffs: [], notes: [], projected: new Map() };
  walk(a, b, path, probe);
  if (!probe.diffs.length) return;
  ctx.notes.push(`${path} — bound to ${binding} on both sides; a bound value's literal is only its projection into the scan's current variable mode, so the two differ while the data — the binding — is identical`);
}

function walk(a: unknown, b: unknown, path: string, ctx: Ctx): void {
  if (a === undefined && b === undefined) return;

  const binding = ctx.projected.get(path);
  if (binding !== undefined) {
    noteProjection(a, b, path, binding, ctx);
    return;
  }

  if (typeof a === 'number' && typeof b === 'number') {
    if (!numbersEqual(a, b)) ctx.diffs.push({ path, left: a, right: b });
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (walkAsSet(a, b, path, ctx)) return;
    if (a.length !== b.length) {
      ctx.diffs.push({ path: joinPath(path, 'length'), left: a.length, right: b.length });
    }
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) walk(a[i], b[i], `${path}[${i}]`, ctx);
    return;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    for (const p of boundProjectedPaths(a, b, path)) ctx.projected.set(p.path, p.binding);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) walk(a[key], b[key], joinPath(path, key), ctx);
    return;
  }

  // Primitives, null, and every type mismatch (array↔object, object↔primitive,
  // present↔absent) land here: one comparison, one entry.
  if (a !== b) ctx.diffs.push({ path, left: a, right: b });
}

/**
 * Deep-compare two specs. `equal` is true iff no field differs; `diffs` lists
 * every field that does, in a deterministic order.
 */
export function structuralDiff(a: unknown, b: unknown): StructuralDiffResult {
  const ctx: Ctx = { diffs: [], notes: [], projected: new Map() };
  walk(a, b, '', ctx);
  return { equal: ctx.diffs.length === 0, diffs: ctx.diffs, normalized: ctx.notes.sort() };
}
