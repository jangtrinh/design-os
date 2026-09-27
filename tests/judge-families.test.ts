import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { FAMILIES, FAMILIES_PATH, FIXTURE, clone, record, report, tmp } from "./fixtures/judge/judge-helpers.js";
import type { Family } from "./fixtures/judge/judge-helpers.js";

describe("knowledge/personas/families.json", () => {
  const ledgerFor = (mutate?: (j: Record<string, unknown>) => void): string => {
    const path = join(tmp(), "judgments.jsonl");
    const ev = clone(FIXTURE);
    mutate?.(ev);
    expect(record(path, ev).code).toBe(0);
    return path;
  };
  const familiesCopy = (mutate: (d: typeof FAMILIES) => void): string => {
    const d = clone(FAMILIES);
    mutate(d);
    const path = join(tmp(), "families.json");
    writeFileSync(path, JSON.stringify(d), "utf8");
    return path;
  };

  it("the committed table validates and resolves the fixture's family refs", () => {
    const r = report(ledgerFor(), ["--families", FAMILIES_PATH]);
    expect(r.code).toBe(0);
    expect(r.problems).toEqual([]);
    expect(r.out).toContain("families: 12 valid");
  });

  it("matches the candidate table: 6 families per platform, 3 reliable attributes each, measured totals", () => {
    const by = (p: string): Family[] => FAMILIES.families.filter((f) => f.platform === p);
    expect(by("web")).toHaveLength(6);
    expect(by("ios")).toHaveLength(6);
    expect(by("web").reduce((n, f) => n + f.apps, 0)).toBe(31);
    expect(by("web").reduce((n, f) => n + f.screens, 0)).toBe(153);
    expect(by("ios").reduce((n, f) => n + f.apps, 0)).toBe(36);
    expect(by("ios").reduce((n, f) => n + f.screens, 0)).toBe(156);
    const unreliable = FAMILIES.unreliableAttributes.map((a) => a.attribute).sort();
    expect(unreliable).toEqual(["corner_radius", "weight_contrast"]);
    for (const f of FAMILIES.families) {
      expect(f.attributes).toHaveLength(3);
      expect(f.attributes.some((a) => unreliable.includes(a.attribute))).toBe(false);
      for (const a of f.attributes) expect(a.weak).toBe(a.share < 0.7);
      expect(f.mobbinUrls.length).toBeGreaterThan(0);
    }
  });

  it("C1: a persona-family judgment naming a family that is not in the table exits 1", () => {
    const path = ledgerFor((j) => {
      j["candidates"] = ["web-hairline-generous-neo-grotesque", "web-made-up-family"];
    });
    const r = report(path, ["--families", FAMILIES_PATH]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/'web-made-up-family' is not a family/);
  });

  it("C1: each way of corrupting the table exits 1", () => {
    const cases: [string, (d: typeof FAMILIES) => void][] = [
      ["nearest does not exist", (d) => { (d.families[0] as Family).nearest = "web-nowhere"; }],
      ["nearest is itself", (d) => { const f = d.families[0] as Family; f.nearest = f.slug; }],
      ["nearest on the other platform", (d) => { (d.families[0] as Family).nearest = "ios-cool-blue-single-accent"; }],
      ["duplicate slug", (d) => { (d.families[1] as Family).slug = (d.families[0] as Family).slug; }],
      ["unreliable attribute leaks in", (d) => { ((d.families[0] as Family).attributes[0] as { attribute: string }).attribute = "corner_radius"; }],
      ["dossier prose smuggled in", (d) => { ((d.families[0] as unknown) as Record<string, unknown>)["prose"] = "a long paragraph"; }],
      ["non-mobbin url", (d) => { (d.families[0] as Family).mobbinUrls = ["https://example.com/x"]; }],
      ["reliable attribute listed as unreliable", (d) => { (d.unreliableAttributes[0] as unknown as { agreement: number }).agreement = 0.9; }],
      ["slug prefix disagrees with platform", (d) => { (d.families[0] as Family).platform = "ios"; }],
    ];
    const ledger = ledgerFor();
    for (const [name, mutate] of cases) {
      expect({ name, code: report(ledger, ["--families", familiesCopy(mutate)]).code }).toEqual({ name, code: 1 });
    }
  });
});
