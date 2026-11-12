/**
 * Value shapes a CSS custom property is written in, shared by the one place that infers a token's `$type`
 * (token-import.ts `inferToken`): a time (with or without its leading zero) and a font-family stack. A value is stored as written: typing a shape
 * never rewrites it.
 * Pure string tests, no I/O.
 */

/** A time: `.1s`, `0.15s`, `150ms`. */
export const DURATION_VALUE_RE = /^\d*\.?\d+m?s$/i;

/** The generic family keywords of CSS; a list that names one is a font stack whatever the property is called. */
const GENERIC_FAMILY = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong)$/i;
/** One family: a quoted name, or bare words (`Segoe UI`, `SFMono-Regular`, `-apple-system`). Nothing with a parenthesis, a digit first, a unit or `!`. */
const QUOTED_FAMILY = /^(?:"[^"]+"|'[^']+')$/;
const BARE_FAMILY = /^-?[A-Za-z_][\w-]*(?: [A-Za-z_][\w-]*)*$/;
/** A bare word that is a CSS-wide or common keyword, never a family on its own. */
const KEYWORD = /^(?:inherit|initial|unset|revert|revert-layer|none|normal|auto|flex|grid|block|inline|hidden|visible|red|blue|green|black|white|transparent|currentcolor)$/i;

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

/**
 * True when `value` is a font-family stack: one or many families, quoted or bare, separated by commas, and either
 * naming a generic family, or (when `nameHinted`, the property is named for a font family) holding a quoted family.
 * Quoted strings alone are not a stack: `"/"`, `"cv02","cv03"` and `"header header","main side"` are other properties'
 * values. A lone bare word (`none`, `flex`) is never one.
 */
export function isFontFamilyStack(value: string, nameHinted: boolean): boolean {
  const families = splitFamilies(value.trim());
  if (families === null || families.length === 0) return false;
  if (!families.every((f) => QUOTED_FAMILY.test(f) || (BARE_FAMILY.test(f) && !KEYWORD.test(f)))) return false;
  if (families.some((f) => GENERIC_FAMILY.test(f))) return true;
  return nameHinted && families.some((f) => QUOTED_FAMILY.test(f));
}
