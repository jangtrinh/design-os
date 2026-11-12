/**
 * Value shapes a CSS custom property is written in, shared by the one place that infers a token's `$type`
 * (token-import.ts `inferToken`): a time (with or without its leading zero) and a font-family stack. A value is
 * stored as written: typing a shape never rewrites it.
 * Pure string tests, no I/O.
 */

/** A time: `.1s`, `0.15s`, `150ms`. */
export const DURATION_VALUE_RE = /^\d*\.?\d+m?s$/i;

/** One family: a quoted name, or bare words (`Segoe UI`, `SFMono-Regular`, `-apple-system`). Nothing with a parenthesis, a digit first, a unit or `!`. */
const QUOTED_FAMILY = /^(?:"[^"]+"|'[^']+')$/;
const BARE_FAMILY = /^-?[A-Za-z_][\w-]*(?: [A-Za-z_][\w-]*)*$/;
/** A bare word that is a CSS-wide keyword or the value of some other property, never a family. */
const KEYWORD = /^(?:inherit|initial|unset|revert|revert-layer|none|normal|auto|flex|grid|block|inline|hidden|visible|swap|fallback|optional|red|blue|green|black|white|transparent|currentcolor)$/i;

/** Split on commas outside quotes; null when a quote is left open. */
function splitFamilies(value: string): string[] | null {
  const parts: string[] = [];
  let quote = "";
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i] as string;
    if (quote !== "") { if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === ",") { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  if (quote !== "") return null;
  parts.push(value.slice(start).trim());
  return parts;
}

/** A property or key name that says it holds a font family (not a font feature, size, weight or style). */
export const FAMILY_NAME_HINT_RE = /(?=.*(?:font|family|typeface))(?!.*(?:feature|size|weight|style|variant|stretch|smoothing|variation))/i;

/** A quoted family holds a letter and no backslash escape: `"/"` and `"\2715"` are glyphs, not families. */
const fitsQuoted = (f: string): boolean => /\p{L}/u.test(f) && !f.includes("\\");

/**
 * True when `value` is a font-family stack: the property is named for a font family (`nameHinted`, decided by the
 * caller from the name alone) and the value fits: a comma-separated list of families, quoted or bare, in which every
 * quoted entry holds a letter and no escape. Any string is a valid family name in CSS, so the value alone never
 * decides: with no name hint nothing is typed.
 */
export function isFontFamilyStack(value: string, nameHinted: boolean): boolean {
  if (!nameHinted) return false;
  const families = splitFamilies(value.trim());
  if (families === null || families.length === 0) return false;
  return families.every((f) => (QUOTED_FAMILY.test(f) ? fitsQuoted(f) : BARE_FAMILY.test(f) && !KEYWORD.test(f)));
}
