/**
 * The import reader of `ui ds surface` (spec 033 FR-019, CD-5): the static imports of a source file, by pattern, and
 * the resolution of a module specifier to a file of the walk. A relative specifier and the `@/`, `~/` aliases resolve
 * to a file when exactly one file matches; a bare package name is external and is never counted as unresolved. A
 * specifier that should be a project file but matches none (or more than one) is counted, never guessed.
 */
import { posix } from "node:path";
import { blankComments } from "./source-text-masks.js";

export interface ImportedName { imported: string; local: string }
export interface SourceImport {
  spec: string;
  defaultName?: string;
  namespace?: string;
  named: ImportedName[];
}

const IMPORT_RE = /(?:^|\n)\s*import\s+(?!type\b)([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;
const SCRIPT_EXT = [".tsx", ".ts", ".jsx", ".js", ".vue", ".svelte"];

function parseClause(clause: string): Omit<SourceImport, "spec"> {
  const out: Omit<SourceImport, "spec"> = { named: [] };
  const braces = /\{([^}]*)\}/.exec(clause);
  if (braces !== null) {
    for (const part of (braces[1] as string).split(",").map((s) => s.trim()).filter((s) => s !== "" && !s.startsWith("type "))) {
      const [imported, local] = part.split(/\s+as\s+/);
      out.named.push({ imported: imported as string, local: local ?? (imported as string) });
    }
  }
  const rest = clause.replace(/\{[^}]*\}/, "").replace(/,/g, " ").trim();
  const ns = /^\*\s+as\s+([\w$]+)/.exec(rest);
  if (ns !== null) out.namespace = ns[1] as string;
  else if (/^[\w$]+$/.test(rest)) out.defaultName = rest;
  return out;
}

export function readImports(source: string): SourceImport[] {
  const text = blankComments(source);
  return [...text.matchAll(IMPORT_RE)].map((m) => ({ spec: m[2] as string, ...parseClause(m[1] as string) }));
}

/** The components a namespace import reaches: `import * as UI` and `<UI.Button />` or `UI.Button`. */
export function namespaceMembers(source: string, namespace: string): string[] {
  const escaped = namespace.replace(/[$]/g, "\\$");
  return [...new Set([...blankComments(source).matchAll(new RegExp(`\\b${escaped}\\.([A-Z][\\w$]*)`, "g"))].map((m) => m[1] as string))].sort();
}

export type Resolution = { kind: "file"; file: string } | { kind: "external" } | { kind: "unresolved" };

const ALIASES = ["@/", "~/", "#/"];

/** Candidate file paths (project-relative, POSIX) a specifier can mean. */
function candidates(base: string): string[] {
  return [base, ...SCRIPT_EXT.map((e) => base + e), ...SCRIPT_EXT.map((e) => `${base}/index${e}`)];
}

/**
 * `files` is every source file of the walk (project-relative); `appRoot` is the project-relative root of the app the
 * alias is read against ("" for the scan root). An alias is tried against the app root and its `src/` directory.
 */
export function resolveSpecifier(fromFile: string, spec: string, files: ReadonlySet<string>, appRoot: string): Resolution {
  const alias = ALIASES.find((a) => spec.startsWith(a));
  let bases: string[];
  if (spec.startsWith("./") || spec.startsWith("../")) bases = [posix.normalize(posix.join(posix.dirname(fromFile), spec))];
  else if (alias !== undefined) {
    const rest = spec.slice(alias.length);
    bases = [posix.normalize(posix.join(appRoot, rest)), posix.normalize(posix.join(appRoot, "src", rest))];
  } else return { kind: "external" };
  const hits = [...new Set(bases.flatMap(candidates).filter((c) => files.has(c)))];
  // `./Card` can match `Card.tsx` and `Card/index.tsx`: the first form a bundler tries wins only when one file matches.
  const exact = hits.filter((h) => bases.some((b) => SCRIPT_EXT.some((e) => h === b + e) || h === b));
  const pool = exact.length > 0 ? exact : hits;
  return pool.length === 1 ? { kind: "file", file: pool[0] as string } : { kind: "unresolved" };
}
