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
    expect(r.out).toContain("families: 11 valid");
  });

  it("matches the candidate table after the owner's blind-review merge: 5 web / 6 ios families, 3 reliable attributes each, measured totals", () => {
    const by = (p: string): Family[] => FAMILIES.families.filter((f) => f.platform === p);
    expect(by("web")).toHaveLength(5);
    expect(by("ios")).toHaveLength(6);
    expect(by("web").reduce((n, f) => n + f.apps, 0)).toBe(31);
    expect(by("web").reduce((n, f) => n + f.screens, 0)).toBe(153);
    expect(by("ios").reduce((n, f) => n + f.apps, 0)).toBe(31);
    expect(by("ios").reduce((n, f) => n + f.screens, 0)).toBe(169);
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
      ["gate_policy names an unknown rule id", (d) => { ((d.families[0] as unknown) as Record<string, unknown>)["gate_policy"] = { "made-up-rule-id": "error" }; }],
    ];
    const ledger = ledgerFor();
    for (const [name, mutate] of cases) {
      expect({ name, code: report(ledger, ["--families", familiesCopy(mutate)]).code }).toEqual({ name, code: 1 });
    }
  });

  it("C1: gate_policy naming a known rule id from the linter catalog validates (data only, no linter code change)", () => {
    const r = report(ledgerFor(), ["--families", FAMILIES_PATH]);
    expect(r.code).toBe(0);
    const bySlug = new Map(FAMILIES.families.map((f) => [f.slug, f as unknown as { gate_policy?: Record<string, string> }]));
    expect(bySlug.get("ios-geometric-high-contrast")?.gate_policy).toEqual({ "cream-palette": "exempt" });
    expect(bySlug.get("ios-pill-control-high-contrast")?.gate_policy).toEqual({ "border-accent-on-rounded": "exempt" });
    expect(bySlug.get("web-hairline-generous-neo-grotesque")?.gate_policy).toEqual({ "gpt-thin-border-wide-shadow": "error" });
    expect(bySlug.get("ios-hairline-neutral-neo-grotesque")?.gate_policy).toEqual({ "gpt-thin-border-wide-shadow": "error" });
  });

  it("A1: the merged family carries an optional accent and a merge history entry; the pill family is owner-confirmed by eye", () => {
    const merged = FAMILIES.families.find((f) => f.slug === "web-hairline-generous-neo-grotesque") as unknown as { accent?: string; history?: { action: string; merged: string[] }[] };
    expect(merged.accent).toBe("optional");
    expect(merged.history?.[0]).toMatchObject({ action: "merged", merged: ["web-hairline-generous-neo-grotesque", "web-quiet-light-single-accent-neo-grotesque"] });
    const pill = FAMILIES.families.find((f) => f.slug === "ios-pill-control-high-contrast") as unknown as { owner_confirmed_by_eye?: boolean };
    expect(pill.owner_confirmed_by_eye).toBe(true);
  });

  it("A2: every family carries a starting_tokens block with provenance: assumed; the mapping rules are recorded once at the top level", () => {
    for (const f of FAMILIES.families) {
      const tokens = (f as unknown as { starting_tokens?: { provenance: string; tokens: unknown } }).starting_tokens;
      expect(tokens?.provenance).toBe("assumed");
      expect(tokens?.tokens).toBeTypeOf("object");
    }
    const rules = (FAMILIES as unknown as { token_mapping_rules: { provenance: string; rules: string } }).token_mapping_rules;
    expect(rules.provenance).toBe("assumed");
    expect(rules.rules.length).toBeGreaterThan(0);
  });
});
