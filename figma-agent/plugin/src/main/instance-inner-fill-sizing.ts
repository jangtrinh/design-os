// spec-005 P14 — the inner-override fields Figma REFUSES to register on a child it
// sizes ITSELF, and the geometry that keeps dropping them honest.
//
// PROVEN on the live canvas (P13's probe, re-run in P14 against 25576:542578): the
// inner child `Slot / Page content` is FILL/FILL inside its auto-layout parent and
// carries `width`/`height` in `overrides[].overriddenFields`. A rebuild replays them
// with `resize()` — and Figma answers with a SILENT no-op: the child stays at the
// size auto-layout computed, nothing throws, and no width/height override is
// registered. The original therefore reports five overridden fields where the
// rebuilt twin reports three, forever.
//
// This is the maxWidth-on-TEXT shape again (P9), one layer in: the VALUE is not lost
// — on a FILL child `child.width` IS auto-layout's output, so the number the scan
// records as the "override" and the number the rebuild computes are the same
// measurement of the same thing. What cannot be reproduced is Figma's "this was SET"
// bit, which the API offers no way to write on a FILL child.
//
// WHY THE SIZE IS EMITTED TOO. Charging that flag to Figma is only honest if the
// geometry really does match; a normalizer that took it on faith would hide a real
// lost pixel the first time one appeared. So the scan records the FILL axes' MEASURED
// size on BOTH sides — the rebuild's child is FILL too, and its entry survives on its
// other overridden fields — and the diff compares those numbers like any other. The
// flag is forgiven; the geometry is still checked, by the same machinery as
// everything else. Drop the flag, keep the measurement.

import { innerChildKey, innerOverrideEntries, keyInnerChildren } from './instance-inner-override-keys';
import { r2, safe } from './scan-node-utils';

/** Sizing field → the axis whose measurement it names. */
const AXIS_OF: Readonly<Record<string, string>> = {
  width: 'layoutSizingHorizontal',
  height: 'layoutSizingVertical',
};

/** True when auto-layout — not the override — decides this child's `field`. */
function isFilledAxis(child: Record<string, unknown>, field: string): boolean {
  const axis = AXIS_OF[field];
  return axis !== undefined && safe(() => child[axis]) === 'FILL';
}

/**
 * The subset of `fields` this child provably cannot have replayed, sorted
 * (deterministic output — Art VI).
 *
 * ONLY width/height, and ONLY on an axis the child FILLs. A FIXED child's width
 * override is reproducible — `resize()` takes — and must keep failing the gate if we
 * ever lose it. Guessing wider here would invent a refusal Figma never made.
 */
export function unreproducibleInnerFields(
  child: Record<string, unknown>,
  fields: Iterable<string>,
): string[] {
  return [...fields].filter((f) => isFilledAxis(child, f)).sort();
}

/**
 * The child's MEASURED size on the axes it FILLs — the geometry guard described in
 * the header, emitted whenever an axis is FILL, independently of what Figma named as
 * overridden. That independence is the point: the rebuild's twin is FILL too but has
 * no width/height override, so a size read off the override report alone would exist
 * on one side only and could never be compared.
 *
 * `r2` for the same reason every other dimension gets it: a rescan must compare
 * equal, not drift in the sub-pixel tail.
 */
export function readFillSize(
  child: Record<string, unknown>,
): { width?: number; height?: number } | undefined {
  const out: { width?: number; height?: number } = {};
  for (const field of ['height', 'width']) {
    if (!isFilledAxis(child, field)) continue;
    const v = safe(() => child[field]);
    if (typeof v === 'number' && Number.isFinite(v)) out[field as 'width' | 'height'] = r2(v);
  }
  return out.width !== undefined || out.height !== undefined ? out : undefined;
}

/**
 * The subset of `readInnerOverrideFields`' flat total that NO rebuild can reproduce.
 *
 * Instance-level, because `figmaScanInnerOverrides` is: it unions field NAMES across
 * every inner child, so a name may only be charged to Figma when EVERY child that
 * overrides it is refused. One FIXED child with a real, reproducible `width` override
 * keeps `width` off this list — and keeps failing the gate if we ever lose it, which
 * is the entire reason this is a tally and not a filter.
 *
 * A child the key cannot reach counts as NOT refused: we did not see it, so we do not
 * get to speak for it. Fail-safe, the same stance as the addressing it stands on.
 */
export function readUnreproducibleInnerFields(
  n: Record<string, unknown>,
  selfId: string,
): string[] {
  const byKey = keyInnerChildren(n, selfId);
  const tally = new Map<string, { named: number; refused: number }>();
  for (const o of innerOverrideEntries(n, selfId)) {
    const key = typeof o.id === 'string' ? innerChildKey(selfId, o.id) : undefined;
    const child = key !== undefined ? byKey.get(key) : undefined;
    const named = o.overriddenFields ?? [];
    const refused = new Set(child ? unreproducibleInnerFields(child, named) : []);
    for (const f of named) {
      const t = tally.get(f) ?? { named: 0, refused: 0 };
      t.named += 1;
      if (refused.has(f)) t.refused += 1;
      tally.set(f, t);
    }
  }
  return [...tally.entries()]
    .filter(([, t]) => t.named === t.refused)
    .map(([f]) => f)
    .sort();
}
