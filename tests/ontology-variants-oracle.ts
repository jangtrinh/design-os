/**
 * The oracle of the ring-2 variant test. Everything is computed here from the variant JSON and from the GRAPH (nodes and
 * links), never from a reader's own totals where the graph can answer: node counts come from the nodes, each scope value,
 * each `figmaId` and each mention is a link, an unresolved reference or a counted repeat, and a link that the variant
 * lost against the unmodified fixture must be explained by a changed value of the same entry and by a count.
 */
import { expect } from "vitest";
import type { Ontology } from "../src/core/ontology/ontology-types.js";
import { at, isObj, nonEmpty } from "./ontology-variants-walker.js";
import type { Doc, Json, Variant } from "./ontology-variants-walker.js";

const MENTION = /`(component|token|pattern):([^`\n]+)`/g;
type Left = Record<string, number>;
const src = (o: Ontology, kind: string): { seen?: number; leftOut: Left } => { const r = o.sources.find((s) => s.kind === kind)!; return { ...(r.seen === undefined ? {} : { seen: r.seen }), leftOut: r.leftOut ?? {} }; };
const total = (m: Left, test: (reason: string) => boolean): number => Object.entries(m).filter(([k]) => test(k)).reduce((n, [, c]) => n + c, 0);
const prefixed = (m: Left, prefix: string): number => total(m, (k) => k.startsWith(prefix) && !k.endsWith("repeated value"));
const bad = (o: Doc, k: string): boolean => k in o && !nonEmpty(o[k]);
const key = (l: { kind: string; from: string; to: string }): string => `${l.kind} ${l.from} ${l.to}`;
const unresolved = (o: Ontology, link: string): number => o.linkReports.find((x) => x.link === link)!.unresolved;

function scopeProblems(s: Json): number {
  if (s === "global") return 0;
  if (!isObj(s)) return 1;
  let n = Object.keys(s).filter((k) => !["apps", "features", "screens"].includes(k)).length;
  for (const k of ["apps", "features", "screens"]) if (k in s && s[k] !== undefined) n += Array.isArray(s[k]) ? s[k].filter((x: Json) => !nonEmpty(x)).length : 1;
  return n;
}

/** Every mention found with the test's own pattern: (node it is written in, the node it names). */
function mentionsOf(rulings: Doc[], principles: Doc[]): { from: string; to: string }[] {
  const texts = [...rulings.map((r) => ({ from: `ruling:${r["id"]}`, text: r["text"] as string })), ...principles.map((p) => ({ from: `principle:${p["id"]}`, text: [nonEmpty(p["title"]) ? p["title"] : p["id"], p["yields_when"], p["test"]].filter(nonEmpty).join("\n") }))];
  return texts.flatMap((t) => [...t.text.matchAll(MENTION)].map((m) => ({ from: t.from, to: `${m[1]}:${m[2]}` })));
}

export function checkInvariant(o: Ontology, docs: ReadonlyMap<string, Json>, label: string): void {
  const kindCount = (kind: string): number => o.nodes.filter((n) => n.kind === kind).length;
  const ids = new Set(o.nodes.map((n) => n.id));
  const rulingList = (docs.get("design/knowledge/rulings.json") as Doc)["rulings"] as Json[];
  const rulings = rulingList.filter((r): r is Doc => isObj(r) && nonEmpty(r["id"]) && nonEmpty(r["text"]));
  const rs = src(o, "ruling");
  expect([rs.seen, kindCount("ruling"), rs.leftOut["without id or text"] ?? 0], label).toEqual([rulingList.length, rulings.length, rulingList.length - rulings.length]);
  expect(prefixed(rs.leftOut, "scope: "), label).toBe(rulings.reduce((n, x) => n + ("scope" in x ? scopeProblems(x["scope"]) : 1), 0));
  const selfRef = rulings.filter((x) => nonEmpty(x["superseded_by"]) && x["superseded_by"] === x["id"]).length;
  expect(prefixed(rs.leftOut, "superseded_by: "), label).toBe(rulings.filter((x) => bad(x, "superseded_by")).length + selfRef);
  const supSeen = rulings.filter((x) => nonEmpty(x["superseded_by"]) && x["superseded_by"] !== x["id"]).length;
  expect(supSeen, label).toBe(o.links.filter((l) => l.kind === "superseded-by").length + unresolved(o, "superseded-by") + (rs.leftOut["superseded_by: repeated value"] ?? 0));

  const principleList = (docs.get("design/principles.json") as Doc)["principles"] as Json[];
  const principles = principleList.filter((p): p is Doc => isObj(p) && nonEmpty(p["id"]));
  const ps = src(o, "principle");
  expect([ps.seen, kindCount("principle"), ps.leftOut["without id"] ?? 0], label).toEqual([principleList.length, principles.length, principleList.length - principles.length]);
  expect(total(ps.leftOut, (k) => k.startsWith("text field")), label).toBe(principles.reduce((n, x) => n + ["title", "yields_when", "test"].filter((k) => bad(x, k)).length, 0));

  // Mentions, from the graph: a mention whose target node exists is a link (written once), else an unresolved reference.
  const mentions = mentionsOf(rulings, principles);
  const found = mentions.filter((m) => ids.has(m.to));
  const pairs = new Set(found.map((m) => `${m.from} ${m.to}`));
  const mentionLinks = o.links.filter((l) => l.kind === "governs" && /^(ruling|principle):/.test(l.from) && /^(component|token|pattern):/.test(l.to));
  expect(new Set(mentionLinks.map((l) => `${l.from} ${l.to}`)), label).toEqual(pairs);
  const mentionRepeated = (rs.leftOut["mention: repeated value"] ?? 0) + (ps.leftOut["mention: repeated value"] ?? 0);
  expect(mentionRepeated, label).toBe(found.length - pairs.size);

  // Scope values: valid items seen = governs links to app, feature and screen nodes + unresolved + repeated.
  const items = rulings.flatMap((r) => (isObj(r["scope"]) ? ["apps", "features", "screens"].flatMap((k) => (Array.isArray(r["scope"][k]) ? (r["scope"][k] as Json[]).filter(nonEmpty) : [])) : []));
  for (const r of rulings) if (isObj(r["scope"]) && Array.isArray(r["scope"]["apps"])) for (const a of (r["scope"]["apps"] as Json[]).filter(nonEmpty)) if (ids.has(`app:${a}`)) expect(o.links.some((l) => l.kind === "governs" && l.from === `ruling:${r["id"]}` && l.to === `app:${a}`), `${label}: app ${a} of ${r["id"]}`).toBe(true);
  const scopeLinks = o.links.filter((l) => l.kind === "governs" && /^ruling:/.test(l.from) && /^(app|feature|screen):/.test(l.to)).length;
  const scopeUnresolved = unresolved(o, "governs") - (mentions.length - found.length);
  expect(scopeUnresolved, label).toBeGreaterThanOrEqual(0);
  expect(items.length, `${label}: scope values seen = links + unresolved + repeated`).toBe(scopeLinks + scopeUnresolved + (rs.leftOut["scope: repeated value"] ?? 0));

  const meta = docs.get("design/knowledge/screens.meta.json") as Doc;
  const entries = Object.values(meta["screens"]) as Doc[];
  const usable = entries.filter((e) => isObj(e));
  const a = src(o, "app");
  const count = (f: (e: Doc) => boolean): number => entries.filter(f).length;
  expect(a.seen, label).toBe(entries.length);
  expect(kindCount("app"), label).toBe(new Set(usable.filter((e) => nonEmpty(e["app"])).map((e) => e["app"])).size);
  expect(kindCount("feature"), label).toBe(new Set(usable.filter((e) => nonEmpty(e["app"]) && nonEmpty(e["feature"])).map((e) => `${e["app"]}\u0000${e["feature"]}`)).size);
  expect(a.leftOut["without an app"] ?? 0, label).toBe(count((e) => !("app" in e)));
  expect(a.leftOut["app that is not a string"] ?? 0, label).toBe(count((e) => bad(e, "app")));
  expect(total(a.leftOut, (k) => k.startsWith("feature that")), label).toBe(count((e) => bad(e, "feature")));
  expect(total(a.leftOut, (k) => k.startsWith("figmaId that")), label).toBe(count((e) => bad(e, "figmaId")));
  expect(total(a.leftOut, (k) => k.startsWith("meta field")), label).toBe(entries.reduce((n, e) => n + ["name", "kind", "page", "purpose"].filter((k) => k in e && typeof e[k] !== "string").length, 0));
  expect(a.leftOut["unassigned entry that is not an object"] ?? 0, label).toBe(((meta["unassigned"] ?? []) as Json[]).filter((u) => !isObj(u)).length);

  // figmaId values: tied + untied = entries. An entry is tied when its figmaId is one Figma frame node and no other entry claims it.
  const frames = new Set(o.nodes.filter((n) => n.kind === "screen" && n["door"] === "figma").map((n) => n.id));
  const claims = new Map<string, number>();
  for (const e of entries) if (nonEmpty(e["figmaId"])) claims.set(e["figmaId"], (claims.get(e["figmaId"]) ?? 0) + 1);
  const tied = entries.filter((e) => nonEmpty(e["figmaId"]) && frames.has(`screen:${e["figmaId"]}`) && claims.get(e["figmaId"]) === 1);
  expect(unresolved(o, "belongs-to"), `${label}: tied + untied = entries`).toBe(entries.length - tied.length);
  for (const e of tied) {
    const parent = o.links.filter((l) => l.kind === "belongs-to" && l.from === `screen:${e["figmaId"]}`);
    expect(parent.length, `${label}: parent of ${e["figmaId"]}`).toBe(nonEmpty(e["app"]) && !bad(e, "feature") ? 1 : 0);
    const fields = ["name", "kind", "page", "purpose"].filter((k) => nonEmpty(e[k]));
    expect(o.nodes.find((n) => n.id === `screen:${e["figmaId"]}`)!["meta"] !== undefined, `${label}: meta of ${e["figmaId"]}`).toBe(fields.length > 0);
  }
}

/** True when a count of the variant is above the unmodified fixture's: a value left out or repeated, or a reference unresolved. */
function countGrew(base: Ontology, o: Ontology): boolean {
  const left = (g: Ontology): number => ["ruling", "principle", "app", "feature"].reduce((n, k) => n + total(src(g, k).leftOut, () => true), 0);
  return left(o) > left(base) || ["governs", "superseded-by", "belongs-to"].some((l) => unresolved(o, l) > unresolved(base, l));
}

/** The ids the variant's entry can have changed: the node ids built from that entry's old and new values. */
function entryIds(v: Variant, originals: ReadonlyMap<string, Json>, base: Ontology, o: Ontology): Set<string> | "all" {
  const [head, index] = v.path;
  const old = originals.get(v.file) as Doc;
  const doc = v.doc as Doc;
  const both = [base, o].flatMap((g) => g.nodes);
  if (v.file.endsWith("rulings.json") && head === "rulings" && typeof index === "number") return new Set([old, doc].map((d) => `ruling:${d["rulings"]?.[index]?.["id"]}`));
  if (v.file.endsWith("principles.json") && head === "principles" && typeof index === "number") return new Set([old, doc].map((d) => `principle:${d["principles"]?.[index]?.["id"]}`));
  if (v.file.endsWith("screens.meta.json") && head === "screens" && typeof index === "string") {
    const values = [old, doc].map((d) => d["screens"]?.[index]).filter(isObj);
    const names = new Set(values.flatMap((e) => [e["app"], e["feature"]]).filter(nonEmpty));
    return new Set(["project:root", ...values.filter((e) => nonEmpty(e["figmaId"])).map((e) => `screen:${e["figmaId"]}`), ...both.filter((n) => (n.kind === "app" || n.kind === "feature") && names.has(n.name)).map((n) => n.id)]);
  }
  return v.path.length <= 1 ? "all" : new Set();
}

/** A link new against the unmodified fixture is allowed only for a value changed to another valid one, on that entry. */
export function checkNewLinks(base: Ontology, o: Ontology, v: Variant, originals: ReadonlyMap<string, Json>, label: string): void {
  const before = new Set(base.links.map(key));
  const own = entryIds(v, originals, base, o);
  const toApp = v.how === "key removed" && v.path[v.path.length - 1] === "feature"; // an entry with no `feature` key belongs to its app (documented)
  for (const l of o.links) {
    if (before.has(key(l))) continue;
    const allowed = (toApp && /^belongs-to screen:\S+ app:/.test(key(l))) || (v.how.startsWith("another id") && (own === "all" || own.has(l.from) || own.has(l.to)));
    expect(allowed, `${label}: new link ${key(l)}`).toBe(true);
  }
}

/** A link lost against the unmodified fixture needs a changed value of its own entry and a count, or a move to a new end. */
export function checkLostLinks(base: Ontology, o: Ontology, v: Variant, originals: ReadonlyMap<string, Json>, label: string): void {
  const after = new Set(o.links.map(key));
  const before = new Set(base.links.map(key));
  const added = o.links.filter((l) => !before.has(key(l)));
  const own = entryIds(v, originals, base, o);
  const grew = countGrew(base, o);
  const nodes = new Set(o.nodes.map((n) => n.id));
  for (const l of base.links) {
    if (after.has(key(l))) continue;
    const inEntry = own === "all" || own.has(l.from) || own.has(l.to);
    const moved = added.some((m) => m.kind === l.kind && (m.from === l.from || m.to === l.to));
    const endpointGone = !nodes.has(l.from) || !nodes.has(l.to);
    // A scope that is an object with no valid item is understood as "names no target" (documented): its ruling gets no scope link.
    const ruling = v.file.endsWith("rulings.json") ? ((v.doc as Doc)["rulings"] as Json[]).find((r) => isObj(r) && `ruling:${r["id"]}` === l.from) : undefined;
    const namesNothing = /^(project|app|feature|screen):/.test(l.to) && isObj(ruling) && isObj(ruling["scope"]) && ["apps", "features", "screens"].every((k) => !Array.isArray(ruling["scope"][k]) || !(ruling["scope"][k] as Json[]).some(nonEmpty));
    // A removed key is no reference any more: the value it held named the target of this link (a name, or "global" for the project).
    const goneValue = v.how === "key removed" && JSON.stringify(at(originals.get(v.file), v.path)).includes(l.to.startsWith("project:") ? "global" : l.to.slice(l.to.indexOf(":") + 1).split("/").pop()!);
    expect(inEntry && (grew || moved || endpointGone || namesNothing || goneValue), `${label}: lost link ${key(l)} has no changed value of its entry with a count`).toBe(true);
  }
}

