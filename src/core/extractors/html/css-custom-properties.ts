/**
 * Resolve `var(--x, fallback)` against the cascade.
 *
 * Custom properties inherit, so resolution walks the element's ancestors and
 * finally `:root`. Two rules the rest of the engine depends on:
 *
 *  - A cycle (`--a: var(--b); --b: var(--a)`) resolves to UNRESOLVED, not to a
 *    hang and not to a guess.
 *  - An unresolvable reference stays unresolved and is reported. The caller
 *    emits no fact for it and counts it, because a colour invented from a
 *    missing variable is a finding about a page that does not exist.
 */
import type { Element } from "domhandler";
import * as du from "domutils";
import type { ComputedStyle } from "./css-cascade.js";

/** Depth guard: deeper than this is a chain nobody authored on purpose. */
const MAX_DEPTH = 16;

export interface Resolution {
  /** The resolved value, or undefined when it could not be resolved. */
  value?: string;
  /** Names that could not be resolved, for the unresolved tally. */
  unresolved: string[];
}

const VAR_CALL = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/;

/**
 * Look a custom property up the ancestor chain, `:root` last.
 *
 * The `byElement` map is the cascade result; `rootStyle` is the computed style
 * of the `:root`/`<html>` element, where most token files declare their scale.
 */
function lookup(
  name: string,
  el: Element | null,
  byElement: Map<Element, ComputedStyle>,
  rootStyle: ComputedStyle | undefined,
): string | undefined {
  let cur: Element | null = el;
  while (cur !== null) {
    const hit = byElement.get(cur)?.get(name);
    if (hit !== undefined) return hit.value;
    const parent = du.getParent(cur);
    cur = parent !== null && (parent.type === "tag" || parent.type === "style") ? (parent as Element) : null;
  }
  return rootStyle?.get(name)?.value;
}

/**
 * Resolve every `var()` in a value. Returns `value: undefined` when any
 * reference could not be resolved and had no usable fallback.
 */
export function resolveVars(
  raw: string,
  el: Element | null,
  byElement: Map<Element, ComputedStyle>,
  rootStyle: ComputedStyle | undefined,
): Resolution {
  const unresolved: string[] = [];
  const seen = new Set<string>();
  let value = raw;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const m = VAR_CALL.exec(value);
    if (m === null) return { value, unresolved };

    const name = m[1] as string;
    const fallback = m[2]?.trim();

    if (seen.has(name)) {
      // A cycle. Say so; never loop and never guess.
      unresolved.push(name);
      return { value: undefined, unresolved };
    }
    seen.add(name);

    const found = lookup(name, el, byElement, rootStyle);
    const replacement = found ?? fallback;
    if (replacement === undefined || replacement === "") {
      unresolved.push(name);
      return { value: undefined, unresolved };
    }
    value = value.slice(0, m.index) + replacement + value.slice(m.index + m[0].length);
  }

  // Depth exhausted: treat as unresolved rather than returning a half-expanded value.
  unresolved.push("(var chain deeper than 16)");
  return { value: undefined, unresolved };
}

/** True when a value still contains an unexpanded `var()`. */
export function hasVar(value: string): boolean {
  return VAR_CALL.test(value);
}
