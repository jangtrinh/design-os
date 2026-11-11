/**
 * The oracle of the `ui ds surface` export reader (spec 033 P4, fix round 4). Four rounds of fixing the shapes a reviewer
 * showed each opened another, so the reader is measured against an independent instrument: the TypeScript parser. This
 * file is the ONLY importer of `typescript` (a dev dependency; the kernel has no parser: a test below fails if a file
 * under `src/` imports it). For every source that parses without error:
 *   (a) every component the reader claims is a top-level export of the file (no phantom);
 *   (b) every upper-camel top-level export whose declaration holds markup is claimed or listed under `unread`, and a file
 *       listed as undecided counts as listing (no silent drop).
 * Table 1 holds the shapes of the reviews of this phase that are fixed. Table 2 holds the KNOWN LIMITS, each asserted as
 * it behaves today with the follow-up named in its title (a lexer for regular-expression literals and markup text), so
 * the day the lexer fixes one, this test says so.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { isComponentName, readComponentExports } from "../src/core/ds-surface/source-export-reader.js";
import { buildTokenLookup, readStyleReferences } from "../src/core/ds-surface/style-references.js";

const holdsJsx = (node: ts.Node): boolean => {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) { found = true; return; }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
};
const hasExport = (n: ts.Node): boolean => (ts.canHaveModifiers(n) ? ts.getModifiers(n) ?? [] : []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** What the file exports at top level, which of those are upper-camel components holding markup, and whether it parses. */
function oracle(file: string, src: string): { exported: Set<string>; components: Set<string>; parseErrors: number } {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.TSX);
  const local = new Map<string, ts.Node>();
  const exported = new Set<string>();
  const components = new Set<string>();
  const note = (name: string, decl: ts.Node | undefined): void => { exported.add(name); if (decl !== undefined && isComponentName(name) && holdsJsx(decl)) components.add(name); };
  for (const st of sf.statements) {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) local.set(st.name.text, st);
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) local.set(d.name.text, d);
  }
  for (const st of sf.statements) {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && hasExport(st) && st.name) note(st.name.text, st);
    else if (ts.isVariableStatement(st) && hasExport(st)) { for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) note(d.name.text, d); }
    else if (ts.isExportAssignment(st) && !st.isExportEquals && ts.isIdentifier(st.expression)) note(st.expression.text, local.get(st.expression.text));
    else if (ts.isExportDeclaration(st) && st.moduleSpecifier === undefined && st.exportClause && ts.isNamedExports(st.exportClause) && !st.isTypeOnly) {
      for (const el of st.exportClause.elements) {
        if (el.isTypeOnly) continue;
        const localName = (el.propertyName ?? el.name).text;
        note(el.name.text === "default" ? localName : el.name.text, local.get(localName));
      }
    }
  }
  const diagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? [];
  return { exported, components, parseErrors: diagnostics.length };
}

interface Verdict { parseErrors: number; claimed: string[]; listed: string[]; phantoms: string[]; silentDrops: string[] }
function verdict(file: string, src: string): Verdict {
  const o = oracle(file, src);
  const r = readComponentExports(file, src);
  const claimed = new Set(r.components.map((c) => c.name));
  const unread = new Set(r.unread.map((u) => u.name));
  const undecided = unread.has("(file)");
  const read = [...o.components].filter((k) => claimed.has(k)).sort();
  const listed = [...o.components].filter((k) => !claimed.has(k) && (unread.has(k) || undecided)).sort();
  return {
    parseErrors: o.parseErrors, claimed: read, listed,
    phantoms: [...claimed].filter((c) => !o.exported.has(c)).sort(),
    silentDrops: [...o.components].filter((k) => !claimed.has(k) && !unread.has(k) && !undecided).sort(),
  };
}
const clean = (v: Verdict): void => { expect(v.parseErrors, "the source must parse").toBe(0); expect(v.phantoms).toEqual([]); expect(v.silentDrops).toEqual([]); };

const fixtureFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? fixtureFiles(p) : /\.(tsx|jsx)$/.test(n) ? [p] : [];
});

