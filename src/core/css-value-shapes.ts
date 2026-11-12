/**
 * Value shapes a CSS custom property is written in, shared by the one place that infers a token's `$type`
 * (token-import.ts `inferToken`): a number written without its leading zero, a time, and a font-family stack.
 * Pure string tests, no I/O.
 */

/** `.5rem` is `0.5rem` and `-.25rem` is `-0.25rem`: the same number with its leading zero written out. */
export function withLeadingZero(value: string): string {
  return value.replace(/^(-?)\./, "$10.");
}

/** A time: `.1s`, `0.15s`, `150ms`. */
export const DURATION_VALUE_RE = /^\d*\.?\d+m?s$/i;

/** The generic family keywords of CSS; a list that names one is a font stack whatever the property is called. */
const GENERIC_FAMILY = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong)$/i;
/** One family: a quoted name, or bare words (`Segoe UI`, `SFMono-Regular`). Nothing with a parenthesis, a digit first, a unit or `!`. */
const QUOTED_FAMILY = /^(?:"[^"]+"|'[^']+')$/;
const BARE_FAMILY = /^[A-Za-z_][\w-]*(?: [A-Za-z_][\w-]*)*$/;
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

/**
 * True when `value` is a font-family stack: one or many families, quoted or bare, separated by commas, and either
 * naming a generic family, or holding a quoted family. A lone bare word (`none`, `flex`, `auto`) is never one: it is a
 * keyword of some other property, and only a property named for a family (decided by the caller) can make it a family.
 */
export function isFontFamilyStack(value: string): boolean {
  const families = splitFamilies(value.trim());
  if (families === null || families.length === 0) return false;
  if (!families.every((f) => QUOTED_FAMILY.test(f) || (BARE_FAMILY.test(f) && !KEYWORD.test(f)))) return false;
  if (families.length === 1) return QUOTED_FAMILY.test(families[0] as string);
  return families.some((f) => QUOTED_FAMILY.test(f) || GENERIC_FAMILY.test(f));
}
