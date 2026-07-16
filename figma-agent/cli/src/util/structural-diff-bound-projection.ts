// The mirror linter's PROJECTION layer (spec-005 P17) — why a BOUND value's literal
// is not data, and must not be diffed.
//
// THE BUG THIS CLOSES (live, probed on the P16 gate). The inner child `…;5198:1124`
// carries a paint bound to `VariableID:5140:17717` (`base/sidebar-foreground`). The
// binding is IDENTICAL on both sides — the round-trip carried it perfectly. Yet the
// literal colour the two scans recorded differs (`r=0` on the original, `r=0.0392` on
// the rebuild), because the rebuild sits in a different variable-MODE context and a
// bound value resolves per mode. The diff called that data loss. It is the opposite:
// the one field that WAS carried is the one it flagged.
//
// THE RULE. For a field whose binding MATCHES on both sides, the literal is only the
// projection of that binding into whichever mode the scan happened to run in — so the
// binding is compared (it always was: `figmaScanBindings` / `keyedBindings` are fields
// like any other) and the literal is not. Every other case keeps the literal, because
// there the literal IS the data:
//   - unbound on both sides            → literal compared (the only record there is)
//   - bound on one side only           → binding lost/gained → the diff stands
//   - bound both sides, DIFFERENT ids  → a different variable → the diff stands
// The gate never got quieter by forgetting a field: it stopped reading a projection as
// a fact.
//
// AND IT IS SAID OUT LOUD. Every skipped literal that ACTUALLY differed is reported in
// the diff's `normalized` list, by path, with the binding that made it a projection —
// so `equal: true` never hides a colour change (see structural-diff).
//
// WHAT THIS DELIBERATELY DOES NOT DO: a multi-paint `fills` array. The walker records
// ONE binding per field (`readBindings` takes the first bound paint's colour), so with
// two paints nothing in the spec says WHICH one it names — and skipping both literals
// could forgive a real loss on the unbound sibling. Those keep positional literal
// comparison: a false red is a bug report, a false green is a lie.

/** A plain object — same stance as structural-diff (walks JSON, not the type). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const asRec = (v: unknown): Record<string, unknown> | undefined =>
  (isPlainObject(v) ? v : undefined);

/** `path` + a key, honouring the root case (no leading dot) — mirrors structural-diff. */
const joinPath = (path: string, key: string): string => (path ? `${path}.${key}` : key);

/** Paint arrays: bound through the paint's own `boundVariables.color`, not the node's. */
const PAINT_FIELDS = ['fills', 'strokes'];

/** The publish key the walker resolved for `field`, if it reached the variable. */
function keyOf(spec: Record<string, unknown>, field: string): string | undefined {
  const key = asRec(asRec(spec.keyedBindings)?.[field])?.key;
  return typeof key === 'string' && key ? key : undefined;
}

/** The raw variable id the walker read off `field` — present for every binding. */
function idOf(spec: Record<string, unknown>, field: string): string | undefined {
  const id = asRec(spec.figmaScanBindings)?.[field];
  return typeof id === 'string' && id ? id : undefined;
}

/**
 * How the two sides' bindings on `field` agree, as a human-readable identity — or
 * undefined when they do not agree, or when either side is unbound.
 *
 * The publish KEY is asked first because it survives the join the rebuild does (a
 * variable imported by key into another file gets a NEW id but keeps its key), and
 * the raw id answers for every binding the walker could not resolve to a key. An
 * unbound side never matches, which is the whole guard: only a binding that provably
 * travelled makes its literal a projection.
 */
function matchingBinding(
  a: Record<string, unknown>, b: Record<string, unknown>, field: string,
): string | undefined {
  const ka = keyOf(a, field);
  const kb = keyOf(b, field);
  if (ka && kb) return ka === kb ? `the variable published as ${ka}` : undefined;
  const ia = idOf(a, field);
  const ib = idOf(b, field);
  if (ia && ib) return ia === ib ? ia : undefined;
  return undefined;
}

const typeOf = (paint: unknown): unknown => asRec(paint)?.type;

/** Skippable iff exactly one paint per side and both SOLID — see the header. */
function soleSolidPaint(a: unknown, b: unknown): boolean {
  return Array.isArray(a) && Array.isArray(b) && a.length === 1 && b.length === 1
    && typeOf(a[0]) === 'SOLID' && typeOf(b[0]) === 'SOLID';
}

const isLiteral = (v: unknown): boolean =>
  typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';

export interface ProjectedPath {
  /** Absolute JSON path of the literal that is only a projection. */
  path: string;
  /** The binding that makes it one — quoted back in the `normalized` note. */
  binding: string;
}

/**
 * Every literal under `a`/`b` that is a mode projection of a binding both sides share,
 * as absolute paths for the caller to skip.
 *
 * Works on ANY object carrying a binding record — a scanned node (`figmaScanBindings`)
 * and an inner child's overridden visual layer (`keyedBindings` only) are the same
 * shape to this rule, so neither is special-cased.
 */
export function boundProjectedPaths(
  a: unknown, b: unknown, path: string,
): ProjectedPath[] {
  const specA = asRec(a);
  const specB = asRec(b);
  if (!specA || !specB) return [];
  const out: ProjectedPath[] = [];

  for (const field of PAINT_FIELDS) {
    const binding = matchingBinding(specA, specB, field);
    if (!binding) continue;
    if (!soleSolidPaint(specA[field], specB[field])) continue;
    out.push({ path: `${joinPath(path, field)}[0].color`, binding });
    // TEXT's `textColor` is the walker's own copy of `fills[0].color` (scan-node-text),
    // so it is the same projection read twice — forgiving one and not the other would
    // leave the identical false red on every bound TEXT node.
    if (field === 'fills' && asRec(specA.textColor) && asRec(specB.textColor)) {
      out.push({ path: joinPath(path, 'textColor'), binding });
    }
  }

  // Scalar bindings (cornerRadius, itemSpacing, padding…) resolve per mode by the same
  // mechanism, and their binding names the field 1:1 — no "which paint" ambiguity to
  // guard against, so the same rule applies with no extra condition.
  const bound = asRec(specA.figmaScanBindings) ?? {};
  for (const field of Object.keys(bound).sort()) {
    if (PAINT_FIELDS.includes(field)) continue;
    if (!isLiteral(specA[field]) || !isLiteral(specB[field])) continue;
    const binding = matchingBinding(specA, specB, field);
    if (!binding) continue;
    out.push({ path: joinPath(path, field), binding });
  }
  return out;
}