describe("every .tsx/.jsx fixture of the phase", () => {
  const files = fixtureFiles(join(process.cwd(), "tests", "fixtures", "ds-surface"));
  it("the fixtures are found", () => { expect(files.length).toBeGreaterThan(5); });
  it.each(files)("%s: no phantom, no silent drop", (f) => { clean(verdict(f, readFileSync(f, "utf8"))); });
});

const FIXED: [string, string][] = [
  ["export text in a <pre> (the Tooltip phantom)", "export function Usage() {\n  return (\n    <pre>\n      export const Tooltip = 1;\n    </pre>\n  );\n}\n"],
  ["export text in a <pre> with the name of a real component", "export function Card() { return <i />; }\nexport function Usage() {\n  return (\n    <pre>\n      export const Card = 1;\n    </pre>\n  );\n}\n"],
  ["a CSV-escape template (a quote in a regular expression inside an interpolation)", "const quote = (v: string) => `\"${v.replace(/\"/g, '\"\"')}\"`;\nexport function Row() { return <i>{quote(\"a\")}</i>; }\n"],
  ["a glob string before a block comment (the Icon silent drop)", "/** Icons. */\nconst icons = import.meta.glob(\"./svg/*.svg\", { eager: true });\nexport function Icon() { return <span />; }\n/**\n * A large icon.\n */\nexport function BigIcon() { return <span />; }\n"],
  ["accept=\"image/*\" before a block comment", "export function Upload() { return <input accept=\"image/*\" />; }\n/** next */\nexport function Next() { return <i />; }\n"],
  ["a quote glued to a keyword (typeof\"`\") around a template with an export line", "const a = typeof\"`\";\nconst t = `\nexport function Ghost() { return <b/>; }\n`;\nconst b = typeof\"`\";\nexport function Real() { return <i />; }\n"],
  ["a regular expression with a backtick, an exported component, then a template with an export line", "const tick = /`/g;\nexport function Tick() { return <i>{\"a\".replace(tick, \"\")}</i>; }\nconst later = `x\nexport function Ghost() { return <b />; }\n`;\n"],
  ["a template nested in a template", "const t = `outer ${`export function Ghost() { return <div/> }`} end`;\nexport function Real() { return <i />; }\n"],
  ["a closing parenthesis in markup text", "export function Steps() { return <ul><li>1) first</li></ul>; }\nexport function Next() { return <i />; }\n"],
  ["apostrophes in markup text", "export function Note() {\n  return (\n    <div>\n      <p>Don't forget</p>\n      <b className=\"text-primary\">it's</b>\n    </div>\n  );\n}\nexport function After() { return <i />; }\n"],
  ["a namespace and an ambient module body", "namespace X {\n  export function Inner() { return <i />; }\n}\ndeclare module \"x\" {\n  export const Y: () => JSX.Element;\n}\nexport function After() { return <i />; }\n"],
  ["an exported function that is also the default export", "export function Card() { return <i />; }\nexport default Card;\n"],
  ["a braced export with a rename and a default", "function Inner() { return <i />; }\nfunction Other() { return <i />; }\nexport { Inner as default, Other as Renamed };\n"],
  ["a JSX attribute called export", "export function Tool() { return <Thing export={true} />; }\n"],
  ["an export assignment and a lowercase export", "export const helper = () => 1;\nexport function Comp() { return <i />; }\n"],
  ["CRLF line endings and a BOM", "﻿export function Bom() {\r\n  return <i />;\r\n}\r\nexport function Next() { return <i />; }\r\n"],
  ["a line comment and a block comment holding quotes and exports", "// don't export function Ghost() { return <b/>; }\n/* it's\nexport function Ghost2() { return <b/>; }\n*/\nexport function Real() { return <i />; }\n"],
  ["a template holding comment openers", "const a = `a // b`;\nconst b = `a /* b`;\nexport function Real() { return <i />; }\n/* tail */\n"],
  ["a class component", "export class Panel extends Base { render() { return <div />; } }\n"],
  ["a const with several declarators", "export const Alpha = () => <i />, Beta = () => <b />;\n"],
];

