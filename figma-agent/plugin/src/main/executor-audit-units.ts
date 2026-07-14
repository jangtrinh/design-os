// Unit-subtree walk for AUDIT_DS — gathers the RAW structural material (structure /
// texts / paints) of ONE comparable unit (a set's variant child, or a standalone
// COMPONENT itself). No judgment: the CLI hashes and compares these arrays. Runs in the
// Figma plugin sandbox (browser platform, NO node APIs) so it stays hash-free here.
//
// Two rules baked in, each a real noise/cost bound on the 1.5k-master VSF file:
//  - INSTANCE children emit their own entry but are NOT recursed into (the composition is
//    captured by the entry; recursing would re-serialize whole nested components as noise).
//  - Hard caps (nodes / depth / text) with a literal '…capped' marker keep the walk bounded
//    AND the resulting hash deterministic (an elided subtree always hashes the same).
import type { AuditUnitFact } from '../../../shared/audit-types';

const MAX_UNIT_NODES = 300; // total nodes visited per unit
const MAX_UNIT_DEPTH = 10; // deepest level we descend into
const MAX_UNIT_TEXT = 2000; // total characters of TEXT collected per unit
const CAPPED = '…capped'; // deterministic marker pushed when a cap is hit

/** rgb float (0..1) → 2-digit lowercase hex, clamped. */
function hex2(c: number): string {
  const v = Math.max(0, Math.min(255, Math.round(c * 255)));
  return v.toString(16).padStart(2, '0');
}

/** One paint → fingerprint. SOLID: bound var id, else `#rrggbb` (+`@0.50` when opacity<1);
 *  any other paint type: the type name only. `prefix` is 'f' (fills) or 's' (strokes). */
function paintFingerprint(prefix: 'f' | 's', p: Paint): string {
  if (p.type === 'SOLID') {
    const bound = p.boundVariables?.color;
    if (bound) return `${prefix}:var:${bound.id}`;
    let s = `${prefix}:#${hex2(p.color.r)}${hex2(p.color.g)}${hex2(p.color.b)}`;
    if (typeof p.opacity === 'number' && p.opacity < 1) s += `@${p.opacity.toFixed(2)}`;
    return s;
  }
  return `${prefix}:${p.type}`;
}

/** Mutable accumulator threaded through the recursive walk. */
interface WalkState {
  structure: string[];
  texts: string[];
  paints: string[];
  nodes: number;
  textLen: number;
  cappedNodes: boolean;
  cappedText: boolean;
}

/** Append SOLID/other paint fingerprints for one node's fills + strokes (never throws). */
function collectPaints(node: SceneNode, st: WalkState): void {
  for (const field of ['fills', 'strokes'] as const) {
    if (!(field in node)) continue;
    let paints: unknown;
    try {
      paints = (node as unknown as Record<string, unknown>)[field];
    } catch {
      continue; // reading the field threw
    }
    if (!Array.isArray(paints)) continue; // figma.mixed (a symbol) or missing → nothing to fingerprint
    const prefix = field === 'fills' ? 'f' : 's';
    for (const p of paints as Paint[]) st.paints.push(paintFingerprint(prefix, p));
  }
}

/** Depth-first walk: emit a structure entry per node, collect TEXT + paints, honour the caps. */
function walk(node: SceneNode, depth: number, isRoot: boolean, st: WalkState): void {
  if (st.cappedNodes) return;
  if (st.nodes >= MAX_UNIT_NODES) {
    st.structure.push(CAPPED);
    st.cappedNodes = true;
    return;
  }
  st.nodes++;

  let w = 0;
  let h = 0;
  try {
    w = Math.round(node.width);
    h = Math.round(node.height);
  } catch {
    w = 0;
    h = 0;
  }
  // ROOT entry is deliberately nameless so identical content under different top names still matches.
  st.structure.push(`${depth}:${node.type}:${isRoot ? '' : node.name}:${w}x${h}`);

  if (node.type === 'TEXT') {
    try {
      const chars = (node as TextNode).characters;
      if (!st.cappedText) {
        if (st.textLen + chars.length > MAX_UNIT_TEXT) {
          st.texts.push(CAPPED);
          st.cappedText = true;
        } else {
          st.texts.push(chars);
          st.textLen += chars.length;
        }
      }
    } catch {
      /* characters unreadable on this node */
    }
  }

  collectPaints(node, st);

  // Composition captured — do NOT descend into an instance, and never past the depth cap.
  if (node.type === 'INSTANCE') return;
  if (depth >= MAX_UNIT_DEPTH) return;
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      if (st.cappedNodes) break;
      walk(child as SceneNode, depth + 1, false, st);
    }
  }
}

/** Build the raw unit fact for `node` (usageCount is stamped by the caller, not here). */
export function unitFact(node: SceneNode): Omit<AuditUnitFact, 'usageCount'> {
  const st: WalkState = {
    structure: [], texts: [], paints: [], nodes: 0, textLen: 0, cappedNodes: false, cappedText: false,
  };
  walk(node, 0, true, st);
  return { id: node.id, name: node.name, structure: st.structure, texts: st.texts, paints: st.paints };
}
