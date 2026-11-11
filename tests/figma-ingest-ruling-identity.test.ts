/**
 * A ruling names what it keeps by id. A collection rename or a scan reorder never changes what a stored ruling means;
 * a change in who collides is a new question, and nothing is written for it until it is answered.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { colorVar, comp, ingestArgs, ingestUntilReady, newProject, reviewing, scanOf, takeRecommended, writeScan } from "./figma-ingest-helpers.js";
import type { Choose } from "./figma-ingest-helpers.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";

const RED = { Light: { r: 1, g: 0, b: 0, a: 1 } };
const GREEN = { Light: { r: 0, g: 1, b: 0, a: 1 } };
const BLUE = { Light: { r: 0, g: 0, b: 1, a: 1 } };
const blocked = (out: string): Cluster[] => JSON.parse(out).data.blocked.clusters as Cluster[];
const read = (dir: string, file: string): string => readFileSync(join(dir, file), "utf8");
const tokens = (dir: string): Record<string, Record<string, { $value: string }>> => JSON.parse(read(dir, "tokens.json")) as Record<string, Record<string, { $value: string }>>;

/** The ids in a collision member (`<path>#<id>,<id>`), sorted. */
const idsOf = (member: string): string[] => member.split("#")[1]!.split(",");
/** Keep every collection; for a collision keep the variable `pick` chooses among those on the path. */
const keepAllThenVariable = (pick: (ids: string[]) => string): Choose => (c) => {
  if (c.kind === "figma-collections") return c.options.filter((o) => (o.selects ?? []).length > 0).map((o) => o.id);
  if (c.kind === "token-path-collision") return reviewing((m) => `keep:${pick(idsOf(m))}`)(c);
  return takeRecommended(c);
};
const first = (ids: string[]): string => ids[0]!;
const second = (ids: string[]): string => ids[1]!;

/** A primitives collection, plus `A` and `B` that both map a variable to `color/brand`. */
const collidingScan = (aName = "A"): Record<string, unknown> => scanOf({ tokens: [
  colorVar("1:1", "color/blue", "Primitives", BLUE),
  colorVar("2:1", "color/brand", aName, RED),
  colorVar("3:1", "color/brand", "B", GREEN),
] });

describe("a collection rename after a collision ruling", () => {
  it("writes the same path from the same variable, and asks nothing about it", () => {
    const project = newProject();
    const out = newProject();
    const scan = collidingScan("A") as { tokens: Record<string, unknown>[] };
    const path = writeScan(project, scan);
    // keep the variable from A (the red one): the ruling names its id
    ingestUntilReady(path, project, out, keepAllThenVariable(first), ["--json"]);
    expect(tokens(out)["color"]!["brand"]!.$value).toBe("#FF0000");

    for (const v of scan.tokens) if (v["collection"] === "A") v["collection"] = "A-renamed";
    writeScan(project, scan);
    const asked = capture([...ingestArgs(path, project, out), "--json"]);
    // the renamed collection is a new member of the collections question and nothing else is asked
    expect(asked.code).toBe(1);
    expect(blocked(asked.out).map((c) => [c.kind, c.members])).toEqual([["figma-collections", ["A-renamed"]]]);
    const { final } = ingestUntilReady(path, project, out, keepAllThenVariable(first), ["--json"]);
    const data = JSON.parse(final.out).data as { ledger: { excluded: Record<string, number> } };
    expect(tokens(out)["color"]!["brand"]!.$value).toBe("#FF0000");
    expect(data.ledger.excluded["path-collision"]).toBe(1);
  });

  it("the ruling can also be the loser: the other variable keeps the path after the rename, never none", () => {
    const project = newProject();
    const out = newProject();
    const scan = collidingScan("A") as { tokens: Record<string, unknown>[] };
    const path = writeScan(project, scan);
    ingestUntilReady(path, project, out, keepAllThenVariable(second), ["--json"]);
    expect(tokens(out)["color"]!["brand"]!.$value).toBe("#00FF00");
    for (const v of scan.tokens) if (v["collection"] === "B") v["collection"] = "B-renamed";
    writeScan(project, scan);
    ingestUntilReady(path, project, out, keepAllThenVariable(second), ["--json"]);
    expect(tokens(out)["color"]!["brand"]!.$value).toBe("#00FF00");
  });
});

describe("a scan reorder never changes a written value or which node keeps a name", () => {
  it("two variables of one collection on one path: the kept variable is the same after the scan is reordered", () => {
    const project = newProject();
    const out = newProject();
    const scan = scanOf({ tokens: [colorVar("1:1", "color/primary", "Only", RED), colorVar("2:1", "color/primary", "Only", GREEN)] }) as { tokens: unknown[] };
    const path = writeScan(project, scan);
    ingestUntilReady(path, project, out, keepAllThenVariable(first), ["--json"]);
    const before = read(out, "tokens.json");
    expect(tokens(out)["color"]!["primary"]!.$value).toBe("#FF0000");
    scan.tokens.reverse();
    writeScan(project, scan);
    const again = capture([...ingestArgs(path, project, out), "--json"]);
    expect(again.code, again.out).toBe(0);
    expect(read(out, "tokens.json")).toBe(before);
  });

  it("two nodes of one name: the node that keeps the name is the same after the scan is reordered", () => {
    const project = newProject();
    const out = newProject();
    const lib = { id: "0:1", name: "Library" };
    const scan = scanOf({
      components: [comp("1:1", "Button", lib, { boundVariables: ["VariableID:9:1"] }), comp("1:2", "Button", lib, { boundVariables: ["VariableID:9:2"] })],
      tokens: [colorVar("9:1", "color/one", "Only", RED), colorVar("9:2", "color/two", "Only", GREEN)],
      sensing: { status: "complete" },
    }) as { components: unknown[] };
    const path = writeScan(project, scan);
    const keepSecondNode: Choose = (c) => (c.kind === "duplicate-component-names" ? reviewing((m) => `keep:${idsOf(m)[1]}`)(c) : takeRecommended(c));
    ingestUntilReady(path, project, out, keepSecondNode, ["--json"]);
    const registry = (): { components: { name: string; tokensUsed: string[] }[] } => JSON.parse(read(out, "component-registry.json")) as { components: { name: string; tokensUsed: string[] }[] };
    expect(registry().components.map((c) => [c.name, c.tokensUsed])).toEqual([["Button", ["color.two"]]]);
    const before = read(out, "component-registry.json");
    scan.components.reverse();
    writeScan(project, scan);
    expect(capture([...ingestArgs(path, project, out), "--json"]).code).toBe(0);
    expect(read(out, "component-registry.json")).toBe(before);
  });
});

