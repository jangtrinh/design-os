/**
 * A variable that aliases the variable on its own token path (a different collection, same path): it stays a member of
 * the collision, can never keep the path, says what it aliases, does not make collections "collide", and no option
 * counts or promises what it does not do. Also pins the collision consequence, the labels and the duplicate page order.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTokensTree } from "../src/core/figma-ds-tokens.js";
import type { DsVariable } from "../src/core/figma-ds-tokens.js";
import { parseDsFile, planIngest } from "../src/core/figma-ds-ingest.js";
import { resolveDetections } from "../src/core/owner-rulings/resolve-detections.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { readPending } from "../src/core/owner-rulings/pending-store.js";
import { aliasTo, answerPending, colorVar, comp, ingestArgs, ingestUntilReady, newProject, scanOf, writeScan } from "./figma-ingest-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

const RED = { Light: { r: 1, g: 0, b: 0, a: 1 } };
const open = (scan: unknown): Cluster[] => resolveDetections(planIngest(parseDsFile(scan), "s", "s").detections, [], "ingest-figma-ds").open;
const kinds = (scan: unknown): string[] => open(scan).map((c) => c.kind);
const id = (n: string): string => `VariableID:${n}`;

/** A `color/brand` in A with its own value, and the same path in B that aliases it. */
const aliasPair = (): unknown[] => [colorVar("1:1", "color/brand", "A", RED), colorVar("2:1", "color/brand", "B", { Light: aliasTo("1:1") })];
/** The collision question as the owner sees it: every collection is kept first, so the question is raised. */
function collisionOf(tokens: unknown[]): Cluster {
  const project = newProject();
  const path = writeScan(project, scanOf({ tokens }));
  const out = newProject();
  capture(ingestArgs(path, project, out));
  if (readPending(project).clusters.some((c) => c.kind === "figma-collections")) {
    answerPending(project, (c) => c.options.filter((o) => (o.selects ?? []).length > 0).map((o) => o.id));
    capture(ingestArgs(path, project, out));
  }
  return readPending(project).clusters.find((c) => c.kind === "token-path-collision")!;
}

