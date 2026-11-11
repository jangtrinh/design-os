/**
 * `ui ontology query`: deterministic lexical retrieval over the ontology file, a 2-hop expansion over its links and a
 * budgeted pack in a fixed order. Never a model, never a network, never a write. A stale file is never queried.
 */
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { keyOf } from "./project-kinds-helpers.js";
import { build, codeProject, fullProject, ontologyOf, read } from "./ontology-helpers.js";
import { builtFull, builtRing1, changeScanAndRebuild, copyTree, failure, printedCommands, query, queryData } from "./ontology-query-helpers.js";

const GROUPS = ["rules", "patterns", "components", "tokens", "rulings", "sibling screens"];
const ids = (d: { pack: { groups: { entries: { id: string }[] }[] } | null }): string[] => (d.pack?.groups ?? []).flatMap((g) => g.entries.map((e) => e.id));

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

describe("the pack: one fixed order, and a budget respected to the character", () => {
  const p = builtFull();
  const full = queryData(p, "Sign in card");
  it("holds the six groups in the order rules, patterns, components, tokens, rulings, sibling screens", () => {
    expect(full.pack!.groups.map((g) => g.group)).toEqual(GROUPS);
    for (let i = 0; i + 1 < GROUPS.length; i++) {
      const order = full.pack!.groups.map((g) => g.group);
      expect(order.indexOf(GROUPS[i] as string), `${GROUPS[i]} before ${GROUPS[i + 1]}`).toBeLessThan(order.indexOf(GROUPS[i + 1] as string));
      expect(full.pack!.text.indexOf(`## ${GROUPS[i]}\n`), `${GROUPS[i]} text before ${GROUPS[i + 1]}`).toBeLessThan(full.pack!.text.indexOf(`## ${GROUPS[i + 1]}\n`));
    }
  });
  it("never packs a ruling that is superseded, and packs its successor", () => {
    const rulings = full.pack!.groups.find((g) => g.group === "rulings")!.entries.map((e) => e.id);
    expect(rulings).toContain("ruling:R-1");
    expect(rulings).not.toContain("ruling:R-3");
    expect(queryData(p, "3").matches.map((m) => m.id)).not.toContain("ruling:R-3");
  });
  it("a sibling screen shares a feature with a matched screen, else shares a component", () => {
    expect(full.pack!.groups.find((g) => g.group === "sibling screens")!.entries.map((e) => e.id)).toEqual(["screen:5:2"]);
  });
  it("the pack text is at most the budget for every budget, and a cut keeps whole entries from the front of the order", () => {
    const all = ids(full);
    for (const budget of [1, 10, 50, 120, 333, full.pack!.characters - 1, full.pack!.characters, full.pack!.characters + 100]) {
      const d = queryData(p, "Sign in card", "--budget", String(budget));
      expect(d.pack!.characters, `budget ${budget}`).toBe(d.pack!.text.length);
      expect(d.pack!.characters, `budget ${budget}`).toBeLessThanOrEqual(budget);
      expect(ids(d), `budget ${budget}`).toEqual(all.slice(0, ids(d).length));
      expect(d.pack!.groups.reduce((n, g) => n + g.leftOut, 0) + ids(d).length).toBe(all.length);
    }
  });
  it("a budget exactly the size of the pack leaves nothing out; one character less leaves the last entry out", () => {
    const exact = queryData(p, "Sign in card", "--budget", String(full.pack!.characters));
    expect(exact.pack!.groups.every((g) => g.leftOut === 0)).toBe(true);
    const less = queryData(p, "Sign in card", "--budget", String(full.pack!.characters - 1));
    expect(ids(less).length).toBeLessThan(ids(full).length);
    expect(less.pack!.groups.find((g) => g.group === "sibling screens")!.leftOut).toBe(1);
  });
  it("the text says how many entries of each group were left out", () => {
    const done = query(p, "Sign in card", "--budget", "200");
    expect(done.out).toMatch(/left out to respect the budget/i);
    expect(done.out).toMatch(/\d+ rule\(s\)|\d+ component\(s\)|\d+ token\(s\)|\d+ ruling\(s\)|\d+ sibling screen\(s\)|\d+ pattern\(s\)/);
  });
  it("a budget that is not a whole number above 0 is refused by name", () => {
    for (const bad of ["abc", "-5", "1.5", "0x10"]) expect(failure(p, "card", "--budget", bad).error.code, bad).toBe("BAD_ARG");
  });
});

