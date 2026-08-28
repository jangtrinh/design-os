/**
 * Expand the box shorthands the tells actually depend on.
 *
 * `padding: 16px` is how real stylesheets are written, and a cascade that only
 * understands `padding-left` sees nothing at all in them. Two rules that matter
 * — `cramped-padding` and `monotonous-spacing` — would then report a clean page
 * for every project that uses the shorthand, which is most of them.
 *
 * Only the shorthands whose expansion is unambiguous from the value alone are
 * handled. `background`, `font` and `transition` are NOT expanded here: their
 * grammars are positional and lossy to guess at, so their consumers read the
 * shorthand directly and say what they could not resolve.
 */

/** CSS 1/2/3/4-value box notation → the four sides, in top-right-bottom-left order. */
export function expandBox(value: string, parts: readonly string[]): [string, string, string, string] | undefined {
  const v = parts.length > 0 ? parts : value.trim().split(/\s+/).filter(Boolean);
  switch (v.length) {
    case 1: return [v[0] as string, v[0] as string, v[0] as string, v[0] as string];
    case 2: return [v[0] as string, v[1] as string, v[0] as string, v[1] as string];
    case 3: return [v[0] as string, v[1] as string, v[2] as string, v[1] as string];
    case 4: return [v[0] as string, v[1] as string, v[2] as string, v[3] as string];
    default: return undefined;
  }
}

const SIDES = ["top", "right", "bottom", "left"] as const;

/**
 * Longhands implied by a shorthand declaration.
 *
 * Returns an empty list for anything not handled, so the caller can keep the
 * shorthand as-is rather than losing it.
 */
export function expandShorthand(prop: string, value: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];

  if (prop === "padding" || prop === "margin") {
    const box = expandBox(value, []);
    if (box !== undefined) SIDES.forEach((side, i) => out.push([`${prop}-${side}`, box[i] as string]));
    return out;
  }

  if (prop === "border-width") {
    const box = expandBox(value, []);
    if (box !== undefined) SIDES.forEach((side, i) => out.push([`border-${side}-width`, box[i] as string]));
    return out;
  }

  // `gap: 8px 16px` → row/column; a single value covers both.
  if (prop === "gap") {
    const v = value.trim().split(/\s+/).filter(Boolean);
    if (v.length >= 1) out.push(["row-gap", v[0] as string], ["column-gap", (v[1] ?? v[0]) as string]);
    return out;
  }

  return out;
}

/** True for shorthands `expandShorthand` knows how to expand. */
export function isExpandableShorthand(prop: string): boolean {
  return prop === "padding" || prop === "margin" || prop === "border-width" || prop === "gap";
}
