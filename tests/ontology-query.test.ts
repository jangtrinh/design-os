/**
 * `ui ontology query`: deterministic lexical retrieval over the ontology file and a 2-hop expansion over its links.
 * The same query is the same bytes, a query with no match is a result, and a screen's name returns its components, tokens and a rule.
 */
import { describe, expect, it } from "vitest";
import { build, codeProject } from "./ontology-helpers.js";
import { builtRing1, copyTree, failure, ids, query, queryData } from "./ontology-query-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

describe("the same query on the same tree is the same bytes", () => {
  const p = builtRing1();
  it("in text and in --json, twice, and from a copy of the tree at another path", () => {
    const other = copyTree(p);
    for (const flags of [[], ["--json"], ["--json", "--budget", "400"]]) {
      const a = query(p, "Sign in", ...flags);
      expect(a.code).toBe(0);
      expect(query(p, "Sign in", ...flags).out).toBe(a.out);
      expect(query(other, "Sign in", ...flags).out).toBe(a.out);
      expect(a.out).not.toContain(p);
      expect(a.out).not.toContain(other);
    }
  });
  it("is independent of the case and the order of the words, and of a word repeated", () => {
    const a = queryData(p, "sign in");
    expect(queryData(p, "IN SIGN").pack).toEqual(a.pack);
    expect(queryData(p, "sign sign in").pack).toEqual(a.pack);
  });
});

describe("a query that matches nothing is a result, not an error", () => {
  const p = builtRing1();
  it("exits 0 with matches: 0, the three nearest titles and no pack", () => {
    const done = query(p, "zzzz qqqq");
    expect(done.code).toBe(0);
    expect(done.out).toContain("matches: 0");
    expect(done.out).not.toMatch(/^Pack/m);
    const d = queryData(p, "zzzz qqqq");
    expect(d.matchCount).toBe(0);
    expect(d.pack).toBeNull();
    expect(d.nearest).toHaveLength(3);
  });
  it("the nearest titles share a word prefix with the query, then are ordered by id", () => {
    const d = queryData(p, "dash");
    expect(d.matchCount).toBe(0);
    expect(d.nearest[0]?.name).toBe("Dashboard");
    const ordered = queryData(p, "zzzz").nearest.map((n) => n.id);
    expect(ordered).toEqual([...ordered].sort());
  });
  it("a text with no word is refused by name", () => {
    expect(failure(p, "!!! ???").error.code).toBe("BAD_ARG");
  });
});

describe("ties in score are broken by node id", () => {
  it("two tokens that hold the one query word come out in id order, as matches and in the pack", () => {
    const d = queryData(builtRing1(), "color");
    expect(d.matches.map((m) => m.id)).toEqual(["token:color.ink", "token:color.paper"]);
    expect(d.pack!.groups.find((g) => g.group === "tokens")!.entries.map((e) => e.id).slice(0, 2)).toEqual(["token:color.ink", "token:color.paper"]);
  });
});

describe("a screen's name returns its components, their tokens and a rule", () => {
  const p = builtRing1();
  it("Sign in: the components the frame uses, the tokens they consume and the rules of the project", () => {
    const d = queryData(p, "Sign in");
    expect(d.matches[0]).toMatchObject({ id: "screen:5:1", score: 2 });
    const got = ids(d);
    expect(got).toEqual(expect.arrayContaining(["component:Button", "component:Card", "token:color.ink", "token:color.paper", "token:space.gap"]));
    expect(d.pack!.groups.find((g) => g.group === "rules")!.entries.length).toBeGreaterThan(0);
    expect(got.some((id) => id.startsWith("rule:"))).toBe(true);
  });
  it("a rule that constrains the whole project reaches a match that no rule's words match", () => {
    const d = queryData(p, "dashboard");
    expect(d.matches.map((m) => m.id)).toEqual(["screen:5:2"]);
    expect(d.pack!.groups.find((g) => g.group === "rules")!.entries.length).toBeGreaterThan(0);
  });
  it("every entry names its id and the project-relative file a host can open", () => {
    const d = queryData(p, "Sign in");
    for (const g of d.pack!.groups) for (const e of g.entries) {
      expect(e.id, e.name).toMatch(/^[a-z]+:/);
      expect(e.source, e.id).toMatch(/^[A-Za-z0-9_./-]+$/);
      expect(e.source.startsWith("/")).toBe(false);
    }
    expect(d.pack!.groups.find((g) => g.group === "components")!.entries.find((e) => e.id === "component:Card")!.source).toBe("design/component-registry.json");
  });
  it("the code door names the file of a component", () => {
    const code = codeProject();
    expect(build(code).code).toBe(0);
    const d = queryData(code, "Card");
    expect(d.pack!.groups.find((g) => g.group === "components")!.entries.find((e) => e.id === "component:Card")!.source).toBe("src/components/Card.tsx");
  });
});

describe("arguments", () => {
  const p = builtRing1();
  it("needs the text; unknown flags are rejected", () => {
    expect(capture(["ontology", "query", "--dir", p, "--json"]).code).toBe(1);
    expect(capture(["ontology", "query", "card", "--dir", p, "--nope"]).code).toBe(1);
  });
});
