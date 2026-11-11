/**
 * The export reader of `ui ds surface` (spec 033 FR-019, CD-5): which components a source file exports, by pattern.
 * No parser, no compiler: line-anchored declarations on a comment-blanked copy of the text. What a pattern cannot
 * decide is reported in `unread` with its reason and never guessed.
 *
 * A component is an exported function, class or constant with an upper-camel name whose own span holds markup. A
 * `.vue` or `.svelte` file is one component whose name is the file name (the framework's own convention) when that
 * name is upper-camel. A re-export (`export { X } from "./x"`, `export * from "./x"`) is not a component here; it is
 * returned apart so the import side can follow a barrel file.
 */
import { basename } from "node:path";
import { blankDelimited, spaces } from "../polyglot-ui-scans.js";

export interface ExportedComponent {
  name: string;
  /** True when the name is the file's default export. */
  isDefault: boolean;
  /** 1-based inclusive line range of the declaration. */
  startLine: number;
  endLine: number;
}
export interface ReExport { names: { exported: string; local: string }[]; star: boolean; spec: string }
export interface UnreadExport { name: string; line: number; reason: string }
export interface SourceExports { components: ExportedComponent[]; reExports: ReExport[]; unread: UnreadExport[] }

/** Component names are upper-camel with at least one lower-case letter: `API_URL` is a constant, not a component. */
export const isComponentName = (name: string): boolean => /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(name);

const MARKUP = /<\/?[A-Za-z][\w.-]*(?:\s[^<>]*)?\/?>|createElement\s*\(|\bjsx\s*\(/;
const TOP_LEVEL = /^(?:export|const|let|var|function|class|type|interface|import|enum|declare|async|abstract)\b/;

/** The text with comments blanked, same length and same lines. */
export function blankComments(source: string): string {
  const noBlock = blankDelimited(source, "/*", "*/", spaces);
  return noBlock.replace(/(^|[\s;{}(),])\/\/[^\n]*/gm, (m, lead: string) => lead + spaces(m.slice(lead.length)));
}

/**
 * The text with string and template literals blanked (same length and lines): a one-line quoted string, and a template
 * literal that may span lines. A quote that does not close on its line (an apostrophe in JSX text) is left alone, so it
 * cannot hide the exports after it.
 */
export function blankStrings(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (c === "`") {
      let j = i + 1;
      while (j < text.length && text[j] !== "`") { if (text[j] === "\\") j++; j++; }
      out += c + spaces(text.slice(i + 1, j)) + (text[j] ?? "");
      i = j;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== "\n") { if (text[j] === "\\") j++; j++; }
      // A module specifier (`from "./a"`) is not a string to hide: the barrel reader needs it.
      if (text[j] === c && !/\bfrom\s*$/.test(out)) { out += c + " ".repeat(j - i - 1) + c; i = j; } else out += c;
    } else out += c;
  }
  return out;
}

/** Names bound by the declarators after the first one of an `export const A = ..., B = ...` statement, read at bracket depth 0. */
function extraDeclarators(statement: string): string[] {
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

function spanFrom(lines: readonly string[], startIdx: number): { startLine: number; endLine: number } {
  let j = startIdx + 1;
  while (j < lines.length && !TOP_LEVEL.test(lines[j] as string)) j++;
  let last = j - 1;
  while (last > startIdx && (lines[last] as string).trim() === "") last--;
  return { startLine: startIdx + 1, endLine: last + 1 };
}

const lineStarts = (text: string): number[] => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
};
const lineIndexOf = (starts: readonly number[], idx: number): number => {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if ((starts[mid] as number) <= idx) lo = mid; else hi = mid - 1; }
  return lo;
};

