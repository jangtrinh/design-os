/**
 * Ring-2 sources, the optional enrichers a mature project may have written: rulings, principles, terms, patterns, and
 * the project-supplied `screens.meta.json` (apps, features: source-screens-meta.ts). An absent source contributes zero nodes and one summary
 * line; a source that exists and cannot be read is refused by name. Every list is read in a deterministic order and
 * nothing is deduplicated or dropped: a repeated id is the lint's to report.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { nodeId } from "./node-ids.js";
import { BAD_SOURCE, OntologyReadError, parseSourceJson, readSourceDir, readSourceText } from "./read-error.js";
import { parseScope, skippedText } from "./ruling-scope.js";
import type { RulingScope } from "./ruling-scope.js";
import { byText } from "./ontology-types.js";
import { readScreensMeta } from "./source-screens-meta.js";
import type { MetaFact } from "./source-screens-meta.js";
import { isBadString, leave, leftOutRecord } from "./left-out.js";
import type { LeftOut } from "./left-out.js";
import type { OntNode, SourceReport } from "./ontology-types.js";

export const RULINGS_REL = "design/knowledge/rulings.json";
export const PRINCIPLES_REL = "design/principles.json";
export const TERMS_REL = "CONTEXT.md";
export const PATTERNS_REL = "design/patterns";

/** `notUnderstood`: how many of the values of this entry the reader counted instead of using (its share of the source line). */
export interface RulingFact { id: string; scope: "global" | RulingScope | null; supersededBy?: string; text: string; notUnderstood: number }
export interface PrincipleFact { id: string; text: string; notUnderstood: number }
export interface Ring2Read {
  nodes: OntNode[];
  rulings: RulingFact[];
  principles: PrincipleFact[];
  meta: MetaFact | null;
  reports: SourceReport[];
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const absent = (kind: SourceReport["kind"], note: string): SourceReport => ({ kind, status: "missing", nodes: 0, note });
const read = (kind: SourceReport["kind"], n: number, note: string, seen?: number, left?: LeftOut): SourceReport => {
  const leftOut = left === undefined ? undefined : leftOutRecord(left);
  return { kind, status: "read", nodes: n, note, ...(seen === undefined ? {} : { seen }), ...(leftOut === undefined ? {} : { leftOut }) };
};

function readList(projectDir: string, rel: string, key: string): unknown[] | null {
  const path = join(projectDir, rel);
  if (!existsSync(path)) return null;
  const doc = parseSourceJson(rel, readSourceText(rel, path));
  const list = isObj(doc) ? doc[key] : undefined;
  if (!Array.isArray(list)) throw new OntologyReadError(BAD_SOURCE, `${rel} must be an object with a '${key}' list`);
  return list;
}

function readRulings(projectDir: string, nodes: OntNode[], facts: RulingFact[]): SourceReport {
  const list = readList(projectDir, RULINGS_REL, "rulings");
  if (list === null) return absent("ruling", `no ${RULINGS_REL}`);
  let unusable = 0;
  const skipped = new Map<string, number>();
  const left: LeftOut = new Map();
  for (const r of list) {
    const id = isObj(r) ? str(r["id"]) : undefined;
    const text = isObj(r) ? str(r["text"]) : undefined;
    if (!isObj(r) || id === undefined || text === undefined) { unusable++; continue; }
    const parsed = parseScope(r["scope"]);
    for (const [why, n] of parsed.skipped) { skipped.set(why, (skipped.get(why) ?? 0) + n); leave(left, `scope: ${why}`, n); }
    const scope = parsed.scope;
    let notUnderstood = [...parsed.skipped.values()].reduce((a, b) => a + b, 0);
    let supersededBy = str(r["superseded_by"]);
    if (isBadString(r, "superseded_by")) { leave(left, "superseded_by: value that is not a non-empty string"); notUnderstood++; }
    if (supersededBy === id) { leave(left, "superseded_by: names itself"); supersededBy = undefined; notUnderstood++; }
    nodes.push({ id: nodeId("ruling", id), kind: "ruling", name: id, category: str(r["category"]) ?? "", text });
    facts.push({ id, scope, text, notUnderstood, ...(supersededBy === undefined ? {} : { supersededBy }) });
  }
  if (unusable > 0) leave(left, "without id or text", unusable);
  const bad = left.get("superseded_by: value that is not a non-empty string") ?? 0;
  const selfRef = left.get("superseded_by: names itself") ?? 0;
  const notes = [unusable > 0 ? `${unusable} without id or text left out and counted` : "", skippedText(skipped), bad > 0 ? `${bad} superseded_by value(s) not understood and counted` : "", selfRef > 0 ? `${selfRef} superseded_by value(s) naming their own ruling counted` : ""].filter((n) => n !== "");
  return read("ruling", list.length - unusable, `${list.length - unusable} read${notes.map((n) => `; ${n}`).join("")}`, list.length, left);
}

function readPrinciples(projectDir: string, nodes: OntNode[], facts: PrincipleFact[]): SourceReport {
  const list = readList(projectDir, PRINCIPLES_REL, "principles");
  if (list === null) return absent("principle", `no ${PRINCIPLES_REL}`);
  let unusable = 0;
  const left: LeftOut = new Map();
  for (const p of list) {
    const id = isObj(p) ? str(p["id"]) : undefined;
    if (!isObj(p) || id === undefined) { unusable++; continue; }
    let notUnderstood = 0;
    for (const key of ["title", "yields_when", "test"]) if (isBadString(p, key)) { leave(left, "text field (title, yields_when, test) that is not a string, so its mentions are not read"); notUnderstood++; }
    const title = str(p["title"]) ?? id;
    nodes.push({ id: nodeId("principle", id), kind: "principle", name: title, yieldsWhen: str(p["yields_when"]) ?? "", test: str(p["test"]) ?? "" });
    facts.push({ id, notUnderstood, text: [title, str(p["yields_when"]), str(p["test"])].filter((s) => s !== undefined).join("\n") });
  }
  if (unusable > 0) leave(left, "without id", unusable);
  const text = [...left].filter(([why]) => why.startsWith("text field")).reduce((n, [, c]) => n + c, 0);
  return read("principle", list.length - unusable, `${list.length - unusable} read${unusable > 0 ? `; ${unusable} without id counted` : ""}${text > 0 ? `; ${text} text field(s) that are not strings counted` : ""}`, list.length, left);
}

/** `**Term**:` entries of CONTEXT.md, outside HTML comments; the definition is the text up to the next blank line or `_Avoid_`. */
export function readTermNodes(text: string): OntNode[] {
  const body = text.replace(/<!--[\s\S]*?-->/g, "");
  const out: OntNode[] = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^\*\*([^*\n]+)\*\*[ \t]*:[ \t]*(.*)$/.exec(lines[i] ?? "");
    if (m === null) continue;
    const parts = [m[2] ?? ""];
    for (let j = i + 1; j < lines.length && (lines[j] ?? "").trim() !== "" && !(lines[j] ?? "").startsWith("_Avoid_") && !/^\*\*[^*]+\*\*\s*:/.test(lines[j] ?? ""); j++) parts.push(lines[j] ?? "");
    const name = (m[1] ?? "").trim();
    out.push({ id: nodeId("term", name), kind: "term", name, definition: parts.join(" ").replace(/\s+/g, " ").trim() });
  }
  return out;
}

