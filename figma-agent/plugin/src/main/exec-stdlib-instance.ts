// INSTANCE-shaped ui.* helpers, split out of exec-stdlib.ts to stay under the repo's
// 200-line module cap (backlog 3.1/3.2). Reuse, do not re-implement: component-ref
// resolution goes through resolveMainComponent (resolve-main-component.ts:1-10) — a
// second copy of ref-resolution here would be the mistake that module exists to avoid.
import { resolveMainComponent } from './resolve-main-component';
import { withCode } from './executor-styles';

/**
 * PURE — exported for unit tests: base name → the instance's actual `Name#12:34` key.
 * Exact hit wins; else the unique key that `startsWith(name + '#')`. Never guesses: 0 or
 * ≥2 candidates both throw, listing what IS there so the caller can correct the call.
 */
export function resolvePropKey(keys: readonly string[], name: string): string {
  if (keys.includes(name)) return name;
  const matches = keys.filter((k) => k.startsWith(`${name}#`));
  if (matches.length === 0) {
    throw new Error(`property "${name}" not found — available: ${keys.join(', ')}`);
  }
  if (matches.length > 1) {
    throw new Error(`property "${name}" is ambiguous: ${matches.join(', ')}`);
  }
  return matches[0];
}

export async function setProps(
  inst: InstanceNode,
  props: Record<string, string | boolean>,
): Promise<Record<string, unknown>> {
  if (inst.type !== 'INSTANCE') {
    throw withCode(new Error(`setProps expects an INSTANCE, got ${inst.type}`), 'E_EVAL');
  }
  const current = inst.componentProperties as Record<string, { type: string; value: unknown }>;
  const keys = Object.keys(current);
  const resolved: Record<string, string | boolean> = {};
  for (const [name, rawValue] of Object.entries(props)) {
    let key: string;
    try {
      key = resolvePropKey(keys, name);
    } catch (err) {
      throw withCode(new Error(`${err instanceof Error ? err.message : String(err)} on "${inst.name}"`), 'E_EVAL');
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'boolean') {
      throw withCode(new Error(`property "${key}" needs a string or boolean, got ${typeof rawValue}`), 'E_EVAL');
    }
    let value: string | boolean = rawValue;
    // An INSTANCE_SWAP definition takes a node id on the wire; a component KEY given by
    // the caller must be imported and resolved to that id first (verified on canvas
    // 2026-07-29 — setProperties takes the id and rejects the key).
    if (current[key]?.type === 'INSTANCE_SWAP' && typeof value === 'string' && !/^\d+:\d+$/.test(value)) {
      const c = await resolveMainComponent({ componentKey: value });
      if (!c) throw withCode(new Error(`component not found for property "${key}": ${value}`), 'E_EVAL');
      value = c.id;
    }
    resolved[key] = value;
  }
  try {
    inst.setProperties(resolved);
  } catch (err) {
    throw withCode(
      new Error(`setProps ${JSON.stringify(resolved)} failed: ${err instanceof Error ? err.message : String(err)}`),
      'E_EVAL',
    );
  }
  // Re-read and assert: setProperties is all-or-nothing, but a value can still silently
  // fail to "take" (e.g. a stale key) — compare against the RESOLVED value, never the
  // caller's original, since a key→id swap makes that comparison always fail.
  //
  // `String(actual) !== String(value)` coerces both sides to text
  // first, so a re-read that comes back as the STRING "true" for a requested BOOLEAN `true`
  // would stringify equal and false-verify a type-mismatched write. `Object.is` compares the
  // re-read value as-is — the values in play are homogeneous per prop kind (string/boolean for
  // TEXT/BOOLEAN, an id string for INSTANCE_SWAP), so identity is the correct comparison.
  const reread = inst.componentProperties as Record<string, { value: unknown }>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resolved)) {
    const actual = reread[key]?.value;
    if (!Object.is(actual, value)) {
      throw withCode(new Error(`setProps applied but "${key}" is still ${String(actual)}`), 'E_EVAL');
    }
    out[key] = actual;
  }
  return out;
}

export async function swapInstance(
  inst: InstanceNode,
  ref: string,
): Promise<{ id: string; mainComponent: { id: string; name: string } }> {
  const component = ref.includes(':')
    ? await resolveMainComponent({ componentId: ref })
    : await resolveMainComponent({ componentKey: ref });
  if (!component) throw withCode(new Error(`component not found: ${ref}`), 'E_EVAL');
  inst.swapComponent(component);
  // Async getter only — the sync `.mainComponent` getter throws under dynamic-page.
  const main = await inst.getMainComponentAsync();
  if (!main || main.id !== component.id) {
    throw withCode(new Error(`swapInstance applied but main is still "${main?.id ?? 'unknown'}"`), 'E_EVAL');
  }
  return { id: inst.id, mainComponent: { id: component.id, name: component.name } };
}
