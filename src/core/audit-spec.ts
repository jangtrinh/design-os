/**
 * Audit DS-spec parsing — turn a DTCG token file + a component registry into
 * the compact lookup surface the deterministic violation detector needs.
 *
 * TOLERANT by design: a spec file with an unrelated issue must not crash an
 * audit, so malformed leaves/records are skipped rather than thrown on. This
 * mirrors taste-lint's token-hex harvest. Zero I/O, zero model calls — the
 * whole audit is a pure, reproducible transform of its JSON inputs.
 */
import { isTokenLeaf } from "./token-model.js";

/** The compact spec the detector consults; all lookups are by value or NAME. */
export interface AuditSpec {
  /** normalized `#rrggbb` → the token path that owns it (deterministic pick). */
  colorTokens: Map<string, string>;
  /** Every component NAME registered in the DS. */
  componentNames: Set<string>;
  /** Component NAMES flagged deprecated in the registry. */
  deprecated: Set<string>;
  /** True when the DS registers an Icon component (enables raw-icon-vs-Icon). */
  hasIconComponent: boolean;
  /** Base grid for off-grid radius/spacing checks (default 4). */
  gridBase: number;
}

/** Normalize a hex string to lower-case `#rrggbb`, or null if not a hex. */
export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(raw.trim());
  if (!m) return null;
  let h = (m[1] ?? "").toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

/**
 * Walk a parsed DTCG token tree collecting hex → dotted-path. When two paths
 * share one hex the lexicographically-smaller path wins (deterministic, not
 * file-order-dependent — ids/positions drift, names do not).
 */
function collectColorTokens(node: unknown, path: string, out: Map<string, string>): void {
  if (node === null || typeof node !== "object") return;
  if (isTokenLeaf(node)) {
    const val = (node as { $value: unknown }).$value;
    const hex = normalizeHex(val);
    if (hex !== null) {
      const existing = out.get(hex);
      if (existing === undefined || path < existing) out.set(hex, path);
    }
    return;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    collectColorTokens(v, path === "" ? k : `${path}.${k}`, out);
  }
}

/** Build the color-token map from an already-JSON-parsed token file (tolerant). */
export function colorTokensFrom(parsed: unknown): Map<string, string> {
  const out = new Map<string, string>();
  collectColorTokens(parsed, "", out);
  return out;
}

/**
 * Build the component surface from an already-JSON-parsed registry (tolerant).
 * Accepts the standard `{components:[{name,category,deprecated?}]}` shape; a
 * component is deprecated when `deprecated === true`. An Icon component is one
 * whose name or category starts with "Icon".
 */
export function registryFrom(parsed: unknown): {
  componentNames: Set<string>;
  deprecated: Set<string>;
  hasIconComponent: boolean;
} {
  const componentNames = new Set<string>();
  const deprecated = new Set<string>();
  let hasIconComponent = false;

  const comps = (parsed as { components?: unknown } | null)?.components;
  if (Array.isArray(comps)) {
    for (const c of comps) {
      if (c === null || typeof c !== "object") continue;
      const rec = c as Record<string, unknown>;
      const name = rec["name"];
      if (typeof name !== "string" || name.length === 0) continue;
      componentNames.add(name);
      if (rec["deprecated"] === true) deprecated.add(name);
      const category = typeof rec["category"] === "string" ? rec["category"] : "";
      if (name.startsWith("Icon") || category.startsWith("Icon")) hasIconComponent = true;
    }
  }
  return { componentNames, deprecated, hasIconComponent };
}

/** Assemble the full AuditSpec from optional parsed inputs + a grid base. */
export function buildAuditSpec(opts: {
  tokens?: unknown;
  registry?: unknown;
  gridBase?: number;
}): AuditSpec {
  const colorTokens = opts.tokens !== undefined ? colorTokensFrom(opts.tokens) : new Map<string, string>();
  const reg =
    opts.registry !== undefined
      ? registryFrom(opts.registry)
      : { componentNames: new Set<string>(), deprecated: new Set<string>(), hasIconComponent: false };
  return {
    colorTokens,
    componentNames: reg.componentNames,
    deprecated: reg.deprecated,
    hasIconComponent: reg.hasIconComponent,
    gridBase: opts.gridBase !== undefined && opts.gridBase > 0 ? opts.gridBase : 4,
  };
}