describe("a variable that aliases the variable on its own path can never keep the path", () => {
  it("its member offers keep-none and the variable it aliases, never itself", () => {
    const q = collisionOf(aliasPair());
    expect(Object.values(q.memberChoices!)[0]!.map((c) => c.id)).toEqual([`keep:${id("1:1")}`, "keep-none"]);
  });
  it("no option offers 'keep the one from' the aliasing collection; the target's collection is still offered", () => {
    const q = collisionOf(aliasPair());
    expect(q.options.map((o) => o.id)).toEqual(["keep-from:A", "keep-none", "review-individually"]);
    expect(q.options.every((o) => Object.values(o.assigns ?? {}).every((v) => v !== `keep:${id("2:1")}`))).toBe(true);
  });
  it("review individually refuses to keep the aliasing variable (BAD_ANSWER at the collision answer)", () => {
    const project = newProject();
    const path = writeScan(project, scanOf({ tokens: aliasPair() }));
    capture(ingestArgs(path, project, newProject()));
    const q = readPending(project).clusters.find((c) => c.kind === "token-path-collision")!;
    const file = join(project, "keep-the-alias.json");
    writeFileSync(file, JSON.stringify({ answers: [{ fingerprint: q.fingerprint, choice: "review-individually", members: { [q.members[0]!]: `keep:${id("2:1")}` } }] }));
    const r = capture(["onboard", "answer", "--file", file, "--cwd", project, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ANSWER");
  });
  it("its label says what it aliases, with the target's name and collection", () => {
    const q = collisionOf(aliasPair());
    const label = Object.values(q.labels!)[0]!;
    expect(label).toContain("color/brand (B) aliases color/brand (A) on the same path");
  });
  it("a collection that holds an aliasing variable on some path of the group is not offered", () => {
    // B aliases A on one path and has its own value on the other: 'keep the one from B' would write only one of the two
    const tokens = [colorVar("1:1", "color/one", "A", RED), colorVar("2:1", "color/one", "B", { Light: aliasTo("1:1") }), colorVar("3:1", "color/two", "A", RED), colorVar("4:1", "color/two", "B", RED)];
    expect(collisionOf(tokens).options.map((o) => o.id)).toEqual(["keep-from:A", "keep-none", "review-individually"]);
  });
  it("buildTokensTree names the target on the collision variable", () => {
    const r = buildTokensTree(aliasPair() as DsVariable[]);
    expect(r.collisions[0]!.variables.map((v) => v.aliasOf?.id)).toEqual([undefined, id("1:1")]);
  });
  it("answering with the option of the target's collection writes the target's value and excludes the alias as a collision loser, with no further question", () => {
    const project = newProject();
    const out = newProject();
    const { final, asked } = ingestUntilReady(writeScan(project, scanOf({ tokens: aliasPair() })), project, out, (c) => (c.kind === "figma-collections" ? c.options.map((o) => o.id) : c.options[0]!.id), ["--json"]);
    expect(asked.flat().map((c) => c.kind)).toEqual(["token-path-collision"]);
    expect(JSON.parse(readFileSync(join(out, "tokens.json"), "utf8")).color.brand.$value).toBe("#FF0000");
    expect(JSON.parse(final.out).data.ledger.excluded).toMatchObject({ "path-collision": 1, total: 1 });
  });
});

describe("such pairs do not make two collections collide", () => {
  it("collections that share only alias pairs raise no collections question, then one collision question", () => {
    expect(kinds(scanOf({ tokens: aliasPair() }))).toEqual(["token-path-collision"]);
    const project = newProject();
    const r = capture([...ingestArgs(writeScan(project, scanOf({ tokens: aliasPair() })), project, newProject()), "--json"]);
    expect((JSON.parse(r.out).data.blocked.clusters as Cluster[]).map((c) => c.kind)).toEqual(["token-path-collision"]);
  });
  it("beside a real collision, the collections question and its recommendation ignore the alias pair", () => {
    const tokens = [
      ...aliasPair(), colorVar("3:1", "color/real", "C", RED), colorVar("4:1", "color/real", "D", { Light: { r: 0, g: 1, b: 0, a: 1 } }),
    ];
    const q = open(scanOf({ tokens })).find((c) => c.kind === "figma-collections")!;
    expect(q.question).toContain("C × D");
    expect(q.question).not.toContain("A × B");
    // A and B collide with nothing that has its own value: they are recommended, C and D are not
    expect(q.options.find((o) => o.recommended === true)!.selects).toEqual(["A", "B"]);
  });
});

describe("the consequence counts only aliases whose source is still written under that option", () => {
  it("the alias that sits on the losing variable's own path does not count; an outside alias does", () => {
    // C aliases B's variable (an outside source); B's variable aliases A's (a source that loses with it)
    const tokens = [...aliasPair(), colorVar("3:1", "color/uses-b", "C", { Light: aliasTo("2:1") })];
    const q = collisionOf(tokens);
    const keepA = q.options.find((o) => o.id === "keep-from:A")!;
    expect(keepA.consequence).toContain("1 alias(es) point at variables that would lose");
    const none = q.options.find((o) => o.id === "keep-none")!;
    // A's variable has one source, B's variable, which loses under keep-none too; B's variable keeps C
    expect(none.consequence).toContain("1 alias(es) point at variables that would lose");
    const plain = collisionOf(aliasPair());
    expect(plain.options.find((o) => o.id === "keep-none")!.consequence).toContain("0 alias(es) point at variables that would lose");
    expect(plain.options.find((o) => o.id === "keep-from:A")!.consequence).toContain("0 alias(es) point at variables that would lose");
  });
  it("a count above zero is stated with the follow-up question", () => {
    const tokens = [colorVar("1:1", "color/brand", "A"), colorVar("2:1", "color/brand", "B"), colorVar("3:1", "color/uses-b", "C", { Light: aliasTo("2:1") })];
    const q = collisionOf(tokens);
    expect(q.options.find((o) => o.id === "keep-from:A")!.consequence).toContain("1 alias(es) point at variables that would lose; each is then asked as a dangling alias");
  });
});

describe("collision labels name the path and every variable with its collection and value", () => {
  it("a plain collision", () => {
    const q = collisionOf([colorVar("1:1", "color/brand", "A", RED), colorVar("2:1", "color/brand", "B", { Light: { r: 0, g: 1, b: 0, a: 1 } })]);
    expect(Object.values(q.labels!)[0]).toBe("color.brand: color/brand (A = #FF0000) or color/brand (B = #00FF00)");
    expect(Object.values(q.memberChoices!)[0]!.map((c) => c.label)).toEqual(["Keep color/brand (A = #FF0000)", "Keep color/brand (B = #00FF00)", "Exclude all of them"]);
  });
});

describe("duplicate page options of equal size keep scan order, never the order of the ids as strings", () => {
  it("three pages that each hold one Card: the first two in the scan, '10:1' before '9:1'", () => {
    const components = [comp("1:1", "Card", { id: "10:1", name: "Ten" }), comp("1:2", "Card", { id: "9:1", name: "Nine" }), comp("1:3", "Card", { id: "2:1", name: "Two" })];
    const project = newProject();
    // keep every page so the duplicate question is reached
    const { asked } = ingestUntilReady(writeScan(project, scanOf({ components })), project, newProject(), (c) => (c.kind === "figma-library-pages" ? c.options.map((o) => o.id) : "rename-all"));
    const dup = asked.flat().find((c) => c.kind === "duplicate-component-names")!;
    expect(dup.options.map((o) => o.id)).toEqual(["keep-page:10:1", "keep-page:9:1", "rename-all", "review-individually"]);
  });
});
