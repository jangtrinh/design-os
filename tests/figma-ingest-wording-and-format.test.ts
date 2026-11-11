/**
 * The member format helper of the kernel, excluded duplicates told apart, "no page" wording, the scan schema's
 * description, and question texts that promise only what is delivered.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDsFile, planIngest } from "../src/core/figma-ds-ingest.js";
import { memberWithIds } from "../src/core/owner-rulings/fingerprint.js";
import { collisionMember } from "../src/core/owner-rulings/kind-token-path-collision.js";
import { duplicateGroups } from "../src/core/owner-rulings/kind-duplicate-component-names.js";
import { resolveDetections } from "../src/core/owner-rulings/resolve-detections.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { colorVar, comp, ingestUntilReady, newProject, reviewing, scanOf, writeScan } from "./figma-ingest-helpers.js";
import type { Choose } from "./figma-ingest-helpers.js";

const open = (scan: unknown): Cluster[] => resolveDetections(planIngest(parseDsFile(scan), "s", "s").detections, [], "ingest-figma-ds").open;

describe("one kernel helper builds the `<key>#<sorted ids>` member", () => {
  it("sorts the ids and joins them after the key", () => {
    expect(memberWithIds("color.brand", ["VariableID:2:1", "VariableID:1:1"])).toBe("color.brand#VariableID:1:1,VariableID:2:1");
    expect(memberWithIds("Card", ["1:2", "1:1"])).toBe("Card#1:1,1:2");
  });
  it("both kinds use it: the collision member and the duplicate member are the helper's output", () => {
    expect(collisionMember("color.brand", [{ id: "b" }, { id: "a" }])).toBe(memberWithIds("color.brand", ["a", "b"]));
    expect(duplicateGroups([{ id: "2", name: "Card" }, { id: "1", name: "Card" }])[0]!.member).toBe(memberWithIds("Card", ["1", "2"]));
  });
});

describe("excluded duplicates are told apart, and a node without a page is 'no page' everywhere", () => {
  const scan = (): Record<string, unknown> => scanOf({ components: [comp("1:1", "Card", { id: "0:1", name: "Library" }), comp("1:2", "Card", { id: "0:2", name: "Other" })] });
  it("the envelope, the text and DESIGN.md name each excluded Card with its page, and the envelope adds the id", () => {
    const project = newProject();
    const out = newProject();
    // two pages leave no slot for "exclude all": the owner excludes each repeated name through the per-member answer
    const keepAll: Choose = (c) => (c.kind === "figma-library-pages" ? c.options.filter((o) => (o.selects ?? []).length > 0).map((o) => o.id) : reviewing(() => "exclude-all")(c));
    const { final } = ingestUntilReady(writeScan(project, scan()), project, out, keepAll);
    expect(final.out).toContain("`Card` (Library)");
    expect(final.out).toContain("`Card` (Other)");
    expect(readFileSync(join(out, "DESIGN.md"), "utf8")).toContain("`Card` (Other)");
    const project2 = newProject();
    const json = ingestUntilReady(writeScan(project2, scan()), project2, newProject(), keepAll, ["--json"]).final;
    const items = JSON.parse(json.out).data.excluded.items["duplicate-excluded"] as { id: string; name: string; where?: string }[];
    expect(items.map((i) => [i.id, i.name, i.where])).toEqual([["1:1", "Card", "Library"], ["1:2", "Card", "Other"]]);
  });
  it("a node with no page is written as '· no page' and asked about as 'no page', never 'unpaged' or '(no page)'", () => {
    const bare = scanOf({ components: [{ id: "1:1", name: "Card", type: "COMPONENT" }, { id: "1:2", name: "Card", type: "COMPONENT" }] });
    const q = open(bare).find((c) => c.kind === "duplicate-component-names")!;
    const text = JSON.stringify([q.question, q.options, q.memberChoices, q.labels]);
    expect(text).toContain("no page");
    expect(text).not.toMatch(/unpaged|\(no page\)/);
    const project = newProject();
    const out = newProject();
    ingestUntilReady(writeScan(project, bare), project, out, () => "rename-all");
    const names = (JSON.parse(readFileSync(join(out, "component-registry.json"), "utf8")) as { components: { name: string }[] }).components.map((c) => c.name);
    expect(names).toEqual(["Card · no page", "Card · no page (2)"]);
  });
});

describe("the scan schema description says a host adding a field changes the schema in the same change", () => {
  it("states it", () => {
    const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas", "figma-ds-scan.schema.json"), "utf8")) as { description: string };
    expect(schema.description).toContain("A host that adds a field changes this schema in the same change");
  });
});

describe("question texts promise only what is delivered", () => {
  it("collections and pages say the collection or the page is named, not the variables or nodes", () => {
    const tokens = [colorVar("1:1", "color/brand", "A"), colorVar("2:1", "color/brand", "B")];
    const collections = open(scanOf({ tokens })).find((c) => c.kind === "figma-collections")!;
    expect(collections.question).not.toContain("counted and named");
    expect(collections.question).toContain("the collection is named");
    const pages = open(scanOf({ components: [comp("1:1", "A", { id: "0:1", name: "P1" }), comp("1:2", "B", { id: "0:2", name: "P2" })] })).find((c) => c.kind === "figma-library-pages")!;
    expect(pages.question).not.toContain("counted and named");
    expect(pages.question).toContain("the page is named");
    for (const o of [...collections.options, ...pages.options]) expect(o.consequence).not.toContain("counted and named");
  });
  it("the recommended option is worded for one colliding collection and for several", () => {
    const sem = (id: string, target: string, c: string, n: string): unknown => colorVar(id, `${c}/color/${n}`, c, { Light: { type: "VARIABLE_ALIAS", id: `VariableID:${target}` } });
    const one = [colorVar("1:1", "color/p", "Primitives"), sem("2:1", "1:1", "Semantic", "s"), colorVar("3:1", "x/color/brand", "Semantic"), colorVar("4:1", "x/color/brand", "Plugin")];
    const labelOne = open(scanOf({ tokens: one })).find((c) => c.kind === "figma-collections")!.options.find((o) => o.recommended === true)!.label;
    expect(labelOne).toContain("Semantic collides but is linked by an alias to a collection that does not");
    const two = [...one, sem("5:1", "1:1", "Tier", "t"), colorVar("6:1", "x/color/brand2", "Tier"), colorVar("7:1", "x/color/brand2", "Plugin")];
    const labelTwo = open(scanOf({ tokens: two })).find((c) => c.kind === "figma-collections")!.options.find((o) => o.recommended === true)!.label;
    expect(labelTwo).toContain("collide but are linked by aliases to a collection that does not");
  });
});
