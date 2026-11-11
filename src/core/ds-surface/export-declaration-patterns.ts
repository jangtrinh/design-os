/**
 * The line patterns of the export reader (`source-export-reader.ts`): what a declaration's own span is, what markup looks
 * like, how a declaration of a name is found, and the names bound after the first declarator of a `const` statement. All of
 * it reads a masked copy of the text (comments and strings blanked), never the file as written.
 */
export const MARKUP = /<\/?[A-Za-z][\w.-]*(?:\s[^<>]*)?\/?>|createElement\s*\(|\bjsx\s*\(/;
const TOP_LEVEL = /^(?:export|const|let|var|function|class|type|interface|import|enum|declare|async|abstract)\b/;

/** Names bound by the declarators after the first one of an `export const A = ..., B = ...` statement, read at bracket depth 0. */
export function extraDeclarators(statement: string): string[] {
  const names: string[] = [];
  let depth = 0;
  for (let i = 0; i < statement.length; i++) {
    const c = statement[i] as string;
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      const m = /^\s*([A-Za-z_$][\w$]*)\s*(?::[^=,]+)?=[^=>]/.exec(statement.slice(i + 1));
      if (m !== null) names.push(m[1] as string);
    }
  }
  return names;
}

export function spanFrom(lines: readonly string[], startIdx: number): { startLine: number; endLine: number } {
  let j = startIdx + 1;
  while (j < lines.length && !TOP_LEVEL.test(lines[j] as string)) j++;
  let last = j - 1;
  while (last > startIdx && (lines[last] as string).trim() === "") last--;
  return { startLine: startIdx + 1, endLine: last + 1 };
}

/** The first upper-case word after `export`: the name a listed keyword is reported under. */
export const firstUpperWord = (rest: string): string => /\b[A-Z][A-Za-z0-9_$]*/.exec(rest.replace(/^export\b/, ""))?.[0] ?? "(export)";

const DECL_HEAD = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;

/** The 0-based line of the first declaration of every name (an exported declaration counts), built in one pass over the lines. */
export function indexDeclarations(lines: readonly string[]): Map<string, number> {
  const at = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const name = DECL_HEAD.exec(lines[i] as string)?.[1];
    if (name !== undefined && !at.has(name)) at.set(name, i);
  }
  return at;
}

/**
 * Every `export` keyword of a script file (strings, templates and comments masked) ends up in one of two places: a
 * reader claims it (a component, a re-export, a type-only or enum export, a statement it read and set aside with its own
 * reason), or it is listed under `unread` with the reason "export form not read". Nothing is dropped by a missing shape.
 */
export const EXPORT_KEYWORD = /(?<![\w$./"'-])export(?![\w$])(?!\s*(?:[:,)]|=[=>]))/g;
export const EXPORT_ASSIGNMENT = /^export\s*=/;
export const TYPE_ONLY_EXPORT = /^export\s+(?:type|interface|declare)\b|^export\s+(?:const\s+)?enum\b/;

