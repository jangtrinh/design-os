/**
 * Text matching for origin attribution: does a source text NAME a custom property,
 * USE a class token, or DECLARE a class in CSS? Boundaries are the point — `--x`
 * must not match inside `--x-y`, and `transition: …` in a stylesheet is a property,
 * not the `transition` utility.
 */

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** A stylesheet declares `.token` — the class written in CSS-escaped form (`.hover\:x`). */
export function declaresClass(css: string, token: string): boolean {
  const escaped = token.replace(/[^\w-]/g, (c) => `\\${c}`);
  if (!css.includes(`.${escaped}`)) return false;
  return new RegExp(`\\.${escapeRe(escaped)}(?![\\w-]|\\\\)`).test(css);
}

/**
 * Class names of a selector chain, unescaped (`.hover\:bg-x\/10` → `hover:bg-x/10`).
 *
 * Classes inside a functional pseudo-class — `:is(.dark *)`, `:where(.group):hover *`,
 * `:not(.x)` — name the CONTEXT a variant matches in, not the rule: Tailwind's `dark:`
 * variant compiles to `.dark\:x:is(.dark *)`, and an app that toggles `class="dark"`
 * would otherwise make every kit `dark:` utility authored. They are used only when the
 * selector has no class outside parentheses (`:where(.prose) h1`).
 */
export function classesOf(selector: string): string[] {
  const outside = new Set<string>();
  const inside = new Set<string>();
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ".") {
      const m = /^\.((?:\\.|[\w-])+)/.exec(selector.slice(i));
      if (m === null) continue;
      (depth === 0 ? outside : inside).add((m[1] ?? "").replace(/\\(.)/g, "$1"));
      i += m[0].length - 1;
    }
  }
  return [...(outside.size > 0 ? outside : inside)];
}

/**
 * A name (custom property, keyframes, utility base) occurs, bounded only by
 * name characters — `[--x:1px]`, `var(--x)` and `data-open:animate-x` all count.
 */
export function containsName(text: string, name: string): boolean {
  if (!text.includes(name)) return false;
  const esc = escapeRe(name);
  return new RegExp(`(?<![\\w-])${esc}(?![\\w-])`).test(text);
}

/** A full class token (variants included) occurs as a whole token, not inside a longer class. */
export function containsToken(text: string, token: string): boolean {
  if (!text.includes(token)) return false;
  const esc = escapeRe(token);
  // Not followed by `:` or `(`: `transition: opacity …` in a stylesheet is a property, not the class.
  return new RegExp(`(?<![\\w\\-:/\\[\\].!])${esc}(?![\\w\\-/\\[\\]:(])`).test(text);
}
