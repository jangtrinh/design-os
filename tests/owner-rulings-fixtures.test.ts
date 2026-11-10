/**
 * The synthetic scan fixtures reproduce the measured shapes by count, and the control raises nothing.
 * The shape is measured here with the kernel's own path function, so "colliding" means what the ingest means.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inferDtcgType, pathOf } from "../src/core/figma-ds-tokens.js";
import type { DsVariable } from "../src/core/figma-ds-tokens.js";

const DIR = join(process.cwd(), "tests", "fixtures", "owner-rulings");
const load = (name: string): { tokens: DsVariable[]; components: { id: string; name: string; page: string }[] } =>
  JSON.parse(readFileSync(join(DIR, name), "utf8"));

/** Collections with their variable counts, and every token path that two different collections both map to. */
function measureCollections(tokens: DsVariable[]): { counts: Map<string, number>; collisions: { path: string; collections: string[] }[] } {
  const counts = new Map<string, number>();
  const byPath = new Map<string, Set<string>>();
  for (const v of tokens) {
    const collection = v.collection ?? "";
    counts.set(collection, (counts.get(collection) ?? 0) + 1);
    const flat = v.valuesByMode !== undefined ? "COLOR" : v.type; // an alias takes its target's type; the fixtures alias colours only
    const type = inferDtcgType(v.name, flat);
    if (type === null) continue;
    const p = pathOf(v.name, type);
    const key = `${p.category}.${p.token}`;
    (byPath.get(key) ?? byPath.set(key, new Set()).get(key)!).add(collection);
  }
  const collisions = [...byPath].filter(([, set]) => set.size > 1).map(([path, set]) => ({ path, collections: [...set].sort() }));
  return { counts, collisions };
}

const MARKER = /^(❌|\[(archived|deprecated)\])\s*/i;

function measurePages(components: { name: string; page: string }[]): { perPage: Map<string, number>; marked: number; duplicates: number; surplus: number } {
  const perPage = new Map<string, number>();
  const names = new Map<string, number>();
  let marked = 0;
  for (const c of components) {
    perPage.set(c.page, (perPage.get(c.page) ?? 0) + 1);
    if (MARKER.test(c.name)) marked++;
    const stripped = c.name.replace(MARKER, "");
    names.set(stripped, (names.get(stripped) ?? 0) + 1);
  }
  const dup = [...names.values()].filter((n) => n > 1);
  return { perPage, marked, duplicates: dup.length, surplus: dup.reduce((a, n) => a + n - 1, 0) };
}

describe("fixture: five variable collections", () => {
  const { counts, collisions } = measureCollections(load("variables-five-collections.json").tokens);
  it("has 516 variables in 5 collections with the measured per-collection counts", () => {
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(516);
    expect(Object.fromEntries(counts)).toEqual({ Semantic: 149, Primitives: 103, "Spacing Primitives": 98, "Plugin Export A": 86, "Plugin Export B": 80 });
  });
  it("has 76 colliding token paths, all between the two plugin-style collections", () => {
    expect(collisions).toHaveLength(76);
    for (const c of collisions) expect(c.collections).toEqual(["Plugin Export A", "Plugin Export B"]);
  });
});

describe("fixture: eleven pages", () => {
  const m = measurePages(load("components-eleven-pages.json").components);
  it("has 781 nodes on 11 pages: 477 on the library page and 304 on ten feature pages", () => {
    expect(m.perPage.size).toBe(11);
    expect([...m.perPage.values()].reduce((a, b) => a + b, 0)).toBe(781);
    expect(m.perPage.get("Library")).toBe(477);
    expect([...m.perPage].filter(([p]) => p !== "Library").map(([, n]) => n).sort((a, b) => b - a)).toEqual([144, 48, 34, 30, 18, 14, 10, 4, 1, 1]);
  });
  it("has 25 archive-marked names and 9 duplicated names (12 surplus records)", () => {
    expect(m.marked).toBe(25);
    expect(m.duplicates).toBe(9);
    expect(m.surplus).toBe(12);
  });
});

describe("fixture: single-collection single-page control", () => {
  const f = load("control-single-collection-single-page.json");
  it("raises nothing: one collection, no colliding path, one page, no marker, no duplicate", () => {
    const { counts, collisions } = measureCollections(f.tokens);
    expect(counts.size).toBe(1);
    expect(collisions).toEqual([]);
    const m = measurePages(f.components);
    expect(m.perPage.size).toBe(1);
    expect([m.marked, m.duplicates, m.surplus]).toEqual([0, 0, 0]);
  });
  it("the shape probe can go red: the five-collection fixture is NOT clean under the same probe", () => {
    expect(measureCollections(load("variables-five-collections.json").tokens).collisions.length).toBeGreaterThan(0);
  });
});
