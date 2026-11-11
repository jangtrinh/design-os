/**
 * The export reader of `ui ds surface` (spec 033 FR-019, CD-5): which components a source file exports, by pattern.
 * No parser, no compiler: line-anchored declarations on a comment-blanked copy of the text. What a pattern cannot
 * decide is reported in `unread` with its reason and never guessed.
 *
 * A component is an exported function, class or constant with an upper-camel name whose own span holds markup. A
 * `.vue` or `.svelte` file is one component whose name is the file name (the framework's own convention) when that
 * name is upper-camel. A re-export (`export { X } from "./x"`, `export * from "./x"`) is not a component here; it is
 * returned apart so the import side can follow a barrel file.
 *
 * An `export` keyword is read as a declaration only at statement position (`export-statement-position.ts`): any other
 * keyword (in markup text, a regular-expression literal, a namespace or ambient module body) is listed under `unread` and
 * is never a component, a re-export or a collision member.
 *
 * Known limit, not built: markup that sits inside no bracket (a multi-line `export const X = <pre> ... </pre>` written
 * without parentheses) whose text has a line starting with `export const <UpperCamel> =` is read as a declaration. A
 * formatter wraps such markup in parentheses. A regular-expression literal that holds a bracket skews the depth, so the
 * exports after it are listed instead of read: a listed export is visible, a phantom record is a wrong fact.
 */
import { basename } from "node:path";
import { DECL, EXPORT_ASSIGNMENT, EXPORT_KEYWORD, MARKUP, TYPE_ONLY_EXPORT, extraDeclarators, firstUpperWord, spanFrom } from "./export-declaration-patterns.js";
import { statementPositions } from "./export-statement-position.js";
import { blankComments, blankStrings, lineIndexOf, lineStarts, scanStrings } from "./source-text-masks.js";

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
/**
 * How the `export` keywords of a script file were accounted for: keywords = claimed + listed. `claimed` is a keyword a reader
 * took; `listed` is a keyword that is also in `unread` with its reason (no reader recognised it, or the position rule set it aside).
 */
export interface ExportAccounting { keywords: number; claimed: number; listed: number }
export interface SourceExports { components: ExportedComponent[]; reExports: ReExport[]; unread: UnreadExport[]; accounting: ExportAccounting }

