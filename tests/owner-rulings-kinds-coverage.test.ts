/**
 * The kinds table, the emitter registry and the coverage rule. The table is pinned to the spec's closed list, the
 * schema's enum is the same list, the registry partitions the kinds, and every registered emitter is RUN on a fixture
 * that must raise it and one that must not.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_HEADER_MAX } from "../src/core/brief-questions-format.js";
import { CLUSTER_KIND_TABLE, CLUSTER_KINDS } from "../src/core/owner-rulings/cluster-kinds.js";
import type { ClusterKind } from "../src/core/owner-rulings/cluster-kinds.js";
import { EMITTERS, KINDS_WITHOUT_EMITTER } from "../src/core/owner-rulings/emitters.js";
import type { KindDetection, KindEmitter } from "../src/core/owner-rulings/kind-emitter.js";
import { kindsCoverageGaps, MUST_NOT_RAISE, MUST_RAISE } from "../src/core/owner-rulings/kinds-coverage.js";

const ROOT = process.cwd();
const FIXTURE_DIR = join(ROOT, "tests", "fixtures", "owner-rulings", "kinds");

const SPEC_KINDS = [
  "figma-collections", "token-path-collision", "figma-library-pages", "screen-pages", "archived-marked-nodes",
  "duplicate-component-names", "classification-conflicts", "untypeable-tokens", "ambiguous-roles", "scan-budget",
  "app-roots", "source-authority", "component-name-collision", "inferred-links",
];

describe("the kinds table", () => {
  it("is the closed list of the spec: 14 kinds, no more, no fewer", () => {
    expect([...CLUSTER_KINDS].sort()).toEqual([...SPEC_KINDS].sort());
    expect(Object.keys(CLUSTER_KIND_TABLE).sort()).toEqual([...SPEC_KINDS].sort());
  });
  it("marks exactly the four set-valued kinds multi-select", () => {
    expect(CLUSTER_KINDS.filter((k) => CLUSTER_KIND_TABLE[k].setValued).sort()).toEqual(["app-roots", "figma-collections", "figma-library-pages", "screen-pages"]);
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

describe("the emitter registry", () => {
  const emitted = EMITTERS.map((e) => e.kind as string);
  it("EMITTERS and KINDS_WITHOUT_EMITTER are disjoint and together equal the kinds table", () => {
    expect(emitted.filter((k) => (KINDS_WITHOUT_EMITTER as readonly string[]).includes(k))).toEqual([]);
    expect([...emitted, ...KINDS_WITHOUT_EMITTER].sort()).toEqual([...CLUSTER_KINDS].sort());
  });
  it("registers the Figma-ingest, import and project-level kinds and leaves the two later kinds without an emitter", () => {
    expect([...emitted].sort()).toEqual(["ambiguous-roles", "app-roots", "archived-marked-nodes", "classification-conflicts", "duplicate-component-names", "figma-collections", "figma-library-pages", "scan-budget", "screen-pages", "source-authority", "token-path-collision", "untypeable-tokens"]);
    expect([...KINDS_WITHOUT_EMITTER].sort()).toEqual(["component-name-collision", "inferred-links"]);
  });
  it("holds the coverage rule on the real registry and the real fixtures", () => {
    const readFixture = (kind: string, file: string): unknown => {
      const p = join(FIXTURE_DIR, kind, file);
      return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined;
    };
    expect(kindsCoverageGaps({ emitters: EMITTERS, readFixture })).toEqual([]);
  });
});

describe("the coverage rule runs emitters (injected)", () => {
  /** An emitter that raises one member per name listed in the fixture's `names`. */
  const emitter = (kind: ClusterKind, behaviour: "correct" | "never" | "always" = "correct"): KindEmitter => ({
    kind,
    detect(input: unknown): KindDetection | null {
      const names = (input as { names?: string[] }).names ?? [];
      const members = behaviour === "never" ? [] : behaviour === "always" ? ["x"] : names;
      return { kind, members, domain: members, ask: () => ({ question: "q", options: [] }) };
    },
  });
  const fixtures = (map: Record<string, unknown>) => (kind: string, file: string): unknown => map[`${kind}/${file}`];
  const both = { [`scan-budget/${MUST_RAISE}`]: { names: ["a"] }, [`scan-budget/${MUST_NOT_RAISE}`]: { names: [] } };

  it("a correct emitter with both fixtures is not a gap", () => {
    expect(kindsCoverageGaps({ emitters: [emitter("scan-budget")], readFixture: fixtures(both) })).toEqual([]);
  });
  it("an emitter that raises nothing on its must-raise fixture is a gap", () => {
    expect(kindsCoverageGaps({ emitters: [emitter("scan-budget", "never")], readFixture: fixtures(both) }))
      .toEqual([`kind 'scan-budget' raises nothing on its ${MUST_RAISE} fixture`]);
  });
  it("an emitter that raises on its must-not-raise fixture is a gap", () => {
    expect(kindsCoverageGaps({ emitters: [emitter("scan-budget", "always")], readFixture: fixtures(both) }))
      .toEqual([`kind 'scan-budget' raises 1 member(s) on its ${MUST_NOT_RAISE} fixture`]);
  });
  it("an emitter with a missing fixture is a gap, for each missing file", () => {
    expect(kindsCoverageGaps({ emitters: [emitter("scan-budget")], readFixture: fixtures({ [`scan-budget/${MUST_RAISE}`]: { names: ["a"] } }) }))
      .toEqual([`kind 'scan-budget' has an emitter and no ${MUST_NOT_RAISE} fixture`]);
    expect(kindsCoverageGaps({ emitters: [emitter("scan-budget")], readFixture: fixtures({}) })).toHaveLength(2);
  });
  it("an emitter for a kind that is not in the table is a gap", () => {
    expect(kindsCoverageGaps({ emitters: [emitter("invented" as ClusterKind)], readFixture: fixtures({}) }))
      .toEqual(["emitter for 'invented' has no row in the kinds table"]);
  });
  it("a file named like an emitter that raises nothing is no longer enough: only what detect() returns counts", () => {
    const hollow: KindEmitter = { kind: "app-roots", detect: () => null };
    const gaps = kindsCoverageGaps({ emitters: [hollow], readFixture: fixtures({ [`app-roots/${MUST_RAISE}`]: {}, [`app-roots/${MUST_NOT_RAISE}`]: {} }) });
    expect(gaps).toEqual([`kind 'app-roots' raises nothing on its ${MUST_RAISE} fixture`]);
  });
});

