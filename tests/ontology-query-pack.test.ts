/**
 * The pack of `ui ontology query`: one fixed order and a budget respected to the character.
 */
import { describe, expect, it } from "vitest";
import { builtFull, failure, GROUPS, ids, query, queryData } from "./ontology-query-helpers.js";

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
