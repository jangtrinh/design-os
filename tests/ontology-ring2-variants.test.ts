/**
 * The test that replaces the reviewer. For every object, list and leaf of every ring-2 JSON file of the full fixture
 * (found by walking the parsed JSON, not from a list of fields), a variant replaces that value in turn by a number,
 * `true`, `null`, `""`, a list holding one string, a list holding one number and an object, and, for every key of an object, the key removed; every object also gets
 * one extra unknown key. Each variant is built in memory. It must either be refused by name, or satisfy the invariant:
 * entries seen = nodes written + entries left out under a named reason; each reference-carrying value is a link, an
 * unresolved reference or a counted "not understood"; no link exists that the unmodified fixture lacks; and an unknown key
 * changes nothing except inside a `scope`, where it is counted. The oracle is computed here from the variant JSON.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { readRulingStore } from "../src/core/owner-rulings/ruling-store.js";
import { buildOntology } from "../src/core/ontology/build-ontology.js";
import { serializeOntology } from "../src/core/ontology/emit-ontology.js";
import { readNodeSources } from "../src/core/ontology/node-sources.js";
import type { Ontology } from "../src/core/ontology/ontology-types.js";
import { OntologyReadError } from "../src/core/ontology/read-error.js";
import { FULL, fullProject, write } from "./ontology-helpers.js";

type Json = unknown;
type Path = (string | number)[];
type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const isObj = (v: Json): v is Doc => v !== null && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v: Json): boolean => typeof v === "string" && v !== "";
const bad = (o: Doc, k: string): boolean => k in o && !nonEmpty(o[k]);

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => relative(dir, join(e.parentPath, e.name)).split("\\").join("/")).sort();
}
function* walk(v: Json, path: Path = []): Generator<{ path: Path; value: Json }> {
  yield { path, value: v };
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* walk(v[i], [...path, i]); }
  else if (isObj(v)) for (const k of Object.keys(v)) yield* walk(v[k], [...path, k]);
}
function put(doc: Json, path: Path, value: Json): Json {
  if (path.length === 0) return value;
  const copy = structuredClone(doc) as Doc;
  let at: Doc = copy;
  for (const k of path.slice(0, -1)) at = at[k];
  at[path[path.length - 1]!] = value;
  return copy;
}
function without(doc: Json, path: Path): Json {
  const copy = structuredClone(doc) as Doc;
  let at: Doc = copy;
  for (const k of path.slice(0, -1)) at = at[k];
  delete at[path[path.length - 1]!];
  return copy;
}
const REPLACEMENTS: [string, Json][] = [["number", 7], ["true", true], ["null", null], ["empty string", ""], ["list of one string", ["x"]], ["list of one number", [1]], ["object", {}]];

const files = jsonFiles(FULL);
const originals = new Map(files.map((f) => [f, JSON.parse(readFileSync(join(FULL, f), "utf8")) as Json]));
interface Variant { file: string; path: Path; how: string; doc: Json; unknownKey: boolean }
const variants: Variant[] = [];
for (const [file, doc] of originals) {
  for (const { path, value } of walk(doc)) {
    for (const [how, v] of REPLACEMENTS) variants.push({ file, path, how, doc: put(doc, path, v), unknownKey: false });
    const parent = path.length === 0 ? undefined : path.slice(0, -1).reduce((at: Json, k) => (at as Doc)[k], doc);
    if (isObj(parent)) variants.push({ file, path, how: "key removed", doc: without(doc, path), unknownKey: false });
    if (isObj(value)) variants.push({ file, path, how: "extra unknown key", doc: put(doc, path, { ...value, zz_unknown: "x" }), unknownKey: true });
  }
}

const project = fullProject();
interface Out { refused?: string; o?: Ontology }
function evaluate(): Out {
  try {
    const rulings = readRulingStore(project).rulings;
    return { o: buildOntology(readNodeSources(project, rulings), rulings).ontology };
  } catch (e) { if (e instanceof OntologyReadError) return { refused: e.code }; throw e; }
}
const linkSet = (o: Ontology): Set<string> => new Set(o.links.map((l) => `${l.kind} ${l.from} ${l.to}`));
const report = (o: Ontology, kind: string): { nodes: number; seen?: number; leftOut: Record<string, number> } => { const r = o.sources.find((s) => s.kind === kind)!; return { nodes: r.nodes, ...(r.seen === undefined ? {} : { seen: r.seen }), leftOut: r.leftOut ?? {} }; };
const sum = (m: Record<string, number>, prefix: string): number => Object.entries(m).filter(([k]) => k.startsWith(prefix)).reduce((n, [, c]) => n + c, 0);

/** Scope values the schema does not let the kernel read, counted from the variant itself. */
function scopeProblems(s: Json): number {
  if (s === "global") return 0;
  if (!isObj(s)) return 1;
  let n = Object.keys(s).filter((k) => !["apps", "features", "screens"].includes(k)).length;
  for (const k of ["apps", "features", "screens"]) {
    if (!(k in s) || s[k] === undefined) continue;
    n += Array.isArray(s[k]) ? s[k].filter((x: Json) => !nonEmpty(x)).length : 1;
  }
  return n;
}

