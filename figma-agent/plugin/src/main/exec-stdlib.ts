// The `ui.*` stdlib injected into EXEC_JS scripts as the wrapper's second parameter — so a
// script gets `ui.setProps(...)` etc. with no import. Every helper here either returns a
// VERIFIED result or throws (→ E_EVAL); a helper that returns without checking its own write
// took is exactly the silent-failure class this wave exists to kill (backlog 3.1/3.2/3.4/2.3/4.1).
//
// Reuse, do not re-implement (the repo's own rule — resolve-main-component.ts:1-10 exists
// because a second copy of ref-resolution was the mistake to avoid): variable-name resolution
// goes through resolveVariable, field binding through bindVariableToField, node serialization
// through serializeNode/jsonSafe. setProps/swapInstance (INSTANCE-shaped) live in
// exec-stdlib-instance.ts — this file crossed the repo's 200-line cap with them inline.
import { resolveVariable, bindVariableToField } from './executor-variables';
import {
  serializeNode, jsonSafe, SERIALIZED_NODE_FIELDS, type SerializedNode,
} from './serialize-node';
import { withCode } from './executor-styles';
import { readBindings } from './scan-node-utils';
import { resolvePropKey, setProps, swapInstance } from './exec-stdlib-instance';

export { resolvePropKey };

export interface ExecStdlib {
  setProps(inst: InstanceNode, props: Record<string, string | boolean>): Promise<Record<string, unknown>>;
  swapInstance(inst: InstanceNode, ref: string): Promise<{ id: string; mainComponent: { id: string; name: string } }>;
  boundFill(node: SceneNode, varName: string, field?: string): Promise<{ id: string; field: string; variable: string }>;
  byPath(rootId: string, names: string[]): Promise<SceneNode>;
  q(target: SceneNode | string, opts?: { depth?: number; fields?: string[] }): Promise<unknown>;
}

// Figma re-keys SOME bindings under a different boundVariables key than the field name asked
// for (cornerRadius → the four per-corner *Radius fields, VERIFIED on canvas) — but that
// re-keying is a KNOWN, closed set, never "any other field on the node". Searching every key
// a node carries would let a variable already bound to an UNRELATED field (e.g. strokes, when
// the caller asked for fills) false-verify a bind that never actually took.
//
// strokeWeight VERIFIED on canvas (2026-07-29): `setBoundVariable('strokeWeight', v)` surfaces
// as strokeTopWeight/strokeBottomWeight/strokeLeftWeight/strokeRightWeight in
// `node.boundVariables` — same per-side split as cornerRadius, so the row below is exact.
const BOUND_FIELD_EXPANSIONS: Record<string, readonly string[]> = {
  cornerRadius: ['cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'],
  strokeWeight: ['strokeWeight', 'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'],
};

function expansionKeysFor(field: string): readonly string[] {
  return BOUND_FIELD_EXPANSIONS[field] ?? [field];
}

async function boundFill(
  node: SceneNode,
  varName: string,
  field = 'fills',
): Promise<{ id: string; field: string; variable: string }> {
  const variable = await resolveVariable(varName);
  bindVariableToField(node, field, variable);
  // Verify through readBindings (scan-node-utils.ts) — the ONE shared field→variable-id reader
  // three other callers already depend on (the node-level join, the publish-key pre-pass, an
  // inner child's visual override). A binding this reader cannot see is a binding the reverse
  // walker cannot reattach either, so the "same eyes" rule applies here too: verifying through
  // a second, ad-hoc reader could pass a bind the walker would still call lost.
  const bindings = readBindings(node as unknown as Record<string, unknown>);
  const hit = expansionKeysFor(field).some((k) => bindings[k] === variable.id);
  if (!hit) {
    throw withCode(
      new Error(`bind of "${varName}" to ${field} did not take on "${node.name}" — bindings: ${JSON.stringify(bindings)}`),
      'E_EVAL',
    );
  }
  return { id: node.id, field, variable: variable.name };
}

async function byPath(rootId: string, names: string[]): Promise<SceneNode> {
  if (names.length === 0) throw withCode(new Error('byPath needs at least one name'), 'E_EVAL');
  const root = await figma.getNodeByIdAsync(rootId);
  if (!root || root.type === 'DOCUMENT' || root.type === 'PAGE') {
    throw withCode(new Error(`byPath root not found: ${rootId}`), 'E_EVAL');
  }
  // Walk to the owning PAGE and load it when it is not the current page — under
  // dynamic-page an unloaded page's children are not enumerable.
  let n: BaseNode | null = root;
  while (n && n.type !== 'PAGE') n = n.parent;
  const page = n as PageNode | null;
  if (page && page !== figma.currentPage) await page.loadAsync();

  let cur: BaseNode = root;
  for (const name of names) {
    if (!('children' in cur)) {
      throw withCode(new Error(`"${(cur as SceneNode).name}" (${cur.type}) has no children`), 'E_EVAL');
    }
    const children = (cur as BaseNode & ChildrenMixin).children as readonly SceneNode[];
    // `find` would silently pick the first of several same-named siblings — exactly the
    // wrong answer a fail-loud helper exists to prevent.
    const hits = children.filter((c) => c.name === name);
    if (hits.length === 0) {
      const names20 = children.slice(0, 20).map((c) => c.name).join(', ');
      throw withCode(new Error(`byPath: "${name}" not found under "${(cur as SceneNode).name}" — children: ${names20}`), 'E_EVAL');
    }
    if (hits.length > 1) {
      throw withCode(
        new Error(`byPath: "${name}" is ambiguous under "${(cur as SceneNode).name}" — ${hits.length} matches: ${hits.map((h) => h.id).join(', ')}`),
        'E_EVAL',
      );
    }
    cur = hits[0];
  }
  return cur as SceneNode;
}

function projectSerialized(node: SerializedNode, fields: readonly string[]): unknown {
  const out: Record<string, unknown> = { id: node.id };
  for (const f of fields) {
    if (f === 'children') {
      if (node.children) out.children = node.children.map((c) => projectSerialized(c, fields));
    } else {
      out[f] = (node as unknown as Record<string, unknown>)[f];
    }
  }
  return out;
}

async function q(target: SceneNode | string, opts: { depth?: number; fields?: string[] } = {}): Promise<unknown> {
  const { depth = 1, fields } = opts;
  let node: SceneNode;
  if (typeof target === 'string') {
    const found = await figma.getNodeByIdAsync(target);
    if (!found || found.type === 'DOCUMENT' || found.type === 'PAGE') {
      throw withCode(new Error(`q: node not found: ${target}`), 'E_EVAL');
    }
    node = found as SceneNode;
  } else {
    node = target;
  }
  if (fields) {
    for (const f of fields) {
      if (!SERIALIZED_NODE_FIELDS.has(f)) {
        throw withCode(
          new Error(`q: unknown field "${f}" on "${node.id}" — available: ${[...SERIALIZED_NODE_FIELDS].join(', ')}`),
          'E_EVAL',
        );
      }
    }
  }
  const full = serializeNode(node, depth);
  return jsonSafe(fields ? projectSerialized(full, fields) : full);
}

export function createExecStdlib(): ExecStdlib {
  return { setProps, swapInstance, boundFill, byPath, q };
}
