/**
 * `ui ingest-figma-ds` and the collections question: a scan whose collections collide is never resolved by position.
 * The command asks, writes nothing while it asks, applies the owner's ruling, counts and names what it leaves out,
 * and asks only about what is new on a later run.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDsFile, planIngest } from "../src/core/figma-ds-ingest.js";
import { resolveDetections } from "../src/core/owner-rulings/resolve-detections.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { ingestArgs, ingestUntilReady, aliasTo, colorVar, newProject, scanOf, takeRecommended, writeScan } from "./figma-ingest-helpers.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";

const FIVE = join(process.cwd(), "tests", "fixtures", "owner-rulings", "variables-five-collections.json");
const blockedClusters = (out: string): Cluster[] => JSON.parse(out).data.blocked.clusters as Cluster[];

/** The questions a scan raises with no ruling at all. */
const openQuestions = (scan: unknown): Cluster[] => resolveDetections(planIngest(parseDsFile(scan), "s", "s").detections, [], "ingest-figma-ds").open;
const collectionsQuestion = (scan: unknown): Cluster | undefined => openQuestions(scan).find((c) => c.kind === "figma-collections");

describe("AC-1: two collections that collide are asked about, and nothing is written while asking", () => {
  it("exits 1 with the declared code, leaves the output tree untouched, and lists every collection with its count and the colliding pair", () => {
    const project = newProject();
    const out = newProject();
    const before = hashTree(out);
    const r = capture([...ingestArgs(FIVE, project, out), "--json"]);
    expect(r.code).toBe(1);
    const env = JSON.parse(r.out) as { error: { code: string }; data: { blocked: { clusters: Cluster[]; pendingPath: string } } };
    expect(env.error.code).toBe("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(hashTree(out)).toBe(before);
    expect(existsSync(join(project, env.data.blocked.pendingPath))).toBe(true);
    const q = env.data.blocked.clusters.find((c) => c.kind === "figma-collections")!;
    expect(q.members).toEqual(["Plugin Export A", "Plugin Export B", "Primitives", "Semantic", "Spacing Primitives"]);
    for (const [name, count] of [["Plugin Export A", 86], ["Plugin Export B", 80], ["Primitives", 103], ["Semantic", 149], ["Spacing Primitives", 98]] as const) {
      expect(q.question).toContain(`${name} (${count} variables)`);
    }
    expect(q.question).toContain("Plugin Export A × Plugin Export B: 76 token paths");
  });

  it("a blocked run leaves the text-mode output tree untouched too, and the next action is named", () => {
    const project = newProject();
    const out = newProject();
    const before = hashTree(out);
    const r = capture(ingestArgs(FIVE, project, out));
    expect(r.code).toBe(1);
    expect(r.err).toContain("ONBOARD_BLOCKED_NEEDS_OWNER_RULING");
    expect(r.err).toContain("ui onboard questions");
    expect(hashTree(out)).toBe(before);
  });

  it("the question follows D15: the recommended set first, then the colliding collections largest first", () => {
    const q = collectionsQuestion(JSON.parse(readFileSync(FIVE, "utf8")))!;
    expect(q.options.map((o) => o.id)).toEqual(["keep:recommended", "member:Plugin Export A", "member:Plugin Export B"]);
    expect(q.options[0]).toMatchObject({ recommended: true, selects: ["Primitives", "Semantic", "Spacing Primitives"] });
    expect(q.options.flatMap((o) => o.selects ?? []).sort()).toEqual(q.members);
  });
});

describe("AC-2: the owner's ruling is applied and every variable is accounted for", () => {
  it("keeping the three non-colliding collections writes the stores with in = written + excluded and pending = 0", () => {
    const project = newProject();
    const out = newProject();
    const { final, rounds } = ingestUntilReady(FIVE, project, out, takeRecommended, ["--json"]);
    expect(rounds).toBe(2);
    const data = JSON.parse(final.out).data as { ledger: { in: { variables: number }; written: { tokens: number }; excluded: Record<string, number>; pending: number }; excluded: { collections: { name: string; count: number }[] } };
    expect(data.ledger.in.variables).toBe(516);
    expect(data.ledger.written.tokens).toBe(350);
    expect(data.ledger.excluded["collection-not-selected"]).toBe(166);
    expect(data.ledger.pending).toBe(0);
    expect(data.excluded.collections).toEqual([{ name: "Plugin Export A", count: 86 }, { name: "Plugin Export B", count: 80 }]);
    const md = readFileSync(join(out, "DESIGN.md"), "utf8");
    expect(md).toContain("Collection `Plugin Export A`: 86 variable(s) left out");
    expect(md).toContain("Collection `Plugin Export B`: 80 variable(s) left out");
    expect(Object.keys(JSON.parse(readFileSync(join(out, "tokens.json"), "utf8")) as object)).not.toContain("plugin-export");
  });

  it("keeping a colliding collection together with the one it collides with asks a second question about the colliding paths", () => {
    const project = newProject();
    const out = newProject();
    const first = capture(ingestArgs(FIVE, project, out));
    expect(first.code).toBe(1);
    const all = (c: Cluster): string[] => c.options.filter((o) => (o.selects ?? []).length > 0).map((o) => o.id);
    const { asked } = ingestUntilReady(FIVE, project, out, (c) => (c.kind === "figma-collections" ? all(c) : c.options.find((o) => o.id.startsWith("keep-from:"))!.id));
    expect(asked.map((round) => round.map((c) => c.kind))).toEqual([["figma-collections"], ["token-path-collision"]]);
    expect(asked[1]![0]!.count).toBe(76);
  });
});

describe("AC-3: only the delta is asked", () => {
  it("a new collection that collides with nothing is one question about exactly that collection", () => {
    const project = newProject();
    const out = newProject();
    const scan = JSON.parse(readFileSync(FIVE, "utf8")) as { tokens: unknown[] };
    const path = writeScan(project, scan);
    ingestUntilReady(path, project, out, takeRecommended);
    scan.tokens.push(colorVar("9:1", "brand-extra/color/only-here", "Brand Extra"));
    writeScan(project, scan);
    const r = capture([...ingestArgs(path, project, out), "--json"]);
    expect(r.code).toBe(1);
    const clusters = blockedClusters(r.out);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ kind: "figma-collections", members: ["Brand Extra"], delta: true });
    expect(clusters[0]!.question).not.toContain("Primitives");
  });
});

