/**
 * The kinds table and its staged coverage rule (AC-14). The table is pinned to the spec's closed list, the schema's
 * enum is the same list, and a kind with an emitter but no must-raise / must-not-raise fixture fails the suite.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLUSTER_KIND_TABLE, CLUSTER_KINDS } from "../src/core/owner-rulings/cluster-kinds.js";
import { kindsCoverageGaps } from "../src/core/owner-rulings/kinds-coverage.js";
import { CLAUDE_HEADER_MAX } from "../src/core/brief-questions-format.js";

const ROOT = process.cwd();
const EMITTER_DIR = join(ROOT, "src", "core", "owner-rulings");
const FIXTURE_DIR = join(ROOT, "tests", "fixtures", "owner-rulings", "kinds");

/** The 14 kinds of the spec's closed list (FR-003). */
const SPEC_KINDS = [
  "figma-collections", "token-path-collision", "figma-library-pages", "screen-pages", "archived-marked-nodes",
  "duplicate-component-names", "classification-conflicts", "untypeable-tokens", "ambiguous-roles", "scan-budget",
  "app-roots", "source-authority", "component-name-collision", "inferred-links",
];

function listFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => readdirSync(join(FIXTURE_DIR, d.name)).map((f) => `${d.name}/${f}`));
}

describe("the kinds table", () => {
  it("is the closed list of the spec: 14 kinds, no more, no fewer", () => {
    expect([...CLUSTER_KINDS].sort()).toEqual([...SPEC_KINDS].sort());
    expect(Object.keys(CLUSTER_KIND_TABLE).sort()).toEqual([...SPEC_KINDS].sort());
  });
  it("marks exactly the four set-valued kinds multi-select", () => {
    const multi = CLUSTER_KINDS.filter((k) => CLUSTER_KIND_TABLE[k].setValued).sort();
    expect(multi).toEqual(["app-roots", "figma-collections", "figma-library-pages", "screen-pages"]);
  });
  it("gives every kind a header that fits the question limit and a unique ask rank", () => {
    for (const k of CLUSTER_KINDS) expect(CLUSTER_KIND_TABLE[k].header.length, k).toBeLessThanOrEqual(CLAUDE_HEADER_MAX);
    expect(new Set(CLUSTER_KINDS.map((k) => CLUSTER_KIND_TABLE[k].rank)).size).toBe(CLUSTER_KINDS.length);
  });
  it("is the same list the manifest schema accepts as a ruling kind", () => {
    const schema = JSON.parse(readFileSync(join(ROOT, "schemas", "design-dir.schema.json"), "utf8"));
    expect([...schema.properties.onboard.properties.rulings.items.properties.kind.enum].sort()).toEqual([...SPEC_KINDS].sort());
  });
});

describe("kinds coverage (staged — complete when every kind has an emitter)", () => {
  it("holds on the real tree: every emitter present has both fixtures", () => {
    expect(kindsCoverageGaps({ emitterFiles: readdirSync(EMITTER_DIR), fixtureFiles: listFixtures() })).toEqual([]);
  });
  it("fails for a kind with an emitter and no must-raise fixture (mutation: one fixture removed)", () => {
    const gaps = kindsCoverageGaps({
      emitterFiles: ["kind-scan-budget.ts", "kind-app-roots.ts"],
      fixtureFiles: ["scan-budget/must-raise.json", "scan-budget/must-not-raise.json", "app-roots/must-not-raise.json"],
    });
    expect(gaps).toEqual(["kind 'app-roots' has an emitter and no must-raise.json fixture"]);
  });
  it("fails for a kind with an emitter and no must-not-raise fixture", () => {
    const gaps = kindsCoverageGaps({ emitterFiles: ["kind-scan-budget.ts"], fixtureFiles: ["scan-budget/must-raise.json"] });
    expect(gaps).toEqual(["kind 'scan-budget' has an emitter and no must-not-raise.json fixture"]);
  });
  it("fails for an emitter whose kind is not in the table (mutation: one kind removed from the table)", () => {
    const withoutApps = CLUSTER_KINDS.filter((k) => k !== "app-roots");
    const gaps = kindsCoverageGaps({ kinds: withoutApps, emitterFiles: ["kind-app-roots.ts"], fixtureFiles: ["app-roots/must-raise.json", "app-roots/must-not-raise.json"] });
    expect(gaps).toEqual(["emitter kind-app-roots.ts has no row in the kinds table"]);
  });
  it("is quiet when nothing has an emitter yet", () => {
    expect(kindsCoverageGaps({ emitterFiles: ["cluster.ts", "kinds-coverage.ts"], fixtureFiles: [] })).toEqual([]);
  });
});
