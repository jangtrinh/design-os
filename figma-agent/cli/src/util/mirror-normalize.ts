// spec-005 P9/P14 — the mirror's concessions, and the rules that keep them honest.
//
// TWO of them now, one shape: a field Figma's own API will not let ANY rebuild carry.
// P9 found it in a binding (`maxWidth` on TEXT); P14 found it in an inner-override
// FLAG (width/height on a child auto-layout sizes — `resize()` there is a silent
// no-op). Both obey the same three rules below, and both are reported out loud.
//
// THE PROBLEM: the live footer text 25575:354192 carries a real
// `boundVariables.maxWidth`, authored through Figma's UI. `setBoundVariable` on a
// TEXT node refuses that field outright (proven live — see
// shared/figma-unbindable-fields), so no rebuild can ever carry it. Left alone, the
// gate reported two diffs (`figmaScanBindings.maxWidth`, `keyedBindings.maxWidth`)
// that NO change to this repo could close: a permanently red gate, which is a gate
// nobody reads.
//
// THE RULE: the diff ignores a binding ONLY where the SCAN ITSELF declared Figma
// refused it — `figmaScanUnbindable`, emitted by the walker that saw the node. The
// CLI hardcodes no field list of its own: if the walker did not name the refusal,
// the diff stands. So this can never quietly grow into "ignore the fields that are
// failing today".
//
// AND IT IS SAID OUT LOUD: every dropped field is reported in the gate's
// `normalized` list, by path. `equal: true` with a normalized entry means "reversible
// as far as Figma's API allows, and here is exactly what it would not allow" — never
// a silent pass.

/** A scanned spec, walked as plain JSON (same stance as structural-diff). */
type Spec = Record<string, unknown>;

const asSpec = (v: unknown): Spec | undefined =>
  (typeof v === 'object' && v !== null && !Array.isArray(v)) ? (v as Spec) : undefined;

const childrenOf = (spec: Spec): Spec[] =>
  Array.isArray(spec.children) ? spec.children.map(asSpec).filter((c): c is Spec => !!c) : [];

const refusedBy = (spec: Spec): string[] =>
  Array.isArray(spec.figmaScanUnbindable)
    ? spec.figmaScanUnbindable.filter((f): f is string => typeof f === 'string')
    : [];

/** `path` + a key, honouring the root case (no leading dot) — mirrors structural-diff. */
const joinPath = (path: string, key: string): string => (path ? `${path}.${key}` : key);

/**
 * Drop every binding the walker recorded as refused by Figma, on both specs.
 *
 * Removes the `figmaScanUnbindable` marker itself AND the matching raw ids from
 * `figmaScanBindings`. Both must go: the ORIGINAL carries them and the rebuild
 * cannot, so leaving either behind reproduces the very diff this closes.
 *
 * Applied to BOTH sides symmetrically — never "make left look like right". A rebuild
 * that somehow DID carry the binding would keep its own `figmaScanBindings` entry
 * (no marker of its own to strip it), and the diff would fire. Pure: the input spec
 * is copied, never mutated.
 */
export function stripUnbindableBindings<T>(spec: T): T {
  const node = asSpec(spec);
  if (!node) return spec;
  const out: Spec = { ...node };

  const refused = refusedBy(out);
  if (refused.length) {
    delete out.figmaScanUnbindable;
    const bindings = asSpec(out.figmaScanBindings);
    if (bindings) {
      const kept = { ...bindings };
      for (const field of refused) delete kept[field];
      if (Object.keys(kept).length) out.figmaScanBindings = kept;
      else delete out.figmaScanBindings;
    }
  }

  if (Array.isArray(out.children)) {
    out.children = out.children.map((child) => stripUnbindableBindings(child));
  }
  return out as T;
}

const refusedInnerBy = (spec: Spec): string[] =>
  Array.isArray(spec.figmaScanUnreproducibleInner)
    ? spec.figmaScanUnreproducibleInner.filter((f): f is string => typeof f === 'string')
    : [];

/**
 * Drop every inner-override FLAG the walker recorded as unreproducible (P14), on both
 * specs: the name from `figmaScanInnerOverrides`, and the value from every
 * `innerOverrides[].fields`.
 *
 * BOTH must go, for the mirrored reason P9's do: the ORIGINAL carries the flag and the
 * rebuild cannot, so leaving either behind reproduces the diff this closes.
 *
 * WHAT IS NOT DROPPED — and this is the guard, not a detail. `figmaScanFillSize`
 * stays: the child's MEASURED size on those very axes, emitted by both scans, diffed
 * like any other field. So this forgives Figma's "was SET" bit and nothing else — a
 * FILL child that actually rebuilt at the wrong size still fails the gate, on the
 * measurement. Symmetric and pure, exactly like stripUnbindableBindings.
 */
export function stripUnreproducibleInnerFields<T>(spec: T): T {
  const node = asSpec(spec);
  if (!node) return spec;
  const out: Spec = { ...node };

  const refused = refusedInnerBy(out);
  if (refused.length) {
    delete out.figmaScanUnreproducibleInner;
    if (Array.isArray(out.figmaScanInnerOverrides)) {
      const kept = out.figmaScanInnerOverrides.filter((f) => !refused.includes(f as string));
      if (kept.length) out.figmaScanInnerOverrides = kept;
      else delete out.figmaScanInnerOverrides;
    }
    if (Array.isArray(out.innerOverrides)) {
      out.innerOverrides = out.innerOverrides.map((entry) => {
        const e = asSpec(entry);
        const fields = e && asSpec(e.fields);
        if (!e || !fields) return entry;
        const keptFields = { ...fields };
        for (const field of refused) delete keptFields[field];
        return { ...e, fields: keptFields };
      });
    }
  }

  if (Array.isArray(out.children)) {
    out.children = out.children.map((child) => stripUnreproducibleInnerFields(child));
  }
  return out as T;
}

/**
 * What stripUnbindableBindings removed, as gate-readable lines — one per refused
 * field, addressed by the same JSON path convention the diffs use, so a reader can
 * line them up against `diffs` without a decoder ring.
 */
export function unbindableNotes(spec: unknown, path = ''): string[] {
  const node = asSpec(spec);
  if (!node) return [];
  const out: string[] = [];
  for (const field of refusedBy(node)) {
    const where = joinPath(path, `figmaScanBindings.${field}`);
    out.push(`${where} — Figma's Plugin API refuses to bind '${field}' on a ${String(node.type)} node; no rebuild can carry it`);
  }
  childrenOf(node).forEach((child, i) => {
    out.push(...unbindableNotes(child, `${joinPath(path, 'children')}[${i}]`));
  });
  return out;
}

/**
 * The P14 twin of unbindableNotes: what stripUnreproducibleInnerFields removed, by
 * path — and, crucially, what is still being checked in its place, so `equal: true`
 * never reads as "the size was forgiven too".
 */
export function unreproducibleInnerNotes(spec: unknown, path = ''): string[] {
  const node = asSpec(spec);
  if (!node) return [];
  const out: string[] = [];
  for (const field of refusedInnerBy(node)) {
    const where = joinPath(path, `figmaScanInnerOverrides.${field}`);
    out.push(`${where} — '${field}' is overridden only on inner children their auto-layout parent sizes (FILL); Figma registers no such override on a rebuild (resize() is a silent no-op there), so the flag cannot be carried. The measured size still is, and is still compared: innerOverrides[].figmaScanFillSize`);
  }
  childrenOf(node).forEach((child, i) => {
    out.push(...unreproducibleInnerNotes(child, `${joinPath(path, 'children')}[${i}]`));
  });
  return out;
}
