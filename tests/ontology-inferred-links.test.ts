/**
 * `inferred-links`: a `defines` link is never exact, so it is asked. One question per term whose name equals a node's
 * name under the registry's own normalisation; only an owner ruling turns a candidate into a link; a term ruled
 * standalone is not an orphan; a term nothing is named after raises nothing.
 */
import { describe, expect, it } from "vitest";
import { KINDS_WITHOUT_EMITTER } from "../src/core/owner-rulings/emitters.js";
import { inferredLinksEmitter, pairMember } from "../src/core/owner-rulings/kind-inferred-links.js";
import { termCandidates } from "../src/core/ontology/inferred-candidates.js";

describe("the kind has an emitter and the coverage pin is empty", () => {
  it("no kind is left without an emitter", () => { expect([...KINDS_WITHOUT_EMITTER]).toEqual([]); });
});

describe("candidates: the registry's own name normalisation, nothing else", () => {
  const nodes = [
    { id: "term:card", kind: "term", name: "card" }, { id: "term:Cards", kind: "term", name: "Cards" }, { id: "term:Card Header", kind: "term", name: "Card Header" }, { id: "term:Sign", kind: "term", name: "Sign" }, { id: "term:SIGN  in", kind: "term", name: " SIGN  in " },
    { id: "component:Card", kind: "component", name: "Card" }, { id: "screen:5:1", kind: "screen", name: "Sign in" }, { id: "rule:x", kind: "rule", name: "card" },
  ];
  const byTerm = Object.fromEntries(termCandidates(nodes as never).map((t) => [t.id, t.candidates.map((c) => c.id)]));
  it("a term whose name equals a node's name after case and spacing is a candidate for it", () => {
    expect(byTerm["term:card"]).toEqual(["component:Card"]);
    expect(byTerm["term:SIGN  in"]).toEqual(["screen:5:1"]);
  });
  it("no substring, no plural, no similarity: those terms have no candidate, and a rule's text is never one", () => {
    expect(byTerm["term:Cards"]).toEqual([]);
    expect(byTerm["term:Card Header"]).toEqual([]);
    expect(byTerm["term:Sign"]).toEqual([]); // a prefix of a node's name is not that name
    expect(byTerm["term:card"]).not.toContain("rule:x");
  });
});

describe("the question", () => {
  it("is one cluster per term with the candidate nodes as members, and a term with no candidate raises nothing", () => {
    const found = inferredLinksEmitter.detectAll!({ terms: [
      { id: "term:Card", name: "Card", candidates: [{ id: "component:Card", name: "Card", kind: "component" }, { id: "pattern:card", name: "card", kind: "pattern" }] },
      { id: "term:Sign in", name: "Sign in", candidates: [{ id: "screen:5:1", name: "Sign in", kind: "screen" }] },
      { id: "term:Ledger", name: "Ledger", candidates: [] },
    ] });
    expect(found.map((d) => d.members)).toEqual([[pairMember("term:Card", "component:Card"), pairMember("term:Card", "pattern:card")], [pairMember("term:Sign in", "screen:5:1")]]);
  });
  it("names each member as term and node with ids, links or marks standalone, and never offers a position", () => {
    const d = inferredLinksEmitter.detectAll!({ terms: [{ id: "term:Card", name: "Card", candidates: [{ id: "component:Card", name: "Card", kind: "component" }, { id: "pattern:card", name: "card", kind: "pattern" }] }] })[0]!;
    const ask = d.ask(d.members);
    expect(ask.options.map((o) => o.id)).toEqual(["link-all", "standalone", "review-individually"]);
    expect(Object.values(ask.labels!)).toEqual(["Card (term) defines Card (component)", "Card (term) defines card (pattern)"]);
    expect(ask.options.map((o) => `${o.label} ${o.consequence}`).join(" ")).not.toMatch(/first|second|1st/i);
  });
});
