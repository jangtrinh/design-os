/**
 * `ui ontology query --area` is exact: a full key or the name after its prefix; ambiguous and unknown names are refused by name.
 */
import { describe, expect, it } from "vitest";
import { build, codeProject } from "./ontology-helpers.js";
import { builtRing1, changeScanAndRebuild, failure, ids, printedCommands, query, queryData } from "./ontology-query-helpers.js";
import { capture } from "./owner-rulings-helpers.js";

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
    for (const name of ["library", " Library", "Libra", "page:library", "PAGE:Library"]) {
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