describe("AC-21: the recommendation is computed on the alias graph", () => {
  const sem = (id: string, target: string, collection: string, name = "role"): Record<string, unknown> => colorVar(id, `${collection}/color/${name}`, collection, { Light: aliasTo(target) });
  const rec = (scan: unknown): string[] | null => {
    const q = collectionsQuestion(scan);
    return q === undefined ? null : q.options.find((o) => o.recommended === true)?.selects ?? [];
  };

  it("one collection: no question", () => {
    expect(collectionsQuestion(scanOf({ tokens: [colorVar("1:1", "color/a", "Only"), colorVar("1:2", "color/b", "Only")] }))).toBeUndefined();
  });
  it("two colliding collections without aliases: a question with no recommendation, options in collection order", () => {
    const q = collectionsQuestion(scanOf({ tokens: [colorVar("1:1", "color/brand", "Zeta"), colorVar("2:1", "color/brand", "Alpha")] }))!;
    expect(q.options.some((o) => o.recommended === true)).toBe(false);
    expect(q.options.map((o) => o.id)).toEqual(["member:Zeta", "member:Alpha"]);
  });
  it("a three-tier alias chain without collisions: no question", () => {
    const scan = scanOf({ tokens: [colorVar("1:1", "color/p", "Primitives"), sem("2:1", "1:1", "Semantic", "s"), sem("3:1", "2:1", "Component", "c")] });
    expect(collectionsQuestion(scan)).toBeUndefined();
  });
  it("the field shape: the three alias-connected collections are recommended, both colliding plugin collections are left out", () => {
    const scan = scanOf({ tokens: [
      colorVar("1:1", "color/p", "Primitives"), sem("2:1", "1:1", "Semantic", "s"), sem("3:1", "2:1", "Component", "c"),
      colorVar("4:1", "x/color/brand", "Plugin A"), colorVar("5:1", "x/color/brand", "Plugin B"),
    ] });
    expect(rec(scan)).toEqual(["Component", "Primitives", "Semantic"]);
  });
  it("two colliding collections of which one is aliased from a third: the aliased one is recommended", () => {
    const scan = scanOf({ tokens: [colorVar("1:1", "x/color/brand", "Left"), colorVar("2:1", "x/color/brand", "Right"), sem("3:1", "1:1", "Third", "t")] });
    expect(rec(scan)).toEqual(["Left", "Third"]);
  });
  it("a recommendation that still holds a colliding pair is no recommendation", () => {
    const scan = scanOf({ tokens: [
      colorVar("1:1", "x/color/brand", "Left"), colorVar("2:1", "x/color/brand", "Right"),
      colorVar("4:1", "color/free", "Free"), sem("5:1", "1:1", "Bridge-L", "l"), sem("6:1", "2:1", "Bridge-R", "r"),
    ] });
    // Left and Right are both aliased from a collection that is not in conflict, so the set would hold a colliding pair.
    expect(collectionsQuestion(scan)!.options.some((o) => o.recommended === true)).toBe(false);
  });
});