describe("--area is exact", () => {
  const p = builtRing1();
  it("takes the name after the prefix or the full key, for a page and for a token group", () => {
    const byKey = queryData(p, "card", "--area", "page:Library");
    expect(byKey.area).toBe("page:Library");
    expect(queryData(p, "card", "--area", "Library").pack).toEqual(byKey.pack);
    expect(ids(byKey)).toContain("component:Card");
    const tokens = queryData(p, "ink", "--area", "tokens:color");
    expect(ids(tokens)).toContain("token:color.ink");
    expect(ids(tokens)).not.toContain("token:space.gap");
    expect(queryData(p, "ink", "--area", "color").pack).toEqual(tokens.pack);
  });
  it("takes a component directory of the code door", () => {
    const code = codeProject();
    expect(build(code).code).toBe(0);
    const d = queryData(code, "button", "--area", "dir:src/components");
    expect(ids(d)).toContain("component:Button");
  });
  it("keeps the matches inside the area, and a node outside it only as a token or a rule of an in-area node", () => {
    const d = queryData(p, "sign dashboard card", "--area", "page:Library");
    expect(d.matches.every((m) => ["component"].includes(m.kind))).toBe(true);
    for (const id of ids(d)) expect(id.startsWith("screen:"), id).toBe(false);
  });
  it("no trimming, no case folding, no fuzzy match: a name that matches nothing is refused with the three nearest keys", () => {
    for (const name of ["library", " Library", "Libra"]) {
      const f = failure(p, "card", "--area", name);
      expect(f.code, name).toBe(1);
      expect(f.error.code, name).toBe("ONTOLOGY_AREA_UNKNOWN");
      expect(f.error.message).toContain("page:Library");
      expect(f.error.message).toContain("tokens:color");
      expect(f.error.message).toContain("tokens:space");
    }
  });
  it("a name that matches more than one key is refused, listing the full keys", () => {
    const q = builtRing1();
    changeScanAndRebuild(q, (scan) => { scan.components.find((c) => c["name"] === "Card")!["page"] = { id: "0:7", name: "color" }; });
    const f = failure(q, "card", "--area", "color");
    expect(f.error.code).toBe("ONTOLOGY_AREA_AMBIGUOUS");
    expect(f.error.message).toContain("page:color");
    expect(f.error.message).toContain("tokens:color");
    expect(queryData(q, "card", "--area", "page:color").area).toBe("page:color");
  });
  it("every next action a refusal prints succeeds when run as printed", () => {
    const q = builtRing1();
    changeScanAndRebuild(q, (scan) => { scan.components.find((c) => c["name"] === "Card")!["page"] = { id: "0:7", name: "color" }; });
    for (const [area, code] of [["color", "ONTOLOGY_AREA_AMBIGUOUS"], ["Libra", "ONTOLOGY_AREA_UNKNOWN"]] as const) {
      const done = query(q, "card", "--area", area);
      expect(done.code).toBe(1);
      expect(done.err).toContain(code);
      const next = printedCommands(done.err, q);
      expect(next.length, area).toBeGreaterThan(0);
      for (const argv of next) expect(capture(argv).code, argv.join(" ")).toBe(0);
    }
  });
});

describe("a stale or missing ontology.json is never queried, and the query writes nothing", () => {
  it("refuses with ONTOLOGY_STALE after a source changed, names the build, and the printed command heals it", () => {
    const p = builtRing1();
    writeFileSync(join(p, "design", "ds.json"), read(p, "design/ds.json").replaceAll('"name": "Library"', '"name": "Kit"'));
    const before = hashTree(p);
    const done = query(p, "Sign in");
    expect(done.code).toBe(1);
    expect(done.err).toContain("ONTOLOGY_STALE");
    expect(done.out).not.toContain("matches");
    expect(hashTree(p)).toBe(before);
    for (const argv of printedCommands(done.err, p)) expect(capture(argv).code, argv.join(" ")).toBe(0);
    expect(query(p, "Sign in").code).toBe(0);
  });
  it("while an owner question blocks the build, the refusal names the one action that works, and running it raises the question", () => {
    const p = fullProject();
    const done = query(p, "Sign in");
    expect(done.code).toBe(1);
    expect(done.err).toContain("ONTOLOGY_STALE");
    expect(done.err).toMatch(/await an owner ruling/);
    const next = printedCommands(done.err, p);
    expect(next).toEqual([["ontology", "build", "--dir", p]]);
    expect(capture(next[0] as string[]).code).toBe(1);
    expect(keyOf(p).some((k) => k.kind === "inferred-links")).toBe(true);
    expect(capture(["onboard", "questions", "--format", "claude", "--cwd", p]).code).toBe(0);
  });
  it("a missing file is stale too, and a file that is not valid JSON", () => {
    const p = builtRing1();
    rmSync(join(p, "design", "knowledge", "ontology.json"));
    expect(failure(p, "Sign in").error.code).toBe("ONTOLOGY_STALE");
    writeFileSync(join(p, "design", "knowledge", "ontology.json"), "{ nope");
    expect(failure(p, "Sign in").error.code).toBe("ONTOLOGY_STALE");
  });
  it("a successful query, a query with no match and a refusal leave the tree byte for byte as it was", () => {
    const p = builtRing1();
    const before = hashTree(p);
    for (const args of [["Sign in"], ["zzzz"], ["card", "--area", "nope"], ["card", "--budget", "x"], ["Sign in", "--json"]]) { query(p, args[0] as string, ...args.slice(1)); expect(hashTree(p)).toBe(before); }
  });
  it("the query reads only the file: the same pack from the ontology of the tree", () => {
    const p = builtRing1();
    const o = ontologyOf(p);
    expect(o.nodes.length).toBeGreaterThan(0);
    expect(queryData(p, "Sign in").pack!.groups.length).toBeGreaterThan(0);
  });
});

describe("arguments", () => {
  const p = builtRing1();
  it("needs the text; unknown flags are rejected", () => {
    expect(capture(["ontology", "query", "--dir", p, "--json"]).code).toBe(1);
    expect(capture(["ontology", "query", "card", "--dir", p, "--nope"]).code).toBe(1);
  });
});