describe("table 1: the fixed shapes of the reviews", () => {
  it.each(FIXED)("%s: 0 phantoms and 0 silent drops", (_title, src) => { clean(verdict("src/P.tsx", src)); });
});

/**
 * Table 2: KNOWN LIMITS, not built. Each row says what the reader does today. A row that goes red means the lexer
 * follow-up (regular-expression literals and markup text) fixed it: move the row to table 1.
 */
const LIMITS: { title: string; src: string; today: Partial<Verdict> }[] = [
  {
    title: "known limit (lexer follow-up): a regular expression with a backtick on a line that opens a real template reads template text as a component",
    src: "const a = /`/.test(x) ? `\nexport function Ghost() { return <b />; }\n` : \"\";\nexport function Real() { return <i />; }\n",
    today: { claimed: [], phantoms: ["Ghost"], listed: ["Real"], silentDrops: [] },
  },
  {
    title: "known limit (lexer follow-up): two regular expressions with a backtick hide the export between them (a silent drop)",
    src: "const r = /`/;\nexport function Alpha() { return <i />; }\nconst q = /`/;\nexport function Beta() { return <i />; }\n",
    today: { claimed: ["Beta"], phantoms: [], listed: [], silentDrops: ["Alpha"] },
  },
  {
    title: "known limit (lexer follow-up): a bracket in a regular expression lists the exports after it instead of reading them",
    src: "const re = /[(]/;\nexport function Alpha() { return <i />; }\n",
    today: { claimed: [], phantoms: [], listed: ["Alpha"], silentDrops: [] },
  },
  {
    title: "known limit (lexer follow-up): an opener in markup text lists every later export",
    src: "export function Alpha() { return <ul><li>(optional</li></ul>; }\nexport function Beta() { return <i />; }\n",
    today: { claimed: ["Alpha"], phantoms: [], listed: ["Beta"], silentDrops: [] },
  },
  {
    title: "known limit (lexer follow-up): markup in no bracket with a text line that starts an export declaration is read as a declaration",
    src: "export const Doc = () => <pre>\nexport function Ghost\n</pre>;\n",
    today: { claimed: ["Doc"], phantoms: ["Ghost"], listed: [], silentDrops: [] },
  },
  {
    title: "known limit (lexer follow-up): the same with `export default function` in the text",
    src: "export const Doc = () => <pre>\nexport default function Ghost\n</pre>;\n",
    today: { claimed: ["Doc"], phantoms: ["Ghost"], listed: [], silentDrops: [] },
  },
];

describe("table 2: known limits, asserted as they behave today", () => {
  it.each(LIMITS.map((l) => [l.title, l] as const))("%s", (_title, row) => {
    const v = verdict("src/P.tsx", row.src);
    expect(v.parseErrors, "the source must parse").toBe(0);
    expect({ claimed: v.claimed, listed: v.listed, phantoms: v.phantoms, silentDrops: v.silentDrops }).toEqual({ claimed: [], listed: [], phantoms: [], silentDrops: [], ...row.today });
  });
  it("known limit (lexer follow-up): a quote in markup text that pairs with a later quote hides the class attribute between them", () => {
    const lookup = buildTokenLookup({ color: { primary: { $type: "color", $value: "#111" } } });
    const src = "export const Hint = () => <p>Click \"<b className=\"text-primary\">Save</b>\" to keep it</p>;\n";
    expect(oracle("src/P.tsx", src).parseErrors).toBe(0);
    expect(readStyleReferences("src/P.tsx", src, lookup).tokens).toEqual([]);
  });
});

describe("the kernel has no parser", () => {
  const sources = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : n.endsWith(".ts") ? [p] : [];
  });
  it("no file under src/ imports typescript", () => {
    const offenders = sources(join(process.cwd(), "src")).filter((f) => /(?:from\s+|require\(\s*|import\(\s*)["'](?:node:)?typescript["']/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