/** Component names are upper-camel with at least one lower-case letter: `API_URL` is a constant, not a component. */
export const isComponentName = (name: string): boolean => /^[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*$/.test(name);

export function readComponentExports(file: string, source: string): SourceExports {
  const out: SourceExports = { components: [], reExports: [], unread: [], accounting: { keywords: 0, claimed: 0, listed: 0 } };
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

  const noComments = blankComments(source.replace(/^\uFEFF/, ""));
  const strings = scanStrings(noComments);
  const text = blankStrings(noComments, strings);
  const lines = text.split("\n");
  const starts = lineStarts(text);
  if (strings.undecidedTemplateAt !== -1) {
    out.unread.push({ name: "(file)", line: lineIndexOf(starts, strings.undecidedTemplateAt) + 1, reason: "the string structure of this file could not be decided (a backtick or quote in a regular expression, or a comment pattern in a template); its exports were read by the plain rule and may be incomplete" });
  }
  const seen = new Set<string>();
  const add = (name: string, isDefault: boolean, idx: number, head = lines[idx] as string): void => {
    if (seen.has(name)) { if (isDefault) { const read = out.components.find((c) => c.name === name); if (read !== undefined) read.isDefault = true; } return; }
    const span = spanFrom(lines, idx);
    if (!MARKUP.test(lines.slice(span.startLine - 1, span.endLine).join("\n"))) {
      out.unread.push({ name, line: span.startLine, reason: "the declaration holds no markup, so it is not read as a component" });
      seen.add(name);
      return;
    }
    if (/^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*[[{]/.test(head)) {
      out.unread.push({ name, line: span.startLine, reason: "an object or array holding markup is not read as a component" });
      seen.add(name);
      return;
    }
    seen.add(name);
    out.components.push({ name, isDefault, ...span });
  };
  const localDecl = (name: string): number => lines.findIndex((l) => DECL(name).test(l)); // an exported declaration is the declaration `export default X` and `export { X }` name

  /** One statement that starts at an `export` keyword (`rest` is the text from the keyword to the end of its line); true when a reader took it. */
  const readStatement = (rest: string, idx: number): boolean => {
    let m: RegExpExecArray | null;
    if ((m = /^export\s+default\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?/.exec(rest)) !== null || (m = /^export\s+default\s+class\s+([A-Za-z_$][\w$]*)?/.exec(rest)) !== null) {
      const name = m[1];
      if (name === undefined || !isComponentName(name)) out.unread.push({ name: name ?? "(anonymous)", line: idx + 1, reason: "the default export has no upper-camel name" });
      else add(name, true, idx, rest);
      return true;
    }
    if ((m = /^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/.exec(rest)) !== null) {
      const name = m[1] as string;
      const at = localDecl(name);
      if (!isComponentName(name)) out.unread.push({ name, line: idx + 1, reason: "the default export has no upper-camel name" });
      else if (at === -1) out.unread.push({ name, line: idx + 1, reason: "the default export names a binding that is not declared in this file" });
      else add(name, true, at);
      return true;
    }
    if (/^export\s+default\b/.test(rest)) { out.unread.push({ name: "(default)", line: idx + 1, reason: "the default export is not a named declaration" }); return true; }
    if ((m = /^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(rest)) !== null || (m = /^export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(rest)) !== null || (m = /^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(rest)) !== null) {
      const name = m[1] as string;
      if (isComponentName(name)) add(name, false, idx, rest);
      else if (/^[A-Z]/.test(name)) out.unread.push({ name, line: idx + 1, reason: "the name has no lower-case letter, so it is not read as a component" });
      if (/^export\s+(?:const|let|var)\b/.test(rest)) {
        const span = spanFrom(lines, idx);
        for (const extra of extraDeclarators(lines.slice(span.startLine - 1, span.endLine).join("\n").replace(/^[\s\S]*?export\s+(?:const|let|var)\s+[A-Za-z_$][\w$]*/, ""))) {
          if (/^[A-Z]/.test(extra)) out.unread.push({ name: extra, line: idx + 1, reason: "the second declarator of one const statement is not read: give it its own export statement" });
        }
      }
      return true;
    }
    if ((m = /^export\s*(?:type\s*)?\*\s*from\s*['"]([^'"]+)['"]/.exec(rest)) !== null) { out.reExports.push({ names: [], star: true, spec: m[1] as string }); return true; }
    return false;
  };

  const found = [...text.matchAll(EXPORT_KEYWORD)].map((m) => m.index as number);
  const standing = statementPositions(text, found);
  // `export =` counts only as a statement: `<Tool export={x} />` is an attribute.
  const keywords = found.filter((p) => standing.has(p) || !EXPORT_ASSIGNMENT.test(text.slice(p, p + 24)));
  const claimed = new Set<number>();
  const braceReExports: ReExport[] = []; // appended after the star re-exports, the order the output has always had

  // `export { A, B as C }` and `export { A } from "./a"` can span lines, so they are read on the whole text.
  for (const m of text.matchAll(/(^|[\s;}])export\s+(type\s+)?\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g)) {
    if (!standing.has((m.index ?? 0) + (m[1] as string).length)) continue; // not a declaration: the keyword loop lists it
    claimed.add((m.index ?? 0) + (m[1] as string).length);
    if (m[2] !== undefined) continue;
    const names = (m[3] as string).split(",").map((s) => s.trim()).filter((s) => s !== "").map((part) => {
      const [local, exported] = part.split(/\s+as\s+/);
      return { local: local as string, exported: exported ?? (local as string) };
    }).filter((n) => !n.local.startsWith("type "));
    const spec = m[4];
    if (spec !== undefined) { braceReExports.push({ names, star: false, spec }); continue; }
    for (const n of names) {
      if (!readsComponents) continue;
      const isDefault = n.exported === "default"; // `export { Inner as default }` exports the local binding as the default
      const name = isDefault ? n.local : n.exported;
      if (!isComponentName(name)) continue;
      const at = localDecl(n.local);
      const reportAt = lineIndexOf(starts, (m.index ?? 0) + (m[1] as string).length);
      if (at === -1) out.unread.push({ name, line: reportAt + 1, reason: "the exported binding is not declared in this file" });
      else add(name, isDefault, at);
    }
  }

  for (const p of keywords) {
    out.accounting.keywords++;
    if (claimed.has(p)) { out.accounting.claimed++; continue; }
    const idx = lineIndexOf(starts, p);
    const end = text.indexOf("\n", p);
    const rest = text.slice(p, end === -1 ? undefined : end);
    const listIt = (name: string, reason: string, setAside = false): void => { out.unread.push({ name, line: idx + 1, reason }); out.accounting[setAside ? "claimed" : "listed"]++; };
    if (!standing.has(p)) { listIt(firstUpperWord(rest), "an `export` keyword that is not at the start of a top-level statement is not read as a declaration", true); continue; }
    if (EXPORT_ASSIGNMENT.test(rest)) { listIt("(export =)", "an export assignment is not read"); continue; }
    const namespace = /^export\s*(?:type\s*)?\*\s*as\s+([A-Za-z_$][\w$]*)\s*from/.exec(rest);
    if (namespace !== null) { listIt(namespace[1] as string, "`export * as <name> from` re-exports a namespace: it is listed here and not followed as a barrel"); continue; }
    if (!readsComponents) { readStatement(rest, idx); out.accounting.claimed++; continue; } // a script file holds no component: only its barrel re-exports are read
    if (readStatement(rest, idx) || TYPE_ONLY_EXPORT.test(rest)) { out.accounting.claimed++; continue; }
    listIt(firstUpperWord(rest), "export form not read");
  }
  out.reExports.push(...braceReExports);
  out.components.sort((a, b) => a.startLine - b.startLine || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}