describe("keeping the second variable and the second node (review individually)", () => {
  it("the second variable of a same-collection collision can keep the path", () => {
    const project = newProject();
    const out = newProject();
    const scan = scanOf({ tokens: [colorVar("1:1", "color/primary", "Only", RED), colorVar("2:1", "color/primary", "Only", GREEN)] });
    const { asked } = ingestUntilReady(writeScan(project, scan), project, out, keepAllThenVariable(second), ["--json"]);
    const q = asked[0]!.find((c) => c.kind === "token-path-collision")!;
    // a same-collection group has no "keep the first": exclude all and review individually
    expect(q.options.map((o) => o.id)).toEqual(["keep-none", "review-individually"]);
    expect(tokens(out)["color"]!["primary"]!.$value).toBe("#00FF00");
  });

  it("the second node can keep the name, and the first is excluded and counted", () => {
    const project = newProject();
    const out = newProject();
    const lib = { id: "0:1", name: "Library" };
    const scan = scanOf({ components: [comp("1:1", "Card", lib), comp("1:2", "Card", lib)] });
    const keepSecondNode: Choose = (c) => (c.kind === "duplicate-component-names" ? reviewing((m) => `keep:${idsOf(m)[1]}`)(c) : takeRecommended(c));
    const { final } = ingestUntilReady(writeScan(project, scan), project, out, keepSecondNode, ["--json"]);
    expect(JSON.parse(final.out).data.ledger.excluded["duplicate-excluded"]).toBe(1);
    expect(JSON.parse(final.out).data.excluded.items["duplicate-excluded"]).toEqual([{ id: "1:1", name: "Card" }]);
  });
});

describe("a change in who collides is a new question; nothing is written until it is answered", () => {
  it("a new variable joining a ruled path is asked", () => {
    const project = newProject();
    const out = newProject();
    const scan = scanOf({ tokens: [colorVar("1:1", "color/primary", "Only", RED), colorVar("2:1", "color/primary", "Only", GREEN)] }) as { tokens: unknown[] };
    const path = writeScan(project, scan);
    ingestUntilReady(path, project, out, keepAllThenVariable(first), ["--json"]);
    scan.tokens.push(colorVar("3:1", "color/primary", "Only", BLUE));
    writeScan(project, scan);
    const before = hashTree(out);
    const r = capture([...ingestArgs(path, project, out), "--json"]);
    expect(r.code).toBe(1);
    const q = blocked(r.out);
    expect(q.map((c) => c.kind)).toEqual(["token-path-collision"]);
    expect(idsOf(q[0]!.members[0]!)).toEqual(["VariableID:1:1", "VariableID:2:1", "VariableID:3:1"]);
    expect(hashTree(out)).toBe(before);
  });

  it("the kept variable removed from the scan: asked again while two remain, no question when one is left", () => {
    const three = (): { tokens: Record<string, unknown>[] } => scanOf({ tokens: [colorVar("1:1", "color/primary", "Only", RED), colorVar("2:1", "color/primary", "Only", GREEN), colorVar("3:1", "color/primary", "Only", BLUE)] }) as { tokens: Record<string, unknown>[] };
    const project = newProject();
    const out = newProject();
    const scan = three();
    const path = writeScan(project, scan);
    ingestUntilReady(path, project, out, keepAllThenVariable(first), ["--json"]);
    scan.tokens = scan.tokens.slice(1); // the kept variable is gone, two remain
    writeScan(project, scan);
    const again = capture([...ingestArgs(path, project, out), "--json"]);
    expect(again.code).toBe(1);
    expect(blocked(again.out).map((c) => c.kind)).toEqual(["token-path-collision"]);

    const project2 = newProject();
    const out2 = newProject();
    const two = scanOf({ tokens: [colorVar("1:1", "color/primary", "Only", RED), colorVar("2:1", "color/primary", "Only", GREEN)] }) as { tokens: unknown[] };
    const path2 = writeScan(project2, two);
    ingestUntilReady(path2, project2, out2, keepAllThenVariable(first), ["--json"]);
    two.tokens = two.tokens.slice(1);
    writeScan(project2, two);
    const left = capture([...ingestArgs(path2, project2, out2), "--json"]);
    expect(left.code, left.out).toBe(0);
    expect(tokens(out2)["color"]!["primary"]!.$value).toBe("#00FF00");
  });
});