function readPatterns(projectDir: string, nodes: OntNode[]): SourceReport {
  const dir = join(projectDir, PATTERNS_REL);
  if (!existsSync(dir)) return absent("pattern", `no ${PATTERNS_REL}/`);
  const files = readSourceDir(PATTERNS_REL, dir).filter((f) => f.endsWith(".md")).sort(byText);
  for (const f of files) {
    const key = f.replace(/\.md$/, "");
    const heading = /^#[ \t]+(.+)$/m.exec(readSourceText(`${PATTERNS_REL}/${f}`, join(dir, f)))?.[1]?.trim();
    nodes.push({ id: nodeId("pattern", key), kind: "pattern", name: heading ?? key });
  }
  return read("pattern", files.length, `${files.length} pattern file(s)`);
}

export function readRing2(projectDir: string): Ring2Read {
  const nodes: OntNode[] = [];
  const rulings: RulingFact[] = [];
  const principles: PrincipleFact[] = [];
  const reports: SourceReport[] = [];
  reports.push(readRulings(projectDir, nodes, rulings));
  reports.push(readPrinciples(projectDir, nodes, principles));
  const termsPath = join(projectDir, TERMS_REL);
  if (existsSync(termsPath)) {
    const terms = readTermNodes(readSourceText(TERMS_REL, termsPath));
    nodes.push(...terms);
    reports.push(read("term", terms.length, `${terms.length} term(s) from ${TERMS_REL}`));
  } else reports.push(absent("term", `no ${TERMS_REL}`));
  reports.push(readPatterns(projectDir, nodes));
  const metaRead = readScreensMeta(projectDir);
  nodes.push(...metaRead.nodes);
  reports.push(...metaRead.reports);
  return { nodes, rulings, principles, meta: metaRead.meta, reports };
}
