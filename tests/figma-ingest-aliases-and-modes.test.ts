/**
 * An alias never points at something that is not written; a value that cannot be converted in any mode is asked about,
 * never dropped; "alias cycle" means a real cycle; "keep raw" never writes an alias blob. The written `tokens.json` of
 * every ingest passes the alias resolution `ui tokens compile` runs.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTokensTree } from "../src/core/figma-ds-tokens.js";
import type { DsVariable } from "../src/core/figma-ds-tokens.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { aliasTo, colorVar, ingestArgs, ingestUntilReady, newProject, preferring, scanOf, takeRecommended, writeScan } from "./figma-ingest-helpers.js";
import type { Choose } from "./figma-ingest-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

const FIX = (name: string): string => join(process.cwd(), "tests", "fixtures", "owner-rulings", name);
const FIGMA = (name: string): string => join(process.cwd(), "tests", "fixtures", "figma-ds", name);
const BAD = { r: "x", g: 0, b: 0 };
const asVars = (list: unknown[]): DsVariable[] => list as DsVariable[];
const id = (n: string): string => `VariableID:${n}`;
const blocked = (out: string): Cluster[] => JSON.parse(out).data.blocked.clusters as Cluster[];

/** Excludes whatever can be excluded, keeps what a question recommends, and keeps a collision's first collection. */
const answerAll: Choose = (c) => c.options.find((o) => o.id === "exclude" || o.id === "exclude-all")?.id ?? takeRecommended(c);

/** The repo's own alias resolution (what `ui tokens compile` runs): throws DANGLING_ALIAS or ALIAS_CYCLE. */
const resolves = (tokensJson: string): void => { resolveTokens(parseTokenFile(JSON.parse(tokensJson))); };

describe("buildTokensTree on its own (an unruled collision keeps nobody)", () => {
  const colliding = asVars([colorVar("1:1", "color/brand", "A"), colorVar("2:1", "color/brand", "B"), colorVar("3:1", "color/other", "A")]);
  it("leaves every variable of the colliding path out of the tree and lists them in `collisions`", () => {
    const r = buildTokensTree(colliding);
    expect(Object.keys(r.tree["color"] ?? {})).toEqual(["other"]);
    expect(r.collisions).toHaveLength(1);
    expect(r.collisions[0]!.variables.map((v) => v.id)).toEqual([id("1:1"), id("2:1")]);
    expect(r.excluded.collisionUnresolved).toEqual([id("1:1"), id("2:1")]);
  });
  it("a ruling that names a variable keeps exactly that one", () => {
    const r = buildTokensTree(colliding, { winners: new Map([["color.brand", id("2:1")]]) });
    expect([...r.pathById]).toEqual(expect.arrayContaining([[id("2:1"), "color.brand"]]));
    expect(r.pathById.has(id("1:1"))).toBe(false);
    expect(r.excluded.collisionLosers).toEqual([id("1:1")]);
  });
});

describe("aliases resolve only against variables that are written", () => {
  it("an alias to a variable that is left out is a dangling alias, and the exclusion cascades through a chain in a fixed order", () => {
    const vars = asVars([
      { id: id("1:1"), name: "color/bad", type: "COLOR", collection: "C", value: BAD },
      colorVar("2:1", "color/mid", "C", { Light: aliasTo("1:1") }),
      colorVar("3:1", "color/top", "C", { Light: aliasTo("2:1") }),
      colorVar("4:1", "color/fine", "C"),
    ]);
    const r = buildTokensTree(vars);
    expect(r.excluded.skipped["bad-colour"]).toEqual([id("1:1")]);
    expect(r.excluded.skipped["dangling-alias"]).toEqual([id("2:1"), id("3:1")]);
    expect(Object.keys(r.tree["color"] ?? {})).toEqual(["fine"]);
    expect(JSON.stringify(r.tree)).not.toContain("{color.bad}");
  });
  it("an alias to a collision loser is never re-pointed at the winner", () => {
    const vars = asVars([colorVar("1:1", "color/brand", "A"), colorVar("2:1", "color/brand", "B"), colorVar("3:1", "color/uses-b", "C", { Light: aliasTo("2:1") })]);
    const r = buildTokensTree(vars, { winners: new Map([["color.brand", id("1:1")]]) });
    expect(r.excluded.skipped["dangling-alias"]).toEqual([id("3:1")]);
    expect(r.tree["color"]).not.toHaveProperty("uses-b");
    expect(JSON.stringify(r.tree)).not.toContain("{color.brand}");
  });
  it("an alias to a variable the owner keeps raw is dangling too: a raw token is not an alias target", () => {
    const vars = asVars([{ id: id("1:1"), name: "color/odd", type: "COLOR", collection: "C", value: BAD }, colorVar("2:1", "color/uses-odd", "C", { Light: aliasTo("1:1") })]);
    const r = buildTokensTree(vars, { keepRaw: new Set([id("1:1"), id("2:1")]) });
    expect(r.rawKept).toEqual([id("1:1")]);
    expect(r.excluded.skipped["dangling-alias"]).toEqual([id("2:1")]);
    expect(r.skipDetail.get(id("2:1"))!.keepable).toBe(false);
  });
  it("a written alias points at the path of the variable written for its target", () => {
    const r = buildTokensTree(asVars([colorVar("1:1", "primitives/color/blue", "P"), colorVar("2:1", "semantic/color/action", "S", { Light: aliasTo("1:1") })]));
    expect(r.tree["color"]!["action"]!.$value).toBe("{color.blue}");
  });
});

