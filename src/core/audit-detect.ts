/**
 * Deterministic DS-violation detector — the zero-token core of `ui audit`.
 *
 * Input: a structured node export (a Figma node tree serialized to JSON) + an
 * AuditSpec (tokens + registry, from audit-spec.ts). Output: violations keyed by
 * node NAME (ids drift on sync; names are the stable key — canvas-operations R2)
 * with per-rule counts, plus a remap table the canvas normalize step applies.
 *
 * The model never reasons about violations — this pure function does. The canvas
 * edits (clone → fix-in-order → re-audit → tag) are the hand, in the workflow.
 */
import type { AuditSpec } from "./audit-spec.js";
import { normalizeHex } from "./audit-spec.js";

/** The five DS-violation families (the closed rule set). */
export type AuditRule =
  | "raw-hex-vs-token"
  | "detached-instance"
  | "raw-icon-vs-Icon"
  | "off-grid"
  | "deprecated-component";

export const AUDIT_RULES: readonly AuditRule[] = [
  "raw-hex-vs-token",
  "detached-instance",
  "raw-icon-vs-Icon",
  "off-grid",
  "deprecated-component",
];

/** One solid fill on a node. `boundToken` present ⇒ already token-bound. */
export interface AuditFill {
  type?: string;
  hex?: string;
  boundToken?: string;
}

/** One node in the structured export. Tolerant: absent fields skip their check. */
export interface AuditNode {
  name?: string;
  type?: string;
  fills?: AuditFill[];
  cornerRadius?: number;
  itemSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  /** For INSTANCE nodes: the component NAME this instantiates. */
  mainComponent?: string;
  /** Node was detached from its component. */
  detached?: boolean;
  /** Semantic hint that this node is an icon. */
  role?: string;
  /** TEXT content — icon-font glyphs here mark a raw icon. */
  characters?: string;
  children?: AuditNode[];
}

export interface Violation {
  rule: AuditRule;
  nodeName: string;
  detail: string;
}

export interface Remap {
  kind: "color" | "radius" | "spacing";
  nodeName: string;
  from: string;
  to: string;
}

export interface AuditResult {
  violations: Violation[];
  counts: Record<AuditRule, number>;
  total: number;
  remap: Remap[];
}

// Corner radii at/above this are treated as intentional pill/full radii and
// exempt from the off-grid check (matches construction lint L11's 999 pill).
const PILL_RADIUS_MIN = 100;

// Generic/default Figma node names (case-insensitive, exact-match). A frame that
// still carries one of these is UNNAMED in intent — it must never be flagged as a
// detached-instance just because a junk registry component happens to share the
// name (e.g. a component literally named "Frame"). Numbered defaults like
// "Frame 12" / "Component 3" are covered by the `<word> <n>` pattern below.
const GENERIC_NODE_NAMES = new Set<string>([
  "frame",
  "group",
  "rectangle",
  "ellipse",
  "vector",
  "line",
  "component",
  "instance",
  "slice",
  "union",
  "subtract",
  "intersect",
  "exclude",
]);

/** True when a name is a generic/default Figma name (exact or numbered default). */
function isGenericName(name: string): boolean {
  const t = name.trim().toLowerCase();
  if (GENERIC_NODE_NAMES.has(t)) return true;
  const m = /^([a-z]+) \d+$/.exec(t); // numbered default: "Frame 12", "Component 3"
  return m !== null && GENERIC_NODE_NAMES.has(m[1] ?? "");
}

/** True when a TEXT node's characters are icon-font glyphs (private-use area). */
function isIconGlyphs(chars: string | undefined): boolean {
  if (chars === undefined || chars.length === 0) return false;
  for (const ch of chars) {
    const cp = ch.codePointAt(0) ?? 0;
    // Skip whitespace; every non-space char must sit in a private-use range.
    if (ch.trim() === "") continue;
    const priv =
      (cp >= 0xe000 && cp <= 0xf8ff) || // BMP private use
      (cp >= 0xf0000 && cp <= 0xffffd) || // plane 15
      (cp >= 0x100000 && cp <= 0x10fffd); // plane 16
    if (!priv) return false;
  }
  return true;
}

/** Nearest multiple of base (ties round up), for the off-grid remap target. */
function snapToGrid(value: number, base: number): number {
  return Math.round(value / base) * base;
}

