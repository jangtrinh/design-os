/**
 * Ring-2 sources, the optional enrichers a mature project may have written: rulings, principles, terms, patterns, and
 * the project-supplied `screens.meta.json` (apps, features: source-screens-meta.ts). An absent source contributes zero nodes and one summary
 * line; a source that exists and cannot be read is refused by name. Every list is read in a deterministic order and
 * nothing is deduplicated or dropped: a repeated id is the lint's to report.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { nodeId } from "./node-ids.js";
import { BAD_SOURCE, OntologyReadError, parseSourceJson } from "./read-error.js";
import { byText } from "./ontology-types.js";
import { readScreensMeta } from "./source-screens-meta.js";
import type { MetaFact } from "./source-screens-meta.js";
import type { OntNode, SourceReport } from "./ontology-types.js";

export const RULINGS_REL = "design/knowledge/rulings.json";
export const PRINCIPLES_REL = "design/principles.json";
export const TERMS_REL = "CONTEXT.md";
export const PATTERNS_REL = "design/patterns";

export interface RulingFact { id: string; scope: "global" | { apps: string[]; features: string[] } | null; supersededBy?: string; text: string }
export interface PrincipleFact { id: string; text: string }
export interface Ring2Read {
  nodes: OntNode[];
  rulings: RulingFact[];
  principles: PrincipleFact[];
  meta: MetaFact | null;
  reports: SourceReport[];
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const absent = (kind: SourceReport["kind"], note: string): SourceReport => ({ kind, status: "missing", nodes: 0, note });
const read = (kind: SourceReport["kind"], n: number, note: string): SourceReport => ({ kind, status: "read", nodes: n, note });

function readList(projectDir: string, rel: string, key: string): unknown[] | null {
  const path = join(projectDir, rel);
  if (!existsSync(path)) return null;
  const doc = parseSourceJson(rel, readFileSync(path, "utf8"));
  const list = isObj(doc) ? doc[key] : undefined;
  if (!Array.isArray(list)) throw new OntologyReadError(BAD_SOURCE, `${rel} must be an object with a '${key}' list`);
  return list;
}

function readRulings(projectDir: string, nodes: OntNode[], facts: RulingFact[]): SourceReport {
  const list = readList(projectDir, RULINGS_REL, "rulings");
  if (list === null) return absent("ruling", `no ${RULINGS_REL}`);
  let unusable = 0;
  for (const r of list) {
    const id = isObj(r) ? str(r["id"]) : undefined;
    const text = isObj(r) ? str(r["text"]) : undefined;
    if (!isObj(r) || id === undefined || text === undefined) { unusable++; continue; }
    const s = r["scope"];
    const scope = s === "global" ? "global" as const : isObj(s) ? { apps: strs(s["apps"]), features: strs(s["features"]) } : null;
    const supersededBy = str(r["superseded_by"]);
    nodes.push({ id: nodeId("ruling", id), kind: "ruling", name: id, category: str(r["category"]) ?? "", text });
    facts.push({ id, scope, text, ...(supersededBy === undefined ? {} : { supersededBy }) });
  }
  return read("ruling", list.length - unusable, `${list.length - unusable} read${unusable > 0 ? `; ${unusable} without id or text left out and counted` : ""}`);
}

function readPrinciples(projectDir: string, nodes: OntNode[], facts: PrincipleFact[]): SourceReport {
  const list = readList(projectDir, PRINCIPLES_REL, "principles");
  if (list === null) return absent("principle", `no ${PRINCIPLES_REL}`);
  let unusable = 0;
  for (const p of list) {
    const id = isObj(p) ? str(p["id"]) : undefined;
    if (!isObj(p) || id === undefined) { unusable++; continue; }
    const title = str(p["title"]) ?? id;
    nodes.push({ id: nodeId("principle", id), kind: "principle", name: title, yieldsWhen: str(p["yields_when"]) ?? "", test: str(p["test"]) ?? "" });
    facts.push({ id, text: [title, str(p["yields_when"]), str(p["test"])].filter((s) => s !== undefined).join("\n") });
  }
  return read("principle", list.length - unusable, `${list.length - unusable} read${unusable > 0 ? `; ${unusable} without id counted` : ""}`);
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
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort(byText);
  for (const f of files) {
    const key = f.replace(/\.md$/, "");
    const heading = /^#[ \t]+(.+)$/m.exec(readFileSync(join(dir, f), "utf8"))?.[1]?.trim();
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
    const terms = readTermNodes(readFileSync(termsPath, "utf8"));
    nodes.push(...terms);
    reports.push(read("term", terms.length, `${terms.length} term(s) from ${TERMS_REL}`));
  } else reports.push(absent("term", `no ${TERMS_REL}`));
  reports.push(readPatterns(projectDir, nodes));
  const metaRead = readScreensMeta(projectDir);
  nodes.push(...metaRead.nodes);
  reports.push(...metaRead.reports);
  return { nodes, rulings, principles, meta: metaRead.meta, reports };
}