describe("an alias cycle is a real cycle", () => {
  it("a variable that aliases itself, and a chain through distinct paths that returns to its start", () => {
    const vars = asVars([
      colorVar("1:1", "color/self", "C", { Light: aliasTo("1:1") }),
      colorVar("2:1", "color/a", "C", { Light: aliasTo("3:1") }),
      colorVar("3:1", "color/b", "C", { Light: aliasTo("2:1") }),
    ]);
    const r = buildTokensTree(vars);
    expect(r.excluded.skipped["alias-cycle"]).toEqual([id("1:1"), id("2:1"), id("3:1")]);
  });
  it("a variable that aliases a variable of another collection on its own path is a member of a collision, not a cycle", () => {
    const vars = asVars([colorVar("1:1", "color/brand", "A"), colorVar("2:1", "color/brand", "B", { Light: aliasTo("1:1") })]);
    const r = buildTokensTree(vars);
    expect(r.excluded.skipped["alias-cycle"]).toEqual([]);
    expect(r.collisions.map((c) => [c.path, c.variables.map((v) => v.id)])).toEqual([["color.brand", [id("1:1"), id("2:1")]]]);
  });
  it("a chain that ends in a variable that is not typed is a dangling alias, not a cycle", () => {
    const vars = asVars([{ id: id("1:1"), name: "flags/on", type: "BOOLEAN", collection: "C", value: true }, colorVar("2:1", "color/x", "C", { Light: aliasTo("1:1") })]);
    const r = buildTokensTree(vars);
    expect(r.excluded.skipped["unmappable-type"]).toEqual([id("1:1")]);
    expect(r.excluded.skipped["dangling-alias"]).toEqual([id("2:1")]);
  });
});

describe("a value that cannot be converted in a non-base mode", () => {
  const vars = asVars([colorVar("1:1", "color/surface", "C", { Light: { r: 1, g: 1, b: 1, a: 1 }, Dark: "oops" })]);
  it("leaves the variable out with the failing value's reason and the mode named; no variable is written with a mode missing", () => {
    const r = buildTokensTree(vars);
    expect(r.excluded.skipped["bad-colour"].concat(r.excluded.skipped["null-leaf"])).toEqual([id("1:1")]);
    expect(r.skipDetail.get(id("1:1"))).toMatchObject({ mode: "Dark", keepable: true });
    expect(r.tree).toEqual({});
  });
  it("the ingest asks about it, names the mode, and writes nothing until it is answered", () => {
    const project = newProject();
    const out = newProject();
    const r = capture([...ingestArgs(writeScan(project, scanOf({ tokens: vars })), project, out), "--json"]);
    expect(r.code).toBe(1);
    const q = blocked(r.out)[0]!;
    expect(q.kind).toBe("untypeable-tokens");
    expect(Object.values(q.labels!)[0]).toContain("in mode Dark");
  });
});

describe("the untypeable question is assigned: alias reasons can only be excluded", () => {
  const scan = (): Record<string, unknown> => scanOf({ tokens: [
    { id: id("1:1"), name: "color/odd", type: "COLOR", collection: "C", value: BAD },
    colorVar("2:1", "color/uses-odd", "C", { Light: aliasTo("1:1") }),
    colorVar("3:1", "color/dangling", "C", { Light: aliasTo("9:9") }),
    colorVar("4:1", "color/fine", "C"),
  ] });
  const ask = (): Cluster => {
    const project = newProject();
    return blocked(capture([...ingestArgs(writeScan(project, scan()), project, newProject()), "--json"]).out)[0]!;
  };
  it("a member with a value to keep may take keep-raw or exclude; an alias member only exclude", () => {
    const q = ask();
    expect(q.memberChoices![id("1:1")]!.map((c) => c.id)).toEqual(["keep-raw", "exclude"]);
    expect(q.memberChoices![id("2:1")]!.map((c) => c.id)).toEqual(["exclude"]);
    expect(q.memberChoices![id("3:1")]!.map((c) => c.id)).toEqual(["exclude"]);
  });
  it("'keep as raw string tokens' assigns keep-raw to the member with a value and exclude to the others, and says both counts", () => {
    const q = ask();
    const keep = q.options.find((o) => o.id === "keep-raw")!;
    expect(keep.assigns).toEqual({ [id("1:1")]: "keep-raw", [id("2:1")]: "exclude", [id("3:1")]: "exclude" });
    expect(keep.consequence).toContain("1 token(s) written under \"raw\"");
    expect(keep.consequence).toContain("2 left out");
  });
  it("answering keep-raw writes only the raw token and no alias blob; the rest are counted under their reasons", () => {
    const project = newProject();
    const out = newProject();
    const { final } = ingestUntilReady(writeScan(project, scan()), project, out, preferring("keep-raw"), ["--json"]);
    const text = readFileSync(join(out, "tokens.json"), "utf8");
    expect(text).not.toContain("VARIABLE_ALIAS");
    expect(Object.keys(JSON.parse(text).raw)).toHaveLength(1);
    expect(JSON.parse(final.out).data.ledger.excluded).toMatchObject({ "dangling-alias": 2, total: 2 });
    resolves(text);
  });
  it("when no member has a value to keep, the options are 'Exclude them' and review, and the text names the earlier answer", () => {
    const project = newProject();
    const noValue = scanOf({ tokens: [colorVar("1:1", "color/dangling", "C", { Light: aliasTo("9:9") })] });
    const q = blocked(capture([...ingestArgs(writeScan(project, noValue), project, newProject()), "--json"]).out)[0]!;
    expect(q.options.map((o) => [o.id, o.label])).toEqual([["exclude", "Exclude them"], ["review-individually", "Review individually"]]);
    expect(q.question).toMatch(/collections answer or the collision answer/);
  });
});