describe("the coverage rule reads the entry point the commands call (detectAll)", () => {
  const readFixture = (kind: string, file: string): unknown => {
    const p = join(FIXTURE_DIR, kind, file);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined;
  };
  const collision = EMITTERS.find((e) => e.kind === "token-path-collision")!;

  it("the collision emitter lists every group: two groups on one input are two detections", () => {
    const v = (id: string, collection: string): object => ({ id, name: "color/brand", collection });
    const input = { collisions: [{ path: "color.a", variables: [v("1", "A"), v("2", "B")] }, { path: "color.b", variables: [v("3", "A"), v("4", "C")] }] };
    expect(collision.detectAll!(input)).toHaveLength(2);
    expect(collision.detect(input)!.members).toHaveLength(1);
  });
  it("an emitter whose detect raises but whose detectAll raises nothing is a gap: the production entry point decides", () => {
    const broken: KindEmitter = { ...collision, detectAll: () => [] };
    expect(kindsCoverageGaps({ emitters: [broken], readFixture })).toEqual([`kind 'token-path-collision' raises nothing on its ${MUST_RAISE} fixture`]);
  });
  it("an emitter whose detectAll raises on the must-not-raise fixture is a gap even when detect does not", () => {
    const noisy: KindEmitter = { ...collision, detectAll: () => [{ kind: "token-path-collision", members: ["x"], domain: ["x"], ask: () => ({ question: "q", options: [] }) }] };
    expect(kindsCoverageGaps({ emitters: [noisy], readFixture })).toEqual([`kind 'token-path-collision' raises 1 member(s) on its ${MUST_NOT_RAISE} fixture`]);
  });
});
