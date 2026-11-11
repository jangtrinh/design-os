import { describe, it, expect } from "vitest";
import { buildTokensTree } from "../src/core/figma-ds-tokens.js";
import type { DsVariable } from "../src/core/figma-ds-tokens.js";
import { parseTokenFile } from "../src/core/token-model.js";
import { resolveTokens } from "../src/core/token-resolve.js";

/**
 * Dogfood F1: two distinct Figma variables that collapse to the SAME DTCG path, where one
 * aliases the other, used to emit a self-alias `{self}` that made the whole tokens file
 * unresolvable ("alias cycle detected"). Such a pair is now a collision (a variable that aliases
 * another on its own path is a member of the collision, not an alias cycle): nothing is written for
 * the path until the owner names the variable that keeps it, and an alias whose target loses is
 * dangling, never re-pointed. An own-id alias is a separate case already caught by resolveType.
 */
describe("figma-ds-tokens — a variable that aliases another on its own path (F1)", () => {
  const vars: DsVariable[] = [
    // Alias var: "color/brand" → the literal below; collapses to the same path `color.brand`.
    { id: "x", name: "color/brand", type: "COLOR", value: { type: "VARIABLE_ALIAS", id: "y" } },
    // Literal var: "color/Brand" → #000000, same collapsed path `color.brand`.
    { id: "y", name: "color/Brand", type: "COLOR", value: { r: 0, g: 0, b: 0 } },
  ];

  it("is a collision: with no ruling neither variable is written and both are listed", () => {
    const r = buildTokensTree(vars);
    expect(r.tree["color"]).toBeUndefined();
    expect(r.collisions.map((c) => c.variables.map((v) => v.id))).toEqual([["x", "y"]]);
    expect(r.excluded.skipped["alias-cycle"]).toEqual([]);
  });

  it("the owner keeps the literal: it is written, never a self-referential alias, and the file resolves", () => {
    const { tree } = buildTokensTree(vars, { winners: new Map([["color.brand", "y"]]) });
    const leaf = (tree["color"] as Record<string, { $value: unknown }>)["brand"];
    expect(leaf?.$value).toBe("#000000");
    expect(leaf?.$value).not.toBe("{color.brand}");
    expect(() => resolveTokens(parseTokenFile(tree))).not.toThrow();
  });

  it("the owner keeps the alias: its target lost, so it is a dangling alias and nothing is written", () => {
    const r = buildTokensTree(vars, { winners: new Map([["color.brand", "x"]]) });
    expect(r.tree["color"]).toBeUndefined();
    expect(r.excluded.skipped["dangling-alias"]).toEqual(["x"]);
  });

  it("an own-id self-alias yields no usable token (caught upstream, not emitted)", () => {
    const selfVars: DsVariable[] = [
      { id: "s", name: "breakpoint/2xl", type: "FLOAT", value: { type: "VARIABLE_ALIAS", id: "s" } },
      { id: "lit", name: "color/ok", type: "COLOR", value: { r: 1, g: 1, b: 1 } },
    ];
    const { tree } = buildTokensTree(selfVars);
    expect(tree["breakpoint"]).toBeUndefined(); // dropped, not emitted as `{breakpoint.2xl}`
    expect(() => resolveTokens(parseTokenFile(tree))).not.toThrow();
  });
});