describe("the written tokens.json passes the alias resolution of `ui tokens compile`, on every ingest fixture and on alias fixtures", () => {
  const fixtures: [string, string][] = [
    ["control", FIX("control-single-collection-single-page.json")],
    ["mixed", FIGMA("ds-mixed.json")],
    ["plugin scan", FIGMA("ds.json")],
    ["five collections", FIX("variables-five-collections.json")],
    ["eleven pages", FIX("components-eleven-pages.json")],
    ["sensed field shape", FIX("scan-sensed-field-shape.json")],
  ];
  const aliasFixtures: [string, Record<string, unknown>][] = [
    ["alias to an excluded variable", scanOf({ tokens: [{ id: id("1:1"), name: "color/bad", type: "COLOR", collection: "C", value: BAD }, colorVar("2:1", "color/uses", "C", { Light: aliasTo("1:1") })] })],
    ["alias to a collision loser", scanOf({ tokens: [colorVar("1:1", "color/brand", "A"), colorVar("2:1", "color/brand", "B"), colorVar("3:1", "color/uses", "C", { Light: aliasTo("2:1") })] })],
    ["alias to a variable in a collection that is left out", scanOf({ tokens: [colorVar("1:1", "color/brand", "A"), colorVar("2:1", "color/brand", "B"), colorVar("3:1", "color/uses", "B", { Light: aliasTo("1:1") }), colorVar("4:1", "color/solo", "S")] })],
    ["a chain of three", scanOf({ tokens: [{ id: id("1:1"), name: "color/bad", type: "COLOR", collection: "C", value: BAD }, colorVar("2:1", "color/b", "C", { Light: aliasTo("1:1") }), colorVar("3:1", "color/c", "C", { Light: aliasTo("2:1") })] })],
    ["a mode alias to a variable that is left out", scanOf({ tokens: [{ id: id("1:1"), name: "color/bad", type: "COLOR", collection: "C", value: BAD }, colorVar("2:1", "color/x", "C", { Light: { r: 1, g: 0, b: 0, a: 1 }, Dark: aliasTo("1:1") })] })],
  ];
  const run = (path: string): string => {
    const project = newProject();
    const out = newProject();
    ingestUntilReady(path, project, out, answerAll, ["--json"]);
    return readFileSync(join(out, "tokens.json"), "utf8");
  };
  for (const [label, path] of fixtures) it(`${label}: no dangling alias is written`, () => { resolves(run(path)); });
  for (const [label, scan] of aliasFixtures) {
    it(`${label}: no dangling alias is written`, () => {
      const project = newProject();
      resolves(run(writeScan(project, scan)));
    });
  }
});

describe("excluded items are named where the text promises it", () => {
  const many = (): Record<string, unknown> => scanOf({ tokens: [
    colorVar("0:1", "color/fine", "C"),
    ...Array.from({ length: 12 }, (_, i) => ({ id: id(`${i + 1}:1`), name: `color/odd-${i}`, type: "COLOR", collection: "C", value: BAD })),
  ] });
  it("the envelope lists every excluded item with its id and name", () => {
    const project = newProject();
    const { final } = ingestUntilReady(writeScan(project, many()), project, newProject(), preferring("exclude"), ["--json"]);
    const items = JSON.parse(final.out).data.excluded.items["bad-colour"] as { id: string; name: string }[];
    expect(items).toHaveLength(12);
    expect(items[0]).toEqual({ id: id("1:1"), name: "color/odd-0" });
  });
  it("the text output and DESIGN.md name at most ten per reason, then point at --json", () => {
    const project = newProject();
    const out = newProject();
    const { final } = ingestUntilReady(writeScan(project, many()), project, out, preferring("exclude"));
    for (const text of [final.out, readFileSync(join(out, "DESIGN.md"), "utf8")]) {
      expect(text).toContain("color/odd-9");
      expect(text).not.toContain("color/odd-10");
      expect(text).toContain("+2 more (full list with `--json`)");
    }
  });
});
