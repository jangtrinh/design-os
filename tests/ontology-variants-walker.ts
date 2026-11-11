/**
 * The walk of the ring-2 variant test: every object, list and leaf of every ring-2 JSON file of the full fixture, found by
 * walking the parsed JSON (no list of fields), and the variants made from it. Replacements: a number, `true`, `null`, `""`,
 * a list of one string, a list of one number, an object, the first item of a list repeated, a string leaf replaced by a
 * valid key of another node kind of the same fixture; for every key the key removed; for every object one extra unknown key.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export type Json = unknown;
export type Path = (string | number)[];
export type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const isObj = (v: Json): v is Doc => v !== null && typeof v === "object" && !Array.isArray(v);
export const nonEmpty = (v: Json): v is string => typeof v === "string" && v !== "";

export interface Variant { file: string; path: Path; how: string; doc: Json; unknownKey: boolean }

export function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => relative(dir, join(e.parentPath, e.name)).split("\\").join("/")).sort();
}
export const loadFiles = (dir: string): Map<string, Json> => new Map(jsonFiles(dir).map((f) => [f, JSON.parse(readFileSync(join(dir, f), "utf8")) as Json]));

function* walk(v: Json, path: Path = []): Generator<{ path: Path; value: Json }> {
  yield { path, value: v };
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* walk(v[i], [...path, i]); }
  else if (isObj(v)) for (const k of Object.keys(v)) yield* walk(v[k], [...path, k]);
}
export function at(doc: Json, path: Path): Json { return path.reduce((cur: Json, k) => (cur as Doc)[k], doc); }
function put(doc: Json, path: Path, value: Json): Json {
  if (path.length === 0) return value;
  const copy = structuredClone(doc) as Doc;
  (at(copy, path.slice(0, -1)) as Doc)[path[path.length - 1]!] = value;
  return copy;
}
function without(doc: Json, path: Path): Json {
  const copy = structuredClone(doc) as Doc;
  delete (at(copy, path.slice(0, -1)) as Doc)[path[path.length - 1]!];
  return copy;
}
const SHAPES: [string, Json][] = [["number", 7], ["true", true], ["null", null], ["empty string", ""], ["list of one string", ["x"]], ["list of one number", [1]], ["object", {}]];

/** `keysByKind`: node kind -> the keys (the id without its kind prefix) of the unmodified fixture's graph. */
export function makeVariants(originals: ReadonlyMap<string, Json>, keysByKind: ReadonlyMap<string, readonly string[]>): Variant[] {
  const kindsOf = (key: string): string[] => [...keysByKind].filter(([, keys]) => keys.includes(key)).map(([k]) => k);
  const out: Variant[] = [];
  for (const [file, doc] of originals) {
    for (const { path, value } of walk(doc)) {
      const add = (how: string, next: Json, unknownKey = false): void => { out.push({ file, path, how, doc: next, unknownKey }); };
      for (const [how, v] of SHAPES) add(how, put(doc, path, v));
      if (path.length > 0 && isObj(at(doc, path.slice(0, -1)))) add("key removed", without(doc, path));
      if (isObj(value)) add("extra unknown key", put(doc, path, { ...value, zz_unknown: "x" }), true);
      if (Array.isArray(value) && value.length > 0) add("first item repeated", put(doc, path, [value[0], ...value]));
      if (typeof value === "string") {
        const own = kindsOf(value);
        // Another kind: one key of that kind. The same kind: every other key (a second claim on one figmaId, a ruling naming itself).
        if (own.length > 0) for (const [kind, keys] of keysByKind) for (const other of own.includes(kind) ? keys.filter((k) => k !== value) : keys.slice(0, 1)) add(`another id of kind ${kind}`, put(doc, path, other));
      }
    }
  }
  return out;
}
