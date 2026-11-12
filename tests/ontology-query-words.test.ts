/**
 * The one lexical measure of the query: words are split at case boundaries before they are lower-cased, and the whole
 * unsplit run is kept as a word too. Node names, aliases, the query text, the nearest titles and the nearest area keys
 * all use it. No stemming, no fuzzy match, no stop words; ties by id.
 */
import { describe, expect, it } from "vitest";
import { resolveArea } from "../src/core/ontology/query-areas.js";
import { wordsOf } from "../src/core/ontology/query-text.js";
import { build, editRegistry, ring1Project } from "./ontology-helpers.js";
import { query, queryData } from "./ontology-query-helpers.js";

describe("wordsOf", () => {
  it("splits a lower-case letter or a digit followed by an upper-case letter, and keeps the whole run", () => {
    expect(wordsOf("PrimaryButton")).toEqual(["primary", "button", "primarybutton"]);
    expect(wordsOf("Card2Column")).toEqual(["card2", "column", "card2column"]);
  });
  it("splits an acronym followed by a capitalised word", () => {
    expect(wordsOf("HTMLTable")).toEqual(["html", "table", "htmltable"]);
    expect(wordsOf("APIKeyInput")).toEqual(["api", "key", "input", "apikeyinput"]);
  });
  it("keeps digits with the letters before them, and an all-caps or single-case run as one word", () => {
    expect(wordsOf("h2")).toEqual(["h2"]);
    expect(wordsOf("Card2")).toEqual(["card2"]);
    expect(wordsOf("FAQ")).toEqual(["faq"]);
    expect(wordsOf("button")).toEqual(["button"]);
  });
  it("kebab, snake and spaced names behave as before: every run is a word", () => {
    expect(wordsOf("primary-button")).toEqual(["primary", "button"]);
    expect(wordsOf("primary_button x2")).toEqual(["primary", "button", "x2"]);
    expect(wordsOf("color.ink")).toEqual(["color", "ink"]);
  });
});

describe("a PascalCase component is reached by its parts, by the typed name and by the unsplit lower-case word", () => {
  const p = ring1Project();
  editRegistry(p, (r) => { r.components.find((c) => c["name"] === "Button")!["name"] = "PrimaryButton"; });
  expect(build(p).code).toBe(0);
  for (const text of ["button", "primary button", "primarybutton", "PrimaryButton", "BUTTON primary"]) {
    it(`"${text}"`, () => {
      const d = queryData(p, text);
      expect(d.matches.map((m) => m.id)).toContain("component:PrimaryButton");
      expect(d.pack!.groups.find((g) => g.group === "components")!.entries.map((e) => e.id)).toContain("component:PrimaryButton");
    });
  }
  it("is the same bytes twice", () => {
    expect(query(p, "PrimaryButton").out).toBe(query(p, "PrimaryButton").out);
  });
  it("the nearest titles use the same split: a prefix of a part of the name reaches it first", () => {
    const d = queryData(p, "prim");
    expect(d.matchCount).toBe(0);
    expect(d.nearest[0]?.name).toBe("PrimaryButton");
  });
});

describe("the nearest area keys use the same split", () => {
  it("a name that is one part of a PascalCase key ranks that key first", () => {
    const got = resolveArea([{ key: "dir:Alpha", nodes: 1 }, { key: "page:PrimaryButtons", nodes: 2 }, { key: "tokens:color", nodes: 3 }], "Buttons");
    expect(got).toEqual({ problem: "unknown", keys: ["page:PrimaryButtons", "dir:Alpha", "tokens:color"] });
  });
});