describe("DANGLING_AFTER_SELECTION: a selection that leaves an alias pointing nowhere is refused", () => {
  const scan = scanOf({ tokens: [
    colorVar("1:1", "color/p", "Primitives"), colorVar("2:1", "color/s", "Semantic", { Light: aliasTo("1:1") }),
    colorVar("3:1", "x/color/brand", "Plugin A"), colorVar("4:1", "x/color/brand", "Plugin B"),
  ] });
  const answerWith = (project: string, q: Cluster, members: Record<string, string>): ReturnType<typeof capture> => {
    const file = join(project, "answers.json");
    writeFileSync(file, JSON.stringify({ answers: [{ fingerprint: q.fingerprint, choice: ["review-individually"], members }] }));
    return capture(["onboard", "answer", "--file", file, "--cwd", project, "--json"]);
  };

  it("the question says before the choice how many aliases each option would break", () => {
    const q = collectionsQuestion(scan)!;
    expect(q.options.find((o) => o.id === "member:Plugin A")!.consequence).toContain("0 alias(es)");
    expect(JSON.stringify(q.evidence)).toContain('"from":"Semantic"');
  });

  it("keeping Semantic while leaving out Primitives is refused with nothing written; keeping both is accepted", () => {
    const project = newProject();
    const path = writeScan(project, scan);
    expect(capture(ingestArgs(path, project, newProject())).code).toBe(1);
    const pendingFile = join(project, ".design-os", "onboard", "pending.json");
    const pendingBefore = readFileSync(pendingFile, "utf8");
    const q = (JSON.parse(pendingBefore) as { clusters: Cluster[] }).clusters[0]!;

    const refused = answerWith(project, q, { Primitives: "drop", Semantic: "keep", "Plugin A": "keep", "Plugin B": "drop" });
    expect(refused.code).toBe(1);
    expect(JSON.parse(refused.out).error.code).toBe("DANGLING_AFTER_SELECTION");
    expect(JSON.parse(refused.out).error.message).toContain("Semantic → Primitives (1)");
    expect(existsSync(join(project, "design", "design-dir.json"))).toBe(false);
    expect(readFileSync(pendingFile, "utf8")).toBe(pendingBefore);

    const accepted = answerWith(project, q, { Primitives: "keep", Semantic: "keep", "Plugin A": "keep", "Plugin B": "drop" });
    expect(accepted.code).toBe(0);
  });
});
