/**
 * Selector → mode. One shared table, kept separate from
 * css-token-ingest.ts to keep that file under the Art IX budget.
 *
 *   :root / :host / html / body / @theme … → base   ($value)
 *   [data-theme="X"] / [data-theme='X'] / [data-theme=X] → mode.X
 *   .dark                               → mode.dark
 *   @media (prefers-color-scheme: dark) → mode.dark
 *   :where(<list>) / :is(<list>)        → the inner list, classified by the same rules
 *   <base><one theme qualifier>         → that mode (`:root[data-theme=dark]`, `html.dark`)
 *   anything else                       → unmapped (not a mode — caller lists it, doesn't drop it)
 *
 * A packaged, minified token sheet writes its base as `:where(:root,:host,…)` and its themes without quotes;
 * a component class (`.card`, `.dark .card`, `:root .card`) holds local variables and stays unmapped, so a
 * widening of this table never promotes a component's variable to a token.
 *
 * Base is mandatory: a token whose only declaration sits under a theme selector has
 * no base value and must not be promoted — that decision lives in css-token-ingest.ts.
 */
import { sanitizeSeg } from "./figma-ds-tokens.js";

export type ModeMapping = { kind: "base" } | { kind: "modes"; names: string[] } | { kind: "unmapped" };

/** The attribute that names a theme, with or without quotes (a minifier removes them). */
const THEME_ATTRIBUTE = String.raw`\[\s*data-theme\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'\]]+))\s*\]`;
const THEME_ATTRIBUTE_ONLY = new RegExp(`^${THEME_ATTRIBUTE}$`, "i");
/** One base selector directly followed by one theme qualifier: no space, no combinator. */
const BASE_WITH_QUALIFIER = new RegExp(String.raw`^(?::root|:host|html|body)(?:(\.dark)|${THEME_ATTRIBUTE})$`, "i");
const DARK_MEDIA = /^@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/i;

/** Split on commas that are outside every parenthesis, bracket and quote. */
function splitTopLevel(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i] as string;
    if (quote !== "") { if (c === quote) quote = ""; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if (c === "," && depth === 0) { parts.push(selector.slice(start, i)); start = i + 1; }
  }
  parts.push(selector.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** The inner list of `:where(…)` / `:is(…)` when the opening parenthesis closes at the last character; else null. */
function wrapperInner(s: string): string | null {
  const m = /^:(?:where|is)\(/i.exec(s);
  if (m === null || !s.endsWith(")")) return null;
  let depth = 0;
  for (let i = m[0].length - 1; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i === s.length - 1 ? s.slice(m[0].length, i) : null;
  }
  return null;
}

const themeName = (m: RegExpExecArray, first: number): string => sanitizeSeg((m[first] ?? m[first + 1] ?? m[first + 2]) as string);

function classifyOne(selector: string): ModeMapping {
  const s = selector.trim();
  if (s === ":root" || s === ":host" || s === "html" || s === "body" || /^@theme\b/.test(s)) return { kind: "base" };
  if (s === ".dark" || DARK_MEDIA.test(s)) return { kind: "modes", names: ["dark"] };
  const attribute = THEME_ATTRIBUTE_ONLY.exec(s);
  if (attribute !== null) return { kind: "modes", names: [themeName(attribute, 1)] };
  const compound = BASE_WITH_QUALIFIER.exec(s);
  if (compound !== null) return { kind: "modes", names: [compound[1] !== undefined ? "dark" : themeName(compound, 2)] };
  const inner = wrapperInner(s);
  if (inner !== null) return classifySelector(inner);
  return { kind: "unmapped" };
}

/** A selector may be a comma-separated list applying one declaration to several modes
 * at once — measured on dana: `[data-theme="dark"], [data-theme="classic"], .dark { ... }`.
 * Base wins if present in the list (not seen in real data, but a safe tie-break). */
export function classifySelector(selector: string): ModeMapping {
  let base = false;
  const names: string[] = [];
  for (const part of splitTopLevel(selector)) {
    const c = classifyOne(part);
    if (c.kind === "base") base = true;
    else if (c.kind === "modes") for (const n of c.names) if (!names.includes(n)) names.push(n);
  }
  if (base) return { kind: "base" };
  if (names.length > 0) return { kind: "modes", names };
  return { kind: "unmapped" };
}