const DECL = (name: string): RegExp => new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\s*\\*?|class|const|let|var)\\s+${name}\\b`);

export function readComponentExports(file: string, source: string): SourceExports {
  const out: SourceExports = { components: [], reExports: [], unread: [] };
  const ext = /\.[A-Za-z0-9]+$/.exec(file)?.[0].toLowerCase() ?? "";
  const lineCount = source.split("\n").length;
  if (ext === ".vue" || ext === ".svelte") {
    const name = basename(file).slice(0, -ext.length);
    if (isComponentName(name)) out.components.push({ name, isDefault: true, startLine: 1, endLine: lineCount });
    else out.unread.push({ name, line: 1, reason: `the file name '${name}' is not an upper-camel component name` });
    return out;
  }
  const SCRIPT_ONLY = [".ts", ".mjs"]; // a .js file may hold JSX: it is read the way a .jsx file is
  if (ext !== ".tsx" && ext !== ".jsx" && ext !== ".js" && !SCRIPT_ONLY.includes(ext)) return out;
  const readsComponents = !SCRIPT_ONLY.includes(ext);

  const text = blankStrings(blankComments(source));
  const lines = text.split("\n");
  const starts = lineStarts(text);
  const seen = new Set<string>();
  const add = (name: string, isDefault: boolean, idx: number): void => {
    if (seen.has(name)) return;
    const span = spanFrom(lines, idx);
    if (!MARKUP.test(lines.slice(span.startLine - 1, span.endLine).join("\n"))) {
      out.unread.push({ name, line: span.startLine, reason: "the declaration holds no markup, so it is not read as a component" });
      seen.add(name);
      return;
    }
    if (/^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*[[{]/.test(lines[idx] as string)) {
      out.unread.push({ name, line: span.startLine, reason: "an object or array holding markup is not read as a component" });
      seen.add(name);
      return;
    }
    seen.add(name);
    out.components.push({ name, isDefault, ...span });
  };
  const localDecl = (name: string): number => lines.findIndex((l) => DECL(name).test(l) && !/^export\b/.test(l));

  lines.forEach((line, idx) => {
    let m: RegExpExecArray | null;
    if (!readsComponents) {
      if ((m = /^export\s*(?:type\s*)?\*\s*(?:as\s+\w+\s*)?from\s*['"]([^'"]+)['"]/.exec(line)) !== null) out.reExports.push({ names: [], star: true, spec: m[1] as string });
      return;
    }
    if ((m = /^export\s+default\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?/.exec(line)) !== null || (m = /^export\s+default\s+class\s+([A-Za-z_$][\w$]*)?/.exec(line)) !== null) {
      const name = m[1];
      if (name === undefined || !isComponentName(name)) out.unread.push({ name: name ?? "(anonymous)", line: idx + 1, reason: "the default export has no upper-camel name" });
      else add(name, true, idx);
    } else if ((m = /^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/.exec(line)) !== null) {
      const name = m[1] as string;
      const at = localDecl(name);
      if (!isComponentName(name)) out.unread.push({ name, line: idx + 1, reason: "the default export has no upper-camel name" });
      else if (at === -1) out.unread.push({ name, line: idx + 1, reason: "the default export names a binding that is not declared in this file" });
      else add(name, true, at);
    } else if (/^export\s+default\b/.test(line)) {
      out.unread.push({ name: "(default)", line: idx + 1, reason: "the default export is not a named declaration" });
    } else if ((m = /^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(line)) !== null || (m = /^export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line)) !== null || (m = /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line)) !== null) {
      const name = m[1] as string;
      if (isComponentName(name)) add(name, false, idx);
      else if (/^[A-Z]/.test(name)) out.unread.push({ name, line: idx + 1, reason: "the name has no lower-case letter, so it is not read as a component" });
      if (/^export\s+(?:const|let|var)\b/.test(line)) {
        const span = spanFrom(lines, idx);
        for (const extra of extraDeclarators(lines.slice(span.startLine - 1, span.endLine).join("\n").replace(/^export\s+(?:const|let|var)\s+[A-Za-z_$][\w$]*/, ""))) {
          if (/^[A-Z]/.test(extra)) out.unread.push({ name: extra, line: idx + 1, reason: "the second declarator of one const statement is not read: give it its own export statement" });
        }
      }
    } else if ((m = /^export\s*(?:type\s*)?\*\s*(?:as\s+\w+\s*)?from\s*['"]([^'"]+)['"]/.exec(line)) !== null) {
      out.reExports.push({ names: [], star: true, spec: m[1] as string });
    }
  });

  // `export { A, B as C }` and `export { A } from "./a"` can span lines, so they are read on the whole text.
  for (const m of text.matchAll(/(^|\n)export\s+(type\s+)?\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g)) {
    if (m[2] !== undefined) continue;
    const names = (m[3] as string).split(",").map((s) => s.trim()).filter((s) => s !== "").map((part) => {
      const [local, exported] = part.split(/\s+as\s+/);
      return { local: local as string, exported: exported ?? (local as string) };
    }).filter((n) => !n.local.startsWith("type "));
    const spec = m[4];
    if (spec !== undefined) { out.reExports.push({ names, star: false, spec }); continue; }
    for (const n of names) {
      if (!readsComponents || !isComponentName(n.exported)) continue;
      const at = localDecl(n.local);
      const reportAt = lineIndexOf(starts, (m.index ?? 0) + (m[1] as string).length);
      if (at === -1) out.unread.push({ name: n.exported, line: reportAt + 1, reason: "the exported binding is not declared in this file" });
      else add(n.exported, false, at);
    }
  }
  out.components.sort((a, b) => a.startLine - b.startLine || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}