function checkInvariant(o: Ontology, docs: Map<string, Json>, label: string): void {
  const rulings = (docs.get("design/knowledge/rulings.json") as Doc)["rulings"] as Json[];
  const usable = rulings.filter((r): r is Doc => isObj(r) && nonEmpty(r["id"]) && nonEmpty(r["text"]));
  const r = report(o, "ruling");
  expect(r.seen, label).toBe(rulings.length);
  expect(r.nodes, label).toBe(usable.length);
  expect(r.leftOut["without id or text"] ?? 0, label).toBe(rulings.length - usable.length);
  expect(sum(r.leftOut, "scope: "), label).toBe(usable.reduce((n, x) => n + ("scope" in x ? scopeProblems(x["scope"]) : 1), 0));
  const supBad = usable.filter((x) => bad(x, "superseded_by")).length;
  expect(sum(r.leftOut, "superseded_by: "), label).toBe(supBad);
  const supSeen = usable.filter((x) => "superseded_by" in x && nonEmpty(x["superseded_by"])).length;
  const written = o.links.filter((l) => l.kind === "superseded-by").length;
  expect(supSeen, label).toBe(written + o.linkReports.find((x) => x.link === "superseded-by")!.unresolved);

  const principles = (docs.get("design/principles.json") as Doc)["principles"] as Json[];
  const pUsable = principles.filter((p): p is Doc => isObj(p) && nonEmpty(p["id"]));
  const p = report(o, "principle");
  expect([p.seen, p.nodes, p.leftOut["without id"] ?? 0], label).toEqual([principles.length, pUsable.length, principles.length - pUsable.length]);
  expect(sum(p.leftOut, "text field"), label).toBe(pUsable.reduce((n, x) => n + ["title", "yields_when", "test"].filter((k) => bad(x, k)).length, 0));

  const meta = docs.get("design/knowledge/screens.meta.json") as Doc;
  const entries = Object.values(meta["screens"]) as Doc[];
  const a = report(o, "app");
  const count = (f: (e: Doc) => boolean): number => entries.filter(f).length;
  expect(a.seen, label).toBe(entries.length);
  expect(a.leftOut["without an app"] ?? 0, label).toBe(count((e) => !("app" in e)));
  expect(a.leftOut["app that is not a string"] ?? 0, label).toBe(count((e) => bad(e, "app")));
  expect(sum(a.leftOut, "feature that"), label).toBe(count((e) => bad(e, "feature")));
  expect(sum(a.leftOut, "figmaId that"), label).toBe(count((e) => bad(e, "figmaId")));
  expect(sum(a.leftOut, "meta field"), label).toBe(entries.reduce((n, e) => n + ["name", "kind", "page", "purpose"].filter((k) => k in e && typeof e[k] !== "string").length, 0));
  expect(a.leftOut["unassigned entry that is not an object"] ?? 0, label).toBe(((meta["unassigned"] ?? []) as Json[]).filter((u) => !isObj(u)).length);
}

describe("every ring-2 value, replaced by every wrong shape", () => {
  const base = (): Map<string, Json> => new Map(originals);
  it(`${variants.length} variants over ${files.join(", ")}: refused by name, or every entry and reference accounted for`, () => {
    for (const f of files) write(project, f, JSON.stringify(originals.get(f)));
    const clean = evaluate();
    expect(clean.refused).toBeUndefined();
    checkInvariant(clean.o!, base(), "unmodified fixture");
    const baseLinks = linkSet(clean.o!);
    const baseBytes = serializeOntology(clean.o!);
    let refusals = 0;
    for (const v of variants) {
      const label = `${v.file} ${["$", ...v.path].join(".")} -> ${v.how}`;
      write(project, v.file, JSON.stringify(v.doc));
      const out = evaluate();
      write(project, v.file, JSON.stringify(originals.get(v.file)));
      if (out.refused !== undefined) { expect(["ONTOLOGY_BAD_SOURCE", "CONVENTIONS_PAIR_DRIFT"], label).toContain(out.refused); refusals++; continue; }
      const docs = base();
      docs.set(v.file, v.doc);
      checkInvariant(out.o!, docs, label);
      // Skip rule: an entry whose `feature` key is removed belongs to its app (documented), so that one new belongs-to link is allowed.
      const toApp = v.how === "key removed" && v.path[v.path.length - 1] === "feature";
      for (const l of linkSet(out.o!)) expect(baseLinks.has(l) || (toApp && /^belongs-to screen:\S+ app:/.test(l)), `${label}: new link ${l}`).toBe(true);
      if (v.unknownKey && !v.path.includes("scope")) expect(serializeOntology(out.o!), label).toBe(baseBytes);
      if (v.unknownKey && v.path[v.path.length - 1] === "scope") expect(sum(report(out.o!, "ruling").leftOut, "scope: key the kernel does not read"), label).toBe(1);
    }
    expect(refusals).toBeGreaterThan(0);
    expect(refusals).toBeLessThan(variants.length);
    console.log(`ring-2 variants: ${variants.length} run, ${refusals} refused by name, ${variants.length - refusals} built and checked`);
  }, 300_000);
});