function checkNode(node: AuditNode, spec: AuditSpec, v: Violation[], r: Remap[]): void {
  const name = typeof node.name === "string" && node.name.length > 0 ? node.name : "(unnamed)";
  const type = node.type ?? "";

  // 1. raw-hex-vs-token — an unbound solid fill whose hex IS a DS token.
  for (const fill of node.fills ?? []) {
    if (fill.boundToken !== undefined && fill.boundToken !== "") continue;
    const hex = normalizeHex(fill.hex);
    if (hex === null) continue;
    const path = spec.colorTokens.get(hex);
    if (path !== undefined) {
      v.push({ rule: "raw-hex-vs-token", nodeName: name, detail: `raw ${hex} should bind token ${path}` });
      r.push({ kind: "color", nodeName: name, from: hex, to: path });
    }
  }

  // 2. detached-instance — detached flag, or a lookalike frame named like a
  //    registered component but not actually an INSTANCE.
  if (node.detached === true) {
    v.push({ rule: "detached-instance", nodeName: name, detail: "node is a detached instance" });
  } else if (
    type !== "INSTANCE" &&
    type !== "COMPONENT" &&
    type !== "COMPONENT_SET" &&
    spec.componentNames.has(name) &&
    // Skip when the node's name (== the matched component's name, exact-match) is a
    // generic/default Figma name: a frame named "Frame" is not a real lookalike.
    !isGenericName(name)
  ) {
    v.push({ rule: "detached-instance", nodeName: name, detail: `${type || "node"} named like component '${name}' but is not an INSTANCE` });
  }

  // 3. raw-icon-vs-Icon — only when the DS actually has an Icon component.
  if (spec.hasIconComponent && type !== "INSTANCE") {
    const isIcon = node.role === "icon" || (type === "TEXT" && isIconGlyphs(node.characters));
    if (isIcon) {
      v.push({ rule: "raw-icon-vs-Icon", nodeName: name, detail: "raw icon should be an Icon component instance" });
    }
  }

  // 4. off-grid — radius + spacing that is BOTH off the base grid AND not a real DS
  //    token value. With --tokens, a value present in the DS radius/spacing scale
  //    (e.g. radius 9 = sm) is valid even when it isn't a grid multiple. Without
  //    --tokens the token sets are empty, so this is pure grid-multiple behavior.
  if (typeof node.cornerRadius === "number" && node.cornerRadius > 0 && node.cornerRadius < PILL_RADIUS_MIN) {
    if (node.cornerRadius % spec.gridBase !== 0 && !spec.radiusTokens.has(node.cornerRadius)) {
      const to = snapToGrid(node.cornerRadius, spec.gridBase);
      v.push({ rule: "off-grid", nodeName: name, detail: `cornerRadius ${node.cornerRadius} off the ${spec.gridBase}px grid` });
      r.push({ kind: "radius", nodeName: name, from: String(node.cornerRadius), to: String(to) });
    }
  }
  const spacings: Array<[string, number | undefined]> = [
    ["itemSpacing", node.itemSpacing],
    ["paddingTop", node.paddingTop],
    ["paddingRight", node.paddingRight],
    ["paddingBottom", node.paddingBottom],
    ["paddingLeft", node.paddingLeft],
  ];
  for (const [prop, value] of spacings) {
    if (typeof value === "number" && value > 0 && value % spec.gridBase !== 0 && !spec.spacingTokens.has(value)) {
      const to = snapToGrid(value, spec.gridBase);
      v.push({ rule: "off-grid", nodeName: name, detail: `${prop} ${value} off the ${spec.gridBase}px grid` });
      r.push({ kind: "spacing", nodeName: name, from: String(value), to: String(to) });
    }
  }

  // 5. deprecated-component — an instance of a registry-deprecated component.
  if (type === "INSTANCE" && typeof node.mainComponent === "string" && spec.deprecated.has(node.mainComponent)) {
    v.push({ rule: "deprecated-component", nodeName: name, detail: `instance of deprecated component '${node.mainComponent}'` });
  }
}

/**
 * Detect all DS violations across a node tree (depth-first, array order —
 * SECTION/children recurse so a full-page sweep misses nothing, R6). Pure.
 */
export function detectViolations(root: AuditNode | AuditNode[], spec: AuditSpec): AuditResult {
  const violations: Violation[] = [];
  const remap: Remap[] = [];
  // DFS preserving document order (children visited in array order) so a
  // full-page sweep reaches every frame nested inside SECTION nodes (R6).
  const walk = (nodes: AuditNode[]): void => {
    for (const n of nodes) {
      if (n === null || typeof n !== "object") continue;
      checkNode(n, spec, violations, remap);
      if (Array.isArray(n.children)) walk(n.children);
    }
  };
  walk(Array.isArray(root) ? root : [root]);

  const counts = Object.fromEntries(AUDIT_RULES.map((rule) => [rule, 0])) as Record<AuditRule, number>;
  for (const viol of violations) counts[viol.rule]++;

  return { violations, counts, total: violations.length, remap };
}
