/**
 * "Keep as raw" never loses a value or writes an object; "alias cycle" names only a walk that returns to its start;
 * the door-neutral untypeable question shows a hint only when the caller passes one.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildTokensTree } from "../src/core/figma-ds-tokens.js";
import type { DsVariable } from "../src/core/figma-ds-tokens.js";
import { untypeableTokensEmitter } from "../src/core/owner-rulings/kind-untypeable-tokens.js";
import type { Cluster } from "../src/core/owner-rulings/cluster.js";
import { aliasTo, colorVar, ingestArgs, ingestUntilReady, newProject, preferring, scanOf, writeScan } from "./figma-ingest-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

const id = (n: string): string => `VariableID:${n}`;
const asVars = (list: unknown[]): DsVariable[] => list as DsVariable[];
const blocked = (out: string): Cluster[] => JSON.parse(out).data.blocked.clusters as Cluster[];
const ask = (tokens: unknown[]): Cluster => {
  const project = newProject();
  return blocked(capture([...ingestArgs(writeScan(project, scanOf({ tokens })), project, newProject()), "--json"]).out)[0]!;
};
const twoModeBool = { id: id("1:1"), name: "flags/enabled", type: "BOOLEAN", collection: "C", valuesByMode: { Light: true, Dark: false } };
const surface = (dark: unknown): unknown => colorVar("2:1", "color/surface", "C", { Light: { r: 1, g: 1, b: 1, a: 1 }, Dark: dark });

describe("keep raw carries every mode, and only primitives can be kept", () => {
  it("a two-mode boolean kept raw writes both modes as strings", () => {
    const project = newProject();
    const out = newProject();
    ingestUntilReady(writeScan(project, scanOf({ tokens: [twoModeBool, colorVar("9:1", "color/fine", "C")] })), project, out, preferring("keep-raw"), ["--json"]);
    const raw = JSON.parse(readFileSync(join(out, "tokens.json"), "utf8")).raw as Record<string, { $value: string; $type: string; $extensions?: Record<string, { $value: string }> }>;
    const leaf = Object.values(raw)[0]!;
    expect(leaf.$value).toBe("true");
    expect(leaf.$extensions).toEqual({ "mode.dark": { $value: "false" } });
  });
  it("a variable with one failing non-base mode offers only exclude", () => {
    const q = ask([surface("oops")]);
    expect(Object.values(q.memberChoices!)[0]!.map((c) => c.id)).toEqual(["exclude"]);
    expect(q.options.some((o) => o.id === "keep-raw")).toBe(false);
  });
  it("an object-valued failure offers only exclude", () => {
    const q = ask([colorVar("3:1", "color/odd", "C", { Light: { r: "x", g: 0, b: 0 } })]);
    expect(Object.values(q.memberChoices!)[0]!.map((c) => c.id)).toEqual(["exclude"]);
  });
  it("the question states how many are kept raw and how many can only be excluded", () => {
    const q = ask([twoModeBool, surface("oops"), colorVar("3:1", "color/odd", "C", { Light: { r: "x", g: 0, b: 0 } })]);
    const keep = q.options.find((o) => o.id === "keep-raw")!;
    expect(keep.consequence).toContain("1 token(s) written under \"raw\" with every mode");
    expect(keep.consequence).toContain("2 can only be excluded");
  });
  it("buildTokensTree never writes an object into a $value, even when asked to keep everything raw", () => {
    const vars = asVars([twoModeBool, surface("oops"), colorVar("3:1", "color/odd", "C", { Light: { r: "x", g: 0, b: 0 } })]);
    const r = buildTokensTree(vars, { keepRaw: new Set(vars.map((v) => v.id)) });
    expect(r.rawKept).toEqual([twoModeBool.id]);
    expect(JSON.stringify(r.tree)).not.toMatch(/\\"|"\{/);
    expect(r.excluded.skipped["bad-colour"].length + r.excluded.skipped["null-leaf"].length).toBe(2);
  });
});

describe("an alias cycle is only a walk that returns to its start", () => {
  it("a variable that aliases into a cycle is a dangling alias, the members of the cycle are the cycle", () => {
    const vars = asVars([
      colorVar("1:1", "color/z", "C", { Light: aliasTo("2:1") }),
      colorVar("2:1", "color/a", "C", { Light: aliasTo("3:1") }),
      colorVar("3:1", "color/b", "C", { Light: aliasTo("2:1") }),
    ]);
    const r = buildTokensTree(vars);
    expect(r.excluded.skipped["alias-cycle"]).toEqual([id("2:1"), id("3:1")]);
    expect(r.excluded.skipped["dangling-alias"]).toEqual([id("1:1")]);
  });
});

describe("the untypeable question is door-neutral: the hint comes from the caller", () => {
  const items = [{ id: "a", name: "a", reason: "dangling-alias", keepable: false }];
  const asked = (hint?: string): string => untypeableTokensEmitter.detect({ items, ...(hint === undefined ? {} : { hint }) })!.ask(["a"]).question;
  it("without a hint the question names no earlier answer", () => {
    expect(asked()).not.toMatch(/collections answer|collision answer|earlier answer/);
  });
  it("a hint the caller passes is shown when no member has a value to keep", () => {
    expect(asked("Keep its target by changing an earlier answer.")).toContain("Keep its target by changing an earlier answer.");
  });
  it("the Figma ingest passes the hint only when an alias has a target that is in the scan", () => {
    const withTarget = ask([{ id: id("1:1"), name: "flags/on", type: "BOOLEAN", collection: "C", value: null }, colorVar("2:1", "color/x", "C", { Light: aliasTo("1:1") })]);
    expect(withTarget.question).toMatch(/collections answer or the collision answer/);
    const cycle = ask([colorVar("1:1", "color/a", "C", { Light: aliasTo("2:1") }), colorVar("2:1", "color/b", "C", { Light: aliasTo("1:1") })]);
    expect(cycle.question).not.toMatch(/collections answer|collision answer/);
    const missing = ask([colorVar("1:1", "color/a", "C", { Light: aliasTo("9:9") })]);
    expect(missing.question).not.toMatch(/collections answer|collision answer/);
  });
});
